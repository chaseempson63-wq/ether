import { eq, desc, and, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, InsertMemoryNode, users, beneficiaries, profiles, memoryNodes, memoryEdges } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, { prepare: false });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createBeneficiary(userId: number, data: {
  name: string;
  relationship?: string;
  email?: string;
  accessLevel?: 'full' | 'restricted' | 'legacy_only';
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(beneficiaries).values({
    userId,
    name: data.name,
    relationship: data.relationship,
    email: data.email,
    accessLevel: data.accessLevel || 'legacy_only',
  });
}

export async function getBeneficiariesByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(beneficiaries).where(eq(beneficiaries.userId, userId));
}

export async function getOrCreateProfile(userId: number, data?: { bio?: string; headline?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  await db.insert(profiles).values({
    userId,
    bio: data?.bio,
    headline: data?.headline,
  });

  const created = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return created[0];
}

// Auth helpers

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0] ?? undefined;
}

/**
 * Look up a user by their Supabase UUID (stored in openId).
 * If the user doesn't exist yet, auto-provision a row in our users table.
 */
export async function ensureUser(
  supabaseId: string,
  email: string,
  name: string
) {
  let user = await getUserByOpenId(supabaseId);
  if (user) return user;

  await upsertUser({
    openId: supabaseId,
    email,
    name,
    loginMethod: "supabase",
    lastSignedIn: new Date(),
  });
  return getUserByOpenId(supabaseId);
}

// ─── Graph Memory helpers ───

export async function createMemoryNode(userId: number, data: {
  nodeType: InsertMemoryNode["nodeType"];
  hallidayLayer: InsertMemoryNode["hallidayLayer"];
  content: string;
  summary?: string;
  embedding?: number[];
  sourceType: InsertMemoryNode["sourceType"];
  confidence?: number;
  metadata?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(memoryNodes).values({
    userId,
    nodeType: data.nodeType,
    hallidayLayer: data.hallidayLayer,
    content: data.content,
    summary: data.summary ?? null,
    embedding: data.embedding ?? null,
    sourceType: data.sourceType,
    confidence: data.confidence ?? 1.0,
    metadata: data.metadata ?? null,
  }).returning();

  return result[0];
}

export async function getMemoryNodesByUserId(
  userId: number,
  filters?: {
    nodeTypes?: InsertMemoryNode["nodeType"][];
    hallidayLayers?: InsertMemoryNode["hallidayLayer"][];
  },
  limit = 50
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(memoryNodes.userId, userId)];

  if (filters?.nodeTypes && filters.nodeTypes.length > 0) {
    conditions.push(inArray(memoryNodes.nodeType, filters.nodeTypes));
  }
  if (filters?.hallidayLayers && filters.hallidayLayers.length > 0) {
    conditions.push(inArray(memoryNodes.hallidayLayer, filters.hallidayLayers));
  }

  return db.select()
    .from(memoryNodes)
    .where(and(...conditions))
    .orderBy(desc(memoryNodes.createdAt))
    .limit(limit);
}

export async function updateMemoryNode(
  nodeId: string,
  data: {
    metadata?: Record<string, unknown> | null;
    embedding?: number[] | null;
    summary?: string | null;
    content?: string;
    confidence?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const set: Record<string, unknown> = {};
  if (data.metadata !== undefined) set.metadata = data.metadata;
  if (data.embedding !== undefined) set.embedding = data.embedding;
  if (data.summary !== undefined) set.summary = data.summary;
  if (data.content !== undefined) set.content = data.content;
  if (data.confidence !== undefined) set.confidence = data.confidence;

  if (Object.keys(set).length === 0) return;

  await db.update(memoryNodes).set(set).where(eq(memoryNodes.id, nodeId));
}

export async function searchMemoryNodesByName(
  userId: number,
  name: string,
  limit = 10
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all nodes for this user and filter with case-insensitive substring matching.
  // For MVP this is simple — we'll add embedding-based similarity later.
  const allNodes = await db
    .select()
    .from(memoryNodes)
    .where(eq(memoryNodes.userId, userId))
    .limit(500);

  const lower = name.toLowerCase();
  return allNodes.filter((n) => {
    const content = n.content.toLowerCase();
    const summary = (n.summary ?? "").toLowerCase();
    const meta = n.metadata as Record<string, unknown> | null;
    const nodeName = ((meta?.name as string) ?? "").toLowerCase();
    const aliases = ((meta?.aliases as string[]) ?? []).map((a) => a.toLowerCase());

    return (
      nodeName === lower ||
      nodeName.includes(lower) ||
      lower.includes(nodeName) ||
      aliases.some((a) => a === lower || a.includes(lower) || lower.includes(a)) ||
      content.includes(lower) ||
      summary.includes(lower)
    );
  }).slice(0, limit);
}

export async function createMemoryEdge(userId: number, data: {
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: string;
  strength?: number;
  evidence?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(memoryEdges).values({
    userId,
    sourceNodeId: data.sourceNodeId,
    targetNodeId: data.targetNodeId,
    relationshipType: data.relationshipType,
    strength: data.strength ?? 0.5,
    evidence: data.evidence ?? null,
  }).returning();

  return result[0];
}

export async function getMemoryEdgesByUserId(userId: number, limit = 200) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(memoryEdges)
    .where(eq(memoryEdges.userId, userId))
    .orderBy(desc(memoryEdges.createdAt))
    .limit(limit);
}

// ─── Graph-Aware RAG helpers ───

export interface VectorSearchResult {
  id: string;
  userId: number;
  nodeType: string;
  hallidayLayer: string;
  content: string;
  summary: string | null;
  sourceType: string;
  confidence: number | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  similarity: number;
}

/**
 * Cosine similarity search using pgvector's <=> operator.
 * Returns top-K memory_nodes ranked by cosine similarity to the query embedding.
 * Uses the HNSW index for fast approximate nearest-neighbour search.
 */
export async function vectorSearchMemoryNodes(
  userId: number,
  queryEmbedding: number[],
  limit = 5
): Promise<VectorSearchResult[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // pgvector <=> returns cosine distance (0 = identical, 2 = opposite).
  // similarity = 1 - distance
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const results = await db
    .select({
      id: memoryNodes.id,
      userId: memoryNodes.userId,
      nodeType: memoryNodes.nodeType,
      hallidayLayer: memoryNodes.hallidayLayer,
      content: memoryNodes.content,
      summary: memoryNodes.summary,
      sourceType: memoryNodes.sourceType,
      confidence: memoryNodes.confidence,
      metadata: memoryNodes.metadata,
      createdAt: memoryNodes.createdAt,
      updatedAt: memoryNodes.updatedAt,
      similarity: sql<number>`1 - (${memoryNodes.embedding} <=> ${embeddingStr}::vector)`.as("similarity"),
    })
    .from(memoryNodes)
    .where(
      and(
        eq(memoryNodes.userId, userId),
        sql`${memoryNodes.embedding} IS NOT NULL`
      )
    )
    .orderBy(sql`${memoryNodes.embedding} <=> ${embeddingStr}::vector`)
    .limit(limit);

  return results as VectorSearchResult[];
}

/**
 * Get all edges that connect to any of the given node IDs (in either direction).
 */
export async function getEdgesForNodes(
  userId: number,
  nodeIds: string[]
): Promise<Array<typeof memoryEdges.$inferSelect>> {
  if (nodeIds.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(memoryEdges)
    .where(
      and(
        eq(memoryEdges.userId, userId),
        or(
          inArray(memoryEdges.sourceNodeId, nodeIds),
          inArray(memoryEdges.targetNodeId, nodeIds)
        )
      )
    );
}

/**
 * Fetch memory_nodes by their UUIDs.
 */
export async function getMemoryNodesByIds(
  nodeIds: string[]
): Promise<Array<typeof memoryNodes.$inferSelect>> {
  if (nodeIds.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(memoryNodes)
    .where(inArray(memoryNodes.id, nodeIds));
}
