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
  { label: "Interview Mode", description: "Guided conversational capture", href: "/interview", icon: Mic },
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
  layerCounts: Record<string, number>;
  totalNodes: number;
};

function getHighlight(href: string, stats: Stats | undefined): Highlight | null {
  if (!stats) return null;

  const LAYER_MIN = 5;
  const sparseLayers = Object.entries({
    voice_and_language: "voice",
    memory_and_life_events: "memory",
    reasoning_and_decisions: "reasoning",
    values_and_beliefs: "values",
    emotional_patterns: "emotional",
  }).filter(([key]) => (stats.layerCounts[key] ?? 0) < LAYER_MIN);

  switch (href) {
    case "/halliday": {
      const d = daysSince(stats.lastHalliday);
      if (d === null) return { reason: "No interview yet — start building your identity" };
      if (d >= 3) return { reason: `${d} days since your last session` };
      return null;
    }
    case "/reflection": {
      const d = daysSince(stats.lastReflection);
      if (d === null) return { reason: "No reflections yet — check in with yourself" };
      if (d >= 2) return { reason: `${d} days since your last reflection` };
      return null;
    }
    case "/quick": {
      const d = daysSince(stats.lastQuickMemory);
      if (d === null) return { reason: "No quick memories yet — drop a thought" };
      if (d >= 3) return { reason: `Nothing captured in ${d} days` };
      return null;
    }
    case "/mind-map":
    case "/dashboard": {
      if (sparseLayers.length > 0) {
        const [, label] = sparseLayers[0];
        return { reason: `Your ${label} layer needs depth` };
      }
      return null;
    }
    default:
      return null;
  }
}

// ─── Component ───

export default function Home() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const statsQuery = trpc.home.stats.useQuery(undefined, { staleTime: 60_000 });

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
          {navItems.map((item) => {
            const highlight = item.locked ? null : getHighlight(item.href, statsQuery.data as Stats | undefined);

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
                  highlight
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
                    {item.description}
                  </CardDescription>
                  {highlight && (
                    <p className="text-[10px] text-blue-500 opacity-80 mt-1 font-sora">
                      {highlight.reason}
                    </p>
                  )}
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <div className="text-center text-slate-500 text-sm mt-12">
          <p>The End of Disappearing. Building the lineage of human intelligence.</p>
        </div>
      </div>
    </div>
  );
}
