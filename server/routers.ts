import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { hallidayRouter } from "./routers/halliday";
import { conversationRouter } from "./routers/conversations";
import { beneficiaryRouter } from "./routers/beneficiary";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getOrCreateProfile, createMemoryNode, getMemoryNodesByUserId, createMemoryEdge, getMemoryEdgesByUserId } from "./db";
import { personaRouter } from "./routers/persona";
import { interviewRouter } from "./routers/interview";
import { processContent } from "./graphPipeline";

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
      }))
      .mutation(async ({ ctx, input }) => {
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

        const node = await createMemoryNode(ctx.user.id, {
          nodeType: 'memory',
          hallidayLayer: 'memory_and_life_events',
          content: input.content,
          sourceType: graphSourceType,
          confidence: 1.0,
          metadata: input.tags ? { tags: input.tags } : null,
        });

        // Background: extract entities, create edges, embed
        processContent(ctx.user.id, input.content, graphSourceType);

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

  persona: personaRouter,
  interview: interviewRouter,
});

export type AppRouter = typeof appRouter;
