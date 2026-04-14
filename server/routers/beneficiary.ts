import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { beneficiaries } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  canAccessMemory,
  canAccessProfile,
  getMemoriesForBeneficiary,
  verifyBeneficiaryOwnership,
  getBeneficiaryAccessLevel,
} from "../accessControl";
import { TRPCError } from "@trpc/server";

export const beneficiaryRouter = router({
  /**
   * Get all beneficiaries for the current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const result = await db.select().from(beneficiaries).where(eq(beneficiaries.userId, ctx.user.id));

    return result;
  }),

  /**
   * Get a specific beneficiary
   */
  get: protectedProcedure
    .input(z.object({ beneficiaryId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await db
        .select()
        .from(beneficiaries)
        .where(and(eq(beneficiaries.id, input.beneficiaryId), eq(beneficiaries.userId, ctx.user.id)))
        .limit(1);

      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Beneficiary not found" });
      }

      return result[0];
    }),

  /**
   * Create a new beneficiary
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        relationship: z.string().optional(),
        accessLevel: z.enum(["full", "restricted", "legacy_only"]),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.insert(beneficiaries).values({
        userId: ctx.user.id,
        name: input.name,
        relationship: input.relationship,
        accessLevel: input.accessLevel,
        email: input.email,
      });

      return { success: true, ...input };
    }),

  /**
   * Update beneficiary access level
   */
  updateAccessLevel: protectedProcedure
    .input(
      z.object({
        beneficiaryId: z.number(),
        accessLevel: z.enum(["full", "restricted", "legacy_only"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const isOwner = await verifyBeneficiaryOwnership(ctx.user.id, input.beneficiaryId);
      if (!isOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this beneficiary" });
      }

      await db
        .update(beneficiaries)
        .set({ accessLevel: input.accessLevel })
        .where(eq(beneficiaries.id, input.beneficiaryId));

      return { success: true };
    }),

  /**
   * Delete a beneficiary
   */
  delete: protectedProcedure
    .input(z.object({ beneficiaryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const isOwner = await verifyBeneficiaryOwnership(ctx.user.id, input.beneficiaryId);
      if (!isOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this beneficiary" });
      }

      await db.delete(beneficiaries).where(eq(beneficiaries.id, input.beneficiaryId));

      return { success: true };
    }),

  /**
   * Get memories visible to a beneficiary (for testing access control)
   */
  getAccessibleMemories: protectedProcedure
    .input(z.object({ beneficiaryId: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const isOwner = await verifyBeneficiaryOwnership(ctx.user.id, input.beneficiaryId);
      if (!isOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this beneficiary" });
      }

      // Get beneficiary access level
      const accessLevel = await getBeneficiaryAccessLevel(ctx.user.id, input.beneficiaryId);
      if (!accessLevel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Beneficiary not found" });
      }

      // Get filtered memories based on access level
      const accessibleMemories = await getMemoriesForBeneficiary(
        ctx.user.id,
        input.beneficiaryId,
        accessLevel,
        input.limit
      );

      return {
        accessLevel,
        count: accessibleMemories.length,
        memories: accessibleMemories,
      };
    }),
});
