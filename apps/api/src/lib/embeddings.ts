import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return null;
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generate a deterministic 1536-dimension unit-normalized mock embedding vector for testing.
 */
function generateMockEmbedding(text: string): number[] {
  const embedding: number[] = new Array(1536).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  for (let i = 0; i < 1536; i++) {
    const angle = ((hash + i) * 180) / Math.PI;
    embedding[i] = Math.sin(angle);
  }
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => (magnitude > 0 ? val / magnitude : 0));
}

/**
 * Generate a 1536-dimension embedding vector for the given text.
 * Uses OpenAI text-embedding-3-small model, with fallback to mock embeddings if key is missing.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  if (!client) {
    console.warn('OPENAI_API_KEY is not defined. Using deterministic mock embedding.');
    return generateMockEmbedding(text);
  }

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call (batch).
 * More cost-efficient for schema crawling.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();
  if (!client) {
    console.warn('OPENAI_API_KEY is not defined. Using batch deterministic mock embeddings.');
    return texts.map(t => generateMockEmbedding(t));
  }

  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      dimensions: 1536,
    });

    // Sort by index to ensure order matches input
    const sorted = response.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map((item) => item.embedding));
  }

  return allEmbeddings;
}

