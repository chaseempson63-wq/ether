import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getMemoryNodesByUserId,
  getMemoryEdgesByUserId,
  createMemoryNode,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { processContent } from "../graphPipeline";
import { checkRateLimit } from "../rateLimit";
import { TRPCError } from "@trpc/server";
import {
  nodeTypeEnum,
  hallidayLayerEnum,
} from "../../drizzle/schema";

const HALLIDAY_LAYERS = hallidayLayerEnum.enumValues;
const NODE_TYPES = nodeTypeEnum.enumValues;

/** Weights per layer — must sum to 1.0, matches halliday router */
const LAYER_WEIGHTS: Record<string, number> = {
  voice_and_language: 0.2,
  memory_and_life_events: 0.2,
  reasoning_and_decisions: 0.25,
  values_and_beliefs: 0.2,
  emotional_patterns: 0.15,
};

/** Target node count per layer for "complete" status */
const LAYER_TARGET = 20;

export const mindMapRouter = router({
  /**
   * Returns the full graph for the current user, shaped for react-force-graph-2d.
   */
  graph: protectedProcedure.query(async ({ ctx }) => {
    const [nodes, edges] = await Promise.all([
      getMemoryNodesByUserId(ctx.user.id, undefined, 500),
      getMemoryEdgesByUserId(ctx.user.id, 1000),
    ]);

    const nodeIds = new Set(nodes.map((n) => n.id));

    // Only include edges where both endpoints exist in the node set
    const validEdges = edges.filter(
      (e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId)
    );

    // Count edges per node (both directions)
    const edgeCounts = new Map<string, number>();
    for (const e of validEdges) {
      edgeCounts.set(e.sourceNodeId, (edgeCounts.get(e.sourceNodeId) ?? 0) + 1);
      edgeCounts.set(e.targetNodeId, (edgeCounts.get(e.targetNodeId) ?? 0) + 1);
    }

    const maxEdges = Math.max(1, ...Array.from(edgeCounts.values()));

    // Build layer stats
    const layerCounts = new Map<string, number>();
    const layerDepthSums = new Map<string, number>();
    for (const n of nodes) {
      const layer = n.hallidayLayer;
      layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
      const depth = (edgeCounts.get(n.id) ?? 0) / maxEdges;
      layerDepthSums.set(layer, (layerDepthSums.get(layer) ?? 0) + depth);
    }

    const layerStats = HALLIDAY_LAYERS.map((layer) => {
      const count = layerCounts.get(layer) ?? 0;
      const avgDepth = count > 0 ? (layerDepthSums.get(layer) ?? 0) / count : 0;
      const completion = Math.min(count / LAYER_TARGET, 1);
      return { layer, count, avgDepth, completion };
    });

    // Weighted overall progress
    const overallProgress = layerStats.reduce(
      (sum, ls) => sum + ls.completion * (LAYER_WEIGHTS[ls.layer] ?? 0),
      0
    );

    const graphNodes = nodes.map((n) => {
      const ec = edgeCounts.get(n.id) ?? 0;
      const name =
        (n.metadata as Record<string, unknown>)?.name as string | undefined;
      return {
        id: n.id,
        label: name ?? n.summary ?? n.content.slice(0, 60),
        nodeType: n.nodeType,
        hallidayLayer: n.hallidayLayer,
        summary: n.summary ?? n.content.slice(0, 200),
        content: n.content,
        depth: ec / maxEdges,
        edgeCount: ec,
        createdAt: n.createdAt,
      };
    });

    const graphEdges = validEdges.map((e) => ({
      source: e.sourceNodeId,
      target: e.targetNodeId,
      relationshipType: e.relationshipType,
      strength: e.strength ?? 0.5,
    }));

    return {
      nodes: graphNodes,
      edges: graphEdges,
      layerStats,
      overallProgress,
    };
  }),

  /**
   * AI-generated gap-analysis prompts targeting thin areas of the identity graph.
   */
  prompts: protectedProcedure.query(async ({ ctx }) => {
    const nodes = await getMemoryNodesByUserId(ctx.user.id, undefined, 500);

    // Count per layer and per node type
    const layerCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    for (const n of nodes) {
      layerCounts.set(n.hallidayLayer, (layerCounts.get(n.hallidayLayer) ?? 0) + 1);
      typeCounts.set(n.nodeType, (typeCounts.get(n.nodeType) ?? 0) + 1);
    }

    const sparseLayers = HALLIDAY_LAYERS.filter(
      (l) => (layerCounts.get(l) ?? 0) < 5
    );
    const missingTypes = NODE_TYPES.filter(
      (t) => (typeCounts.get(t) ?? 0) === 0
    );

    const layerSummary = HALLIDAY_LAYERS.map(
      (l) => `${l}: ${layerCounts.get(l) ?? 0} nodes`
    ).join(", ");

    const typeSummary = NODE_TYPES.map(
      (t) => `${t}: ${typeCounts.get(t) ?? 0}`
    ).join(", ");

    try {
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a gap-analysis engine for a personal identity knowledge graph. Given a summary of the user's graph, generate exactly 3 thoughtful questions that target the weakest areas. Each question should help the user reveal something meaningful about themselves.

Return ONLY a JSON array of objects with these fields:
- "question": a warm, conversational question (1-2 sentences)
- "targetLayer": one of [${HALLIDAY_LAYERS.join(", ")}]
- "targetNodeType": one of [${NODE_TYPES.join(", ")}]

Focus on sparse layers and missing node types. Questions should feel personal, not clinical.`,
          },
          {
            role: "user",
            content: `Identity graph summary:
Layers: ${layerSummary}
Node types: ${typeSummary}
Sparse layers: ${sparseLayers.length > 0 ? sparseLayers.join(", ") : "none"}
Missing node types: ${missingTypes.length > 0 ? missingTypes.join(", ") : "none"}
Total nodes: ${nodes.length}`,
          },
        ],
      });

      const raw = result.choices?.[0]?.message?.content;
      const text = typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw.filter((p): p is { type: "text"; text: string } => typeof p === "object" && p.type === "text").map((p) => p.text).join("")
          : "";

      // Extract JSON array from response (may be wrapped in markdown code fence)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { prompts: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        question: string;
        targetLayer: string;
        targetNodeType: string;
      }>;

      const prompts = parsed
        .filter(
          (p) =>
            typeof p.question === "string" &&
            HALLIDAY_LAYERS.includes(p.targetLayer as typeof HALLIDAY_LAYERS[number]) &&
            NODE_TYPES.includes(p.targetNodeType as typeof NODE_TYPES[number])
        )
        .slice(0, 3)
        .map((p, i) => ({
          id: `prompt-${i}`,
          question: p.question,
          targetLayer: p.targetLayer as typeof HALLIDAY_LAYERS[number],
          targetNodeType: p.targetNodeType as typeof NODE_TYPES[number],
        }));

      return { prompts };
    } catch (err) {
      console.error("[mindMap.prompts] LLM call failed:", err);
      return { prompts: [] };
    }
  }),

  /**
   * Save an inline answer from a prompt bubble as a new memory node.
   */
  answer: protectedProcedure
    .input(
      z.object({
        question: z.string(),
        answer: z.string().min(1),
        targetLayer: z.enum(hallidayLayerEnum.enumValues),
        targetNodeType: z.enum(nodeTypeEnum.enumValues),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rl = checkRateLimit(`mindmap:${ctx.user.id}`, 10, 60_000);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limited. Retry after ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s.`,
        });
      }

      const node = await createMemoryNode(ctx.user.id, {
        nodeType: input.targetNodeType,
        hallidayLayer: input.targetLayer,
        content: input.answer,
        sourceType: "reflection",
        confidence: 1.0,
        metadata: {
          source: "mind_map",
          question: input.question,
        },
      });

      // Fire-and-forget entity extraction + embedding
      processContent(ctx.user.id, input.answer, "reflection");

      return { success: true as const, nodeId: node.id };
    }),
});
