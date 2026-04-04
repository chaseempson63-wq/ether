import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { generatePersonaResponse } from "../personaEngine";

export const personaRouter = router({
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1),
      legacyMode: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const response = await generatePersonaResponse(
          ctx.user.id,
          input.message,
          []
        );
        // Transform response to match new format
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
