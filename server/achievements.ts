import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { userAchievements, memoryNodes } from "../drizzle/schema";
import type {
  UserAchievement,
  InsertUserAchievement,
  MemoryNode,
} from "../drizzle/schema";

export type AchievementColor = "gold" | "cyan" | "violet" | "magenta";

export type AchievementIconName =
  | "sun"
  | "sparkles"
  | "headphones"
  | "network"
  | "shield"
  | "orbit"
  | "moon"
  | "mic";

export type AchievementStats = {
  memoryCount: number;
  voiceMemoCount: number;
  reasoningCount: number;
  valuesCount: number;
  streakDays: number;
};

export type AchievementDefinition = {
  id: string;
  name: string;
  sub: string;
  color: AchievementColor;
  icon: AchievementIconName;
  order: number;
  threshold: (stats: AchievementStats) => boolean;
};

// Ordered catalogue — stays in code so copy, icons, thresholds can change
// without a migration. Only earned rows ever hit the DB.
export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "first_spark",
    name: "First Spark",
    sub: "First memory captured",
    color: "gold",
    icon: "sparkles",
    order: 0,
    threshold: (s) => s.memoryCount >= 1,
  },
  {
    id: "first_light",
    name: "First Light",
    sub: "10 memories",
    color: "gold",
    icon: "sun",
    order: 10,
    threshold: (s) => s.memoryCount >= 10,
  },
  {
    id: "deep_listener",
    name: "Deep Listener",
    sub: "30 voice logs",
    color: "cyan",
    icon: "headphones",
    order: 20,
    threshold: (s) => s.voiceMemoCount >= 30,
  },
  {
    id: "pattern_seeker",
    name: "Pattern Seeker",
    sub: "5 insights forged",
    color: "violet",
    icon: "network",
    order: 30,
    threshold: (s) => s.reasoningCount >= 5,
  },
  {
    id: "core_values",
    name: "Core Values",
    sub: "10 values defined",
    color: "magenta",
    icon: "shield",
    order: 40,
    threshold: (s) => s.valuesCount >= 10,
  },
  {
    id: "week_one",
    name: "Week One",
    sub: "7-day streak",
    color: "gold",
    icon: "orbit",
    order: 50,
    threshold: (s) => s.streakDays >= 7,
  },
  {
    id: "silver_tongue",
    name: "Silver Tongue",
    sub: "100 voice logs",
    color: "gold",
    icon: "mic",
    order: 60,
    threshold: (s) => s.voiceMemoCount >= 100,
  },
  {
    id: "lunar_orbit",
    name: "Lunar Orbit",
    sub: "30-day streak",
    color: "cyan",
    icon: "moon",
    order: 70,
    threshold: (s) => s.streakDays >= 30,
  },
];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Streak = consecutive days ending today (or yesterday if today has no entry
// yet) on which the user created at least one memory node. A missing *today*
// alone doesn't reset the streak — gives users a grace window each morning.
export function computeStreakDays(dates: ReadonlyArray<Date | string>): number {
  if (dates.length === 0) return 0;
  const daySet = new Set(dates.map((d) => dayKey(new Date(d))));
  const cursor = new Date();
  if (!daySet.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!daySet.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (daySet.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function deriveStats(
  nodes: ReadonlyArray<MemoryNode>,
): AchievementStats {
  let memoryCount = 0;
  let voiceMemoCount = 0;
  let reasoningCount = 0;
  let valuesCount = 0;
  for (const n of nodes) {
    if (n.hallidayLayer === "memory_and_life_events") memoryCount++;
    if (n.sourceType === "voice_memo") voiceMemoCount++;
    if (n.nodeType === "reasoning_pattern" || n.nodeType === "decision") {
      reasoningCount++;
    }
    if (n.nodeType === "value" || n.nodeType === "belief") valuesCount++;
  }
  const streakDays = computeStreakDays(nodes.map((n) => n.createdAt));
  return {
    memoryCount,
    voiceMemoCount,
    reasoningCount,
    valuesCount,
    streakDays,
  };
}

export async function evaluateAchievements(
  userId: number,
): Promise<UserAchievement[]> {
  const db = await getDb();
  if (!db) return [];

  const nodes = await db
    .select()
    .from(memoryNodes)
    .where(eq(memoryNodes.userId, userId));

  const stats = deriveStats(nodes);

  const existing = await db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));
  const earnedIds = new Set(existing.map((r) => r.achievementId));

  const toInsert: InsertUserAchievement[] = [];
  for (const def of ACHIEVEMENTS) {
    if (!earnedIds.has(def.id) && def.threshold(stats)) {
      toInsert.push({ userId, achievementId: def.id });
    }
  }
  if (toInsert.length === 0) return [];

  return await db.insert(userAchievements).values(toInsert).returning();
}

export async function listEarnedAchievements(
  userId: number,
): Promise<UserAchievement[]> {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));
}
