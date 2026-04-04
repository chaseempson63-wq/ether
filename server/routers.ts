import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { conversationRouter } from "./routers/conversations";
import { beneficiaryRouter } from "./routers/beneficiary";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { createMemory, getMemoriesByUserId, createReasoningPattern, getReasoningPatternsByUserId, createCoreValue, getCoreValuesByUserId, createBeneficiary, getBeneficiariesByUserId, getOrCreateProfile } from "./db";
import { personaRouter } from "./routers/persona";
import { interviewRouter } from "./routers/interview";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  conversations: conversationRouter,
  beneficiary: beneficiaryRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Ether features
  memory: router({
    create: protectedProcedure
      .input(z.object({
        content: z.string().min(1),
        sourceType: z.enum(['journal', 'voice_memo', 'passive_import', 'interview']),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return createMemory(ctx.user.id, {
          content: input.content,
          sourceType: input.sourceType,
          tags: input.tags,
          occurredAt: new Date(),
        });
      }),
    list: protectedProcedure.query(({ ctx }) =>
      getMemoriesByUserId(ctx.user.id)
    ),
  }),

  reasoning: router({
    create: protectedProcedure
      .input(z.object({
        decision: z.string().min(1),
        logicWhy: z.string().min(1),
        outcome: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return createReasoningPattern(ctx.user.id, input);
      }),
    list: protectedProcedure.query(({ ctx }) =>
      getReasoningPatternsByUserId(ctx.user.id)
    ),
  }),

  values: router({
    create: protectedProcedure
      .input(z.object({
        valueStatement: z.string().min(1),
        beliefContext: z.string().optional(),
        priority: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return createCoreValue(ctx.user.id, input);
      }),
    list: protectedProcedure.query(({ ctx }) =>
      getCoreValuesByUserId(ctx.user.id)
    ),
  }),

  profile: router({
    get: protectedProcedure.query(({ ctx }) =>
      getOrCreateProfile(ctx.user.id)
    ),
    update: protectedProcedure
      .input(z.object({
        bio: z.string().optional(),
        headline: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return getOrCreateProfile(ctx.user.id, input);
      }),
  }),



  persona: personaRouter,
  interview: interviewRouter,
});

export type AppRouter = typeof appRouter;
