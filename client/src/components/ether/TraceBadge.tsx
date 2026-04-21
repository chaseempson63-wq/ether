import { useEffect, useState, type ReactNode } from "react";

export type TraceBadgeTone = "violet" | "gold";

export type TraceBadgeProps = {
  /** Violet = trace/progress, gold = layer/level completion. */
  tone?: TraceBadgeTone;
  children: ReactNode;
  /** Full lifecycle duration in ms before the component unmounts itself. */
  duration?: number;
  /** Called after the unmount so parents can reset their trigger state. */
  onDone?: () => void;
};

// Presentational float layer. Always absolute, pointer-events disabled —
// the parent must be position:relative for it to anchor correctly.
// Self-unmounts after `duration` so stale badges don't accumulate.
export function TraceBadge({
  tone = "violet",
  children,
  duration = 1600,
  onDone,
}: TraceBadgeProps) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => window.clearTimeout(t);
  }, [duration, onDone]);

  if (!visible) return null;

  const color =
    tone === "gold" ? "var(--ether-gold)" : "var(--ether-violet)";

  return (
    <span
      aria-hidden="true"
      className="absolute left-0 right-0 flex justify-center pointer-events-none z-20"
      style={{ top: 0 }}
    >
      <span
        className="font-ui font-semibold text-sm whitespace-nowrap"
        style={{
          color,
          textShadow: `0 0 12px color-mix(in srgb, ${color} 60%, transparent)`,
          animation: `traceFloat ${duration}ms ease-out forwards`,
        }}
      >
        {children}
      </span>
    </span>
  );
}
