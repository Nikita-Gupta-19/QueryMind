import { GoogleGenerativeAI } from '@google/generative-ai';

function getClient(customApiKey?: string): GoogleGenerativeAI | null {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Generate a deterministic 3072-dimension unit-normalized mock embedding vector for testing.
 */
function generateMockEmbedding(text: string): number[] {
  const embedding: number[] = new Array(3072).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  for (let i = 0; i < 3072; i++) {
    const angle = ((hash + i) * 180) / Math.PI;
    embedding[i] = Math.sin(angle);
  }
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => (magnitude > 0 ? val / magnitude : 0));
}

/**
 * Generate a 3072-dimension embedding vector for the given text.
 * Uses Gemini gemini-embedding-2 model, with fallback to mock embeddings if key is missing.
 */
export async function generateEmbedding(text: string, customApiKey?: string): Promise<number[]> {
  const client = getClient(customApiKey);
  if (!client) {
    console.warn('GEMINI_API_KEY is not defined. Using deterministic mock embedding.');
    return generateMockEmbedding(text);
  }

  const model = client.getGenerativeModel({ model: 'gemini-embedding-2' });
  const result = await model.embedContent(text);

  return result.embedding.values;
}

/**
 * Generate embeddings for multiple texts in a single API call (batch).
 * More cost-efficient for schema crawling.
 */
export async function generateEmbeddingsBatch(texts: string[], customApiKey?: string): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient(customApiKey);
  if (!client) {
    console.warn('GEMINI_API_KEY is not defined. Using batch deterministic mock embeddings.');
    return texts.map(t => generateMockEmbedding(t));
  }

  const model = client.getGenerativeModel({ model: 'gemini-embedding-2' });
  const requests = texts.map(t => ({ content: { role: 'user', parts: [{ text: t }] } }));
  
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const batch = requests.slice(i, i + BATCH_SIZE);
    const result = await model.batchEmbedContents({ requests: batch });
    const batchEmbeddings = result.embeddings.map(e => e.values);
    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}
