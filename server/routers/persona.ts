import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generatePersonaResponse } from "../personaEngine";
import { processContent } from "../graphPipeline";
import { checkRateLimit } from "../rateLimit";

export const personaRouter = router({
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1),
      legacyMode: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Rate limit: 20 requests per minute per user
      const rateCheck = checkRateLimit(`persona:${ctx.user.id}`, 20, 60_000);
      if (!rateCheck.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)} seconds.`,
        });
      }

      try {
        const response = await generatePersonaResponse(
          ctx.user.id,
          input.message,
          []
        );

        // Only extract entities from statements, not questions.
        // Questions create hollow nodes that pollute vector search.
        const trimmed = input.message.trim();
        const isQuestion = trimmed.endsWith("?") || trimmed.split(/\s+/).length < 30;
        if (!isQuestion) {
          processContent(ctx.user.id, input.message, 'chat');
        }

        return {
          message: response.content,
          truthfulnessTag: response.truthfulnessTag?.type === 'known_memory' ? 'Known Memory' :
                          response.truthfulnessTag?.type === 'likely_inference' ? 'Likely Inference' :
                          'Speculation',
          sourceMemories: response.sourceMemories?.map((s, i) => ({ id: i, title: s, content: s })) || [],
          confidence: response.truthfulnessTag?.confidence || 0.5,
        };
      } catch (error) {
        console.error("Error in persona chat:", error);
        throw error;
      }
    }),
});
