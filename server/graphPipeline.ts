import { invokeLLM } from "./_core/llm";
import { generateEmbedding } from "./embeddingService";
import {
  createMemoryNode,
  createMemoryEdge,
  searchMemoryNodesByName,
  updateMemoryNode,
  getMemoryNodesByIds,
} from "./db";
import type { InsertMemoryNode } from "../drizzle/schema";

// ─── Types ───

interface ExtractedEntity {
  name: string;
  node_type: string;
  halliday_layer: string;
  summary: string;
}

interface ProposedEdge {
  source_name: string;
  target_name: string;
  relationship_type: string;
  strength: number;
  evidence: string;
}

// ─── Valid enum values (for sanitization) ───

const VALID_NODE_TYPES = new Set([
  "memory", "person", "place", "value", "belief",
  "reasoning_pattern", "decision", "skill", "event",
  "emotion", "concept",
]);

const VALID_HALLIDAY_LAYERS = new Set([
  "voice_and_language", "memory_and_life_events",
  "reasoning_and_decisions", "values_and_beliefs",
  "emotional_patterns",
]);

const VALID_RELATIONSHIP_TYPES = new Set([
  "taught_by", "influenced_by", "contradicts", "supports",
  "evolved_from", "experienced_during", "related_to", "caused",
  "involves_person", "involves_place",
  "elaborates_on",
]);

// ─── Helpers ───

function parseJsonFromLLM(text: string): unknown {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned);
}

function sanitizeEntity(e: unknown): ExtractedEntity | null {
  if (!e || typeof e !== "object") return null;
  const obj = e as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return null;

  // Map the Venice response layer names to our enum values
  let layer = typeof obj.halliday_layer === "string" ? obj.halliday_layer : "memory_and_life_events";
  // Venice might return shortened names — normalize
  if (layer === "memory_events") layer = "memory_and_life_events";
  if (layer === "reasoning_decisions") layer = "reasoning_and_decisions";
  if (layer === "values_beliefs") layer = "values_and_beliefs";
  if (layer === "emotional_patterns") layer = "emotional_patterns";
  if (layer === "voice_language") layer = "voice_and_language";

  return {
    name,
    node_type: VALID_NODE_TYPES.has(obj.node_type as string)
      ? (obj.node_type as string)
      : "concept",
    halliday_layer: VALID_HALLIDAY_LAYERS.has(layer) ? layer : "memory_and_life_events",
    summary: typeof obj.summary === "string" ? obj.summary.slice(0, 500) : name,
  };
}

function sanitizeEdge(e: unknown): ProposedEdge | null {
  if (!e || typeof e !== "object") return null;
  const obj = e as Record<string, unknown>;
  const source = typeof obj.source_name === "string" ? obj.source_name.trim() : "";
  const target = typeof obj.target_name === "string" ? obj.target_name.trim() : "";
  if (!source || !target) return null;

  const relType = typeof obj.relationship_type === "string" ? obj.relationship_type : "related_to";

  return {
    source_name: source,
    target_name: target,
    relationship_type: VALID_RELATIONSHIP_TYPES.has(relType) ? relType : "related_to",
    strength: typeof obj.strength === "number" ? Math.max(0, Math.min(1, obj.strength)) : 0.5,
    evidence: typeof obj.evidence === "string" ? obj.evidence.slice(0, 500) : "",
  };
}

// ─── Step 1: Extract entities ───

async function extractEntities(content: string): Promise<ExtractedEntity[]> {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are an entity extraction engine for a personal memory graph. " +
          "Given the following text written by or about a person, extract all meaningful entities. " +
          "For each entity return a JSON array of objects with: " +
          "name (string), node_type (one of: person, place, value, belief, reasoning_pattern, decision, skill, event, emotion, concept), " +
          "halliday_layer (one of: voice_and_language, memory_and_life_events, reasoning_and_decisions, values_and_beliefs, emotional_patterns), " +
          "summary (1-2 sentence description of this entity in context). " +
          "Return ONLY valid JSON, no other text.",
      },
      { role: "user", content },
    ],
  });

  const raw = typeof result.choices?.[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : "[]";

  try {
    const parsed = parseJsonFromLLM(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeEntity).filter((e): e is ExtractedEntity => e !== null);
  } catch (err) {
    console.error("[GraphPipeline] Failed to parse entity extraction response:", err);
    return [];
  }
}

// ─── Step 2: Resolve or create nodes ───

async function resolveOrCreateNodes(
  userId: number,
  entities: ExtractedEntity[],
  sourceType: InsertMemoryNode["sourceType"]
): Promise<Map<string, string>> {
  // Map: entity name → node UUID
  const nameToId = new Map<string, string>();

  for (const entity of entities) {
    // Search for existing nodes with fuzzy name match
    const matches = await searchMemoryNodesByName(userId, entity.name, 5);

    if (matches.length > 0) {
      // Use the best match (first result)
      const existing = matches[0];
      nameToId.set(entity.name, existing.id);

      // Update metadata: merge aliases, update summary if richer
      const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
      const aliases = new Set<string>((existingMeta.aliases as string[]) ?? []);
      aliases.add(entity.name);
      if (existingMeta.name) aliases.add(existingMeta.name as string);

      await updateMemoryNode(existing.id, {
        metadata: {
          ...existingMeta,
          name: existingMeta.name ?? entity.name,
          aliases: Array.from(aliases),
          lastMentioned: new Date().toISOString(),
        },
        summary: entity.summary.length > (existing.summary?.length ?? 0)
          ? entity.summary
          : undefined,
      });
    } else {
      // Create new node
      const node = await createMemoryNode(userId, {
        nodeType: entity.node_type as InsertMemoryNode["nodeType"],
        hallidayLayer: entity.halliday_layer as InsertMemoryNode["hallidayLayer"],
        content: entity.summary,
        summary: entity.summary,
        sourceType,
        confidence: 0.8,
        metadata: {
          name: entity.name,
          aliases: [entity.name],
          autoExtracted: true,
          lastMentioned: new Date().toISOString(),
        },
      });
      if (node) nameToId.set(entity.name, node.id);
    }
  }

  return nameToId;
}

// ─── Step 3: Create edges ───

async function proposeAndCreateEdges(
  userId: number,
  content: string,
  entities: ExtractedEntity[],
  nameToId: Map<string, string>
): Promise<void> {
  if (entities.length < 2) return; // Need at least 2 entities for edges

  const entityList = entities.map((e) => `${e.name} (${e.node_type})`).join(", ");

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "Given this text and these entities, propose relationships between them. " +
          "Return a JSON array of objects with: " +
          "source_name (string), target_name (string), " +
          "relationship_type (one of: taught_by, influenced_by, contradicts, supports, evolved_from, experienced_during, related_to, caused, involves_person, involves_place), " +
          "strength (0-1 float), evidence (short quote or paraphrase from the text that justifies this edge). " +
          "Return ONLY valid JSON, no other text.",
      },
      {
        role: "user",
        content: `Text: ${content}\n\nEntities: ${entityList}`,
      },
    ],
  });

  const raw = typeof result.choices?.[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : "[]";

  let edges: ProposedEdge[];
  try {
    const parsed = parseJsonFromLLM(raw);
    if (!Array.isArray(parsed)) return;
    edges = parsed.map(sanitizeEdge).filter((e): e is ProposedEdge => e !== null);
  } catch (err) {
    console.error("[GraphPipeline] Failed to parse edge proposal response:", err);
    return;
  }

  for (const edge of edges) {
    // Resolve names to node IDs — try exact match first, then fuzzy
    let sourceId = nameToId.get(edge.source_name);
    let targetId = nameToId.get(edge.target_name);

    // Fuzzy fallback: find a key that contains the name or vice versa
    if (!sourceId) {
      const lower = edge.source_name.toLowerCase();
      for (const [name, id] of nameToId) {
        if (name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase())) {
          sourceId = id;
          break;
        }
      }
    }
    if (!targetId) {
      const lower = edge.target_name.toLowerCase();
      for (const [name, id] of nameToId) {
        if (name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase())) {
          targetId = id;
          break;
        }
      }
    }

    if (!sourceId || !targetId || sourceId === targetId) continue;

    try {
      await createMemoryEdge(userId, {
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        relationshipType: edge.relationship_type,
        strength: edge.strength,
        evidence: edge.evidence,
      });
    } catch (err) {
      console.error("[GraphPipeline] Failed to create edge:", err);
    }
  }
}

// ─── Step 4: Generate embeddings ───

async function embedNodes(nameToId: Map<string, string>, entities: ExtractedEntity[]): Promise<void> {
  for (const entity of entities) {
    const nodeId = nameToId.get(entity.name);
    if (!nodeId) continue;

    try {
      const embeddingText = `${entity.name}: ${entity.summary}`;
      const result = await generateEmbedding(embeddingText);
      await updateMemoryNode(nodeId, { embedding: result.embedding });
    } catch (err) {
      console.error(`[GraphPipeline] Failed to embed node "${entity.name}":`, err);
    }
  }
}

// ─── Retry helper ───

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 1,
  delayMs = 3000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        console.warn(
          `[GraphPipeline] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms:`,
          err instanceof Error ? err.message : err
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

// ─── Main pipeline entry point ───

/**
 * Process content through the graph extraction pipeline.
 * Runs asynchronously — caller should fire-and-forget.
 * Each step has 1 retry with a 3-second delay on failure.
 *
 * 1. Extract entities via Venice
 * 2. Resolve duplicates or create new nodes
 * 3. Propose and create edges between entities
 * 4. Generate embeddings for new/updated nodes
 */
export async function processContent(
  userId: number,
  content: string,
  sourceType: InsertMemoryNode["sourceType"]
): Promise<void> {
  try {
    console.log(`[GraphPipeline] Starting extraction for user ${userId} (${content.length} chars)`);

    // Step 1: Extract entities (with retry)
    const entities = await withRetry(
      () => extractEntities(content),
      "extractEntities"
    );
    if (entities.length === 0) {
      console.log("[GraphPipeline] No entities extracted, skipping");
      return;
    }
    console.log(`[GraphPipeline] Extracted ${entities.length} entities: ${entities.map((e) => e.name).join(", ")}`);

    // Step 2: Resolve or create nodes (with retry)
    const nameToId = await withRetry(
      () => resolveOrCreateNodes(userId, entities, sourceType),
      "resolveOrCreateNodes"
    );
    console.log(`[GraphPipeline] Resolved/created ${nameToId.size} nodes`);

    // Step 3: Create edges (with retry)
    await withRetry(
      () => proposeAndCreateEdges(userId, content, entities, nameToId),
      "proposeAndCreateEdges"
    );
    console.log("[GraphPipeline] Edges created");

    // Step 4: Generate embeddings (with retry)
    await withRetry(
      () => embedNodes(nameToId, entities),
      "embedNodes"
    );
    console.log("[GraphPipeline] Embeddings generated");

    console.log(`[GraphPipeline] Done for user ${userId}`);
  } catch (err) {
    console.error(
      "[GraphPipeline] Pipeline failed after retries:",
      err instanceof Error ? err.message : err
    );
    // Never throw — this is a background job
  }
}

/**
 * Process a probe response — the user answered a prompt targeting an existing node.
 *
 * Default behavior: enrich the source node by appending the probe response to its
 * content and regenerating the embedding. No new node is created for the raw answer.
 *
 * Escalation: if entity extraction finds genuinely new entities (not already in the
 * user's graph), create child nodes for them and link each back to the source with
 * an "elaborates_on" edge. Existing entities are still touched for metadata/alias
 * updates (handled by resolveOrCreateNodes) but no duplicate edges are created.
 *
 * Returns the IDs of any newly created child nodes so the caller can surface them
 * to the UI. Never throws — errors are logged and a safe shape is returned.
 */
export async function processProbeResponse(
  userId: number,
  sourceNodeId: string,
  probeResponse: string,
  sourceType: InsertMemoryNode["sourceType"]
): Promise<{ enrichedSource: boolean; newChildNodeIds: string[] }> {
  try {
    // Step 1: Fetch the source node and verify ownership
    const sources = await getMemoryNodesByIds([sourceNodeId]);
    const source = sources[0];
    if (!source || source.userId !== userId) {
      console.warn(
        `[GraphPipeline] Probe source ${sourceNodeId} missing or not owned by user ${userId}`
      );
      return { enrichedSource: false, newChildNodeIds: [] };
    }

    // Step 2: Append probe response to content, regenerate embedding, bump updatedAt
    const nextContent = `${source.content}\n\n${probeResponse}`.trim();
    const embeddingInput = source.summary
      ? `${source.summary}: ${nextContent}`
      : nextContent;

    let nextEmbedding: number[] | undefined;
    try {
      const embedRes = await generateEmbedding(embeddingInput);
      nextEmbedding = embedRes.embedding;
    } catch (e) {
      console.warn(
        "[GraphPipeline] Failed to re-embed enriched source, keeping old embedding:",
        e
      );
    }

    await updateMemoryNode(sourceNodeId, {
      content: nextContent,
      embedding: nextEmbedding,
    });

    // Step 3: Extract entities from the probe response only (not the merged content)
    const entities = await withRetry(
      () => extractEntities(probeResponse),
      "extractProbeEntities"
    );
    if (entities.length === 0) {
      console.log(
        `[GraphPipeline] Probe ${sourceNodeId}: enriched, no new entities extracted`
      );
      return { enrichedSource: true, newChildNodeIds: [] };
    }

    // Step 4: Resolve or create nodes. Record probeStart so we can tell which nodes
    // were newly created (by createdAt timestamp) vs matched to existing nodes.
    const probeStart = new Date();
    const nameToId = await resolveOrCreateNodes(userId, entities, sourceType);

    const resolvedNodes = await getMemoryNodesByIds(Array.from(nameToId.values()));
    const newChildNodeIds = resolvedNodes
      .filter((n) => n.id !== sourceNodeId && n.createdAt >= probeStart)
      .map((n) => n.id);

    // Step 5: Edge each new child back to the source with "elaborates_on"
    for (const childId of newChildNodeIds) {
      try {
        await createMemoryEdge(userId, {
          sourceNodeId,
          targetNodeId: childId,
          relationshipType: "elaborates_on",
          strength: 0.8,
          evidence: probeResponse.slice(0, 500),
        });
      } catch (e) {
        console.warn(
          `[GraphPipeline] Failed to create elaborates_on edge ${sourceNodeId} -> ${childId}:`,
          e
        );
      }
    }

    // Step 6: Generate embeddings for newly created children only
    if (newChildNodeIds.length > 0) {
      const newEntityNameToId = new Map<string, string>();
      const newEntities: ExtractedEntity[] = [];
      for (const e of entities) {
        const id = nameToId.get(e.name);
        if (id && newChildNodeIds.includes(id)) {
          newEntityNameToId.set(e.name, id);
          newEntities.push(e);
        }
      }
      await embedNodes(newEntityNameToId, newEntities);
    }

    console.log(
      `[GraphPipeline] Probe ${sourceNodeId}: enriched source, created ${newChildNodeIds.length} child node(s)`
    );
    return { enrichedSource: true, newChildNodeIds };
  } catch (err) {
    console.error(
      "[GraphPipeline] processProbeResponse failed:",
      err instanceof Error ? err.message : err
    );
    return { enrichedSource: false, newChildNodeIds: [] };
  }
}
