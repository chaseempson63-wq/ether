import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  memoryNodes,
  memoryEdges,
  interviewLevels,
} from "../drizzle/schema";
import type { MemoryNode, UserAchievement } from "../drizzle/schema";
import {
  ACHIEVEMENTS,
  type AchievementColor,
  type AchievementIconName,
  deriveStats,
  listEarnedAchievements,
} from "./achievements";

// ─── Types (consumed by the client tRPC router) ──────────────────────────────

export type DashboardStatBlock = {
  count: number;
  deltaWeek: number;
  spark: number[];
  label?: string;
};

export type StreakDay = { label: string; active: boolean; today?: boolean };

export type MemoryStreamType =
  | "voice"
  | "interview"
  | "reflection"
  | "insight";

export type MemoryRarity = "common" | "rare" | "epic";

export type MemoryStreamItem = {
  id: string;
  type: MemoryStreamType;
  text: string;
  tag: string;
  meta: string;
  rarity: MemoryRarity;
};

export type BrainRing = {
  count: number;
  radius: number;
  color: string;
  size: number;
};

export type AchievementItem = {
  id: string;
  name: string;
  sub: string;
  color: AchievementColor;
  icon: AchievementIconName;
  isNew: boolean;
  locked: boolean;
  earnedAt: string | null;
};

export type GrowthSeries = {
  key: "memories" | "decisions" | "values";
  color: string;
  values: number[];
};

export type DashboardPayload = {
  user: {
    mindVersion: string;
  };
  stats: {
    memories: DashboardStatBlock;
    decisions: DashboardStatBlock;
    values: DashboardStatBlock;
    streak: { days: number; week: StreakDay[] };
  };
  brain: {
    nodes: number;
    connections: number;
    coherence: number;
    rings: BrainRing[];
  };
  memoryStream: MemoryStreamItem[];
  achievements: {
    earned: number;
    total: number;
    items: AchievementItem[];
  };
  growth: {
    range: string;
    series: GrowthSeries[];
    xAxis: string[];
  };
  quest: {
    eyebrow: string;
    title: string;
    subtitle: string;
    cta: string;
    unlocks: string[];
  };
  copy: {
    heroEyebrow: string;
    heroHeadline: string;
    heroBody: string;
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 3600 * 1000;

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

function countsPerDay(
  dates: ReadonlyArray<Date | string>,
  windowDays: number,
): number[] {
  const buckets = new Array(windowDays).fill(0);
  const todayStart = startOfDay(new Date()).getTime();
  for (const raw of dates) {
    const t = new Date(raw).getTime();
    const diff = Math.floor((todayStart - startOfDay(new Date(t)).getTime()) / DAY_MS);
    if (diff >= 0 && diff < windowDays) {
      buckets[windowDays - 1 - diff]++;
    }
  }
  return buckets;
}

function cumulativeFromDaily(daily: number[]): number[] {
  let running = 0;
  return daily.map((v) => (running += v));
}

function weekOfStreak(
  dates: ReadonlyArray<Date | string>,
): StreakDay[] {
  const daySet = new Set(dates.map((d) => dayKey(new Date(d))));
  const today = new Date();
  const todayDay = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Start the row on Monday.
  const daysFromMonday = (todayDay + 6) % 7;
  const monday = new Date(today);
  monday.setDate(monday.getDate() - daysFromMonday);
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  return labels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      label,
      active: daySet.has(dayKey(d)),
      today: dayKey(d) === dayKey(today),
    };
  });
}

function rarityForNode(n: MemoryNode): MemoryRarity {
  if (n.nodeType === "decision" || n.nodeType === "reasoning_pattern") {
    return "epic";
  }
  if (
    n.sourceType === "interview" ||
    n.nodeType === "value" ||
    n.nodeType === "belief"
  ) {
    return "rare";
  }
  return "common";
}

function typeForNode(n: MemoryNode): MemoryStreamType {
  if (n.nodeType === "decision" || n.nodeType === "reasoning_pattern") {
    return "insight";
  }
  if (n.sourceType === "interview") return "interview";
  if (n.sourceType === "voice_memo") return "voice";
  return "reflection";
}

function tagForNode(n: MemoryNode): string {
  const t = typeForNode(n);
  if (t === "voice") return "VOICE";
  if (t === "interview") return "INTERVIEW";
  if (t === "insight") return "INSIGHT";
  return "REFLECTION";
}

function metaForNode(n: MemoryNode): string {
  const created = new Date(n.createdAt);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - created.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return `${created.getDate().toString().padStart(2, "0")}/${(created.getMonth() + 1).toString().padStart(2, "0")}`;
}

function mindVersionFor(memoryCount: number): string {
  // Simple cosmetic version: 0.01 per memory, rounded to two decimals, capped.
  const v = Math.min(9.99, memoryCount * 0.01);
  return v.toFixed(2);
}

function heroHeadline(weekDelta: number): string {
  if (weekDelta === 0) return "Your mind is waiting for its next trace.";
  if (weekDelta < 5) return "Your mind is starting to remember you.";
  if (weekDelta < 15) return "Your mind is learning the shape of your thought.";
  return "Your mind is remembering you.";
}

function heroBody(weekDelta: number): string {
  if (weekDelta === 0) {
    return "No new traces this week. Capture a thought — even a short one — and your mind will begin to take shape.";
  }
  const n = weekDelta === 1 ? "One trace" : `${weekDelta} traces`;
  return `${n} this week. Your reasoning is starting to form its own geometry — a recognizable pattern of how you decide. Keep going. The next layer is close.`;
}

// ─── Main aggregator ─────────────────────────────────────────────────────────

export async function getDashboard(
  userId: number,
): Promise<DashboardPayload> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [nodes, edges, earned, levels] = await Promise.all([
    db
      .select()
      .from(memoryNodes)
      .where(eq(memoryNodes.userId, userId))
      .orderBy(desc(memoryNodes.createdAt)),
    db
      .select()
      .from(memoryEdges)
      .where(eq(memoryEdges.userId, userId)),
    listEarnedAchievements(userId),
    db
      .select()
      .from(interviewLevels)
      .where(eq(interviewLevels.userId, userId)),
  ]);

  const stats = deriveStats(nodes);
  const createdAtList = nodes.map((n) => n.createdAt);

  const memoryDates = nodes
    .filter((n) => n.hallidayLayer === "memory_and_life_events")
    .map((n) => n.createdAt);
  const decisionDates = nodes
    .filter(
      (n) =>
        n.nodeType === "decision" || n.nodeType === "reasoning_pattern",
    )
    .map((n) => n.createdAt);
  const valueDates = nodes
    .filter((n) => n.nodeType === "value" || n.nodeType === "belief")
    .map((n) => n.createdAt);

  const weekCount = (dates: ReadonlyArray<Date | string>) => {
    const cutoff = Date.now() - 7 * DAY_MS;
    return dates.filter((d) => new Date(d).getTime() >= cutoff).length;
  };
  const lastWeekCount = (dates: ReadonlyArray<Date | string>) => {
    const now = Date.now();
    return dates.filter((d) => {
      const t = new Date(d).getTime();
      return t >= now - 14 * DAY_MS && t < now - 7 * DAY_MS;
    }).length;
  };

  const SPARK_DAYS = 9;
  const GROWTH_DAYS = 21;

  const weekDelta = {
    memories: weekCount(memoryDates) - lastWeekCount(memoryDates),
    decisions: weekCount(decisionDates) - lastWeekCount(decisionDates),
    values: weekCount(valueDates) - lastWeekCount(valueDates),
  };

  const growthDailyMemories = countsPerDay(memoryDates, GROWTH_DAYS);
  const growthDailyDecisions = countsPerDay(decisionDates, GROWTH_DAYS);
  const growthDailyValues = countsPerDay(valueDates, GROWTH_DAYS);

  // Next incomplete interview level → quest CTA text
  const nextLevel =
    levels
      .filter((l) => l.status !== "completed")
      .sort((a, b) => a.level - b.level)[0] ?? null;
  const questLevel = nextLevel?.level ?? 1;
  const questEyebrow = `Next quest · Level ${questLevel}`;
  const questTitle =
    questLevel === 1
      ? "Lay the first layer of your mind."
      : questLevel === 2
        ? "Teach your mind how you decide under pressure."
        : "Deepen the architecture of what you already know.";
  const questSubtitle =
    questLevel === 1
      ? "Six seed questions across five Halliday layers. Each answer becomes a node your future self can stand on."
      : "Six open questions remaining. Each layer sharpens the pattern your mind is already forming.";

  const earnedMap = new Map<string, UserAchievement>(
    earned.map((r) => [r.achievementId, r]),
  );
  const now = Date.now();
  const achievementItems: AchievementItem[] = ACHIEVEMENTS.map((def) => {
    const row = earnedMap.get(def.id);
    const earnedAt = row ? row.earnedAt : null;
    const isNew = !!earnedAt && now - new Date(earnedAt).getTime() < DAY_MS;
    return {
      id: def.id,
      name: def.name,
      sub: def.sub,
      color: def.color,
      icon: def.icon,
      isNew,
      locked: !row,
      earnedAt: earnedAt ? new Date(earnedAt).toISOString() : null,
    };
  });

  const memoryStream: MemoryStreamItem[] = nodes.slice(0, 7).map((n) => ({
    id: n.id,
    type: typeForNode(n),
    text: n.content,
    tag: tagForNode(n),
    meta: metaForNode(n),
    rarity: rarityForNode(n),
  }));

  const coherence =
    nodes.length === 0 ? 0 : Math.min(1, edges.length / nodes.length);

  // Ring counts are proportional to node count but capped so the visual
  // doesn't get hairy.
  const ringNodeCount = (base: number, cap: number) =>
    Math.min(cap, Math.max(3, Math.round(nodes.length * base)));

  // Growth x-axis: 5 evenly-spaced day labels across the window.
  const xAxis: string[] = [];
  const today = startOfDay(new Date());
  for (let i = 0; i < 5; i++) {
    const offset = Math.round((GROWTH_DAYS - 1) * (i / 4));
    const d = new Date(today.getTime() - (GROWTH_DAYS - 1 - offset) * DAY_MS);
    xAxis.push(
      i === 4
        ? "TODAY"
        : `${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getMonth()]} ${d.getDate().toString().padStart(2, "0")}`,
    );
  }

  return {
    user: {
      mindVersion: mindVersionFor(stats.memoryCount),
    },
    stats: {
      memories: {
        count: stats.memoryCount,
        deltaWeek: weekDelta.memories,
        spark: countsPerDay(memoryDates, SPARK_DAYS),
      },
      decisions: {
        count: stats.reasoningCount,
        deltaWeek: weekDelta.decisions,
        spark: countsPerDay(decisionDates, SPARK_DAYS),
      },
      values: {
        count: stats.valuesCount,
        deltaWeek: weekDelta.values,
        spark: countsPerDay(valueDates, SPARK_DAYS),
      },
      streak: {
        days: stats.streakDays,
        week: weekOfStreak(createdAtList),
      },
    },
    brain: {
      nodes: nodes.length,
      connections: edges.length,
      coherence,
      rings: [
        { count: ringNodeCount(0.2, 8), radius: 110, color: "#3DD9FF", size: 3.2 },
        { count: ringNodeCount(0.35, 12), radius: 160, color: "#8A7CFF", size: 2.6 },
        { count: ringNodeCount(0.5, 16), radius: 210, color: "#FF6FD1", size: 2.2 },
      ],
    },
    memoryStream,
    achievements: {
      earned: earned.length,
      total: ACHIEVEMENTS.length,
      items: achievementItems,
    },
    growth: {
      range: `${xAxis[0]} → TODAY`,
      series: [
        {
          key: "memories",
          color: "#3DD9FF",
          values: cumulativeFromDaily(growthDailyMemories),
        },
        {
          key: "decisions",
          color: "#8A7CFF",
          values: cumulativeFromDaily(growthDailyDecisions),
        },
        {
          key: "values",
          color: "#FF6FD1",
          values: cumulativeFromDaily(growthDailyValues),
        },
      ],
      xAxis,
    },
    quest: {
      eyebrow: questEyebrow,
      title: questTitle,
      subtitle: questSubtitle,
      cta: `Begin Level ${questLevel}`,
      unlocks: [],
    },
    copy: {
      heroEyebrow: `Mind v${mindVersionFor(stats.memoryCount)}`,
      heroHeadline: heroHeadline(weekDelta.memories),
      heroBody: heroBody(weekDelta.memories),
    },
  };
}
