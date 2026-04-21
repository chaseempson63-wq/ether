import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useCompanion } from "@/companion";
import {
  Loader2,
  BookOpen,
  Lightbulb,
  Heart,
  ArrowLeft,
  MessageCircle,
  MessageCircleOff,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocation } from "wouter";
import { useMemo } from "react";
import {
  HeroBlock,
  StatCard,
  StreakCard,
  BrainRingsViz,
  MemoryStreamRow,
  AchievementMedal,
  GrowthChart,
  NextStepCTA,
  ETHER_COLOR,
} from "@/components/DashboardParts";

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const companion = useCompanion();
  const { theme, toggleTheme } = useTheme();
  const dashboardQuery = trpc.dashboard.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const data = dashboardQuery.data;

  const displayName = user?.email?.split("@")[0] ?? "you";
  const initials = useMemo(() => {
    if (!displayName) return "?";
    const parts = displayName.split(/[\s_.-]+/).filter(Boolean);
    if (parts.length === 0) return displayName.slice(0, 2).toUpperCase();
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }, [displayName]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--ether-bg0)]">
        <p className="text-slate-400">Please log in to access your Dashboard</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ether-bg0)] text-white relative overflow-hidden">
      {/* Ambient aurora background */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(900px 600px at 10% -10%, color-mix(in srgb, var(--ether-violet) 18%, transparent), transparent 60%), radial-gradient(800px 500px at 100% 10%, color-mix(in srgb, var(--ether-cyan) 12%, transparent), transparent 60%), radial-gradient(700px 400px at 50% 110%, color-mix(in srgb, var(--ether-magenta) 10%, transparent), transparent 60%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-[11px] tracking-[0.18em] text-slate-500 hover:text-white transition-colors uppercase"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </button>
          <div className="flex items-center gap-4">
            <div className="text-[11px] text-slate-500 hidden md:block">
              {data ? `Mind v${data.user.mindVersion}` : "Mind v…"}
            </div>

            {/* Settings cluster — paired theme + companion toggles. The
                glass pill reads as a single "customization" cell on the
                dashboard. */}
            <div className="flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/[0.06] p-1 backdrop-blur-sm">
              <SettingToggle
                on={theme === "day"}
                onToggle={toggleTheme}
                iconOn={<Sun className="h-3.5 w-3.5" />}
                iconOff={<Moon className="h-3.5 w-3.5" />}
                labelOn="Day"
                labelOff="Night"
                tooltip={theme === "day" ? "Switch to night" : "Switch to day"}
              />
              <span
                aria-hidden="true"
                className="w-px h-4 bg-white/10 mx-0.5"
              />
              <SettingToggle
                on={companion.enabled}
                onToggle={() => companion.setEnabled(!companion.enabled)}
                iconOn={<MessageCircle className="h-3.5 w-3.5" />}
                iconOff={<MessageCircleOff className="h-3.5 w-3.5" />}
                labelOn="On"
                labelOff="Off"
                tooltip={
                  companion.enabled
                    ? "Turn companion off"
                    : "Turn companion on"
                }
              />
            </div>

            <div
              data-keep-white
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--ether-cyan), var(--ether-violet))",
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.08), 0 0 12px color-mix(in srgb, var(--ether-violet) 40%, transparent)",
              }}
            >
              {initials}
            </div>
          </div>
        </div>

        {dashboardQuery.isLoading || !data ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-6 w-6 text-slate-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* Hero */}
            <HeroBlock
              eyebrow={data.copy.heroEyebrow}
              headline={data.copy.heroHeadline}
              body={data.copy.heroBody}
            />

            {/* Brain viz + stats grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-12">
              <div className="lg:col-span-3 rounded-2xl border border-white/5 bg-white/[0.02] p-6 flex items-center justify-center min-h-[440px]">
                <BrainRingsViz
                  nodes={data.brain.nodes}
                  connections={data.brain.connections}
                  coherence={data.brain.coherence}
                  memoriesCount={data.brain.memoriesCount}
                  insightsCount={data.brain.insightsCount}
                  valuesCount={data.brain.valuesCount}
                />
              </div>
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-6">
                <StatCard
                  label="Memories"
                  count={data.stats.memories.count}
                  deltaWeek={data.stats.memories.deltaWeek}
                  spark={data.stats.memories.spark}
                  color={ETHER_COLOR.cyan}
                  icon={BookOpen}
                />
                <StatCard
                  label="Insights"
                  count={data.stats.decisions.count}
                  deltaWeek={data.stats.decisions.deltaWeek}
                  spark={data.stats.decisions.spark}
                  color={ETHER_COLOR.violet}
                  icon={Lightbulb}
                />
                <StatCard
                  label="Values"
                  count={data.stats.values.count}
                  deltaWeek={data.stats.values.deltaWeek}
                  spark={data.stats.values.spark}
                  color={ETHER_COLOR.magenta}
                  icon={Heart}
                />
                <StreakCard
                  days={data.stats.streak.days}
                  week={data.stats.streak.week}
                />
              </div>
            </div>

            {/* Memory stream */}
            <section className="mb-12">
              <div className="flex items-end justify-between mb-5">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-1 font-[Space_Grotesk,system-ui,sans-serif]">
                    Memory stream
                  </h2>
                  <p className="text-sm text-slate-500">
                    Your captured thoughts, weaving themselves into pattern
                  </p>
                </div>
                <button
                  onClick={() => setLocation("/quick")}
                  className="text-[11px] tracking-[0.18em] text-slate-500 hover:text-white uppercase"
                >
                  + Capture
                </button>
              </div>
              {data.memoryStream.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-10 text-center text-slate-500 text-sm">
                  No memories yet. Tap "Capture" to start.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.memoryStream.map((m) => (
                    <MemoryStreamRow
                      key={m.id}
                      type={m.type}
                      text={m.text}
                      tag={m.tag}
                      meta={m.meta}
                      rarity={m.rarity}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Achievements */}
            <section className="mb-12">
              <div className="flex items-end justify-between mb-5">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-1 font-[Space_Grotesk,system-ui,sans-serif]">
                    Achievements
                  </h2>
                  <p className="text-sm text-slate-500">
                    Badges your mind has earned along the way
                  </p>
                </div>
                <div className="text-[11px] tracking-[0.18em] text-slate-500 uppercase tabular-nums">
                  {data.achievements.earned} / {data.achievements.total}
                </div>
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
                  {data.achievements.items.map((a) => (
                    <AchievementMedal
                      key={a.id}
                      name={a.name}
                      sub={a.sub}
                      color={a.color}
                      icon={a.icon}
                      isNew={a.isNew}
                      locked={a.locked}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* Growth */}
            <section className="mb-12">
              <div className="flex items-end justify-between mb-5">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-1 font-[Space_Grotesk,system-ui,sans-serif]">
                    Growth of your mind
                  </h2>
                  <p className="text-sm text-slate-500">
                    Memories · Insights · Values, traced over time
                  </p>
                </div>
                <div className="text-[11px] tracking-[0.18em] text-slate-500 uppercase">
                  {data.growth.range}
                </div>
              </div>
              <GrowthChart series={data.growth.series} xAxis={data.growth.xAxis} />
            </section>

            {/* Next step */}
            <section className="mb-4">
              <NextStepCTA
                eyebrow={data.quest.eyebrow}
                title={data.quest.title}
                subtitle={data.quest.subtitle}
                cta={data.quest.cta}
                onClick={() => setLocation("/interview")}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SettingToggle({
  on,
  onToggle,
  iconOn,
  iconOff,
  labelOn,
  labelOff,
  tooltip,
}: {
  on: boolean;
  onToggle: () => void;
  iconOn: React.ReactNode;
  iconOff: React.ReactNode;
  labelOn: string;
  labelOff: string;
  tooltip: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={tooltip}
      {...(on ? { "data-keep-white": "" } : {})}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all duration-[180ms] text-[11px] font-medium tracking-wide ${
        on
          ? "bg-ether-violet text-white shadow-[0_0_12px_0_rgba(138,124,255,0.35)]"
          : "text-slate-400 hover:text-white"
      }`}
    >
      {on ? iconOn : iconOff}
      <span>{on ? labelOn : labelOff}</span>
    </button>
  );
}
