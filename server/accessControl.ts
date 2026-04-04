import { getDb } from "./db";
import { beneficiaries, memories } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Access Control System for Beneficiaries
 * Enforces authorization rules for memory and data access
 */

export type AccessLevel = "full" | "restricted" | "legacy_only";

/**
 * Check if a beneficiary has access to a specific memory
 */
export async function canAccessMemory(
  beneficiaryId: number,
  memoryId: number,
  accessLevel: AccessLevel
): Promise<boolean> {
  // Full access: can see all memories
  if (accessLevel === "full") {
    return true;
  }

  // Legacy only: can only see memories marked for legacy
  if (accessLevel === "legacy_only") {
    const db = await getDb();
    if (!db) return false;

    const memory = await db
      .select()
      .from(memories)
      .where(eq(memories.id, memoryId))
      .limit(1);

    if (memory.length === 0) return false;

    // Check if memory has "legacy" tag
    const tags = memory[0].tags;
    const tagArray = Array.isArray(tags) ? tags : typeof tags === "string" ? JSON.parse(tags) : [];
    return tagArray.includes("legacy") || tagArray.includes("for_beneficiaries");
  }

  // Restricted: can only see memories explicitly shared with them
  if (accessLevel === "restricted") {
    const db = await getDb();
    if (!db) return false;

    // Check if memory has "shared_with_beneficiaries" tag
    const memory = await db
      .select()
      .from(memories)
      .where(eq(memories.id, memoryId))
      .limit(1);

    if (memory.length === 0) return false;

    const tags = memory[0].tags;
    const tagArray = Array.isArray(tags) ? tags : typeof tags === "string" ? JSON.parse(tags) : [];
    return tagArray.includes("shared") || tagArray.includes("shared_with_beneficiaries");
  }

  return false;
}

/**
 * Check if a beneficiary can access a user's profile
 */
export async function canAccessProfile(
  userId: number,
  beneficiaryId: number,
  accessLevel: AccessLevel
): Promise<boolean> {
  // All beneficiaries can access basic profile info
  if (accessLevel === "full" || accessLevel === "legacy_only") {
    return true;
  }

  if (accessLevel === "restricted") {
    // Restricted beneficiaries can access basic profile info
    // but not sensitive details
    return true;
  }

  return false;
}

/**
 * Get filtered memories for a beneficiary based on their access level
 */
export async function getMemoriesForBeneficiary(
  userId: number,
  beneficiaryId: number,
  accessLevel: AccessLevel,
  limit: number = 50
) {
  const db = await getDb();
  if (!db) return [];

  const allMemories = await db.select().from(memories).where(eq(memories.userId, userId)).limit(limit);

  if (accessLevel === "full") {
    return allMemories;
  }

  if (accessLevel === "legacy_only") {
    return allMemories.filter((m) => {
      const tags = Array.isArray(m.tags) ? m.tags : typeof m.tags === "string" ? JSON.parse(m.tags) : [];
      return tags.includes("legacy") || tags.includes("for_beneficiaries");
    });
  }

  if (accessLevel === "restricted") {
    // Return only memories explicitly shared with beneficiaries
    return allMemories.filter((m) => {
      const tags = Array.isArray(m.tags) ? m.tags : typeof m.tags === "string" ? JSON.parse(m.tags) : [];
      return tags.includes("shared") || tags.includes("shared_with_beneficiaries");
    });
  }

  return [];
}

/**
 * Get filtered reasoning patterns for a beneficiary
 */
export async function getReasoningForBeneficiary(
  userId: number,
  beneficiaryId: number,
  accessLevel: AccessLevel,
  limit: number = 50
) {
  const db = await getDb();
  if (!db) return [];

  if (accessLevel === "full") {
    return await db
      .select()
      .from(reasoningPatterns)
      .where(eq(reasoningPatterns.userId, userId))
      .limit(limit);
  }

  if (accessLevel === "legacy_only") {
    // Return reasoning patterns tagged for legacy
    const allReasoning = await db
      .select()
      .from(reasoningPatterns)
      .where(eq(reasoningPatterns.userId, userId))
      .limit(limit);

    return allReasoning.filter((r) => {
      const tags = Array.isArray(r.tags) ? r.tags : typeof r.tags === "string" ? JSON.parse(r.tags) : [];
      return tags.includes("legacy") || tags.includes("for_beneficiaries");
    });
  }

  if (accessLevel === "restricted") {
    // Return reasoning patterns explicitly shared
    const allReasoning = await db
      .select()
      .from(reasoningPatterns)
      .where(eq(reasoningPatterns.userId, userId))
      .limit(limit);

    return allReasoning.filter((r) => {
      const tags = Array.isArray(r.tags) ? r.tags : typeof r.tags === "string" ? JSON.parse(r.tags) : [];
      return tags.includes("shared") || tags.includes("shared_with_beneficiaries");
    });
  }

  return [];
}

/**
 * Verify that a beneficiary belongs to a user
 */
export async function verifyBeneficiaryOwnership(userId: number, beneficiaryId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.id, beneficiaryId), eq(beneficiaries.userId, userId)))
    .limit(1);

  return result.length > 0;
}

/**
 * Get beneficiary access level
 */
export async function getBeneficiaryAccessLevel(userId: number, beneficiaryId: number): Promise<AccessLevel | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.id, beneficiaryId), eq(beneficiaries.userId, userId)))
    .limit(1);

  if (result.length === 0) return null;

  return result[0].accessLevel as AccessLevel;
}

// Import reasoningPatterns for the function above
import { reasoningPatterns } from "../drizzle/schema";
