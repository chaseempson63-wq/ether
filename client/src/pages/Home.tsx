import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Brain,
  MessageCircle,
  Zap,
  Calendar,
  Mic,
  Users,
  Network,
  LogOut,
  type LucideIcon,
} from "lucide-react";

// ─── Nav items ───

interface NavItem {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  locked?: boolean;
}

const navItems: NavItem[] = [
  { label: "Mind Map", description: "Explore your identity graph", href: "/mind-map", icon: Network },
  { label: "Dashboard", description: "View your memories, values, and decisions", href: "/dashboard", icon: LayoutDashboard },
  { label: "Halliday Interview", description: "Deep identity questions across 5 layers", href: "/halliday", icon: Brain },
  { label: "Persona Chat", description: "Talk to your digital mind", href: "/chat", icon: MessageCircle },
  { label: "Quick Memory", description: "Capture a thought right now", href: "/quick", icon: Zap },
  { label: "Daily Reflection", description: "Journal and reflect on your day", href: "/reflection", icon: Calendar },
  { label: "Interview Mode", description: "Progressive identity interview", href: "/interview", icon: Mic },
  { label: "Beneficiaries", description: "Manage who can access your mind", href: "/beneficiaries", icon: Users, locked: true },
];

// ─── Highlighting logic ───

const DAY_MS = 1000 * 60 * 60 * 24;

function daysSince(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / DAY_MS);
}

interface Highlight {
  reason: string;
}

type Stats = {
  lastHalliday: Date | string | null;
  lastReflection: Date | string | null;
  lastQuickMemory: Date | string | null;
  lastChat: Date | string | null;
  lastInterview: Date | string | null;
  interviewLevel1Complete: boolean;
  layerCounts: Record<string, number>;
  totalNodes: number;
};

/**
 * Returns a Set of hrefs (max 2) that should be highlighted,
 * ranked by urgency. Only input-oriented cards qualify.
 */
function getHighlightedHrefs(stats: Stats | undefined): Map<string, string> {
  if (!stats) return new Map();

  const ranked: Array<{ href: string; reason: string }> = [];

  // Priority 1: Halliday Interview — no session ever, or 3+ days stale
  const hallidayDays = daysSince(stats.lastHalliday);
  if (hallidayDays === null) {
    ranked.push({ href: "/halliday", reason: "No interview yet — start building your identity" });
  } else if (hallidayDays >= 3) {
    ranked.push({ href: "/halliday", reason: `${hallidayDays} days since your last session` });
  }

  // Priority 2: Interview Mode — if Level 1 not complete
  if (!stats.interviewLevel1Complete) {
    ranked.push({ href: "/interview", reason: "Complete Level 1 to unlock deeper questions" });
  }

  // Priority 3: Quick Memory — no memories in 3+ days
  const quickDays = daysSince(stats.lastQuickMemory);
  if (quickDays === null) {
    ranked.push({ href: "/quick", reason: "No quick memories yet — drop a thought" });
  } else if (quickDays >= 3) {
    ranked.push({ href: "/quick", reason: `Nothing captured in ${quickDays} days` });
  }

  // Priority 4: Daily Reflection — no reflection in 2+ days
  const reflectionDays = daysSince(stats.lastReflection);
  if (reflectionDays === null) {
    ranked.push({ href: "/reflection", reason: "No reflections yet — check in with yourself" });
  } else if (reflectionDays >= 2) {
    ranked.push({ href: "/reflection", reason: `${reflectionDays} days since your last reflection` });
  }

  // Priority 5: Mind Map — any layer < 5 nodes
  const LAYER_MIN = 5;
  const sparseLayers = Object.entries({
    voice_and_language: "voice",
    memory_and_life_events: "memory",
    reasoning_and_decisions: "reasoning",
    values_and_beliefs: "values",
    emotional_patterns: "emotional",
  }).filter(([key]) => (stats.layerCounts[key] ?? 0) < LAYER_MIN);

  if (sparseLayers.length > 0) {
    const [, label] = sparseLayers[0];
    ranked.push({ href: "/mind-map", reason: `Your ${label} layer needs depth` });
  }

  // Dashboard + Persona Chat never highlight

  // Take top 2 only
  const result = new Map<string, string>();
  for (const item of ranked.slice(0, 2)) {
    result.set(item.href, item.reason);
  }
  return result;
}

// ─── Component ───

export default function Home() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const statsQuery = trpc.home.stats.useQuery(undefined, { staleTime: 60_000 });
  const interviewStatus = trpc.interviewMode.status.useQuery(undefined, { staleTime: 60_000 });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white p-6 font-sora">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-bold">Ether</h1>
            <p className="text-slate-400 mt-1">Your Digital Mind. Living Forever.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => { await logout(); setLocation("/login"); }}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Log out
          </Button>
        </div>

        {user?.email && (
          <p className="text-slate-400 mb-8">Welcome back, <span className="text-white">{user.user_metadata?.name || user.email}</span></p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(() => {
            const highlighted = getHighlightedHrefs(statsQuery.data as Stats | undefined);
            return navItems.map((item) => {
            const reason = item.locked ? null : highlighted.get(item.href) ?? null;

            if (item.locked) {
              return (
                <Card
                  key={item.href}
                  className="bg-slate-800/60 border-slate-700 opacity-40 cursor-default transition-colors relative"
                >
                  <span
                    className="absolute top-3 right-3 font-sora uppercase text-[#64748b] select-none"
                    style={{
                      fontSize: "9px",
                      letterSpacing: "0.1em",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "4px",
                      padding: "3px 8px",
                    }}
                  >
                    Coming soon
                  </span>
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-3 text-lg">
                      <item.icon className="h-5 w-5 text-blue-400" />
                      {item.label}
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            }

            return (
              <Card
                key={item.href}
                className={`bg-slate-800/60 hover:bg-slate-800 cursor-pointer transition-colors ${
                  reason
                    ? "border-blue-500/50 animate-card-pulse"
                    : "border-slate-700 hover:border-slate-600"
                }`}
                onClick={() => setLocation(item.href)}
              >
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-3 text-lg">
                    <item.icon className="h-5 w-5 text-blue-400" />
                    {item.label}
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    {item.href === "/interview" && interviewStatus.data?.currentLevel
                      ? (() => {
                          const cl = interviewStatus.data.levels.find(l => l.level === interviewStatus.data!.currentLevel);
                          return cl ? `Level ${cl.level} — ${cl.answered}/${cl.total}` : item.description;
                        })()
                      : item.description}
                  </CardDescription>
                  {reason && (
                    <p className="text-[10px] text-blue-500 opacity-80 mt-1 font-sora">
                      {reason}
                    </p>
                  )}
                </CardHeader>
              </Card>
            );
          });
          })()}
        </div>

        <div className="text-center text-slate-500 text-sm mt-12">
          <p>The End of Disappearing. Building the lineage of human intelligence.</p>
        </div>
      </div>
    </div>
  );
}
