import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;
let flashModel: GenerativeModel | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables.');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

function getFlashModel(): GenerativeModel {
  if (!flashModel) {
    flashModel = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return flashModel;
}

/**
 * Generate a deterministic mock response when GEMINI_API_KEY is not defined.
 */
function mockGenerateText(prompt: string): string {
  // 1. Check if the prompt is for a query plan (contains "steps" or "3-5")
  if (prompt.includes('3-5') || prompt.includes('steps')) {
    const qMatch = prompt.match(/<user_question>([\s\S]*?)<\/user_question>/i);
    const question = qMatch ? qMatch[1].trim() : 'Execute query';
    
    let tableName = 'table';
    const tableMatches = prompt.match(/Table: ([a-zA-Z0-9_\-]+)/gi);
    if (tableMatches && tableMatches.length > 0) {
      const firstTable = tableMatches[0].replace(/Table:\s*/i, '').trim();
      tableName = firstTable;
      for (const m of tableMatches) {
        const name = m.replace(/Table:\s*/i, '').trim();
        if (question.toLowerCase().includes(name.toLowerCase())) {
          tableName = name;
          break;
        }
      }
    }

    return `1. Identify the target table: ${tableName}\n2. Filter columns if needed\n3. Execute SQL query\n4. Present the records in the UI`;
  }

  // 2. Otherwise, assume it is for SQL generation (JSON format)
  const qMatch = prompt.match(/<user_question>([\s\S]*?)<\/user_question>/i);
  const question = qMatch ? qMatch[1].trim() : 'Show me data';

  const tableMatches = [...prompt.matchAll(/Table:\s*([a-zA-Z0-9_\-]+)/gi)].map(m => m[1]);
  
  let targetTable = tableMatches[0] || 'rna';
  for (const name of tableMatches) {
    if (question.toLowerCase().includes(name.toLowerCase())) {
      targetTable = name;
      break;
    }
  }

  // Detect limit if specified
  let limit = 50;
  const numMatch = question.match(/\b(\d+)\b/);
  if (numMatch) {
    limit = parseInt(numMatch[1]);
  } else if (question.toLowerCase().includes('five')) {
    limit = 5;
  } else if (question.toLowerCase().includes('ten')) {
    limit = 10;
  }

  const generatedSql = `SELECT * FROM ${targetTable} LIMIT ${limit};`;
  const explanation = `Selects ${limit} rows from the ${targetTable} table.`;

  return JSON.stringify({
    sql: generatedSql,
    explanation: explanation,
    confidence: 'HIGH'
  });
}

/**
 * Generate a single non-streaming text response from Gemini 2.0 Flash.
 */
export async function generateText(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[LLM] GEMINI_API_KEY is not defined. Using mock fallback.');
    return mockGenerateText(prompt);
  }
  const model = getFlashModel();
  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

/**
 * Stream a response from Gemini 2.0 Flash, calling onChunk for each chunk.
 * Used for streaming SQL insights/plan steps to the frontend via Socket.IO.
 */
export async function streamText(
  prompt: string,
  onChunk: (text: string) => void
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[LLM] GEMINI_API_KEY is not defined. Using mock fallback.');
    const mockText = mockGenerateText(prompt);
    onChunk(mockText);
    return mockText;
  }
  const model = getFlashModel();
  const result = await model.generateContentStream(prompt);

  let fullText = '';
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    fullText += chunkText;
    onChunk(chunkText);
  }
  return fullText;
}
