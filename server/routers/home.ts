import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getMemoryNodesByUserId } from "../db";
import { invokeLLM } from "../_core/llm";
import {
  hallidayProgress,
  chatMessages,
  interviewLevels,
  interviewQuestions,
  hallidayLayerEnum,
  users,
} from "../../drizzle/schema";
import { eq, and, max, count } from "drizzle-orm";

const HALLIDAY_LAYERS = hallidayLayerEnum.enumValues;

// ─── Card ID → route + CTA mappings ───

const CARD_ROUTES: Record<string, string> = {
  halliday_interview: "/halliday",
  interview_mode: "/interview",
  quick_memory: "/quick",
  daily_reflection: "/reflection",
  mind_map: "/mind-map",
  persona_chat: "/chat",
  dashboard: "/dashboard",
};

const CARD_CTA_LABELS: Record<string, string> = {
  halliday_interview: "Start interview",
  interview_mode: "Begin Level 1",
  quick_memory: "Drop a thought",
  daily_reflection: "Reflect now",
  mind_map: "Explore your mind",
  persona_chat: "Talk to yourself",
  dashboard: "View dashboard",
};

const VALID_CARDS = new Set(Object.keys(CARD_ROUTES));

// ─── In-memory recommendation cache (per user, 4hr TTL) ───

interface CachedRecommendation {
  recommendations: Array<{ card: string; reason: string; priority: number }>;
  timestamp: number;
}

const recommendationCache = new Map<number, CachedRecommendation>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function invalidateRecommendationCache(userId: number): void {
  recommendationCache.delete(userId);
}

// ─── Gather user state ───

async function getUserState(userId: number) {
  const db = await getDb();
  if (!db) return null;

  // All queries are individually fault-tolerant — tables may not exist or have permission issues
  const [allNodes, progressRow, chatCountRow, chatLastRow, interviewAnswerRow, interviewL1Row, userRow] = await Promise.all([
    getMemoryNodesByUserId(userId, undefined, 500).catch(() => [] as Awaited<ReturnType<typeof getMemoryNodesByUserId>>),

    db.select({ lastAt: hallidayProgress.lastQuestionAnsweredAt })
      .from(hallidayProgress)
      .where(eq(hallidayProgress.userId, userId))
      .limit(1)
      .then((r) => r[0] ?? null)
      .catch(() => null),

    db.select({ cnt: count() })
      .from(chatMessages)
      .where(eq(chatMessages.userId, userId))
      .then((r) => r[0] ?? null)
      .catch(() => null),

    db.select({ lastAt: max(chatMessages.createdAt) })
      .from(chatMessages)
      .where(eq(chatMessages.userId, userId))
      .then((r) => r[0] ?? null)
      .catch(() => null),

    db.select({ lastAt: max(interviewQuestions.answeredAt) })
      .from(interviewQuestions)
      .where(eq(interviewQuestions.userId, userId))
      .then((r) => r[0] ?? null)
      .catch(() => null),

    db.select({ status: interviewLevels.status })
      .from(interviewLevels)
      .where(and(eq(interviewLevels.userId, userId), eq(interviewLevels.level, 1)))
      .limit(1)
      .then((r) => r[0] ?? null)
      .catch(() => null),

    db.select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((r) => r[0] ?? null)
      .catch(() => null),
  ]);

  // Layer counts
  const nodesByLayer: Record<string, number> = {};
  let lastReflection: Date | null = null;
  let lastQuickMemory: Date | null = null;
  for (const n of allNodes) {
    nodesByLayer[n.hallidayLayer] = (nodesByLayer[n.hallidayLayer] ?? 0) + 1;
    if (n.sourceType === "reflection" && (!lastReflection || n.createdAt > lastReflection)) {
      lastReflection = n.createdAt;
    }
    if (n.sourceType === "quick_memory" && (!lastQuickMemory || n.createdAt > lastQuickMemory)) {
      lastQuickMemory = n.createdAt;
    }
  }

  // Interview mode progress
  let interviewModeProgress = "0/20";
  let interviewLevel2Status = "locked";
  let interviewLevel3Status = "locked";
  try {
    const qs = await db.select().from(interviewQuestions)
      .where(eq(interviewQuestions.userId, userId));
    const l1Qs = qs.filter((q) => q.level === 1);
    const l1Answered = l1Qs.filter((q) => q.answer != null).length;
    interviewModeProgress = `${l1Answered}/${l1Qs.length || 20}`;

    const lvls = await db.select().from(interviewLevels)
      .where(eq(interviewLevels.userId, userId));
    const l2 = lvls.find((l) => l.level === 2);
    const l3 = lvls.find((l) => l.level === 3);
    if (l2) interviewLevel2Status = l2.status;
    if (l3) interviewLevel3Status = l3.status;
  } catch {
    // Tables may not exist yet
  }

  const accountAgeDays = userRow?.createdAt
    ? Math.floor((Date.now() - userRow.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const fmt = (d: Date | null) => d ? d.toISOString() : "never";

  return {
    total_nodes: allNodes.length,
    nodes_by_layer: Object.fromEntries(HALLIDAY_LAYERS.map((l) => [l, nodesByLayer[l] ?? 0])),
    interview_mode: {
      level_1_progress: interviewModeProgress,
      level_2_status: interviewLevel2Status,
      level_3_status: interviewLevel3Status,
    },
    last_halliday_interview: fmt(progressRow?.lastAt ?? null),
    last_daily_reflection: fmt(lastReflection),
    last_quick_memory: fmt(lastQuickMemory),
    last_persona_chat: fmt(chatLastRow?.lastAt ?? null),
    total_persona_chat_messages: chatCountRow?.cnt ?? 0,
    account_age_days: accountAgeDays,
  };
}

// ─── Venice system prompt ───

const RECOMMENDATION_SYSTEM_PROMPT = `You are the intelligence engine behind Ether, a personal identity AI platform. Your job is to analyze a user's current progress and recommend the 1-2 most impactful actions they should take next to build the most complete digital mind.

You will receive the user's current state as JSON. Respond ONLY with valid JSON, no preamble, no markdown backticks.

Response format:
{
  "recommendations": [
    {
      "card": "halliday_interview" | "interview_mode" | "quick_memory" | "daily_reflection" | "mind_map" | "persona_chat" | "dashboard",
      "reason": "8-12 words explaining why, written directly to the user",
      "priority": 1 | 2
    }
  ]
}

Rules:
- Return exactly 1 or 2 recommendations. Never more.
- Prioritize actions that fill the biggest gaps in identity coverage.
- A user with no interview history should always start there.
- A user with broad but shallow coverage should deepen via Interview Mode or Halliday.
- A user with deep coverage in some layers but empty in others should target the empty layers.
- Daily Reflection and Quick Memory are maintenance actions — only recommend if foundation layers are solid.
- Dashboard and Persona Chat are consumption features — only recommend Persona Chat if the user has 20+ nodes.
- Reason text must be specific to their data — reference actual layer names or counts. Never generic.
- Be direct, not therapeutic.`;

// ─── Default fallback ───

const DEFAULT_RECOMMENDATIONS = [
  { card: "interview_mode", reason: "Start building your foundation — 0 nodes captured", priority: 1 },
];

// ─── Router ───

export const homeRouter = router({
  recommendations: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Check cache
    const cached = recommendationCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { recommendations: cached.recommendations };
    }

    // Gather user state
    const userState = await getUserState(userId);
    if (!userState) {
      return { recommendations: DEFAULT_RECOMMENDATIONS };
    }

    // Call Venice
    try {
      const result = await invokeLLM({
        messages: [
          { role: "system", content: RECOMMENDATION_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userState) },
        ],
      });

      const raw = result.choices?.[0]?.message?.content;
      const text = typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw.filter((p): p is { type: "text"; text: string } => typeof p === "object" && p.type === "text").map((p) => p.text).join("")
          : "";

      // Parse — handle possible markdown code fence wrapping
      const jsonStr = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(jsonStr) as {
        recommendations: Array<{ card: string; reason: string; priority: number }>;
      };

      // Validate
      const validated = (parsed.recommendations ?? [])
        .filter((r) => VALID_CARDS.has(r.card) && typeof r.reason === "string" && [1, 2].includes(r.priority))
        .slice(0, 2);

      const recs = validated.length > 0 ? validated : DEFAULT_RECOMMENDATIONS;

      // Cache
      recommendationCache.set(userId, { recommendations: recs, timestamp: Date.now() });

      return { recommendations: recs };
    } catch (err) {
      console.error("[home.recommendations] Venice call failed:", err);
      return { recommendations: DEFAULT_RECOMMENDATIONS };
    }
  }),

  nudge: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Check cache first (same as recommendations)
    let recs: Array<{ card: string; reason: string; priority: number }>;
    const cached = recommendationCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      recs = cached.recommendations;
    } else {
      // Gather state and call Venice (or use fallback)
      const userState = await getUserState(userId);
      if (!userState) {
        recs = DEFAULT_RECOMMENDATIONS;
      } else {
        try {
          const result = await invokeLLM({
            messages: [
              { role: "system", content: RECOMMENDATION_SYSTEM_PROMPT },
              { role: "user", content: JSON.stringify(userState) },
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
            recommendations: Array<{ card: string; reason: string; priority: number }>;
          };

          const validated = (parsed.recommendations ?? [])
            .filter((r) => VALID_CARDS.has(r.card) && typeof r.reason === "string" && [1, 2].includes(r.priority))
            .slice(0, 2);

          recs = validated.length > 0 ? validated : DEFAULT_RECOMMENDATIONS;
          recommendationCache.set(userId, { recommendations: recs, timestamp: Date.now() });
        } catch {
          recs = DEFAULT_RECOMMENDATIONS;
        }
      }
    }

    // Take priority 1 recommendation
    const top = recs.find((r) => r.priority === 1) ?? recs[0];
    if (!top) return null;

    return {
      message: top.reason,
      cta: {
        label: CARD_CTA_LABELS[top.card] ?? "Go",
        href: CARD_ROUTES[top.card] ?? "/",
      },
    };
  }),
});
