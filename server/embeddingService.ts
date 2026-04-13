import { ENV } from "./_core/env";

const VENICE_EMBEDDINGS_URL = "https://api.venice.ai/api/v1/embeddings";
const VENICE_EMBEDDING_MODEL = "text-embedding-bge-m3";

/**
 * Embedding Service
 * Generates vector embeddings via Venice AI (BGE-M3, 1024 dimensions)
 */

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens: number;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  if (!ENV.veniceApiKey) {
    throw new Error("VENICE_API_KEY is not configured");
  }

  const response = await fetch(VENICE_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.veniceApiKey}`,
    },
    body: JSON.stringify({
      model: VENICE_EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding;

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Invalid embedding response format");
  }

  return {
    embedding,
    model: data.model || VENICE_EMBEDDING_MODEL,
    tokens: data.usage?.total_tokens || 0,
  };
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<EmbeddingResult[]> {
  if (!ENV.veniceApiKey) {
    throw new Error("VENICE_API_KEY is not configured");
  }

  const response = await fetch(VENICE_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.veniceApiKey}`,
    },
    body: JSON.stringify({
      model: VENICE_EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const embeddings = data.data?.map((item: any) => ({
    embedding: item.embedding,
    model: data.model || VENICE_EMBEDDING_MODEL,
    tokens: data.usage?.total_tokens || 0,
  }));

  if (!embeddings || embeddings.length === 0) {
    throw new Error("No embeddings returned from API");
  }

  return embeddings;
}
