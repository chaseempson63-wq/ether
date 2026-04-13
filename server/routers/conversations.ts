import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { conversations, chatMessages } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

export const conversationRouter = router({
  // Create a new conversation
  create: protectedProcedure
    .input(z.object({ title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        await db.insert(conversations).values({
          userId: ctx.user.id,
          title: input.title || "New Conversation",
        });

        // Fetch the created conversation
        const created = await db
          .select()
          .from(conversations)
          .where(eq(conversations.userId, ctx.user.id))
          .orderBy(desc(conversations.createdAt))
          .limit(1);

        return created[0] || { id: 0, userId: ctx.user.id, title: input.title || "New Conversation", createdAt: new Date(), updatedAt: new Date() };
      } catch (error) {
        console.error("Failed to create conversation:", error);
        throw new Error("Failed to create conversation");
      }
    }),

  // List all conversations for a user
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    try {
      const result = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, ctx.user.id))
        .orderBy(desc(conversations.updatedAt));

      return result;
    } catch (error) {
      console.error("Failed to list conversations:", error);
      return [];
    }
  }),

  // Get a specific conversation with all messages
  getWithMessages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      try {
        const conversation = await db
          .select()
          .from(conversations)
          .where(
            (t) =>
              eq(t.id, input.conversationId) &&
              eq(t.userId, ctx.user.id)
          );

        if (!conversation || conversation.length === 0) {
          return null;
        }

        const messages = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, input.conversationId));

        return {
          ...conversation[0],
          messages,
        };
      } catch (error) {
        console.error("Failed to get conversation:", error);
        return null;
      }
    }),

  // Add a message to a conversation
  addMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        truthfulnessTag: z.enum(["Known Memory", "Likely Inference", "Speculation"]).optional(),
        sourceMemories: z
          .array(z.object({ id: z.number(), title: z.string(), content: z.string() }))
          .optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        // Verify conversation belongs to user
        const conversation = await db
          .select()
          .from(conversations)
          .where(
            (t) =>
              eq(t.id, input.conversationId) &&
              eq(t.userId, ctx.user.id)
          );

        if (!conversation || conversation.length === 0) {
          throw new Error("Conversation not found");
        }

        // Add message
        await db.insert(chatMessages).values({
          conversationId: input.conversationId,
          userId: ctx.user.id,
          role: input.role,
          content: input.content,
          truthfulnessTag: input.truthfulnessTag,
          sourceMemories: input.sourceMemories ? JSON.stringify(input.sourceMemories) : null,
          confidence: input.confidence,
        });

        // Update conversation updatedAt
        await db
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, input.conversationId));

        // Fetch the created message
        const created = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, input.conversationId))
          .orderBy(desc(chatMessages.createdAt))
          .limit(1);

        return { id: created[0]?.id || 0 };
      } catch (error) {
        console.error("Failed to add message:", error);
        throw new Error("Failed to add message");
      }
    }),

  // Delete a conversation
  delete: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        // Verify conversation belongs to user
        const conversation = await db
          .select()
          .from(conversations)
          .where(
            (t) =>
              eq(t.id, input.conversationId) &&
              eq(t.userId, ctx.user.id)
          );

        if (!conversation || conversation.length === 0) {
          throw new Error("Conversation not found");
        }

        // Delete messages first
        await db
          .delete(chatMessages)
          .where(eq(chatMessages.conversationId, input.conversationId));

        // Delete conversation
        await db
          .delete(conversations)
          .where(eq(conversations.id, input.conversationId));

        return { success: true };
      } catch (error) {
        console.error("Failed to delete conversation:", error);
        throw new Error("Failed to delete conversation");
      }
    }),

  // Update a conversation's title
  updateTitle: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      title: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(conversations)
        .set({ title: input.title })
        .where(eq(conversations.id, input.conversationId));

      return { success: true };
    }),

  // Auto-generate a short title from the first message via Venice
  generateTitle: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      firstMessage: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "Generate a short 3-6 word title for a conversation that starts with this message. " +
                "Return only the title, nothing else. No quotes, no punctuation at the end.",
            },
            { role: "user", content: input.firstMessage },
          ],
        });

        const title =
          typeof result.choices?.[0]?.message?.content === "string"
            ? result.choices[0].message.content.trim().slice(0, 60)
            : input.firstMessage.slice(0, 40);

        await db
          .update(conversations)
          .set({ title })
          .where(eq(conversations.id, input.conversationId));

        return { title };
      } catch (error) {
        console.error("Failed to generate title:", error);
        // Fallback: use first 40 chars of message
        const fallback = input.firstMessage.trim().slice(0, 40);
        await db
          .update(conversations)
          .set({ title: fallback })
          .where(eq(conversations.id, input.conversationId));
        return { title: fallback };
      }
    }),
});
