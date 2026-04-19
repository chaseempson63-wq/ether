import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompanion } from "@/companion";
import { VoiceInput } from "@/components/VoiceInput";
import {
  ArrowLeft,
  Loader2,
  Lock,
  CheckCircle2,
  ChevronRight,
  Send,
  Sparkles,
} from "lucide-react";

// ─── Constants ───

const LAYER_COLORS: Record<string, string> = {
  voice_and_language: "#8b5cf6",
  memory_and_life_events: "#3b82f6",
  reasoning_and_decisions: "#10b981",
  values_and_beliefs: "#f59e0b",
  emotional_patterns: "#ef4444",
};

const LAYER_LABELS: Record<string, string> = {
  voice_and_language: "VOICE",
  memory_and_life_events: "MEMORY",
  reasoning_and_decisions: "REASONING",
  values_and_beliefs: "VALUES",
  emotional_patterns: "EMOTIONAL",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  locked: { bg: "rgba(255,255,255,0.03)", text: "#475569", label: "LOCKED" },
  in_progress: { bg: "rgba(59,130,246,0.08)", text: "#3b82f6", label: "IN PROGRESS" },
  completed: { bg: "rgba(16,185,129,0.08)", text: "#10b981", label: "COMPLETED" },
};

// ─── Component ───

export default function InterviewMode() {
  const [, setLocation] = useLocation();
  const { notifyMutation } = useCompanion();

  const [activeLevel, setActiveLevel] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [celebrating, setCelebrating] = useState(false);

  const statusQuery = trpc.interviewMode.status.useQuery(undefined, {
    staleTime: 10_000,
  });

  const questionsQuery = trpc.interviewMode.getQuestions.useQuery(
    { level: activeLevel! },
    { enabled: activeLevel != null, staleTime: 10_000 }
  );

  const answerMutation = trpc.interviewMode.answer.useMutation({
    onSuccess: (data) => {
      setAnswerText("");
      notifyMutation("interviewMode.answer");

      if (data.levelComplete) {
        notifyMutation("interviewMode.levelComplete");
        setCelebrating(true);
        setTimeout(() => {
          setCelebrating(false);
          setActiveLevel(null);
          statusQuery.refetch();
        }, 2500);
        return;
      }

      // Advance to next unanswered question
      const questions = questionsQuery.data?.questions ?? [];
      const nextUnanswered = questions.findIndex(
        (q, i) => i > currentIndex && q.answer == null
      );
      if (nextUnanswered !== -1) {
        setCurrentIndex(nextUnanswered);
      } else {
        // Check from beginning
        const fromStart = questions.findIndex((q) => q.answer == null);
        if (fromStart !== -1) setCurrentIndex(fromStart);
      }
      questionsQuery.refetch();
    },
  });

  // Reset index when level changes
  useEffect(() => {
    setCurrentIndex(0);
    setAnswerText("");
  }, [activeLevel]);

  // Auto-advance to first unanswered on questions load
  useEffect(() => {
    if (!questionsQuery.data) return;
    const qs = questionsQuery.data.questions;
    const firstUnanswered = qs.findIndex((q) => q.answer == null);
    if (firstUnanswered !== -1) setCurrentIndex(firstUnanswered);
  }, [questionsQuery.data]);

  const handleSubmit = async () => {
    const questions = questionsQuery.data?.questions ?? [];
    const q = questions[currentIndex];
    if (!q || !answerText.trim()) return;

    await answerMutation.mutateAsync({
      questionId: q.id,
      answer: answerText.trim(),
    });
  };

  // ─── Loading ───
  if (statusQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#080b14] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  const levels = statusQuery.data?.levels ?? [];

  // ─── Celebration overlay ───
  if (celebrating) {
    return (
      <div className="min-h-screen bg-[#080b14] flex items-center justify-center font-sora">
        <div className="text-center animate-float-in">
          <Sparkles className="h-16 w-16 text-blue-400 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-2">
            Level {activeLevel} Complete
          </h2>
          <p className="text-slate-400 text-sm">
            {activeLevel! < 3 ? "Unlocking the next level..." : "All levels complete. Your digital mind is deep."}
          </p>
        </div>
      </div>
    );
  }

  // ─── Question view ───
  if (activeLevel != null) {
    const questions = questionsQuery.data?.questions ?? [];
    const isReview = questionsQuery.data?.status === "completed";
    const q = questions[currentIndex];
    const answered = questions.filter((q) => q.answer != null).length;

    if (questionsQuery.isLoading) {
      return (
        <div className="min-h-screen bg-[#080b14] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#080b14] text-white flex flex-col font-sora">
        {/* Header */}
        <header
          className="flex items-center justify-between px-5 py-2.5 z-20 border-b border-white/[0.04]"
          style={{ background: "rgba(8,11,20,0.9)", backdropFilter: "blur(12px)" }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveLevel(null)}
              className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 tracking-wide uppercase transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
            <div className="w-px h-4 bg-white/[0.06]" />
            <span className="text-[13px] font-medium text-white">
              Level {activeLevel} — {levels.find((l) => l.level === activeLevel)?.title}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums">
            {answered} / {questions.length}
          </span>
        </header>

        {/* Question */}
        <div className="flex-1 flex items-center justify-center px-6">
          {q ? (
            <div className="w-full max-w-2xl">
              {/* Progress dots */}
              <div className="flex gap-1 mb-8 justify-center flex-wrap">
                {questions.map((qItem, i) => (
                  <button
                    key={qItem.id}
                    onClick={() => { setCurrentIndex(i); setAnswerText(""); }}
                    className="w-2 h-2 rounded-full transition-all"
                    style={{
                      backgroundColor:
                        i === currentIndex
                          ? "#3b82f6"
                          : qItem.answer != null
                            ? "#10b981"
                            : "rgba(255,255,255,0.1)",
                    }}
                  />
                ))}
              </div>

              {/* Layer badge */}
              <span
                className="text-[10px] uppercase tracking-[0.08em] font-medium block mb-3"
                style={{ color: LAYER_COLORS[q.layer] ?? "#64748b" }}
              >
                {LAYER_LABELS[q.layer] ?? q.layer}
              </span>

              {/* Question text */}
              <h2 className="text-[22px] font-medium text-[#e2e8f0] leading-snug mb-8">
                {q.question}
              </h2>

              {isReview ? (
                <div
                  className="rounded-lg p-4 text-[13px] text-slate-300 leading-relaxed"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {q.answer ?? "No answer recorded"}
                </div>
              ) : q.answer != null ? (
                <div
                  className="rounded-lg p-4 text-[13px] text-slate-400 leading-relaxed"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-slate-500 text-[10px] uppercase tracking-[0.08em] mb-2">Your answer</p>
                  {q.answer}
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <textarea
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="Type or speak your answer..."
                      rows={5}
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3 pr-12 text-[13px] text-white placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-500/30 transition-colors"
                      autoFocus
                    />
                    <VoiceInput
                      className="absolute bottom-2 right-2"
                      disabled={answerMutation.isPending}
                      onTranscript={(text) =>
                        setAnswerText((prev) => (prev ? prev + " " + text : text))
                      }
                    />
                  </div>
                  <div className="flex justify-end mt-4">
                    <button
                      onClick={handleSubmit}
                      disabled={!answerText.trim() || answerMutation.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-[12px] font-semibold text-white rounded-md transition-colors"
                    >
                      {answerMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Submit
                    </button>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between mt-8">
                <button
                  onClick={() => { setCurrentIndex(Math.max(0, currentIndex - 1)); setAnswerText(""); }}
                  disabled={currentIndex === 0}
                  className="text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-30 uppercase tracking-wide transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => { setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1)); setAnswerText(""); }}
                  disabled={currentIndex === questions.length - 1}
                  className="text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-30 uppercase tracking-wide transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No questions available.</p>
          )}
        </div>
      </div>
    );
  }

  // ─── Level progression view (default) ───
  return (
    <div className="min-h-screen bg-[#080b14] text-white font-sora p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-6 mb-10">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 tracking-wide uppercase transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Home
          </button>
          <div className="w-px h-4 bg-white/[0.06]" />
          <span className="text-[13px] font-medium text-white">Interview Mode</span>
        </div>

        <h1 className="text-[28px] font-bold text-white mb-2">Build Your Identity</h1>
        <p className="text-slate-500 text-[13px] mb-10">
          Three levels of progressively deeper questions. Each level unlocks after the previous one is complete.
        </p>

        {/* Level cards */}
        <div className="space-y-4">
          {levels.map((level) => {
            const style = STATUS_STYLES[level.status] ?? STATUS_STYLES.locked;
            const isLocked = level.status === "locked";
            const isComplete = level.status === "completed";
            const isActive = level.status === "in_progress";
            const progress = level.total > 0 ? level.answered / level.total : 0;

            return (
              <button
                key={level.level}
                onClick={() => {
                  if (!isLocked) setActiveLevel(level.level);
                }}
                disabled={isLocked}
                className={`w-full text-left rounded-lg p-5 transition-all ${
                  isLocked ? "opacity-40 cursor-default" : "cursor-pointer hover:bg-white/[0.04]"
                }`}
                style={{
                  background: style.bg,
                  border: isActive
                    ? "1px solid rgba(59,130,246,0.3)"
                    : isComplete
                      ? "1px solid rgba(16,185,129,0.2)"
                      : "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {isLocked && <Lock className="h-4 w-4 text-slate-600" />}
                    {isComplete && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {isActive && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1" />}
                    <div>
                      <h3 className="text-[15px] font-medium text-white">
                        Level {level.level} — {level.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {level.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="text-[9px] uppercase tracking-[0.1em] font-medium px-2 py-0.5 rounded"
                      style={{ color: style.text, background: "rgba(255,255,255,0.03)" }}
                    >
                      {style.label}
                    </span>
                    {!isLocked && <ChevronRight className="h-4 w-4 text-slate-600" />}
                  </div>
                </div>

                {/* Progress bar */}
                {!isLocked && level.total > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-slate-600 mb-1">
                      <span>{level.answered} / {level.total} answered</span>
                      <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                    </div>
                    <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round(progress * 100)}%`,
                          backgroundColor: isComplete ? "#10b981" : "#3b82f6",
                        }}
                      />
                    </div>
                  </div>
                )}

                {isLocked && (
                  <p className="text-[10px] text-slate-600 mt-2">
                    Complete Level {level.level - 1} to unlock
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
