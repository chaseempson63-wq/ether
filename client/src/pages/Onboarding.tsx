import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowRight, Sparkles, Brain } from "lucide-react";

// ─── Step definitions ───

const STEPS = [
  { id: 1, question: "What should I call you?", placeholder: "Your name", type: "input" as const },
  { id: 2, question: "Where do you call home?", placeholder: "City, country, or wherever feels like home", type: "input" as const },
  { id: 3, question: "What do you do?", placeholder: "Your work, craft, or calling", type: "input" as const },
  { id: 4, question: "Who matters most to you?", placeholder: "The people who shaped you — names, relationships, why they matter…", type: "textarea" as const },
  { id: 5, question: "What's one thing you believe deeply?", placeholder: "A principle you live by, something you'd defend…", type: "textarea" as const },
  { id: 6, question: "Tell me something nobody else knows.", placeholder: "A memory, a secret, something you've never said out loud…", type: "textarea" as const },
  { id: 7, question: "How should I sound when I speak as you?", placeholder: "", type: "voice" as const },
] as const;

const VOICE_STYLES = [
  { value: "casual", label: "Casual", desc: "Relaxed and conversational, like talking to a friend" },
  { value: "formal", label: "Formal", desc: "Polished and precise, measured words" },
  { value: "warm", label: "Warm", desc: "Empathetic and caring, emotionally present" },
  { value: "direct", label: "Direct", desc: "Straight to the point, no filler" },
  { value: "playful", label: "Playful", desc: "Witty and light, a bit of humor" },
  { value: "storyteller", label: "Storyteller", desc: "Rich in detail, loves painting a picture" },
];

// ─── Phase types ───

type Phase = "intent" | "steps" | "companion" | "done";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<Phase>("intent");
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(7).fill(""));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fadeIn, setFadeIn] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submitStep = trpc.onboarding.submitStep.useMutation();
  const completeOnboarding = trpc.onboarding.complete.useMutation();

  // Focus the input when step changes
  useEffect(() => {
    if (phase !== "steps") return;
    const timer = setTimeout(() => {
      if (STEPS[currentStep]?.type === "input") inputRef.current?.focus();
      else if (STEPS[currentStep]?.type === "textarea") textareaRef.current?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, [currentStep, phase]);

  // Transition helper
  const transition = useCallback((fn: () => void) => {
    setFadeIn(false);
    setTimeout(() => {
      fn();
      setFadeIn(true);
    }, 300);
  }, []);

  // ─── Handlers ───

  const handleIntentChoice = (choice: "build" | "capture") => {
    if (choice === "capture") {
      // Skip onboarding — mark complete and go to dashboard
      completeOnboarding.mutate(undefined, {
        onSuccess: () => setLocation("/dashboard"),
      });
      return;
    }
    transition(() => setPhase("steps"));
  };

  const handleStepSubmit = async () => {
    const answer = answers[currentStep]?.trim();
    if (!answer) return;

    setIsSubmitting(true);
    try {
      await submitStep.mutateAsync({
        step: STEPS[currentStep].id,
        answer,
      });

      if (currentStep === 5) {
        // After step 6 (secret memory), show companion moment
        transition(() => setPhase("companion"));
      } else if (currentStep === 6) {
        // After step 7 (voice style), complete onboarding
        await completeOnboarding.mutateAsync();
        transition(() => setPhase("done"));
      } else {
        transition(() => setCurrentStep((s) => s + 1));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompanionContinue = () => {
    transition(() => {
      setPhase("steps");
      setCurrentStep(6);
    });
  };

  const handleDone = () => {
    setLocation("/dashboard");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && STEPS[currentStep]?.type === "input") {
      e.preventDefault();
      handleStepSubmit();
    }
  };

  const updateAnswer = (value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[currentStep] = value;
      return next;
    });
  };

  const selectVoiceStyle = (value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[currentStep] = value;
      return next;
    });
  };

  // ─── Renders ───

  const progressPct = phase === "steps" ? ((currentStep + 1) / STEPS.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div
        className={`w-full max-w-2xl transition-all duration-300 ease-in-out ${
          fadeIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* ─── Intent Split Screen ─── */}
        {phase === "intent" && (
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-3">Welcome to Ether</h1>
            <p className="text-slate-400 mb-12 text-lg">How would you like to begin?</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => handleIntentChoice("build")}
                className="group relative bg-slate-800 border border-slate-700 rounded-2xl p-8 text-left hover:border-blue-500/60 hover:bg-slate-800/80 transition-all duration-200"
              >
                <div className="mb-4">
                  <Brain className="h-10 w-10 text-blue-400 group-hover:text-blue-300 transition-colors" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Build my digital mind</h2>
                <p className="text-slate-400 text-sm">
                  Answer a few questions so your AI persona understands who you are from the start.
                </p>
                <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-blue-500/30 transition-colors pointer-events-none" />
              </button>

              <button
                onClick={() => handleIntentChoice("capture")}
                className="group relative bg-slate-800 border border-slate-700 rounded-2xl p-8 text-left hover:border-slate-500/60 hover:bg-slate-800/80 transition-all duration-200"
              >
                <div className="mb-4">
                  <Sparkles className="h-10 w-10 text-slate-400 group-hover:text-slate-300 transition-colors" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Just start capturing</h2>
                <p className="text-slate-400 text-sm">
                  Skip the intro and go straight to journaling, reflections, and memory capture.
                </p>
                <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-slate-500/30 transition-colors pointer-events-none" />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step Flow ─── */}
        {phase === "steps" && (
          <div>
            {/* Progress bar */}
            <div className="mb-12">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 uppercase tracking-wider">
                  Step {currentStep + 1} of {STEPS.length}
                </span>
                <span className="text-xs text-slate-500">
                  {Math.round(progressPct)}%
                </span>
              </div>
              <Progress
                value={progressPct}
                className="h-1.5 bg-slate-800"
              />
            </div>

            {/* Question */}
            <h2 className="text-3xl font-bold text-white mb-8">
              {STEPS[currentStep].question}
            </h2>

            {/* Input area */}
            {STEPS[currentStep].type === "input" && (
              <Input
                ref={inputRef}
                value={answers[currentStep]}
                onChange={(e) => updateAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={STEPS[currentStep].placeholder}
                className="bg-slate-800 border-slate-700 text-white text-lg py-6 px-4 placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
                disabled={isSubmitting}
                autoFocus
              />
            )}

            {STEPS[currentStep].type === "textarea" && (
              <Textarea
                ref={textareaRef}
                value={answers[currentStep]}
                onChange={(e) => updateAnswer(e.target.value)}
                placeholder={STEPS[currentStep].placeholder}
                className="bg-slate-800 border-slate-700 text-white text-lg py-4 px-4 min-h-[140px] placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/20 resize-none"
                disabled={isSubmitting}
                autoFocus
              />
            )}

            {STEPS[currentStep].type === "voice" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {VOICE_STYLES.map((style) => (
                  <button
                    key={style.value}
                    onClick={() => selectVoiceStyle(style.value)}
                    className={`text-left rounded-xl p-4 border transition-all duration-200 ${
                      answers[currentStep] === style.value
                        ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500/30"
                        : "bg-slate-800 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <p className="font-medium text-white text-sm">{style.label}</p>
                    <p className="text-slate-400 text-xs mt-1">{style.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Continue button */}
            <div className="mt-8 flex justify-end">
              <Button
                onClick={handleStepSubmit}
                disabled={!answers[currentStep]?.trim() || isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 text-base disabled:opacity-40"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                {currentStep === 6 ? "Finish" : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Companion Moment (after step 6) ─── */}
        {phase === "companion" && (
          <div className="text-center py-12">
            <div className="mb-8 relative inline-block">
              <div className="h-20 w-20 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto animate-pulse">
                <Sparkles className="h-10 w-10 text-blue-400" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">I see you.</h2>
            <p className="text-slate-400 text-lg mb-2">
              That took courage. This stays between us.
            </p>
            <p className="text-slate-500 text-sm mb-10">
              Your memories are encrypted and belong only to you.
            </p>
            <Button
              onClick={handleCompanionContinue}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-5 text-base"
            >
              One last thing <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* ─── Completion ─── */}
        {phase === "done" && (
          <div className="text-center py-12">
            <div className="mb-8">
              <div className="h-20 w-20 rounded-full bg-green-600/20 flex items-center justify-center mx-auto">
                <Brain className="h-10 w-10 text-green-400" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Your digital mind is ready.</h2>
            <p className="text-slate-400 text-lg mb-10">
              Keep adding memories, reflections, and conversations to deepen it over time.
            </p>
            <Button
              onClick={handleDone}
              className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 text-lg"
            >
              Go to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
