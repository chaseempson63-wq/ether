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
import { invalidateRecommendationCache } from "./home";
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
   * AI-generated prompts targeting specific shallow nodes in the identity graph.
   */
  prompts: protectedProcedure.query(async ({ ctx }) => {
    const [nodes, edges] = await Promise.all([
      getMemoryNodesByUserId(ctx.user.id, undefined, 500),
      getMemoryEdgesByUserId(ctx.user.id, 1000),
    ]);

    // Empty graph → return generic fallback prompts
    if (nodes.length === 0) {
      return {
        prompts: [
          { id: "prompt-0", nodeId: null, nodeLabel: "Identity", layer: "voice_and_language" as const, question: "What language do you think in when you're alone?" },
          { id: "prompt-1", nodeId: null, nodeLabel: "Memory", layer: "memory_and_life_events" as const, question: "What moment split your life into before and after?" },
          { id: "prompt-2", nodeId: null, nodeLabel: "Values", layer: "values_and_beliefs" as const, question: "What would you never compromise on?" },
        ],
      };
    }

    // Compute edge counts per node
    const edgeCounts = new Map<string, number>();
    for (const e of edges) {
      edgeCounts.set(e.sourceNodeId, (edgeCounts.get(e.sourceNodeId) ?? 0) + 1);
      edgeCounts.set(e.targetNodeId, (edgeCounts.get(e.targetNodeId) ?? 0) + 1);
    }
    const maxEdges = Math.max(1, ...Array.from(edgeCounts.values()));

    // Build node summaries sorted by shallowest first
    const nodeSummaries = nodes.map((n) => {
      const ec = edgeCounts.get(n.id) ?? 0;
      const name = (n.metadata as Record<string, unknown>)?.name as string | undefined;
      return {
        id: n.id,
        label: name ?? n.summary ?? n.content.slice(0, 60),
        layer: n.hallidayLayer,
        edgeCount: ec,
        depth: ec / maxEdges,
      };
    }).sort((a, b) => a.depth - b.depth);

    // Pick shallowest nodes from different layers for Venice context
    const contextNodes = nodeSummaries.slice(0, 20);

    try {
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are generating targeted questions to deepen a user's digital mind graph. You will receive their existing memory nodes with depth scores. For each question, you MUST reference a specific existing node by name and ask something that would add connections or depth to that node.

Return JSON only, no preamble, no markdown backticks:
{"prompts":[{"nodeId":"uuid","nodeLabel":"label","layer":"layer_enum","question":"12-20 words referencing the node specifically"}]}

Rules:
- Generate exactly 3 prompts targeting the 3 shallowest nodes from different layers.
- Each question MUST reference the specific node by name. Never generic.
- Bad: "What is your core value?" Good: "You mentioned faith but haven't said how it shaped your biggest decisions"
- 12-20 words per question. Direct, not therapeutic.
- nodeId and nodeLabel must match exactly from the input nodes.
- layer must be one of: ${HALLIDAY_LAYERS.join(", ")}`,
          },
          {
            role: "user",
            content: JSON.stringify({ nodes: contextNodes }),
          },
        ],
      });

      const raw = result.choices?.[0]?.message?.content;
      const text = typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw.filter((p): p is { type: "text"; text: string } => typeof p === "object" && p.type === "text").map((p) => p.text).join("")
          : "";

      const jsonStr = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(jsonStr) as {
        prompts: Array<{
          nodeId: string;
          nodeLabel: string;
          layer: string;
          question: string;
        }>;
      };

      // Validate: nodeId must exist, layer must be valid
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      const prompts = (parsed.prompts ?? [])
        .filter(
          (p) =>
            typeof p.question === "string" &&
            typeof p.nodeLabel === "string" &&
            HALLIDAY_LAYERS.includes(p.layer as typeof HALLIDAY_LAYERS[number])
        )
        .slice(0, 3)
        .map((p, i) => ({
          id: `prompt-${i}`,
          nodeId: nodeIdSet.has(p.nodeId) ? p.nodeId : null,
          nodeLabel: p.nodeLabel,
          layer: p.layer as typeof HALLIDAY_LAYERS[number],
          question: p.question,
        }));

      return { prompts: prompts.length > 0 ? prompts : [] };
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
      invalidateRecommendationCache(ctx.user.id);

      return { success: true as const, nodeId: node.id };
    }),
});
