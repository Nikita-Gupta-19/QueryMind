import prisma from '../../config/db';
import { generateEmbedding } from '../../lib/embeddings';

export interface RetrievedTable {
  tableName: string;
  columnNames: string[];
  description: string;
  similarity: number;
}

/**
 * Retrieve the top-K most relevant tables for a given user question
 * using pgvector cosine similarity against schema embeddings.
 *
 * This is the core RAG retrieval step — the LLM only ever sees columns
 * from the tables returned here, preventing hallucinated column names.
 */
export async function retrieveRelevantSchema(
  question: string,
  connectionId: string,
  topK: number = 5
): Promise<RetrievedTable[]> {
  // 1. Embed the user's question
  const questionEmbedding = await generateEmbedding(question);
  const embeddingStr = `[${questionEmbedding.join(',')}]`;

  // 2. Cosine similarity search via pgvector
  // 1 - (embedding <=> query) gives cosine similarity (0=orthogonal, 1=identical)
  const results = await prisma.$queryRawUnsafe<
    Array<{
      table_name: string;
      column_names: string[];
      description: string | null;
      similarity: number;
    }>
  >(
    `SELECT
       "tableName"   AS table_name,
       "columnNames" AS column_names,
       description,
       1 - (embedding <=> $1::vector) AS similarity
     FROM "schema_embeddings"
     WHERE "connectionId" = $2::uuid

       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    embeddingStr,
    connectionId,
    topK
  );

  return results.map((r) => ({
    tableName: r.table_name,
    columnNames: r.column_names,
    description: r.description ?? '',
    similarity: Number(r.similarity),
  }));
}

/**
 * Build a compact schema context string to inject into the LLM prompt.
 * Only includes retrieved tables — not the full schema.
 */
export function buildSchemaContext(tables: RetrievedTable[]): string {
  if (tables.length === 0) {
    return 'No relevant tables found in the schema.';
  }

  return tables
    .map((t) => {
      const cols = t.columnNames.join(', ');
      return `Table: ${t.tableName}\nColumns: ${cols}\nDescription: ${t.description}`;
    })
    .join('\n\n');
}
