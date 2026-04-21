import { useState, type ReactNode } from "react";
import {
  EtherPageFrame,
  EtherButton,
  BreathingCore,
  BreathingDot,
  EmptyState,
  StatusPill,
  TraceBadge,
  type EtherButtonVariant,
  type BreathingCoreTone,
  type EmptyStateTone,
  type StatusPillTone,
  type TraceBadgeTone,
} from "@/components/ether";

// Dev-only route rendering every Ether primitive in every variant.
// Not linked from navigation — visit /dev/primitives directly.
// This is the review surface before Phase 3 page alignment.
export default function DevPrimitives() {
  return (
    <EtherPageFrame
      topBar={
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl tracking-tight text-slate-100">
              Ether primitives
            </h1>
            <p className="font-ui text-xs text-slate-500 mt-1">
              Phase 2 review surface · not linked from nav
            </p>
          </div>
          <BreathingCore size={32} tone="violet" />
        </div>
      }
      aliveElement={<BreathingCore size={64} tone="cyan" speed={5} />}
    >
      <Section title="EtherButton" sub="primary / ghost / destructive / earned">
        <ButtonGrid />
      </Section>

      <Section title="BreathingCore" sub="Four tones, canonical alive element">
        <div className="flex items-end gap-8 flex-wrap">
          {(["violet", "cyan", "magenta", "gold"] as BreathingCoreTone[]).map(
            (tone) => (
              <div key={tone} className="flex flex-col items-center gap-3">
                <BreathingCore size={72} tone={tone} />
                <span className="font-ui text-xs text-slate-500 uppercase tracking-wider">
                  {tone}
                </span>
              </div>
            ),
          )}
          <div className="flex flex-col items-center gap-3">
            <BreathingCore size={40} tone="violet" speed={2} />
            <span className="font-ui text-xs text-slate-500 uppercase tracking-wider">
              2s speed
            </span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <BreathingCore size={40} tone="violet" speed={8} />
            <span className="font-ui text-xs text-slate-500 uppercase tracking-wider">
              8s speed
            </span>
          </div>
        </div>
      </Section>

      <Section
        title="BreathingDot"
        sub="Default slate-500 + color overrides used by EtherButton loading"
      >
        <div className="flex items-center gap-8 flex-wrap">
          <LabeledCell label="default slate">
            <BreathingDot />
          </LabeledCell>
          <LabeledCell label="white (over violet fill)">
            <div className="bg-ether-violet rounded-lg px-4 py-3">
              <BreathingDot color="white" />
            </div>
          </LabeledCell>
          <LabeledCell label="gold tone">
            <BreathingDot color="var(--ether-gold)" />
          </LabeledCell>
          <LabeledCell label="larger (size=10)">
            <BreathingDot size={10} />
          </LabeledCell>
        </div>
      </Section>

      <Section title="EmptyState" sub="Four tones with default poetic copy">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(["memory", "insight", "value", "neutral"] as EmptyStateTone[]).map(
            (tone) => (
              <EmptyState key={tone} tone={tone} />
            ),
          )}
        </div>
        <div className="mt-4">
          <EmptyState
            tone="memory"
            title="Override example"
            body="Pages can pass their own copy, icon, and action via props."
            action={<EtherButton variant="primary">Primary action</EtherButton>}
          />
        </div>
      </Section>

      <Section
        title="StatusPill"
        sub="Retires traffic-light statuses across the app"
      >
        <div className="flex items-center gap-3 flex-wrap">
          {(
            ["memory", "insight", "value", "earned", "neutral"] as StatusPillTone[]
          ).map((tone) => (
            <StatusPill key={tone} tone={tone}>
              {tone}
            </StatusPill>
          ))}
          <StatusPill tone="earned" uppercase={false}>
            earned · not uppercase
          </StatusPill>
        </div>
      </Section>

      <Section
        title="TraceBadge"
        sub="Tap the buttons to fire the float animation"
      >
        <TraceBadgeDemo />
      </Section>

      <Section
        title="EtherPageFrame"
        sub="This entire page is wrapped in it. Aurora, max-width, topBar, and aliveElement (top-right cyan core) all visible on this route."
      >
        <div className="font-ui text-sm text-slate-400">
          See the aurora gradient in the corners and the cyan BreathingCore
          pinned to the top-right of the viewport.
        </div>
      </Section>
    </EtherPageFrame>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-12">
      <div className="mb-5">
        <h2 className="font-display text-lg tracking-tight text-slate-100">
          {title}
        </h2>
        {sub && <p className="font-ui text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
        {children}
      </div>
    </section>
  );
}

function LabeledCell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      {children}
      <span className="font-ui text-xs text-slate-500 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

function ButtonGrid() {
  const variants: EtherButtonVariant[] = [
    "primary",
    "ghost",
    "destructive",
    "earned",
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
      {variants.map((variant) => (
        <div key={variant} className="flex flex-col items-start gap-3">
          <span className="font-ui text-xs text-slate-500 uppercase tracking-wider">
            {variant}
          </span>
          <EtherButton variant={variant}>Normal</EtherButton>
          <EtherButton variant={variant} disabled>
            Disabled
          </EtherButton>
          <EtherButton variant={variant} loading>
            Saving…
          </EtherButton>
        </div>
      ))}
    </div>
  );
}

function TraceBadgeDemo() {
  const [violetKey, setVioletKey] = useState<number | null>(null);
  const [goldKey, setGoldKey] = useState<number | null>(null);
  const tones: { tone: TraceBadgeTone; label: string; state: number | null; fire: () => void }[] =
    [
      {
        tone: "violet",
        label: "+1 trace",
        state: violetKey,
        fire: () => setVioletKey(Date.now()),
      },
      {
        tone: "gold",
        label: "v1.0 → v1.1",
        state: goldKey,
        fire: () => setGoldKey(Date.now()),
      },
    ];
  return (
    <div className="flex gap-6 flex-wrap">
      {tones.map(({ tone, label, state, fire }) => (
        <div
          key={tone}
          className="relative flex items-center justify-center w-56 h-24 rounded-lg border border-white/5 bg-white/[0.02]"
        >
          <EtherButton variant={tone === "gold" ? "earned" : "primary"} onClick={fire}>
            Fire {tone}
          </EtherButton>
          {state !== null && (
            <TraceBadge
              key={state}
              tone={tone}
              onDone={() => {
                if (tone === "violet") setVioletKey(null);
                else setGoldKey(null);
              }}
            >
              {label}
            </TraceBadge>
          )}
        </div>
      ))}
    </div>
  );
}
