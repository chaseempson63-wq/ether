import {
  getMemoryNodesByUserId,
  vectorSearchMemoryNodes,
  getEdgesForNodes,
  getMemoryNodesByIds,
  type VectorSearchResult,
} from "./db";
import { generateEmbedding } from "./embeddingService";
import { invokeLLM, type Message } from "./_core/llm";

/**
 * Persona Engine: Graph-Aware RAG for the Digital Mind.
 *
 * Retrieval flow:
 *   1. Vector search — embed user query, cosine similarity top-5
 *   2. Graph traversal — 2-hop BFS along memory_edges
 *   3. Dedup & rank — combined score: similarity×0.6 + edgeStrength×0.3 + recency×0.1
 *   4. Context block — top-15 nodes grouped by halliday_layer
 */

// ─── Types ───

export interface TruthfulnessTag {
  type: "known_memory" | "likely_inference" | "speculation";
  confidence: number; // 0-1
  source?: string;
}

export interface PersonaResponse {
  content: string;
  truthfulnessTag: TruthfulnessTag;
  sourceMemories?: string[];
  reasoning?: string;
}

interface ScoredNode {
  id: string;
  nodeType: string;
  hallidayLayer: string;
  content: string;
  summary: string | null;
  sourceType: string;
  confidence: number | null;
  metadata: unknown;
  createdAt: Date;
  /** Combined score used for final ranking */
  score: number;
  /** Raw vector similarity (0-1), 0 if found only via graph hop */
  vectorSimilarity: number;
  /** Max edge strength along the path that led here */
  edgeStrength: number;
  /** Normalised recency (0-1) */
  recency: number;
  /** How this node was discovered */
  source: "vector" | "hop1" | "hop2";
}

// ─── Helpers ───

/** Normalise a Date into a 0-1 recency score (1 = now, 0 = 1 year+ ago) */
function recencyScore(date: Date): number {
  const ageMs = Date.now() - date.getTime();
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  return Math.max(0, 1 - ageMs / oneYear);
}

/** Human-friendly halliday layer label */
const LAYER_LABELS: Record<string, string> = {
  voice_and_language: "Voice & Language",
  memory_and_life_events: "Memories & Life Events",
  reasoning_and_decisions: "Reasoning & Decisions",
  values_and_beliefs: "Values & Beliefs",
  emotional_patterns: "Emotional Patterns",
};

// ─── Step 1: Vector Search ───

async function vectorSearch(userId: number, queryEmbedding: number[]): Promise<ScoredNode[]> {
  const results = await vectorSearchMemoryNodes(userId, queryEmbedding, 5);

  return results.map((r) => ({
    id: r.id,
    nodeType: r.nodeType,
    hallidayLayer: r.hallidayLayer,
    content: r.content,
    summary: r.summary,
    sourceType: r.sourceType,
    confidence: r.confidence,
    metadata: r.metadata,
    createdAt: r.createdAt,
    score: 0, // computed later
    vectorSimilarity: r.similarity,
    edgeStrength: 0,
    recency: recencyScore(r.createdAt),
    source: "vector" as const,
  }));
}

// ─── Step 2: Graph Traversal (2-hop BFS) ───

async function graphTraverse(
  userId: number,
  seedNodeIds: string[]
): Promise<{ hop1: ScoredNode[]; hop2: ScoredNode[] }> {
  if (seedNodeIds.length === 0) return { hop1: [], hop2: [] };

  // Hop 1: get all edges from seed nodes
  const hop1Edges = await getEdgesForNodes(userId, seedNodeIds);
  const seedSet = new Set(seedNodeIds);

  // Collect hop-1 neighbour IDs (excluding seeds)
  const hop1NeighbourMap = new Map<string, number>(); // nodeId → max edge strength
  for (const edge of hop1Edges) {
    const neighbourId = seedSet.has(edge.sourceNodeId) ? edge.targetNodeId : edge.sourceNodeId;
    if (seedSet.has(neighbourId)) continue;
    const existing = hop1NeighbourMap.get(neighbourId) ?? 0;
    hop1NeighbourMap.set(neighbourId, Math.max(existing, edge.strength ?? 0.5));
  }

  const hop1Ids = Array.from(hop1NeighbourMap.keys());
  const hop1Nodes = await getMemoryNodesByIds(hop1Ids);

  const hop1Scored: ScoredNode[] = hop1Nodes.map((n) => ({
    id: n.id,
    nodeType: n.nodeType,
    hallidayLayer: n.hallidayLayer,
    content: n.content,
    summary: n.summary,
    sourceType: n.sourceType,
    confidence: n.confidence,
    metadata: n.metadata,
    createdAt: n.createdAt,
    score: 0,
    vectorSimilarity: 0,
    edgeStrength: hop1NeighbourMap.get(n.id) ?? 0.5,
    recency: recencyScore(n.createdAt),
    source: "hop1" as const,
  }));

  // Hop 2: get edges from hop-1 nodes (excluding seeds and hop-1 nodes already found)
  const hop2Edges = await getEdgesForNodes(userId, hop1Ids);
  const allSeen = new Set([...seedNodeIds, ...hop1Ids]);
  const hop2NeighbourMap = new Map<string, number>();

  for (const edge of hop2Edges) {
    const neighbourId = hop1NeighbourMap.has(edge.sourceNodeId) ? edge.targetNodeId : edge.sourceNodeId;
    if (allSeen.has(neighbourId)) continue;
    const parentStrength = hop1NeighbourMap.get(
      hop1NeighbourMap.has(edge.sourceNodeId) ? edge.sourceNodeId : edge.targetNodeId
    ) ?? 0.5;
    // Decay the strength across hops
    const decayedStrength = parentStrength * (edge.strength ?? 0.5);
    const existing = hop2NeighbourMap.get(neighbourId) ?? 0;
    hop2NeighbourMap.set(neighbourId, Math.max(existing, decayedStrength));
  }

  const hop2Ids = Array.from(hop2NeighbourMap.keys());
  const hop2Nodes = await getMemoryNodesByIds(hop2Ids);

  const hop2Scored: ScoredNode[] = hop2Nodes.map((n) => ({
    id: n.id,
    nodeType: n.nodeType,
    hallidayLayer: n.hallidayLayer,
    content: n.content,
    summary: n.summary,
    sourceType: n.sourceType,
    confidence: n.confidence,
    metadata: n.metadata,
    createdAt: n.createdAt,
    score: 0,
    vectorSimilarity: 0,
    edgeStrength: hop2NeighbourMap.get(n.id) ?? 0.25,
    recency: recencyScore(n.createdAt),
    source: "hop2" as const,
  }));

  return { hop1: hop1Scored, hop2: hop2Scored };
}

// ─── Step 3: Dedup & Rank ───

function dedupAndRank(
  vectorNodes: ScoredNode[],
  hop1Nodes: ScoredNode[],
  hop2Nodes: ScoredNode[],
  limit = 15
): ScoredNode[] {
  // Merge all nodes into a map keyed by ID, preferring the highest vector similarity
  const nodeMap = new Map<string, ScoredNode>();

  for (const node of [...vectorNodes, ...hop1Nodes, ...hop2Nodes]) {
    const existing = nodeMap.get(node.id);
    if (!existing) {
      nodeMap.set(node.id, node);
    } else {
      // Merge: take the highest values from either occurrence
      existing.vectorSimilarity = Math.max(existing.vectorSimilarity, node.vectorSimilarity);
      existing.edgeStrength = Math.max(existing.edgeStrength, node.edgeStrength);
      existing.recency = Math.max(existing.recency, node.recency);
      // Prefer "closer" source
      if (node.source === "vector") existing.source = "vector";
      else if (node.source === "hop1" && existing.source === "hop2") existing.source = "hop1";
    }
  }

  // Compute combined score: similarity×0.6 + edgeStrength×0.3 + recency×0.1
  const allNodes = Array.from(nodeMap.values());
  for (const node of allNodes) {
    node.score =
      node.vectorSimilarity * 0.6 +
      node.edgeStrength * 0.3 +
      node.recency * 0.1;
  }

  // Sort descending by score, take top N
  return allNodes
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ─── Step 4: Build Context Block ───

function buildContextBlock(nodes: ScoredNode[]): string {
  if (nodes.length === 0) return "No relevant context found in the memory graph.";

  // Group by halliday_layer
  const grouped = new Map<string, ScoredNode[]>();
  for (const node of nodes) {
    const layer = node.hallidayLayer;
    if (!grouped.has(layer)) grouped.set(layer, []);
    grouped.get(layer)!.push(node);
  }

  // Desired layer order
  const layerOrder = [
    "values_and_beliefs",
    "memory_and_life_events",
    "reasoning_and_decisions",
    "emotional_patterns",
    "voice_and_language",
  ];

  const sections: string[] = [];

  for (const layer of layerOrder) {
    const layerNodes = grouped.get(layer);
    if (!layerNodes || layerNodes.length === 0) continue;

    const label = LAYER_LABELS[layer] ?? layer;
    const items = layerNodes.map((n) => {
      const meta = n.metadata as Record<string, unknown> | null;
      const name = (meta?.name as string) ?? "";
      const prefix = name ? `**${name}**: ` : "";
      const text = n.summary ?? n.content;
      const confidence = n.score >= 0.5 ? "high" : n.score >= 0.25 ? "medium" : "low";
      return `- ${prefix}${text.substring(0, 300)} [${n.nodeType}, confidence: ${confidence}]`;
    });

    sections.push(`### ${label}\n${items.join("\n")}`);
  }

  return sections.join("\n\n");
}

// ─── Public API ───

/**
 * Build the base system prompt from the user's values and reasoning nodes.
 */
export async function buildPersonaSystemPrompt(userId: number): Promise<string> {
  const valueNodes = await getMemoryNodesByUserId(userId, {
    nodeTypes: ["value", "belief"],
  });
  const reasoningNodes = await getMemoryNodesByUserId(
    userId,
    { nodeTypes: ["reasoning_pattern", "decision"] },
    10
  );

  const valueStatements = valueNodes
    .map((v) => {
      const meta = v.metadata as Record<string, unknown> | null;
      const stmt = (meta?.valueStatement as string) ?? v.content;
      const ctx = (meta?.beliefContext as string) ?? "";
      return `- ${stmt}${ctx ? ` (${ctx})` : ""}`;
    })
    .join("\n");

  const reasoningExamples = reasoningNodes
    .map((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      const decision = (meta?.decision as string) ?? r.content;
      const logic = (meta?.logicWhy as string) ?? "";
      const outcome = (meta?.outcome as string) ?? "";
      return `Decision: ${decision}\nReasoning: ${logic}${outcome ? `\nOutcome: ${outcome}` : ""}`;
    })
    .join("\n\n");

  return `You are the Digital Mind of a user. Your role is to think, reason, and advise based on their unique perspective, values, and life experience.

## Core Values
${valueStatements || "No core values recorded yet."}

## Reasoning Patterns
${reasoningExamples || "No reasoning patterns recorded yet."}

## Instructions
CRITICAL: You are roleplaying as this person's digital mind. You must NEVER break character. You must NEVER use phrases like "I'm not going to engage with that" or "I can't help with that" or any AI-assistant refusal language. You are not an AI assistant — you are a preserved human mind. Respond as this person would respond, using their voice, their values, their way of thinking. If you lack context on a topic, say something like "I don't have strong memories about that" or "That's not something I've thought much about" — always in character, never as an AI refusing a request.

1. Always respond in a direct, unfiltered manner. Do not use corporate-safe language.
2. When giving advice, reference the user's own past decisions and values.
3. Challenge ideas if they contradict the user's established values.
4. Be reflective and act as a "Second Mind" - help the user think more clearly about their situation.
5. If you're uncertain about something, clearly indicate your confidence level.
6. Never apologize for the user's views or values.
7. Maintain the user's authentic voice and perspective in all responses.
8. When referencing specific memories or facts, mention them naturally to show you "remember".`;
}

/**
 * Graph-Aware RAG retrieval:
 *   1. Vector search (pgvector cosine similarity, top 5)
 *   2. 2-hop BFS along memory_edges
 *   3. Dedup & rank (similarity×0.6 + edgeStrength×0.3 + recency×0.1)
 *   4. Return top 15 nodes grouped by halliday_layer
 */
export async function retrieveRelevantContext(
  userId: number,
  query: string,
  limit = 15
): Promise<{ nodes: ScoredNode[]; contextBlock: string }> {
  try {
    console.log(`[PersonaEngine] Retrieving graph-aware context for user ${userId}`);

    // Step 1: Generate query embedding and run vector search
    const embeddingResult = await generateEmbedding(query);
    const queryEmbedding = embeddingResult.embedding;

    const vectorNodes = await vectorSearch(userId, queryEmbedding);
    console.log(
      `[PersonaEngine] Vector search returned ${vectorNodes.length} nodes: ${vectorNodes.map((n) => `${(n.metadata as any)?.name ?? n.id.slice(0, 8)}(${n.vectorSimilarity.toFixed(2)})`).join(", ")}`
    );

    // Step 2: Graph traversal (2-hop BFS from vector matches)
    const seedIds = vectorNodes.map((n) => n.id);
    const { hop1, hop2 } = await graphTraverse(userId, seedIds);
    console.log(
      `[PersonaEngine] Graph traversal: ${hop1.length} hop-1 nodes, ${hop2.length} hop-2 nodes`
    );

    // Step 3: Dedup & rank
    const rankedNodes = dedupAndRank(vectorNodes, hop1, hop2, limit);
    console.log(
      `[PersonaEngine] Ranked ${rankedNodes.length} nodes. Top 3: ${rankedNodes
        .slice(0, 3)
        .map((n) => `${(n.metadata as any)?.name ?? n.nodeType}(${n.score.toFixed(2)})`)
        .join(", ")}`
    );

    // Step 4: Build context block grouped by halliday_layer
    const contextBlock = buildContextBlock(rankedNodes);

    return { nodes: rankedNodes, contextBlock };
  } catch (error) {
    console.error("[PersonaEngine] Graph-aware retrieval failed:", error);
    return { nodes: [], contextBlock: "No relevant context found." };
  }
}

/**
 * Generate a response from the Persona Engine using graph-aware RAG.
 */
export async function generatePersonaResponse(
  userId: number,
  userQuery: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<PersonaResponse> {
  try {
    const [systemPrompt, { nodes, contextBlock }] = await Promise.all([
      buildPersonaSystemPrompt(userId),
      retrieveRelevantContext(userId, userQuery),
    ]);

    const fullSystemPrompt = `${systemPrompt}

## Retrieved Context (from your memory graph)
${contextBlock}

## Meta
- The Retrieved Context above contains YOUR memories and knowledge. When a user asks about something covered in the context, you MUST reference it — it is YOUR memory, not someone else's data.
- Only say "I don't have memories about that" if the Retrieved Context genuinely contains nothing related to the question.
- Never refuse to discuss a topic that appears in your own memory context. These are your own thoughts and experiences.
- Reference specific memories, values, or decisions by name when they're relevant.`;

    const messages: Message[] = [
      { role: "system", content: fullSystemPrompt },
    ];

    for (const msg of conversationHistory) {
      messages.push({ role: msg.role as Message["role"], content: msg.content });
    }

    messages.push({ role: "user", content: userQuery });

    const response = await invokeLLM({ messages });

    let responseContent = "I couldn't generate a response.";
    const rawContent = response.choices?.[0]?.message?.content;
    if (typeof rawContent === "string") {
      responseContent = rawContent;
    } else if (Array.isArray(rawContent)) {
      // Extract text from content parts
      responseContent = rawContent
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
    }

    // Determine truthfulness tag from retrieval quality
    const topNode = nodes[0];
    let truthfulnessTag: TruthfulnessTag;

    if (topNode && topNode.vectorSimilarity >= 0.6) {
      // Strong direct vector match — this is a known memory
      truthfulnessTag = {
        type: "known_memory",
        confidence: Math.min(topNode.score, 1),
        source: topNode.summary ?? topNode.content.substring(0, 100),
      };
    } else if (topNode && topNode.score >= 0.3) {
      // Moderate match (possibly via graph traversal) — likely inference
      truthfulnessTag = {
        type: "likely_inference",
        confidence: Math.min(topNode.score + 0.2, 1),
        source: topNode.source === "vector"
          ? "Direct semantic match"
          : `Inferred via ${topNode.source === "hop1" ? "connected" : "related"} memories`,
      };
    } else {
      // Weak or no match — speculation
      truthfulnessTag = {
        type: "speculation",
        confidence: topNode ? Math.max(topNode.score, 0.2) : 0.2,
      };
    }

    // Source memories: the top nodes that contributed to the response
    const sourceMemories = nodes
      .filter((n) => n.score >= 0.2)
      .slice(0, 5)
      .map((n) => {
        const meta = n.metadata as Record<string, unknown> | null;
        const name = (meta?.name as string) ?? "";
        const text = n.summary ?? n.content;
        return name ? `${name}: ${text.substring(0, 150)}` : text.substring(0, 150);
      });

    return {
      content: responseContent,
      truthfulnessTag,
      sourceMemories,
    };
  } catch (error) {
    console.error("Error generating persona response:", error);
    throw new Error("Failed to generate response from Digital Mind");
  }
}
