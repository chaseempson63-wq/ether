import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, createMemoryNode } from "../db";
import { processContent } from "../graphPipeline";
import { hallidayQuestions, hallidayResponses, hallidayProgress } from "../../drizzle/schema";
import { eq, and, desc, inArray, avg } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { invalidateRecommendationCache } from "./home";

// Category weights as defined in the Halliday framework
const CATEGORY_WEIGHTS: Record<string, number> = {
  voice_language: 0.20,
  memory_life_events: 0.20,
  reasoning_decisions: 0.25,
  values_beliefs: 0.20,
  emotional_patterns: 0.15,
};

// Accuracy thresholds with labels
const ACCURACY_THRESHOLDS = [
  { pct: 0.20, label: "Seed", description: "Basic identity captured" },
  { pct: 0.40, label: "Emerging", description: "Patterns starting to form" },
  { pct: 0.60, label: "Developing", description: "Voice becoming distinct" },
  { pct: 0.80, label: "Established", description: "Strong identity model" },
  { pct: 1.00, label: "Complete", description: "Full Digital Mind achieved" },
];

/**
 * Calculate specificity score from response text.
 * Longer, more specific answers score higher.
 */
function calculateSpecificity(response: string): number {
  const words = response.trim().split(/\s+/).length;
  const hasNumbers = /\d/.test(response);
  const hasNames = /[A-Z][a-z]+/.test(response);
  const hasDates = /\d{4}|\d{1,2}\/\d{1,2}/.test(response);

  let score = 0;
  // Length score (0-0.4)
  score += Math.min(words / 100, 0.4);
  // Specificity bonuses
  if (hasNumbers) score += 0.15;
  if (hasNames) score += 0.15;
  if (hasDates) score += 0.15;
  // Minimum floor for any real answer
  if (words >= 10) score += 0.15;

  return Math.min(score, 1.0);
}

/**
 * Adaptive question selector:
 * 1. Prioritise the weakest category (lowest weighted progress)
 * 2. Within that category, prefer questions in sections with low average accuracy
 * 3. Fall back to random unanswered question if no weak area found
 */
async function selectAdaptiveQuestion(
  db: any,
  userId: number,
  preferredCategory?: string
) {
  // Fetch all questions and user responses in one pass
  const allQuestions = await db.select().from(hallidayQuestions);
  const userResponses: Array<{ questionId: string; specificity: number | null; accuracy: number | null }> =
    await db
      .select({
        questionId: hallidayResponses.questionId,
        specificity: hallidayResponses.specificity,
        accuracy: hallidayResponses.accuracy,
      })
      .from(hallidayResponses)
      .where(eq(hallidayResponses.userId, userId));

  const answeredMap = new Map(userResponses.map((r) => [r.questionId, r]));

  // Separate into answered / unanswered
  const unanswered = allQuestions.filter((q: any) => !answeredMap.has(q.questionId));

  if (unanswered.length === 0) return null;

  // If a category is explicitly requested, filter to it
  const pool = preferredCategory
    ? unanswered.filter((q: any) => q.category === preferredCategory)
    : unanswered;

  if (pool.length === 0) return null;

  // If no preferred category, find the weakest category by weighted progress
  if (!preferredCategory) {
    const categoryStats: Record<string, { total: number; answered: number; weightedScore: number }> = {};

    for (const [catId, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      const total = allQuestions.filter((q: any) => q.category === catId).length;
      const answered = userResponses.filter((r) => {
        const q = allQuestions.find((q: any) => q.questionId === r.questionId);
        return q?.category === catId;
      }).length;
      const progress = total > 0 ? answered / total : 0;
      categoryStats[catId] = { total, answered, weightedScore: progress * weight };
    }

    // Sort categories by weighted score ascending (weakest first)
    const sortedCats = Object.entries(categoryStats).sort(
      (a, b) => a[1].weightedScore - b[1].weightedScore
    );

    // Pick from the weakest category that still has unanswered questions
    for (const [catId] of sortedCats) {
      const catPool = unanswered.filter((q: any) => q.category === catId);
      if (catPool.length > 0) {
        // Within the category, prefer sections with low average specificity
        const sectionScores: Record<string, number> = {};
        for (const q of catPool as any[]) {
          if (!sectionScores[q.section]) sectionScores[q.section] = 0;
          sectionScores[q.section]++;
        }
        // Shuffle within the weakest section
        const randomIdx = Math.floor(Math.random() * catPool.length);
        return catPool[randomIdx];
      }
    }
  }

  // Fallback: random from pool
  return pool[Math.floor(Math.random() * pool.length)];
}

export const hallidayRouter = router({
  /**
   * Get all questions for a specific category
   */
  getQuestionsByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const questions = await db
        .select()
        .from(hallidayQuestions)
        .where(eq(hallidayQuestions.category, input.category));

      return questions;
    }),

  /**
   * Adaptive question selection:
   * - Prioritises weakest categories by weighted progress
   * - Uses answer-aware logic to surface under-explored sections
   */
  getNextQuestion: protectedProcedure
    .input(z.object({ category: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      return selectAdaptiveQuestion(db, ctx.user.id, input.category);
    }),

  /**
   * Generate conversational follow-up questions to dig deeper into a user's
   * initial answer before saving.
   */
  generateFollowUp: protectedProcedure
    .input(z.object({
      questionText: z.string(),
      userAnswer: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are an interviewer helping someone capture their life story. " +
              "They just answered a question but their response may be surface-level. " +
              "Ask 1-2 short follow-up questions that dig deeper into the WHY, the EMOTION, " +
              "or the SPECIFIC DETAILS of what they shared. Be warm and curious, not clinical. " +
              "Keep it to 2-3 sentences max. Do not repeat what they said. " +
              "Do not number your questions — write them as natural conversational prose.",
          },
          {
            role: "user",
            content: `Question: ${input.questionText}\n\nTheir answer: ${input.userAnswer}`,
          },
        ],
      });

      const followUp =
        typeof result.choices?.[0]?.message?.content === "string"
          ? result.choices[0].message.content
          : "Could you tell me more about that? What was going through your mind at the time?";

      return { followUp };
    }),

  /**
   * Submit a response to a Halliday question.
   * Automatically calculates specificity from response text.
   */
  submitResponse: protectedProcedure
    .input(
      z.object({
        questionId: z.string(),
        response: z.string().min(1),
        responseType: z.enum(["text", "voice", "interview"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const specificity = calculateSpecificity(input.response);

      await db.insert(hallidayResponses).values({
        userId: ctx.user.id,
        questionId: input.questionId,
        response: input.response,
        responseType: input.responseType,
        specificity,
        accuracy: specificity,
      });

      // Auto-capture: persist Halliday response into memory_nodes
      // so it is available to the RAG Persona Engine
      const question = await db
        .select()
        .from(hallidayQuestions)
        .where(eq(hallidayQuestions.questionId, input.questionId))
        .limit(1);

      if (question.length > 0) {
        const q = question[0];
        const memoryContent = `[Halliday Interview — ${q.category.replace(/_/g, " ")}] ${q.text}\n\nAnswer: ${input.response}`;

        // Map halliday category to halliday_layer
        const layerMap: Record<string, "voice_and_language" | "memory_and_life_events" | "reasoning_and_decisions" | "values_and_beliefs" | "emotional_patterns"> = {
          voice_language: "voice_and_language",
          memory_life_events: "memory_and_life_events",
          reasoning_decisions: "reasoning_and_decisions",
          values_beliefs: "values_and_beliefs",
          emotional_patterns: "emotional_patterns",
        };

        await createMemoryNode(ctx.user.id, {
          nodeType: "memory",
          hallidayLayer: layerMap[q.category] ?? "memory_and_life_events",
          content: memoryContent,
          sourceType: "halliday",
          confidence: 1.0,
          metadata: { tags: ["halliday", q.category, q.section], questionId: q.questionId },
        });
      }

      // Update weighted progress
      await updateUserProgress(db, ctx.user.id);

      // Background: extract entities from the full response
      const fullContent = question.length > 0
        ? `[Halliday Interview — ${question[0].category.replace(/_/g, " ")}] ${question[0].text}\n\nAnswer: ${input.response}`
        : input.response;
      processContent(ctx.user.id, fullContent, 'halliday');
      invalidateRecommendationCache(ctx.user.id);

      return { success: true, specificity };
    }),

  /**
   * Get user's full progress with weighted accuracy and threshold info
   */
  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    let progress = await db
      .select()
      .from(hallidayProgress)
      .where(eq(hallidayProgress.userId, ctx.user.id));

    if (progress.length === 0) {
      await db.insert(hallidayProgress).values({ userId: ctx.user.id });
      progress = await db
        .select()
        .from(hallidayProgress)
        .where(eq(hallidayProgress.userId, ctx.user.id));
    }

    const p = progress[0];
    const weightedAccuracy = p?.overallAccuracy ?? 0;

    // Determine current threshold band
    const currentThreshold =
      ACCURACY_THRESHOLDS.find((t) => weightedAccuracy <= t.pct) ??
      ACCURACY_THRESHOLDS[ACCURACY_THRESHOLDS.length - 1];

    const nextThreshold =
      ACCURACY_THRESHOLDS.find((t) => t.pct > weightedAccuracy) ?? null;

    return {
      ...p,
      thresholds: ACCURACY_THRESHOLDS,
      currentThreshold,
      nextThreshold,
      progressToNextThreshold: nextThreshold
        ? (weightedAccuracy - (currentThreshold.pct - 0.2)) /
          (nextThreshold.pct - (currentThreshold.pct - 0.2))
        : 1,
    };
  }),

  /**
   * Get user's responses to a specific category
   */
  getResponsesByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const questions = await db
        .select({ questionId: hallidayQuestions.questionId })
        .from(hallidayQuestions)
        .where(eq(hallidayQuestions.category, input.category));

      const questionIds = questions.map((q) => q.questionId);
      if (questionIds.length === 0) return [];

      return db
        .select()
        .from(hallidayResponses)
        .where(
          and(
            eq(hallidayResponses.userId, ctx.user.id),
            inArray(hallidayResponses.questionId, questionIds)
          )
        );
    }),

  /**
   * Get all user responses with question text
   */
  getAllResponses: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select({
        id: hallidayResponses.id,
        questionId: hallidayResponses.questionId,
        questionText: hallidayQuestions.text,
        category: hallidayQuestions.category,
        section: hallidayQuestions.section,
        response: hallidayResponses.response,
        responseType: hallidayResponses.responseType,
        specificity: hallidayResponses.specificity,
        accuracy: hallidayResponses.accuracy,
        createdAt: hallidayResponses.createdAt,
      })
      .from(hallidayResponses)
      .innerJoin(
        hallidayQuestions,
        eq(hallidayResponses.questionId, hallidayQuestions.questionId)
      )
      .where(eq(hallidayResponses.userId, ctx.user.id))
      .orderBy(desc(hallidayResponses.createdAt));
  }),

  /**
   * Get category breakdown with weighted accuracy and threshold info
   */
  getCategoryBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allQuestions = await db.select().from(hallidayQuestions);
    const userResponses = await db
      .select()
      .from(hallidayResponses)
      .where(eq(hallidayResponses.userId, ctx.user.id));

    return Object.entries(CATEGORY_WEIGHTS).map(([catId, weight]) => {
      const catQuestions = allQuestions.filter((q: any) => q.category === catId);
      const catResponses = userResponses.filter((r) => {
        const q = catQuestions.find((q: any) => q.questionId === r.questionId);
        return !!q;
      });

      const progress = catQuestions.length > 0 ? catResponses.length / catQuestions.length : 0;
      const avgSpecificity =
        catResponses.length > 0
          ? catResponses.reduce((s, r) => s + (r.specificity ?? 0), 0) / catResponses.length
          : 0;

      const weightedContribution = progress * avgSpecificity * weight;

      const currentThreshold =
        ACCURACY_THRESHOLDS.find((t) => progress <= t.pct) ??
        ACCURACY_THRESHOLDS[ACCURACY_THRESHOLDS.length - 1];

      return {
        categoryId: catId,
        weight,
        totalQuestions: catQuestions.length,
        answeredQuestions: catResponses.length,
        progress,
        avgSpecificity,
        weightedContribution,
        currentThreshold,
        thresholds: ACCURACY_THRESHOLDS,
      };
    });
  }),
});

/**
 * Update user progress using proper category weights.
 * Overall accuracy = Σ (category_progress × category_weight × avg_specificity)
 */
async function updateUserProgress(db: any, userId: number) {
  const allQuestions = await db.select().from(hallidayQuestions);
  const userResponses = await db
    .select()
    .from(hallidayResponses)
    .where(eq(hallidayResponses.userId, userId));

  const fieldMap: Record<string, string> = {
    voice_language: "voiceLanguageProgress",
    memory_life_events: "memoryLifeProgress",
    reasoning_decisions: "reasoningDecisionsProgress",
    values_beliefs: "valuesBelifsProgress",
    emotional_patterns: "emotionalPatternsProgress",
  };

  const updates: Record<string, number> = {};
  let weightedAccuracy = 0;
  let totalAnswered = 0;

  for (const [catId, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const catQuestions = allQuestions.filter((q: any) => q.category === catId);
    const catResponses = userResponses.filter((r: any) => {
      const q = catQuestions.find((q: any) => q.questionId === r.questionId);
      return !!q;
    });

    const progress = catQuestions.length > 0 ? catResponses.length / catQuestions.length : 0;
    const avgSpecificity =
      catResponses.length > 0
        ? catResponses.reduce((s: number, r: any) => s + (r.specificity ?? 0), 0) /
          catResponses.length
        : 0;

    updates[fieldMap[catId]] = progress;
    weightedAccuracy += progress * avgSpecificity * weight;
    totalAnswered += catResponses.length;
  }

  // Check if progress row exists
  const existing = await db
    .select({ id: hallidayProgress.id })
    .from(hallidayProgress)
    .where(eq(hallidayProgress.userId, userId));

  if (existing.length === 0) {
    await db.insert(hallidayProgress).values({
      userId,
      ...updates,
      totalQuestionsAnswered: totalAnswered,
      overallAccuracy: weightedAccuracy,
      lastQuestionAnsweredAt: new Date(),
    });
  } else {
    await db
      .update(hallidayProgress)
      .set({
        ...updates,
        totalQuestionsAnswered: totalAnswered,
        overallAccuracy: weightedAccuracy,
        lastQuestionAnsweredAt: new Date(),
      })
      .where(eq(hallidayProgress.userId, userId));
  }
}
