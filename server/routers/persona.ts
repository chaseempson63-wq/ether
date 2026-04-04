import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { generatePersonaResponse } from "../personaEngine";

export const personaRouter = router({
  chat: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      conversationHistory: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const response = await generatePersonaResponse(
          ctx.user.id,
          input.query,
          input.conversationHistory || []
        );
        return response;
      } catch (error) {
        console.error("Error in persona chat:", error);
        throw error;
      }
    }),
});
