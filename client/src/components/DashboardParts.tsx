import {
  Sun,
  Sparkles,
  Headphones,
  Network,
  Shield,
  Orbit,
  Moon,
  Mic,
  Lock,
  type LucideIcon,
} from "lucide-react";

// ─── Palette helpers ─────────────────────────────────────────────────────────

export const ETHER_COLOR: Record<string, string> = {
  gold: "var(--ether-gold)",
  cyan: "var(--ether-cyan)",
  violet: "var(--ether-violet)",
  magenta: "var(--ether-magenta)",
  mint: "var(--ether-mint)",
};

const ICON_MAP: Record<string, LucideIcon> = {
  sun: Sun,
  sparkles: Sparkles,
  headphones: Headphones,
  network: Network,
  shield: Shield,
  orbit: Orbit,
  moon: Moon,
  mic: Mic,
};

// ─── Hero ────────────────────────────────────────────────────────────────────

export function HeroBlock({
  eyebrow,
  headline,
  body,
}: {
  eyebrow: string;
  headline: string;
  body: string;
}) {
  return (
    <div className="mb-10">
      <div className="text-[11px] tracking-[0.22em] text-slate-500 uppercase mb-3">
        {eyebrow}
      </div>
      <h1 className="text-4xl md:text-5xl font-semibold text-white leading-tight mb-4 font-[Space_Grotesk,system-ui,sans-serif]">
        {headline}
      </h1>
      <p className="text-slate-300 text-base md:text-lg max-w-2xl leading-relaxed">
        {body}
      </p>
    </div>
  );
}

// ─── Sparkline (inline SVG, no lib) ──────────────────────────────────────────

export function Sparkline({
  values,
  color,
  height = 28,
  width = 80,
}: {
  values: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (values.length === 0) {
    return <div style={{ width, height }} />;
  }
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

export function StatCard({
  label,
  count,
  deltaWeek,
  spark,
  color,
  icon: Icon,
}: {
  label: string;
  count: number;
  deltaWeek: number;
  spark: number[];
  color: string;
  icon: LucideIcon;
}) {
  const deltaLabel =
    deltaWeek > 0 ? `+${deltaWeek} this week` : deltaWeek < 0 ? `${deltaWeek} this week` : "steady this week";
  return (
    <div
      className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-5 overflow-hidden"
      style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.03)` }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at 0% 0%, ${color}, transparent 60%)`,
        }}
      />
      <div className="relative flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color }} />
          <div className="text-[11px] tracking-[0.18em] text-slate-400 uppercase">
            {label}
          </div>
        </div>
        <Sparkline values={spark} color={color} />
      </div>
      <div className="relative flex items-end justify-between">
        <div className="text-4xl font-semibold text-white tabular-nums">{count}</div>
        <div className="text-[11px] text-slate-500">{deltaLabel}</div>
      </div>
    </div>
  );
}

// ─── Streak card ─────────────────────────────────────────────────────────────

export function StreakCard({
  days,
  week,
}: {
  days: number;
  week: { label: string; active: boolean; today?: boolean }[];
}) {
  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-5 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at 100% 0%, var(--ether-gold), transparent 60%)`,
        }}
      />
      <div className="relative flex items-start justify-between mb-4">
        <div className="text-[11px] tracking-[0.18em] text-slate-400 uppercase">
          Streak
        </div>
      </div>
      <div className="relative flex items-end justify-between mb-3">
        <div className="text-4xl font-semibold text-white tabular-nums">{days}</div>
        <div className="text-[11px] text-slate-500">{days === 1 ? "day" : "days"} in a row</div>
      </div>
      <div className="relative flex gap-1.5">
        {week.map((d, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1"
            title={d.label}
          >
            <div
              className={`w-full aspect-square rounded-full transition-colors ${d.today ? "ring-2 ring-[var(--ether-gold)]/60 ring-offset-0" : ""}`}
              style={{
                background: d.active
                  ? "var(--ether-gold)"
                  : "rgba(255,255,255,0.05)",
              }}
            />
            <div className="text-[10px] text-slate-500">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Brain rings viz (SVG, pure CSS rotation) ────────────────────────────────

export function BrainRingsViz({
  nodes,
  connections,
  coherence,
  rings,
}: {
  nodes: number;
  connections: number;
  coherence: number;
  rings: { count: number; radius: number; color: string; size: number }[];
}) {
  const max = Math.max(...rings.map((r) => r.radius)) + 20;
  const size = max * 2;
  return (
    <div className="relative w-full aspect-square max-w-[440px] mx-auto">
      <svg
        viewBox={`${-max} ${-max} ${size} ${size}`}
        width="100%"
        height="100%"
        className="overflow-visible"
      >
        {/* Faint guide rings */}
        {rings.map((ring, i) => (
          <circle
            key={`g${i}`}
            cx="0"
            cy="0"
            r={ring.radius}
            fill="none"
            stroke={ring.color}
            strokeOpacity="0.08"
            strokeWidth="1"
          />
        ))}
        {/* Orbiting nodes — animated via CSS on wrapping <g> */}
        {rings.map((ring, ri) => (
          <g
            key={`r${ri}`}
            style={{
              transformOrigin: "0 0",
              animation: `etherSpin ${60 + ri * 25}s linear ${ri % 2 === 0 ? "" : "reverse"} infinite`,
            }}
          >
            {Array.from({ length: ring.count }).map((_, i) => {
              const angle = (i / ring.count) * Math.PI * 2;
              const x = Math.cos(angle) * ring.radius;
              const y = Math.sin(angle) * ring.radius;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={ring.size}
                  fill={ring.color}
                  opacity="0.85"
                  style={{
                    filter: `drop-shadow(0 0 6px ${ring.color})`,
                  }}
                />
              );
            })}
          </g>
        ))}
        {/* Core */}
        <circle
          cx="0"
          cy="0"
          r="18"
          fill="white"
          opacity="0.9"
          style={{ filter: "drop-shadow(0 0 20px rgba(255,255,255,0.6))" }}
        />
      </svg>

      {/* Center readouts */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-[10px] tracking-[0.22em] text-slate-500 uppercase mb-1">
          Coherence
        </div>
        <div className="text-2xl font-semibold text-white tabular-nums">
          {(coherence * 100).toFixed(0)}
          <span className="text-slate-500 text-sm ml-0.5">%</span>
        </div>
      </div>

      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-6 text-[11px] text-slate-500">
        <div>
          <span className="text-white tabular-nums">{nodes}</span> nodes
        </div>
        <div>
          <span className="text-white tabular-nums">{connections}</span> connections
        </div>
      </div>
    </div>
  );
}

// ─── Memory stream row ───────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  voice: "var(--ether-cyan)",
  interview: "var(--ether-violet)",
  reflection: "var(--ether-magenta)",
  insight: "var(--ether-gold)",
};

const RARITY_SHADOW: Record<string, string> = {
  common: "",
  rare: "shadow-[0_0_0_1px_rgba(138,124,255,0.2)]",
  epic: "shadow-[0_0_0_1px_rgba(255,210,122,0.35),0_0_24px_rgba(255,210,122,0.1)]",
};

export function MemoryStreamRow({
  type,
  text,
  tag,
  meta,
  rarity,
}: {
  type: "voice" | "interview" | "reflection" | "insight";
  text: string;
  tag: string;
  meta: string;
  rarity: "common" | "rare" | "epic";
}) {
  const color = TYPE_COLOR[type] ?? "var(--ether-ink0)";
  return (
    <div
      className={`relative rounded-xl bg-white/[0.02] border border-white/5 p-4 ${RARITY_SHADOW[rarity]}`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] tracking-[0.18em] font-medium uppercase px-2 py-0.5 rounded"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
          }}
        >
          {tag}
        </span>
        <span className="text-[10px] text-slate-500">{meta}</span>
      </div>
      <p className="text-sm text-slate-200 leading-relaxed line-clamp-3">
        {text}
      </p>
    </div>
  );
}

// ─── Achievement medal ───────────────────────────────────────────────────────

export function AchievementMedal({
  name,
  sub,
  color,
  icon,
  isNew,
  locked,
}: {
  name: string;
  sub: string;
  color: string;
  icon: string;
  isNew: boolean;
  locked: boolean;
}) {
  const Icon = locked ? Lock : (ICON_MAP[icon] ?? Sparkles);
  const hex = ETHER_COLOR[color] ?? "var(--ether-gold)";
  return (
    <div className="relative flex flex-col items-center text-center group">
      {isNew && (
        <span className="absolute -top-1 -right-1 z-10 text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[var(--ether-gold)] text-slate-950">
          New
        </span>
      )}
      <div
        className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-transform ${locked ? "opacity-30 grayscale" : "group-hover:scale-105"}`}
        style={{
          background: locked
            ? "rgba(255,255,255,0.04)"
            : `radial-gradient(circle at 30% 30%, color-mix(in srgb, ${hex} 40%, transparent), color-mix(in srgb, ${hex} 5%, transparent))`,
          boxShadow: locked
            ? "inset 0 0 0 1px rgba(255,255,255,0.05)"
            : `0 0 20px color-mix(in srgb, ${hex} 25%, transparent), inset 0 0 0 1px color-mix(in srgb, ${hex} 30%, transparent)`,
        }}
      >
        <Icon
          className="h-6 w-6"
          style={{ color: locked ? "rgba(255,255,255,0.3)" : hex }}
        />
      </div>
      <div className="mt-3 text-[11px] font-medium text-white leading-tight">
        {name}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

// ─── Growth chart ────────────────────────────────────────────────────────────

export function GrowthChart({
  series,
  xAxis,
}: {
  series: { key: string; color: string; values: number[] }[];
  xAxis: string[];
}) {
  const height = 180;
  const width = 600;
  const padY = 20;
  const padX = 12;
  const allMax = Math.max(1, ...series.flatMap((s) => s.values));
  const lineFor = (values: number[]) => {
    if (values.length === 0) return "";
    const step =
      values.length > 1 ? (width - padX * 2) / (values.length - 1) : 0;
    return values
      .map((v, i) => {
        const x = padX + i * step;
        const y = height - padY - (v / allMax) * (height - padY * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };
  return (
    <div className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-5 overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        className="block"
        preserveAspectRatio="none"
      >
        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={width - padX}
            y1={padY + (height - padY * 2) * t}
            y2={padY + (height - padY * 2) * t}
            stroke="rgba(255,255,255,0.04)"
            strokeDasharray="2 4"
          />
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <path
              d={lineFor(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 6px ${s.color})` }}
            />
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between mt-3 text-[10px] text-slate-500 tabular-nums">
        {xAxis.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }}
            />
            <span className="text-[11px] text-slate-400 capitalize">
              {s.key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Next-step CTA ───────────────────────────────────────────────────────────

export function NextStepCTA({
  eyebrow,
  title,
  subtitle,
  cta,
  onClick,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10 p-6 md:p-8">
      <div
        aria-hidden
        className="absolute inset-0 opacity-90 pointer-events-none"
        style={{
          background:
            "radial-gradient(1100px 500px at 0% 0%, color-mix(in srgb, var(--ether-violet) 28%, transparent), transparent 60%), radial-gradient(800px 400px at 100% 100%, color-mix(in srgb, var(--ether-cyan) 18%, transparent), transparent 60%), #0B1020",
        }}
      />
      <div className="relative">
        <div className="text-[11px] tracking-[0.22em] text-[var(--ether-cyan)] uppercase mb-3">
          {eyebrow}
        </div>
        <h3 className="text-2xl md:text-3xl font-semibold text-white mb-2 font-[Space_Grotesk,system-ui,sans-serif] leading-tight">
          {title}
        </h3>
        <p className="text-slate-300 max-w-2xl mb-6">{subtitle}</p>
        <button
          onClick={onClick}
          className="inline-flex items-center gap-2 rounded-full bg-white text-slate-950 px-5 py-2.5 text-sm font-semibold hover:bg-slate-100 transition-colors"
        >
          {cta}
          <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
