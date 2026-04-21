import {
  BookOpen,
  Lightbulb,
  Heart,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type EmptyStateTone = "memory" | "insight" | "value" | "neutral";

type ToneConfig = {
  color: string;
  icon: LucideIcon;
  title: string;
  body: string;
};

// Copy defaults are poetic, second-person, and pass the "would this appear
// on a generic SaaS product?" test. Pages can override via props if the
// specific context needs different words.
const TONE_CONFIG: Record<EmptyStateTone, ToneConfig> = {
  memory: {
    color: "var(--ether-cyan)",
    icon: BookOpen,
    title: "Your mind is listening.",
    body: "Capture a thought and the stream begins.",
  },
  insight: {
    color: "var(--ether-violet)",
    icon: Lightbulb,
    title: "No patterns yet — just raw thought.",
    body: "A few more decisions and the geometry shows.",
  },
  value: {
    color: "var(--ether-magenta)",
    icon: Heart,
    title: "Your values haven't surfaced yet.",
    body: "Name one thing you won't compromise on.",
  },
  neutral: {
    color: "rgb(148 163 184)", // slate-400
    icon: Sparkles,
    title: "This space is open.",
    body: "Fill it when the moment finds you.",
  },
};

export type EmptyStateProps = {
  tone?: EmptyStateTone;
  /** Override the default poetic title. */
  title?: string;
  /** Override the default poetic body. */
  body?: string;
  /** Optional CTA — pass an <EtherButton> or link. */
  action?: ReactNode;
  /** Override the default tone icon. */
  icon?: LucideIcon;
  className?: string;
};

export function EmptyState({
  tone = "neutral",
  title,
  body,
  action,
  icon,
  className,
}: EmptyStateProps) {
  const config = TONE_CONFIG[tone];
  const Icon = icon ?? config.icon;
  return (
    <div
      className={`rounded-2xl border border-white/5 bg-white/[0.02] p-10 text-center flex flex-col items-center ${className ?? ""}`}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{
          background: `radial-gradient(circle at 30% 30%, color-mix(in srgb, ${config.color} 35%, transparent), color-mix(in srgb, ${config.color} 5%, transparent))`,
          boxShadow: `0 0 20px color-mix(in srgb, ${config.color} 20%, transparent), inset 0 0 0 1px color-mix(in srgb, ${config.color} 30%, transparent)`,
        }}
      >
        <Icon className="h-5 w-5" style={{ color: config.color }} />
      </div>
      <h3 className="font-display text-lg text-slate-100 mb-2 tracking-tight">
        {title ?? config.title}
      </h3>
      <p className="font-ui text-sm text-slate-500 max-w-sm leading-relaxed">
        {body ?? config.body}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
