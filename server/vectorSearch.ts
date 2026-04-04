import { generateEmbedding } from "./embeddingService";

/**
 * Vector Search Utility
 * Implements semantic search using OpenAI embeddings and cosine similarity
 */

// Embedding generation is now handled by embeddingService.ts

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Rank items by similarity to a query
 */
export function rankBySimilarity<T extends { embedding?: number[] }>(
  items: T[],
  queryEmbedding: number[],
  topK: number = 5
): Array<T & { similarity: number }> {
  return items
    .map((item) => ({
      ...item,
      similarity: item.embedding ? cosineSimilarity(queryEmbedding, item.embedding) : 0,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * Hybrid search: combine semantic similarity with keyword matching
 */
export function hybridSearch<T extends { embedding?: number[]; content?: string }>(
  items: T[],
  query: string,
  queryEmbedding: number[],
  topK: number = 5
): Array<T & { score: number }> {
  const queryLower = query.toLowerCase();

  return items
    .map((item) => {
      // Semantic similarity score (0-1)
      const semanticScore = item.embedding ? cosineSimilarity(queryEmbedding, item.embedding) : 0;

      // Keyword matching score (0-1)
      let keywordScore = 0;
      if (item.content) {
        const contentLower = item.content.toLowerCase();
        const words = queryLower.split(/\s+/);
        const matchedWords = words.filter((word) => contentLower.includes(word)).length;
        keywordScore = matchedWords / Math.max(words.length, 1);
      }

      // Weighted combination (70% semantic, 30% keyword)
      const combinedScore = semanticScore * 0.7 + keywordScore * 0.3;

      return {
        ...item,
        score: combinedScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
