import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users, memories, reasoningPatterns, coreValues, beneficiaries, profiles } from "../drizzle/schema";
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

// Ether-specific database helpers

export async function createMemory(userId: number, data: {
  content: string;
  sourceType: 'journal' | 'voice_memo' | 'passive_import' | 'interview';
  occurredAt?: Date;
  tags?: string[];
  embedding?: number[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(memories).values({
    userId,
    content: data.content,
    sourceType: data.sourceType,
    occurredAt: data.occurredAt,
    tags: data.tags ?? null,
    embedding: data.embedding ?? null,
  });

  return result;
}

export async function getMemoriesByUserId(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(memories).where(eq(memories.userId, userId)).orderBy(desc(memories.createdAt)).limit(limit);
}

export async function createReasoningPattern(userId: number, data: {
  decision: string;
  logicWhy: string;
  outcome?: string;
  tags?: string[];
  embedding?: number[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(reasoningPatterns).values({
    userId,
    decision: data.decision,
    logicWhy: data.logicWhy,
    outcome: data.outcome,
    tags: data.tags ?? null,
    embedding: data.embedding ?? null,
  });
}

export async function getReasoningPatternsByUserId(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(reasoningPatterns).where(eq(reasoningPatterns.userId, userId)).orderBy(desc(reasoningPatterns.createdAt)).limit(limit);
}

export async function createCoreValue(userId: number, data: {
  valueStatement: string;
  beliefContext?: string;
  priority?: number;
  embedding?: number[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(coreValues).values({
    userId,
    valueStatement: data.valueStatement,
    beliefContext: data.beliefContext,
    priority: data.priority || 1,
    embedding: data.embedding ?? null,
  });
}

export async function getCoreValuesByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(coreValues).where(eq(coreValues.userId, userId)).orderBy(coreValues.priority);
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
