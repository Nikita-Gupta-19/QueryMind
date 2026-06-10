import { generateText } from '../../lib/llm';

export interface GeneratedSQL {
  sql: string;
  explanation: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Generate SQL from a natural language question using Gemini 2.0 Flash.
 *
 * The prompt uses chain-of-thought reasoning and injects only the
 * retrieved schema context (from RAG), preventing hallucinations.
 * User input is always wrapped in XML tags to prevent prompt injection.
 */
export async function generateSQL(
  question: string,
  schemaContext: string,
  dbType: 'POSTGRES' | 'MYSQL',
  glossaryContext?: string
): Promise<GeneratedSQL> {
  const dialect = dbType === 'POSTGRES' ? 'PostgreSQL' : 'MySQL';

  const glossarySection = glossaryContext
    ? `\n## Business Glossary Mappings\nThe following business terms map to schema column names:\n${glossaryContext}\nAlways use the schema column name in SQL, not the business term.\n`
    : '';

  const prompt = `You are an expert ${dialect} SQL analyst. Your only job is to write safe, correct SELECT queries.

## Schema Context (only these tables and columns exist — do NOT invent others)
${schemaContext}
${glossarySection}
## Rules
1. Write ONLY a SELECT statement. Never write UPDATE, INSERT, DELETE, DROP, ALTER, TRUNCATE, or any DDL/DML.
2. Use only the table names and column names listed above.
3. Always qualify column names with the table name when joining (e.g. orders.id not just id).
4. If a LIMIT is needed for performance, include it (max LIMIT 1000).
5. Do not hallucinate column names. If the question cannot be answered with the available schema, say so.
6. Return ONLY valid ${dialect} SQL — no markdown fences, no explanation text mixed in.

## Output Format
Respond with a JSON object with these exact fields:
{
  "sql": "SELECT ...",
  "explanation": "Brief plain-English explanation of what this query does",
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}

confidence = HIGH if the schema clearly supports the question, MEDIUM if making assumptions, LOW if uncertain.

## User Question
<user_question>${question}</user_question>

Now generate the SQL JSON response:`;

  const rawResponse = await generateText(prompt);

  // Extract JSON from response (Gemini sometimes adds surrounding text)
  const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Gemini did not return valid JSON. Raw response: ${rawResponse.slice(0, 200)}`);
  }

  let parsed: { sql: string; explanation: string; confidence: string };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse Gemini JSON response: ${jsonMatch[0].slice(0, 200)}`);
  }

  if (!parsed.sql || typeof parsed.sql !== 'string') {
    throw new Error('Gemini response missing "sql" field');
  }

  // Clean the SQL: strip any accidental markdown fences
  const cleanSQL = parsed.sql
    .replace(/```sql\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  return {
    sql: cleanSQL,
    explanation: parsed.explanation || '',
    confidence: (['HIGH', 'MEDIUM', 'LOW'].includes(parsed.confidence)
      ? parsed.confidence
      : 'MEDIUM') as GeneratedSQL['confidence'],
  };
}

/**
 * Generate a query plan (step-by-step reasoning) before writing SQL.
 * Streamed to the frontend immediately so the UI feels responsive.
 */
export async function generateQueryPlan(
  question: string,
  schemaContext: string
): Promise<string> {
  const prompt = `You are a senior data analyst. Given this database schema and user question, list 3-5 concise steps you would take to answer it. Be specific about which tables and columns you'd use.

## Schema Context
${schemaContext}

## User Question
<user_question>${question}</user_question>

Respond with a numbered list ONLY. No preamble, no SQL, just the steps. Example:
1. Access the orders table
2. Filter by date range using created_at column
3. Group by product_id and sum revenue column
4. Sort descending and return top 10 rows`;

  return generateText(prompt);
}
