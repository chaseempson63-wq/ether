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

// ─── Nav items with stable card IDs matching Venice response ───

interface NavItem {
  cardId: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  locked?: boolean;
}

const navItems: NavItem[] = [
  { cardId: "mind_map", label: "Mind Map", description: "Explore your identity graph", href: "/mind-map", icon: Network },
  { cardId: "dashboard", label: "Dashboard", description: "View your memories, values, and decisions", href: "/dashboard", icon: LayoutDashboard },
  { cardId: "halliday_interview", label: "Halliday Interview", description: "Deep identity questions across 5 layers", href: "/halliday", icon: Brain },
  { cardId: "persona_chat", label: "Persona Chat", description: "Talk to your digital mind", href: "/chat", icon: MessageCircle },
  { cardId: "quick_memory", label: "Quick Memory", description: "Capture a thought right now", href: "/quick", icon: Zap },
  { cardId: "daily_reflection", label: "Daily Reflection", description: "Journal and reflect on your day", href: "/reflection", icon: Calendar },
  { cardId: "interview_mode", label: "Interview Mode", description: "Progressive identity interview", href: "/interview", icon: Mic },
  { cardId: "beneficiaries", label: "Beneficiaries", description: "Manage who can access your mind", href: "/beneficiaries", icon: Users, locked: true },
];

// ─── Component ───

export default function Home() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const recsQuery = trpc.home.recommendations.useQuery(undefined, { staleTime: 60_000 });
  const interviewStatus = trpc.interviewMode.status.useQuery(undefined, { staleTime: 60_000 });

  // Build a map of cardId → reason for highlighted cards
  const highlightMap = new Map<string, string>();
  if (recsQuery.data?.recommendations) {
    for (const rec of recsQuery.data.recommendations) {
      highlightMap.set(rec.card, rec.reason);
    }
  }

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
            const reason = item.locked ? null : highlightMap.get(item.cardId) ?? null;

            if (item.locked) {
              return (
                <Card
                  key={item.cardId}
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
                key={item.cardId}
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
                    {item.cardId === "interview_mode" && interviewStatus.data?.currentLevel
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
          })}
        </div>

        <div className="text-center text-slate-500 text-sm mt-12">
          <p>The End of Disappearing. Building the lineage of human intelligence.</p>
        </div>
      </div>
    </div>
  );
}
