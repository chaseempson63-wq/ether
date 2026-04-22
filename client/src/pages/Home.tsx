import { useAuth } from "@/_core/hooks/useAuth";
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
import {
  EtherPageFrame,
  EtherButton,
  BreathingCore,
  StatusPill,
} from "@/components/ether";
import { cn } from "@/lib/utils";

// Each destination belongs to a canonical stat family. Icon + highlight
// colors pull from that family — never a flat "blue = interactive".
type NavTone = "cyan" | "violet" | "magenta" | "gold";

interface NavItem {
  cardId: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: NavTone;
  locked?: boolean;
}

const NAV: NavItem[] = [
  {
    cardId: "mind_map",
    label: "Mind Map",
    description: "The shape your thinking makes.",
    href: "/mind-map",
    icon: Network,
    tone: "magenta",
  },
  {
    cardId: "dashboard",
    label: "Dashboard",
    description: "The weight of what you've built.",
    href: "/dashboard",
    icon: LayoutDashboard,
    tone: "cyan",
  },
  {
    cardId: "halliday_interview",
    label: "Halliday Interview",
    description: "The layers that make you.",
    href: "/halliday",
    icon: Brain,
    tone: "violet",
  },
  {
    cardId: "persona_chat",
    label: "Persona Chat",
    description: "A conversation with yourself.",
    href: "/chat",
    icon: MessageCircle,
    tone: "violet",
  },
  {
    cardId: "quick_memory",
    label: "Quick Memory",
    description: "One thought, before it's gone.",
    href: "/quick",
    icon: Zap,
    tone: "cyan",
  },
  {
    cardId: "daily_reflection",
    label: "Daily Reflection",
    description: "Today, through your own eyes.",
    href: "/reflection",
    icon: Calendar,
    tone: "cyan",
  },
  {
    cardId: "interview_mode",
    label: "Interview Mode",
    description: "The slow work of self-knowledge.",
    href: "/interview",
    icon: Mic,
    tone: "violet",
  },
  {
    cardId: "beneficiaries",
    label: "Beneficiaries",
    description: "Who inherits the mind you've built.",
    href: "/beneficiaries",
    icon: Users,
    tone: "gold",
  },
];

const TONE_COLOR: Record<NavTone, string> = {
  cyan: "var(--ether-cyan)",
  violet: "var(--ether-violet)",
  magenta: "var(--ether-magenta)",
  gold: "var(--ether-gold)",
};

export default function Home() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const recsQuery = trpc.home.recommendations.useQuery(undefined, {
    staleTime: 60_000,
  });
  const interviewStatus = trpc.interviewMode.status.useQuery(undefined, {
    staleTime: 60_000,
  });

  const highlightMap = new Map<string, string>();
  if (recsQuery.data?.recommendations) {
    for (const rec of recsQuery.data.recommendations) {
      highlightMap.set(rec.card, rec.reason);
    }
  }

  const displayName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "you";

  return (
    <EtherPageFrame
      maxWidth="max-w-4xl"
      aliveElement={<BreathingCore size={80} tone="violet" speed={8} />}
      topBar={
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl tracking-tight text-white">
            Ether
          </h1>
          <EtherButton
            variant="ghost"
            onClick={async () => {
              await logout();
              setLocation("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </EtherButton>
        </div>
      }
    >
      {/* Hero greeting — voice-first, no "Welcome back" clinical opener. */}
      <h2 className="font-display text-2xl md:text-3xl tracking-tight text-white mb-12 leading-tight">
        Your mind is waiting,{" "}
        <span className="text-slate-400">{displayName}</span>.
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {NAV.map((item) => {
          const reason = item.locked
            ? null
            : (highlightMap.get(item.cardId) ?? null);

          const description =
            item.cardId === "interview_mode" &&
            interviewStatus.data?.currentLevel
              ? (() => {
                  const cl = interviewStatus.data.levels.find(
                    (l) => l.level === interviewStatus.data!.currentLevel,
                  );
                  return cl
                    ? `Level ${cl.level} — ${cl.answered}/${cl.total}`
                    : item.description;
                })()
              : item.description;

          return (
            <NavCard
              key={item.cardId}
              item={item}
              description={description}
              reason={reason}
              onClick={() => !item.locked && setLocation(item.href)}
            />
          );
        })}
      </div>

      <div className="text-center font-ui text-sm text-slate-500 mt-16">
        The End of Disappearing. Building the lineage of human intelligence.
      </div>
    </EtherPageFrame>
  );
}

function NavCard({
  item,
  description,
  reason,
  onClick,
}: {
  item: NavItem;
  description: string;
  reason: string | null;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const color = TONE_COLOR[item.tone];

  if (item.locked) {
    return (
      <div className="relative rounded-xl border border-white/5 bg-white/[0.02] p-5 opacity-50 cursor-default">
        <div className="absolute top-3 right-3">
          <StatusPill tone="neutral">Coming soon</StatusPill>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <Icon className="h-5 w-5" style={{ color }} />
          <h3 className="font-display text-lg tracking-tight text-white">
            {item.label}
          </h3>
        </div>
        <p className="font-ui text-sm text-slate-500 leading-relaxed">
          {description}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative text-left w-full rounded-xl border p-5 transition-all duration-[180ms] ease-out",
        "bg-white/[0.02] hover:bg-white/[0.04] active:translate-y-px",
        reason
          ? "border-[color-mix(in_srgb,var(--ether-violet)_35%,transparent)] shadow-[0_0_20px_0_rgba(138,124,255,0.15)]"
          : "border-white/5 hover:border-white/10",
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        <Icon
          className="h-5 w-5 transition-[filter] duration-[180ms] group-hover:[filter:drop-shadow(0_0_8px_currentColor)]"
          style={{ color }}
        />
        <h3 className="font-display text-lg tracking-tight text-white">
          {item.label}
        </h3>
      </div>
      <p className="font-ui text-sm text-slate-400 leading-relaxed">
        {description}
      </p>
      {reason && (
        <p
          className="font-ui text-[11px] mt-3 tracking-wide"
          style={{ color: "var(--ether-violet)" }}
        >
          {reason}
        </p>
      )}
    </button>
  );
}
