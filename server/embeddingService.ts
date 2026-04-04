import { ENV } from "./_core/env";

/**
 * Embedding Service
 * Generates and manages vector embeddings for semantic search
 */

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens: number;
}

/**
 * Generate embedding for text using OpenAI's API via Manus built-in service
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  try {
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      throw new Error("Embedding service not configured");
    }

    const response = await fetch(`${ENV.forgeApiUrl}/v1/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Extract embedding from response
    const embedding = data.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Invalid embedding response format");
    }

    return {
      embedding,
      model: data.model || "text-embedding-3-small",
      tokens: data.usage?.total_tokens || 0,
    };
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate embeddings for multiple texts (batch operation)
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<EmbeddingResult[]> {
  try {
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      throw new Error("Embedding service not configured");
    }

    const response = await fetch(`${ENV.forgeApiUrl}/v1/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Extract embeddings from response
    const embeddings = data.data?.map((item: any) => ({
      embedding: item.embedding,
      model: data.model || "text-embedding-3-small",
      tokens: data.usage?.total_tokens || 0,
    }));

    if (!embeddings || embeddings.length === 0) {
      throw new Error("No embeddings returned from API");
    }

    return embeddings;
  } catch (error) {
    console.error("Failed to generate embeddings batch:", error);
    throw new Error(`Batch embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
