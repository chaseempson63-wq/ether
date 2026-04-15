import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getMemoryNodesByUserId } from "../db";
import {
  hallidayProgress,
  memoryNodes,
  chatMessages,
  hallidayLayerEnum,
} from "../../drizzle/schema";
import { eq, desc, max, sql, and } from "drizzle-orm";

const HALLIDAY_LAYERS = hallidayLayerEnum.enumValues;

const LAYER_LABELS: Record<string, string> = {
  voice_and_language: "voice",
  memory_and_life_events: "memory",
  reasoning_and_decisions: "reasoning",
  values_and_beliefs: "values",
  emotional_patterns: "emotional",
};

// ─── Shared helper ───

interface ActivityStats {
  lastHalliday: Date | null;
  lastReflection: Date | null;
  lastQuickMemory: Date | null;
  lastChat: Date | null;
  layerCounts: Record<string, number>;
  totalNodes: number;
}

async function getActivityStats(userId: number): Promise<ActivityStats> {
  const db = await getDb();
  if (!db) {
    return {
      lastHalliday: null,
      lastReflection: null,
      lastQuickMemory: null,
      lastChat: null,
      layerCounts: {},
      totalNodes: 0,
    };
  }

  // Run queries in parallel
  const [progressRow, allNodes, chatRow] = await Promise.all([
    // Last Halliday interview
    db
      .select({ lastAt: hallidayProgress.lastQuestionAnsweredAt })
      .from(hallidayProgress)
      .where(eq(hallidayProgress.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    // All memory nodes (for layer counts + source-type timestamps)
    getMemoryNodesByUserId(userId, undefined, 500),

    // Last chat message
    db
      .select({ lastAt: max(chatMessages.createdAt) })
      .from(chatMessages)
      .where(eq(chatMessages.userId, userId))
      .then((rows) => rows[0] ?? null),
  ]);

  // Compute layer counts and source-type timestamps
  const layerCounts: Record<string, number> = {};
  let lastReflection: Date | null = null;
  let lastQuickMemory: Date | null = null;

  for (const n of allNodes) {
    layerCounts[n.hallidayLayer] = (layerCounts[n.hallidayLayer] ?? 0) + 1;
    if (n.sourceType === "reflection" && (!lastReflection || n.createdAt > lastReflection)) {
      lastReflection = n.createdAt;
    }
    if (n.sourceType === "quick_memory" && (!lastQuickMemory || n.createdAt > lastQuickMemory)) {
      lastQuickMemory = n.createdAt;
    }
  }

  return {
    lastHalliday: progressRow?.lastAt ?? null,
    lastReflection,
    lastQuickMemory,
    lastChat: chatRow?.lastAt ?? null,
    layerCounts,
    totalNodes: allNodes.length,
  };
}

// ─── Helpers ───

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function sparsestLayer(
  layerCounts: Record<string, number>
): { layer: string; count: number } | null {
  let min = Infinity;
  let minLayer: string | null = null;
  for (const layer of HALLIDAY_LAYERS) {
    const count = layerCounts[layer] ?? 0;
    if (count < min) {
      min = count;
      minLayer = layer;
    }
  }
  return minLayer && min < 5 ? { layer: minLayer, count: min } : null;
}

// ─── Router ───

export const homeRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    return getActivityStats(ctx.user.id);
  }),

  nudge: protectedProcedure.query(async ({ ctx }) => {
    const stats = await getActivityStats(ctx.user.id);

    // Priority order: Halliday → sparse layer → reflection → quick memory
    const hallidayDays = daysSince(stats.lastHalliday);
    if (hallidayDays === null || hallidayDays >= 3) {
      const d = hallidayDays ?? 0;
      return {
        message:
          d === 0
            ? "You haven't started the Halliday interview yet. One session fills gaps fast."
            : `No interview in ${d} days. One session fills gaps fast.`,
        cta: { label: "Start interview", href: "/halliday" },
      };
    }

    const sparse = sparsestLayer(stats.layerCounts);
    if (sparse) {
      return {
        message: `Your ${LAYER_LABELS[sparse.layer] ?? sparse.layer} layer is thin — ${sparse.count} node${sparse.count !== 1 ? "s" : ""}.`,
        cta: { label: "Go deeper", href: "/halliday" },
      };
    }

    const reflectionDays = daysSince(stats.lastReflection);
    if (reflectionDays === null || reflectionDays >= 2) {
      const d = reflectionDays ?? 0;
      return {
        message:
          d === 0
            ? "No reflections yet. A quick check-in deepens everything."
            : `No reflection in ${d} days. A quick check-in deepens everything.`,
        cta: { label: "Start reflecting", href: "/reflection" },
      };
    }

    const quickDays = daysSince(stats.lastQuickMemory);
    if (quickDays === null || quickDays >= 3) {
      return {
        message: "Nothing captured recently. Drop a thought.",
        cta: { label: "Capture now", href: "/quick" },
      };
    }

    // All good
    return null;
  }),
});
