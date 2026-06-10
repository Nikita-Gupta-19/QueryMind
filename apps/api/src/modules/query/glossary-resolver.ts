import prisma from '../../config/db';
import { generateEmbedding } from '../../lib/embeddings';

export interface MappedGlossaryTerm {
  businessTerm: string;
  schemaTerm: string;
  description: string;
  similarity: number;
}

/**
 * Resolves user terms to schema columns/tables using vector similarity search
 * against business glossary terms.
 */
export async function resolveGlossaryTerms(
  question: string,
  workspaceId: string,
  topK: number = 3,
  similarityThreshold: number = 0.5
): Promise<MappedGlossaryTerm[]> {
  try {
    // 1. Check if there are any glossary terms in this workspace first
    const totalTerms = await prisma.glossaryTerm.count({ where: { workspaceId } });
    if (totalTerms === 0) {
      return [];
    }

    // 2. Embed the question
    let questionEmbedding: number[];
    try {
      questionEmbedding = await generateEmbedding(question);
    } catch (err) {
      console.warn('[GlossaryResolver] Failed to generate embedding for question. Skipping glossary resolution.', err);
      return [];
    }

    const embeddingStr = `[${questionEmbedding.join(',')}]`;

    // 3. Cosine similarity query on "GlossaryTerm"
    const results = await prisma.$queryRawUnsafe<
      Array<{
        business_term: string;
        schema_term: string;
        description: string | null;
        similarity: number;
      }>
    >(
      `SELECT
         "businessTerm" AS business_term,
         "schemaTerm"   AS schema_term,
         description,
         1 - (embedding <=> $1::vector) AS similarity
       FROM "GlossaryTerm"
       WHERE "workspaceId" = $2
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      embeddingStr,
      workspaceId,
      topK
    );

    return results
      .map((r) => ({
        businessTerm: r.business_term,
        schemaTerm: r.schema_term,
        description: r.description ?? '',
        similarity: Number(r.similarity),
      }))
      .filter((r) => r.similarity >= similarityThreshold);
  } catch (err) {
    console.error('[GlossaryResolver] Error resolving terms:', err);
    return [];
  }
}

/**
 * Format the resolved glossary mapping into a prompt instruction context block.
 */
export function buildGlossaryContext(terms: MappedGlossaryTerm[]): string {
  if (terms.length === 0) return '';

  const mappings = terms
    .map((t) => `- Business term "${t.businessTerm}" resolves to database column/table name: "${t.schemaTerm}" (Definition: ${t.description || 'none'})`)
    .join('\n');

  return `
<business_glossary>
Use the following domain mappings where applicable. When user mentions the business term (left), translate it to the database schema term (right):
${mappings}
</business_glossary>
`;
}
