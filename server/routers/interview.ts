import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { interviewSessions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const interviewRouter = router({
  saveResponse: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        questionId: z.string(),
        question: z.string(),
        category: z.enum(["values", "decisions", "lessons", "beliefs"]),
        response: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      try {
        const sessionData = {
          questionId: input.questionId,
          question: input.question,
          category: input.category,
          response: input.response,
          timestamp: new Date().toISOString(),
        };

        await db.insert(interviewSessions).values({
          userId: ctx.user.id,
          sessionData: sessionData,
          createdAt: new Date(),
        });

        return { success: true };
      } catch (error) {
        console.error("Failed to save interview response:", error);
        throw new Error("Failed to save interview response");
      }
    }),

  listSessions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      return [];
    }

    try {
      const sessions = await db
        .select()
        .from(interviewSessions)
        .where(eq(interviewSessions.userId, ctx.user.id));

      return sessions.map((session: any) => ({
        sessionId: session.id,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
        data: session.sessionData,
      }));
    } catch (error) {
      console.error("Failed to list interview sessions:", error);
      return [];
    }
  }),

  getSessionResponses: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        return [];
      }

      try {
        const session = await db
          .select()
          .from(interviewSessions)
          .where(eq(interviewSessions.id, parseInt(input.sessionId)));

        return session;
      } catch (error) {
        console.error("Failed to get interview responses:", error);
        return [];
      }
    }),
});
