import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { hallidayRouter } from "./routers/halliday";
import { conversationRouter } from "./routers/conversations";
import { beneficiaryRouter } from "./routers/beneficiary";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getOrCreateProfile, updateProfile, createMemoryNode, getMemoryNodesByUserId, createMemoryEdge, getMemoryEdgesByUserId } from "./db";
import { personaRouter } from "./routers/persona";
import { interviewRouter } from "./routers/interview";
import { interviewModeRouter } from "./routers/interviewMode";
import { mindMapRouter } from "./routers/mindMap";
import { homeRouter, invalidateRecommendationCache } from "./routers/home";
import { processContent } from "./graphPipeline";
import { checkRateLimit } from "./rateLimit";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,
  halliday: hallidayRouter,
  conversations: conversationRouter,
  beneficiary: beneficiaryRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Ether features (now backed by memory_nodes graph) ───

  memory: router({
    create: protectedProcedure
      .input(z.object({
        content: z.string().min(1),
        sourceType: z.enum(['journal', 'voice_memo', 'passive_import', 'interview']),
        tags: z.array(z.string()).optional(),
        imageUrls: z.array(z.string().url()).max(10).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Rate limit: 20 creates per minute per user
        const rateCheck = checkRateLimit(`create:${ctx.user.id}`, 20, 60_000);
        if (!rateCheck.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Rate limit exceeded. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s.` });
        }

        const isQuickMemory = input.sourceType === 'voice_memo'
          && input.tags?.includes('quick');

        let graphSourceType: 'journal' | 'voice_memo' | 'interview' | 'quick_memory';
        if (isQuickMemory) {
          graphSourceType = 'quick_memory';
        } else if (input.sourceType === 'passive_import') {
          graphSourceType = 'journal';
        } else {
          graphSourceType = input.sourceType;
        }

        const metadata: Record<string, unknown> = {};
        if (input.tags) metadata.tags = input.tags;
        if (input.imageUrls?.length) metadata.imageUrls = input.imageUrls;

        const node = await createMemoryNode(ctx.user.id, {
          nodeType: 'memory',
          hallidayLayer: 'memory_and_life_events',
          content: input.content,
          sourceType: graphSourceType,
          confidence: 1.0,
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        });

        // Background: extract entities, create edges, embed
        processContent(ctx.user.id, input.content, graphSourceType);
        invalidateRecommendationCache(ctx.user.id);

        return node;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const nodes = await getMemoryNodesByUserId(ctx.user.id, {
        hallidayLayers: ['memory_and_life_events'],
      });

      // Shape response for Dashboard / QuickMemory compatibility
      return nodes.map(node => {
        const meta = node.metadata as Record<string, unknown> | null;
        let sourceType: string = node.sourceType;
        if (sourceType === 'quick_memory') sourceType = 'voice_memo';

        return {
          id: node.id,
          userId: node.userId,
          content: node.content,
          sourceType,
          occurredAt: null,
          embedding: null,
          tags: meta?.tags ?? null,
          imageUrls: (meta?.imageUrls as string[]) ?? null,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        };
      });
    }),
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
        const rateCheck = checkRateLimit(`create:${ctx.user.id}`, 20, 60_000);
        if (!rateCheck.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Rate limit exceeded. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s.` });
        }

        const contentParts = [
          `Decision: ${input.decision}`,
          `Reasoning: ${input.logicWhy}`,
        ];
        if (input.outcome) contentParts.push(`Outcome: ${input.outcome}`);

        const fullContent = contentParts.join('\n\n');
        const node = await createMemoryNode(ctx.user.id, {
          nodeType: 'reasoning_pattern',
          hallidayLayer: 'reasoning_and_decisions',
          content: fullContent,
          sourceType: 'reflection',
          confidence: 1.0,
          metadata: {
            decision: input.decision,
            logicWhy: input.logicWhy,
            outcome: input.outcome ?? null,
            tags: input.tags ?? null,
          },
        });

        processContent(ctx.user.id, fullContent, 'reflection');
        invalidateRecommendationCache(ctx.user.id);

        return node;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const nodes = await getMemoryNodesByUserId(ctx.user.id, {
        nodeTypes: ['reasoning_pattern', 'decision'],
      });

      return nodes.map(node => {
        const meta = node.metadata as Record<string, unknown> | null;
        return {
          id: node.id,
          userId: node.userId,
          decision: (meta?.decision as string) ?? node.content,
          logicWhy: (meta?.logicWhy as string) ?? '',
          outcome: (meta?.outcome as string) ?? null,
          embedding: null,
          tags: meta?.tags ?? null,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        };
      });
    }),
  }),

  values: router({
    create: protectedProcedure
      .input(z.object({
        valueStatement: z.string().min(1),
        beliefContext: z.string().optional(),
        priority: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const rateCheck = checkRateLimit(`create:${ctx.user.id}`, 20, 60_000);
        if (!rateCheck.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Rate limit exceeded. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s.` });
        }

        const contentParts = [input.valueStatement];
        if (input.beliefContext) contentParts.push(input.beliefContext);

        const fullContent = contentParts.join('\n\n');
        const node = await createMemoryNode(ctx.user.id, {
          nodeType: 'value',
          hallidayLayer: 'values_and_beliefs',
          content: fullContent,
          sourceType: 'reflection',
          confidence: 1.0,
          metadata: {
            valueStatement: input.valueStatement,
            beliefContext: input.beliefContext ?? null,
            priority: input.priority ?? 1,
          },
        });

        processContent(ctx.user.id, fullContent, 'reflection');
        invalidateRecommendationCache(ctx.user.id);

        return node;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const nodes = await getMemoryNodesByUserId(ctx.user.id, {
        nodeTypes: ['value', 'belief'],
      });

      return nodes.map(node => {
        const meta = node.metadata as Record<string, unknown> | null;
        return {
          id: node.id,
          userId: node.userId,
          valueStatement: (meta?.valueStatement as string) ?? node.content,
          beliefContext: (meta?.beliefContext as string) ?? null,
          priority: (meta?.priority as number) ?? 1,
          embedding: null,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        };
      });
    }),
  }),

  // ─── Raw graph access ───

  graph: router({
    nodes: router({
      list: protectedProcedure
        .input(z.object({
          nodeTypes: z.array(z.enum([
            'memory', 'person', 'place', 'value', 'belief',
            'reasoning_pattern', 'decision', 'skill', 'event',
            'emotion', 'concept',
          ])).optional(),
          hallidayLayers: z.array(z.enum([
            'voice_and_language', 'memory_and_life_events',
            'reasoning_and_decisions', 'values_and_beliefs',
            'emotional_patterns',
          ])).optional(),
          limit: z.number().min(1).max(500).optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
          return getMemoryNodesByUserId(
            ctx.user.id,
            {
              nodeTypes: input?.nodeTypes,
              hallidayLayers: input?.hallidayLayers,
            },
            input?.limit ?? 50
          );
        }),
    }),
    edges: router({
      list: protectedProcedure
        .input(z.object({
          limit: z.number().min(1).max(1000).optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
          return getMemoryEdgesByUserId(ctx.user.id, input?.limit ?? 200);
        }),
      create: protectedProcedure
        .input(z.object({
          sourceNodeId: z.string().uuid(),
          targetNodeId: z.string().uuid(),
          relationshipType: z.string().min(1),
          strength: z.number().min(0).max(1).optional(),
          evidence: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          return createMemoryEdge(ctx.user.id, input);
        }),
    }),
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

  onboarding: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getOrCreateProfile(ctx.user.id);
      return { onboardingComplete: profile.onboardingComplete };
    }),

    submitStep: protectedProcedure
      .input(z.object({
        step: z.number().min(1).max(7),
        answer: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Map steps to node types and halliday layers
        const stepConfig: Record<number, {
          nodeType: 'memory' | 'person' | 'place' | 'value' | 'belief' | 'concept';
          hallidayLayer: 'voice_and_language' | 'memory_and_life_events' | 'reasoning_and_decisions' | 'values_and_beliefs' | 'emotional_patterns';
          label: string;
        }> = {
          1: { nodeType: 'concept', hallidayLayer: 'voice_and_language', label: 'name' },
          2: { nodeType: 'place', hallidayLayer: 'memory_and_life_events', label: 'home' },
          3: { nodeType: 'concept', hallidayLayer: 'reasoning_and_decisions', label: 'occupation' },
          4: { nodeType: 'person', hallidayLayer: 'memory_and_life_events', label: 'important_people' },
          5: { nodeType: 'belief', hallidayLayer: 'values_and_beliefs', label: 'core_belief' },
          6: { nodeType: 'memory', hallidayLayer: 'emotional_patterns', label: 'secret_memory' },
          7: { nodeType: 'concept', hallidayLayer: 'voice_and_language', label: 'voice_style' },
        };

        const config = stepConfig[input.step];

        // Step 1 (name): also update user's name on profile headline
        if (input.step === 1) {
          await updateProfile(ctx.user.id, { headline: `${input.answer}'s Digital Mind` });
        }

        // Step 7 (voice style): save to profile
        if (input.step === 7) {
          await updateProfile(ctx.user.id, { voiceStyle: input.answer });
        }

        // Create a memory node for every step
        const node = await createMemoryNode(ctx.user.id, {
          nodeType: config.nodeType,
          hallidayLayer: config.hallidayLayer,
          content: input.answer,
          sourceType: 'interview',
          confidence: 1.0,
          metadata: { tags: ['onboarding', config.label], onboardingStep: input.step },
        });

        // Fire-and-forget graph pipeline for text answers
        processContent(ctx.user.id, input.answer, 'interview');
        invalidateRecommendationCache(ctx.user.id);

        return { success: true, nodeId: node.id };
      }),

    complete: protectedProcedure.mutation(async ({ ctx }) => {
      await updateProfile(ctx.user.id, { onboardingComplete: true });
      return { success: true };
    }),
  }),

  persona: personaRouter,
  interview: interviewRouter,
  interviewMode: interviewModeRouter,
  mindMap: mindMapRouter,
  home: homeRouter,
});

export type AppRouter = typeof appRouter;
