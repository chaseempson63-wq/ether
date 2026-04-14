import { getDb, getMemoryNodesByUserId } from "./db";
import { beneficiaries, memoryNodes } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Access Control System for Beneficiaries
 * Enforces authorization rules for memory and data access.
 * All reads now go through memory_nodes (graph layer).
 */

export type AccessLevel = "full" | "restricted" | "legacy_only";

/** Extract tags array from a memory_node's jsonb metadata */
function getTagsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const meta = metadata as Record<string, unknown>;
  const tags = meta.tags;
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === "string") {
    try { return JSON.parse(tags); } catch { return []; }
  }
  return [];
}

/**
 * Check if a beneficiary has access to a specific memory node
 */
export async function canAccessMemory(
  beneficiaryId: number,
  memoryId: string,
  accessLevel: AccessLevel
): Promise<boolean> {
  if (accessLevel === "full") return true;

  const db = await getDb();
  if (!db) return false;

  const result = await db
    .select()
    .from(memoryNodes)
    .where(eq(memoryNodes.id, memoryId))
    .limit(1);

  if (result.length === 0) return false;

  const tags = getTagsFromMetadata(result[0].metadata);

  if (accessLevel === "legacy_only") {
    return tags.includes("legacy") || tags.includes("for_beneficiaries");
  }

  if (accessLevel === "restricted") {
    return tags.includes("shared") || tags.includes("shared_with_beneficiaries");
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
  return accessLevel === "full" || accessLevel === "legacy_only" || accessLevel === "restricted";
}

/**
 * Get filtered memory nodes for a beneficiary based on their access level
 */
export async function getMemoriesForBeneficiary(
  userId: number,
  beneficiaryId: number,
  accessLevel: AccessLevel,
  limit: number = 50
) {
  const allNodes = await getMemoryNodesByUserId(userId, {
    hallidayLayers: ["memory_and_life_events"],
  }, limit);

  if (accessLevel === "full") {
    return allNodes.map(nodeToMemoryShape);
  }

  if (accessLevel === "legacy_only") {
    return allNodes
      .filter((n) => {
        const tags = getTagsFromMetadata(n.metadata);
        return tags.includes("legacy") || tags.includes("for_beneficiaries");
      })
      .map(nodeToMemoryShape);
  }

  if (accessLevel === "restricted") {
    return allNodes
      .filter((n) => {
        const tags = getTagsFromMetadata(n.metadata);
        return tags.includes("shared") || tags.includes("shared_with_beneficiaries");
      })
      .map(nodeToMemoryShape);
  }

  return [];
}

/**
 * Get filtered reasoning nodes for a beneficiary
 */
export async function getReasoningForBeneficiary(
  userId: number,
  beneficiaryId: number,
  accessLevel: AccessLevel,
  limit: number = 50
) {
  const allNodes = await getMemoryNodesByUserId(userId, {
    nodeTypes: ["reasoning_pattern", "decision"],
  }, limit);

  if (accessLevel === "full") {
    return allNodes.map(nodeToReasoningShape);
  }

  const filtered = allNodes.filter((n) => {
    const tags = getTagsFromMetadata(n.metadata);
    if (accessLevel === "legacy_only") {
      return tags.includes("legacy") || tags.includes("for_beneficiaries");
    }
    return tags.includes("shared") || tags.includes("shared_with_beneficiaries");
  });

  return filtered.map(nodeToReasoningShape);
}

/** Shape a memory_node into a legacy-compatible memory response */
function nodeToMemoryShape(node: {
  id: string;
  userId: number;
  content: string;
  sourceType: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const tags = getTagsFromMetadata(node.metadata);
  return {
    id: node.id,
    userId: node.userId,
    content: node.content,
    sourceType: node.sourceType,
    tags: tags.length > 0 ? tags : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

/** Shape a memory_node into a legacy-compatible reasoning response */
function nodeToReasoningShape(node: {
  id: string;
  userId: number;
  content: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const meta = node.metadata as Record<string, unknown> | null;
  const tags = getTagsFromMetadata(node.metadata);
  return {
    id: node.id,
    userId: node.userId,
    decision: (meta?.decision as string) ?? node.content,
    logicWhy: (meta?.logicWhy as string) ?? "",
    outcome: (meta?.outcome as string) ?? null,
    tags: tags.length > 0 ? tags : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
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
