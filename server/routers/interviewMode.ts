import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, createMemoryNode, getMemoryNodesByUserId } from "../db";
import { invokeLLM } from "../_core/llm";
import { processContent } from "../graphPipeline";
import { checkRateLimit } from "../rateLimit";
import { invalidateRecommendationCache } from "./home";
import { TRPCError } from "@trpc/server";
import {
  interviewLevels,
  interviewQuestions,
  hallidayLayerEnum,
} from "../../drizzle/schema";
import { eq, and, asc, isNull, count } from "drizzle-orm";

const HALLIDAY_LAYERS = hallidayLayerEnum.enumValues;

// ─── Level metadata ───

const LEVEL_META: Record<number, { title: string; description: string; questionCount: number }> = {
  1: { title: "Foundation", description: "Broad questions across all 5 identity layers", questionCount: 20 },
  2: { title: "Depth", description: "Personalized follow-ups based on your answers", questionCount: 15 },
  3: { title: "Synthesis", description: "Connecting patterns across your identity", questionCount: 10 },
};

// ─── Layer → nodeType mapping ───

const LAYER_TO_NODE_TYPE: Record<string, string> = {
  voice_and_language: "concept",
  memory_and_life_events: "memory",
  reasoning_and_decisions: "reasoning_pattern",
  values_and_beliefs: "value",
  emotional_patterns: "emotion",
};

// ─── Level 1 seed questions ───

const LEVEL_1_SEED: Array<{ question: string; layer: typeof HALLIDAY_LAYERS[number]; orderIndex: number }> = [
  // Voice & Language (4)
  { question: "What language do you think in?", layer: "voice_and_language", orderIndex: 1 },
  { question: "What phrase do you say that nobody else does?", layer: "voice_and_language", orderIndex: 2 },
  { question: "How would your closest friend describe your voice?", layer: "voice_and_language", orderIndex: 3 },
  { question: "What word do you overuse?", layer: "voice_and_language", orderIndex: 4 },
  // Memory & Life Events (4)
  { question: "Where did you grow up?", layer: "memory_and_life_events", orderIndex: 5 },
  { question: "What's a moment that split your life into before and after?", layer: "memory_and_life_events", orderIndex: 6 },
  { question: "What's your earliest memory?", layer: "memory_and_life_events", orderIndex: 7 },
  { question: "What's something that happened to you that you still don't fully understand?", layer: "memory_and_life_events", orderIndex: 8 },
  // Reasoning & Decision Making (4)
  { question: "How do you make big decisions?", layer: "reasoning_and_decisions", orderIndex: 9 },
  { question: "What's a belief you held strongly that you later changed?", layer: "reasoning_and_decisions", orderIndex: 10 },
  { question: "What do you do for work and why?", layer: "reasoning_and_decisions", orderIndex: 11 },
  { question: "What's a risk you took that paid off?", layer: "reasoning_and_decisions", orderIndex: 12 },
  // Values & Beliefs (4)
  { question: "What would you never compromise on?", layer: "values_and_beliefs", orderIndex: 13 },
  { question: "What do you want to be remembered for?", layer: "values_and_beliefs", orderIndex: 14 },
  { question: "What's worth suffering for?", layer: "values_and_beliefs", orderIndex: 15 },
  { question: "Where does your sense of right and wrong come from?", layer: "values_and_beliefs", orderIndex: 16 },
  // Emotional Patterns (4)
  { question: "What makes you angry that doesn't bother most people?", layer: "emotional_patterns", orderIndex: 17 },
  { question: "How do you handle being wrong?", layer: "emotional_patterns", orderIndex: 18 },
  { question: "What's your relationship with fear?", layer: "emotional_patterns", orderIndex: 19 },
  { question: "When do you feel most like yourself?", layer: "emotional_patterns", orderIndex: 20 },
];

// ─── Helpers ───

async function ensureLevelsExist(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  // Check if levels exist
  const existing = await db
    .select()
    .from(interviewLevels)
    .where(eq(interviewLevels.userId, userId))
    .orderBy(asc(interviewLevels.level));

  if (existing.length > 0) return existing;

  // Create 3 levels: L1 = in_progress, L2/L3 = locked
  const rows = await db
    .insert(interviewLevels)
    .values([
      { userId, level: 1, status: "in_progress" as const, startedAt: new Date() },
      { userId, level: 2, status: "locked" as const },
      { userId, level: 3, status: "locked" as const },
    ])
    .returning();

  // Seed Level 1 questions
  await db.insert(interviewQuestions).values(
    LEVEL_1_SEED.map((q) => ({
      userId,
      level: 1,
      question: q.question,
      layer: q.layer,
      orderIndex: q.orderIndex,
    }))
  );

  return rows.sort((a, b) => a.level - b.level);
}

async function generateLevelQuestions(
  userId: number,
  level: 2 | 3,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const nodes = await getMemoryNodesByUserId(userId, undefined, 300);
  if (nodes.length === 0) return;

  // Build a concise summary of existing knowledge
  const summary = nodes
    .map((n) => {
      const name = (n.metadata as Record<string, unknown>)?.name as string | undefined;
      return `[${n.hallidayLayer}] ${name ?? n.summary ?? n.content.slice(0, 100)}`;
    })
    .slice(0, 60)
    .join("\n");

  const questionCount = level === 2 ? 15 : 10;
  const layerList = HALLIDAY_LAYERS.join(", ");

  const systemPrompt = level === 2
    ? `You are generating personalized follow-up questions for a person. Here are facts from their Level 1 interview:\n\n${summary}\n\nGenerate exactly ${questionCount} questions that dig deeper into specific things they shared. Be specific — reference actual answers. Each must target one layer: [${layerList}]. Return ONLY a JSON array of objects: [{"question": "...", "layer": "..."}]. 8-15 words per question. Direct, not therapeutic.`
    : `You are generating synthesis questions that find patterns across a person's identity. Here is everything known about them:\n\n${summary}\n\nGenerate exactly ${questionCount} questions connecting ideas across different identity layers — find surprising links, tensions, or throughlines. Reference at least 2 things they shared. Each must target one layer: [${layerList}]. Return ONLY a JSON array of objects: [{"question": "...", "layer": "..."}]. 10-20 words per question.`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the questions now." },
      ],
    });

    const raw = result.choices?.[0]?.message?.content;
    const text = typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.filter((p): p is { type: "text"; text: string } => typeof p === "object" && p.type === "text").map((p) => p.text).join("")
        : "";

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`[interviewMode] Failed to parse Venice response for level ${level}`);
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ question: string; layer: string }>;
    const validated = parsed
      .filter(
        (q) =>
          typeof q.question === "string" &&
          q.question.length >= 10 &&
          HALLIDAY_LAYERS.includes(q.layer as typeof HALLIDAY_LAYERS[number])
      )
      .slice(0, questionCount);

    if (validated.length === 0) {
      console.error(`[interviewMode] No valid questions generated for level ${level}`);
      return;
    }

    await db.insert(interviewQuestions).values(
      validated.map((q, i) => ({
        userId,
        level,
        question: q.question,
        layer: q.layer as typeof HALLIDAY_LAYERS[number],
        orderIndex: i + 1,
      }))
    );
  } catch (err) {
    console.error(`[interviewMode] Question generation failed for level ${level}:`, err);
  }
}

// ─── Router ───

export const interviewModeRouter = router({
  /**
   * Returns level statuses and progress for all 3 levels.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const levels = await ensureLevelsExist(ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Get question counts per level
    const questions = await db
      .select()
      .from(interviewQuestions)
      .where(eq(interviewQuestions.userId, ctx.user.id));

    const levelData = levels.map((l) => {
      const qs = questions.filter((q) => q.level === l.level);
      const answered = qs.filter((q) => q.answer != null).length;
      const total = qs.length;
      return {
        level: l.level,
        title: LEVEL_META[l.level]?.title ?? `Level ${l.level}`,
        description: LEVEL_META[l.level]?.description ?? "",
        status: l.status,
        answered,
        total,
        startedAt: l.startedAt,
        completedAt: l.completedAt,
      };
    });

    const currentLevel = levelData.find((l) => l.status === "in_progress")?.level ?? null;

    return { levels: levelData, currentLevel };
  }),

  /**
   * Returns questions for a specific level.
   */
  getQuestions: protectedProcedure
    .input(z.object({ level: z.number().min(1).max(3) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify level is accessible
      const levelRow = await db
        .select()
        .from(interviewLevels)
        .where(and(eq(interviewLevels.userId, ctx.user.id), eq(interviewLevels.level, input.level)))
        .limit(1);

      if (!levelRow[0] || levelRow[0].status === "locked") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Level is locked" });
      }

      const questions = await db
        .select()
        .from(interviewQuestions)
        .where(
          and(
            eq(interviewQuestions.userId, ctx.user.id),
            eq(interviewQuestions.level, input.level),
          )
        )
        .orderBy(asc(interviewQuestions.orderIndex));

      return { questions, status: levelRow[0].status };
    }),

  /**
   * Submit an answer to an interview question.
   */
  answer: protectedProcedure
    .input(z.object({
      questionId: z.string().uuid(),
      answer: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const rl = checkRateLimit(`interview:${ctx.user.id}`, 20, 60_000);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limited. Retry after ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s.`,
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Find the question
      const [question] = await db
        .select()
        .from(interviewQuestions)
        .where(
          and(
            eq(interviewQuestions.id, input.questionId),
            eq(interviewQuestions.userId, ctx.user.id),
          )
        )
        .limit(1);

      if (!question) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });
      }

      if (question.answer != null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already answered" });
      }

      // Save the answer
      await db
        .update(interviewQuestions)
        .set({ answer: input.answer, answeredAt: new Date() })
        .where(eq(interviewQuestions.id, input.questionId));

      // Create memory node
      const nodeType = (LAYER_TO_NODE_TYPE[question.layer] ?? "memory") as any;
      const fullContent = `[Interview L${question.level}] ${question.question}\n\nAnswer: ${input.answer}`;

      const node = await createMemoryNode(ctx.user.id, {
        nodeType,
        hallidayLayer: question.layer,
        content: fullContent,
        sourceType: "interview",
        confidence: 1.0,
        metadata: {
          source: "interview_mode",
          level: question.level,
          questionId: question.id,
        },
      });

      // Fire-and-forget entity extraction
      processContent(ctx.user.id, input.answer, "interview");
      invalidateRecommendationCache(ctx.user.id);

      // Check if level is now complete
      const remaining = await db
        .select({ cnt: count() })
        .from(interviewQuestions)
        .where(
          and(
            eq(interviewQuestions.userId, ctx.user.id),
            eq(interviewQuestions.level, question.level),
            isNull(interviewQuestions.answer),
          )
        );

      // Subtract 1 because we just answered one but the count might be stale
      const unanswered = (remaining[0]?.cnt ?? 0);
      const levelComplete = unanswered === 0;

      if (levelComplete) {
        // Mark level complete
        await db
          .update(interviewLevels)
          .set({ status: "completed", completedAt: new Date() })
          .where(
            and(
              eq(interviewLevels.userId, ctx.user.id),
              eq(interviewLevels.level, question.level),
            )
          );

        // Unlock + generate next level (async, don't block response)
        if (question.level < 3) {
          const nextLevel = (question.level + 1) as 2 | 3;
          db.update(interviewLevels)
            .set({ status: "in_progress", startedAt: new Date() })
            .where(
              and(
                eq(interviewLevels.userId, ctx.user.id),
                eq(interviewLevels.level, nextLevel),
              )
            )
            .then(() => generateLevelQuestions(ctx.user.id, nextLevel))
            .catch((err) => console.error("[interviewMode] Unlock failed:", err));
        }
      }

      return { success: true as const, nodeId: node.id, levelComplete };
    }),
});
