import prisma from '../../config/db';
import { generateText } from '../../lib/llm';
import { retrieveRelevantSchema, buildSchemaContext } from '../query/rag';
import { validateSQL } from '../query/validator';
import { executeQuery } from '../query/executor';
import { decrypt } from '../connections/crypto.utils';

export interface AgentStep {
  thought: string;
  action: 'get_schema' | 'run_query' | 'finish';
  params: any;
}

export interface ToolResult {
  action: string;
  output: any;
}

/**
 * Execute the multi-step analyst agent loop using Gemini 2.0 Flash.
 * Loops up to 5 times running tools (Schema RAG, SQL execution) before synthesizing the final explanation.
 */
export async function runAnalystAgent(
  question: string,
  connectionId: string,
  workspaceId: string,
  onStep: (step: AgentStep) => void,
  onResult: (result: ToolResult) => void,
  customApiKey?: string
): Promise<string> {
  // 1. Fetch connection details
  const conn = await prisma.dbConnection.findFirst({
    where: { id: connectionId, workspaceId },
  });
  if (!conn) throw new Error('Database connection not found in this workspace.');

  const connectionString = decrypt(conn.encryptedConnString);

  // 2. Prep schemas context (retrieved table list via RAG similarity)
  let relevantTables = await retrieveRelevantSchema(question, connectionId, 5, customApiKey);
  if (relevantTables.length === 0) {
    try {
      console.log('[AnalystAgent] Schema embeddings not found. Triggering inline sync...');
      const { syncSchemaInProcess } = await import('../schema/sync-schema.utils');
      await syncSchemaInProcess(connectionId);
      relevantTables = await retrieveRelevantSchema(question, connectionId, 5, customApiKey);
    } catch (syncErr) {
      console.error('[AnalystAgent] Dynamic inline schema sync failed:', syncErr);
    }
  }

  if (relevantTables.length === 0) {
    throw new Error('No schema embeddings found for this connection and fallback sync failed.');
  }

  const schemaContext = buildSchemaContext(relevantTables);

  // 3. Initiate agent transcript history
  const conversationHistory: Array<{ role: 'user' | 'model'; parts: string }> = [];

  const systemPrompt = `You are a senior data analyst agent. Your task is to investigate and answer the following question: "${question}"
You have access to the database connection named "${conn.name}".
You must decide which SQL queries to execute, examine the results, and compile a final answer.

## Available Tools:
1. get_schema: Retrieve columns, data types, and foreign key descriptions.
   Params: {}
2. run_query: Execute a read-only SELECT query on the database.
   Params: { "sql": "SELECT ..." }
3. finish: Conclude investigation and return your final answer explanation.
   Params: { "answer": "Plain-English explanation..." }

## Safety Constraints:
- You must write SELECT statements only. Do NOT attempt write or modify operations.
- Qualify column names with table names when joining.
- Keep output row counts limited.
- IMPORTANT: PostgreSQL is case-sensitive for quoted identifiers. If a table is named "User" (with a capital U), you MUST quote it like SELECT * FROM "User", otherwise PostgreSQL will query the current_user system variable.
- If a query fails with an error, DO NOT hallucinate a successful response. You must either fix the SQL and try again, or use 'finish' to tell the user the query failed.

## Output Format:
You MUST respond with a single valid JSON object containing thought, action, and params. No markdown blocks, no prefixing text.
Format Example:
{
  "thought": "I will check the column names of the sales table.",
  "action": "get_schema",
  "params": {}
}

## Final Answer Guidelines:
When using the 'finish' action, your answer MUST directly address the user's question using the exact data rows you retrieved. Do NOT use generic analyst jargon (e.g., "no data drift detected"). Just answer the question clearly (e.g. "Here are the users I found: Nikita, John, ...").
`;

  conversationHistory.push({ role: 'user', parts: systemPrompt });

  let iteration = 0;
  const maxIterations = 5;
  let finalAnswer = '';

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[AnalystAgent] Iteration ${iteration}/${maxIterations}`);

    // Call LLM
    const prompt = conversationHistory
      .map((h) => `${h.role === 'user' ? 'User' : 'Model'}: ${h.parts}`)
      .join('\n\n') + '\n\nModel:';

    let rawResponse = await generateText(prompt, customApiKey);

    // Parse output JSON block
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Agent did not return valid JSON. Raw response: ${rawResponse.slice(0, 200)}`);
    }

    let step: AgentStep;
    try {
      step = JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error(`Failed to parse agent JSON: ${jsonMatch[0].slice(0, 200)}`);
    }

    // Call status callback
    onStep(step);

    conversationHistory.push({ role: 'model', parts: JSON.stringify(step) });

    if (step.action === 'finish') {
      finalAnswer = step.params.answer;
      break;
    }

    // Execute Tool
    let toolResult: any;
    try {
      if (step.action === 'get_schema') {
        toolResult = { schema: schemaContext };
      } else if (step.action === 'run_query') {
        const sql = step.params.sql;
        // Enforce 4-layer validation on agent-generated queries
        const validation = validateSQL(sql);
        if (!validation.valid) {
          toolResult = { error: `SQL validator rejected query: ${validation.rejectionReason}` };
        } else {
          const queryResult = await executeQuery(connectionString, conn.dbType, validation.sql);
          toolResult = {
            rows: queryResult.rows.slice(0, 10), // Limit tool input rows to save token context
            fields: queryResult.fields,
            rowCount: queryResult.rowCount,
            truncated: queryResult.truncated,
          };
        }
      } else {
        toolResult = { error: `Unsupported tool action: ${step.action}` };
      }
    } catch (err: any) {
      toolResult = { error: err.message || 'Tool execution failed' };
    }

    // Call result callback
    onResult({ action: step.action, output: toolResult });

    conversationHistory.push({
      role: 'user',
      parts: `Tool output result from action '${step.action}': ${JSON.stringify(toolResult)}\n\nNow, decide your next step (thought, action, params).`,
    });
  }

  if (!finalAnswer) {
    finalAnswer = 'Agent reached maximum iteration limit without compiling a final answer.';
  }

  return finalAnswer;
}
