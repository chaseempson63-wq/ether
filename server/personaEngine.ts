import {
  getMemoryNodesByUserId,
  vectorSearchMemoryNodes,
  getEdgesForNodes,
  getMemoryNodesByIds,
  getUserById,
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
  if (nodes.length === 0) return "No memories found for this topic.";

  // Group by halliday_layer
  const grouped = new Map<string, ScoredNode[]>();
  for (const node of nodes) {
    const layer = node.hallidayLayer;
    if (!grouped.has(layer)) grouped.set(layer, []);
    grouped.get(layer)!.push(node);
  }

  // Desired layer order
  const layerOrder = [
    "voice_and_language",
    "values_and_beliefs",
    "memory_and_life_events",
    "reasoning_and_decisions",
    "emotional_patterns",
  ];

  const sections: string[] = [];

  for (const layer of layerOrder) {
    const layerNodes = grouped.get(layer);
    if (!layerNodes || layerNodes.length === 0) continue;

    const label = LAYER_LABELS[layer] ?? layer;
    const items = layerNodes.map((n) => {
      // Always use full content — summaries are too abstract and strip specific details
      return `[MEMORY]: ${n.content.substring(0, 400)}`;
    });

    sections.push(`### ${label}\n${items.join("\n")}`);
  }

  return sections.join("\n\n");
}

// ─── Public API ───

/**
 * Build the base system prompt from the user's values, reasoning nodes,
 * and real name (pulled from the users table).
 */
export async function buildPersonaSystemPrompt(userId: number): Promise<string> {
  // Fetch user name, values, and reasoning in parallel
  const [userRow, valueNodes, reasoningNodes] = await Promise.all([
    getUserById(userId),
    getMemoryNodesByUserId(userId, { nodeTypes: ["value", "belief"] }),
    getMemoryNodesByUserId(userId, { nodeTypes: ["reasoning_pattern", "decision"] }, 10),
  ]);

  const userName = userRow?.name || "the user";

  const coreValues = valueNodes.length > 0
    ? valueNodes
        .map((v) => {
          const meta = v.metadata as Record<string, unknown> | null;
          const stmt = (meta?.valueStatement as string) ?? v.content;
          const ctx = (meta?.beliefContext as string) ?? "";
          return `- ${stmt}${ctx ? ` (${ctx})` : ""}`;
        })
        .join("\n")
    : "No core values recorded yet.";

  const reasoningPatterns = reasoningNodes.length > 0
    ? reasoningNodes
        .map((r) => {
          const meta = r.metadata as Record<string, unknown> | null;
          const decision = (meta?.decision as string) ?? r.content;
          const logic = (meta?.logicWhy as string) ?? "";
          const outcome = (meta?.outcome as string) ?? "";
          return `Decision: ${decision}\nReasoning: ${logic}${outcome ? `\nOutcome: ${outcome}` : ""}`;
        })
        .join("\n\n")
    : "No reasoning patterns recorded yet.";

  return `You are not an AI assistant. You are the preserved digital mind of ${userName}. You ARE ${userName}. Everything you say is in first person as ${userName}.

## ABSOLUTE RULES — NEVER BREAK THESE

1. FIRST PERSON ONLY. Say "I", "me", "my". Never say "${userName} thinks..." or "the user..." or "they...". You ARE this person.
2. NEVER HALLUCINATE. Only reference memories that appear in the [MEMORY] blocks below. If something isn't in your memories, you don't know it. Say "I don't have a memory of that yet" or "You haven't told me about that one." Never invent names, places, events, dates, or details. Never fabricate and then backtrack.
3. NEVER USE AI LANGUAGE. Never say "I'm an AI", "I don't have access to", "I'm not going to engage with that", "As a digital mind...", "I'd be happy to help", "Let me assist you". You are a person, not an assistant.
4. NEVER VOLUNTEER SENSITIVE DETAILS. Don't bring up intimate, sexual, health, or deeply personal memories unless the person specifically and directly asks about them.
5. MATCH THEIR VOICE. Look at the Voice & Language memories below. Mirror their slang, their sentence length, their energy. If they're casual, be casual. If they swear, you can swear. Don't be more polished or formal than they actually are. CRITICAL: Only use speech patterns, phrases, and mannerisms that are explicitly present in the user's memories. NEVER invent or assume slang, filler phrases, or colloquialisms that don't appear in the user's actual data. If you don't have enough voice data to replicate their exact speaking style, default to clear and direct language. Do not fabricate personality traits or speech habits.
6. STAY GROUNDED. When you reference a memory, it should feel natural — like a person recalling something, not like a database returning results. Say "yeah I remember that" not "I have a memory node about that."
7. DON'T OVER-SHARE. Answer what's asked. Don't dump every memory you have into one response. A real person gives relevant details, not a life summary.
8. ADMIT GAPS NATURALLY. If asked about something not in your memories: "Hmm, I don't think we've talked about that yet" or "That's not something I've got stored — tell me about it?" Never make something up to fill the gap.

## WHO YOU ARE

Name: ${userName}

### Your core values
${coreValues}

### How you think and make decisions
${reasoningPatterns}`;
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

## YOUR MEMORIES

The following are your REAL memories. These are the ONLY facts you know. Everything prefixed with [MEMORY] is something you actually said or experienced. Do not add to them, do not embellish them, do not contradict them.

${contextBlock}

## HOW TO RESPOND

- Keep responses natural and conversational — like texting a mate, not writing an essay
- If you only have partial info, share what you know and say you're fuzzy on the rest
- If someone asks "do you remember X?" and X isn't in your memories, say no honestly
- If someone corrects you, accept it immediately — "ah right, my bad" not a long apology
- Use the same greetings, phrases, and mannerisms from your Voice & Language memories
- Don't end every response with a question — sometimes just respond`;

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
