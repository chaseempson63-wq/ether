import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ChevronRight, CheckCircle, AlertCircle, TrendingUp, ArrowLeft, Save, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { VoiceInput } from "@/components/VoiceInput";

const CATEGORIES = [
  { id: "voice_language", name: "Voice & Language", weight: 20, emoji: "🗣️" },
  { id: "memory_life_events", name: "Memory & Life", weight: 20, emoji: "📖" },
  { id: "reasoning_decisions", name: "Reasoning", weight: 25, emoji: "🧠" },
  { id: "values_beliefs", name: "Values & Beliefs", weight: 20, emoji: "⚖️" },
  { id: "emotional_patterns", name: "Emotional Patterns", weight: 15, emoji: "❤️" },
];

const THRESHOLD_COLORS: Record<string, string> = {
  Seed: "bg-red-500",
  Emerging: "bg-orange-500",
  Developing: "bg-yellow-500",
  Established: "bg-blue-500",
  Complete: "bg-green-500",
};

type ConversationPhase = "answering" | "loading_followup" | "following_up" | "saving";

export default function HallidayInterview() {
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string>("reasoning_decisions");
  const [response, setResponse] = useState("");
  const [followUpResponse, setFollowUpResponse] = useState("");
  const [followUpText, setFollowUpText] = useState("");
  const [phase, setPhase] = useState<ConversationPhase>("answering");
  const [lastSpecificity, setLastSpecificity] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"interview" | "progress">("interview");

  const { data: nextQuestion, refetch: refetchQuestion, isLoading: questionLoading } =
    trpc.halliday.getNextQuestion.useQuery(
      { category: selectedCategory },
      { enabled: !!selectedCategory }
    );

  const { data: progress, refetch: refetchProgress } = trpc.halliday.getProgress.useQuery();
  const { data: categoryBreakdown, refetch: refetchBreakdown } =
    trpc.halliday.getCategoryBreakdown.useQuery();

  const generateFollowUpMutation = trpc.halliday.generateFollowUp.useMutation();
  const submitResponseMutation = trpc.halliday.submitResponse.useMutation();

  const resetConversation = () => {
    setResponse("");
    setFollowUpResponse("");
    setFollowUpText("");
    setPhase("answering");
  };

  const handleRequestFollowUp = async () => {
    if (!nextQuestion || !response.trim()) return;
    setPhase("loading_followup");
    try {
      const result = await generateFollowUpMutation.mutateAsync({
        questionText: nextQuestion.text,
        userAnswer: response.trim(),
      });
      setFollowUpText(result.followUp);
      setPhase("following_up");
    } catch {
      toast.error("Couldn't generate follow-up. Saving your answer as-is.");
      await saveAnswer(response.trim());
    }
  };

  const saveAnswer = async (fullContent: string) => {
    if (!nextQuestion) return;
    setPhase("saving");
    try {
      const result = await submitResponseMutation.mutateAsync({
        questionId: nextQuestion.questionId,
        response: fullContent,
        responseType: "text",
      });
      setLastSpecificity(result.specificity);
      resetConversation();
      refetchQuestion();
      refetchProgress();
      refetchBreakdown();

      const pct = Math.round(result.specificity * 100);
      if (pct >= 70) toast.success(`Strong answer! Specificity: ${pct}%`);
      else if (pct >= 40) toast.info(`Good answer. Specificity: ${pct}%.`);
      else toast.warning(`Generic answer (${pct}%). More detail helps your AI.`);
    } catch {
      toast.error("Failed to save response.");
      setPhase("answering");
    }
  };

  const handleSaveWithFollowUp = () => {
    const parts = [response.trim()];
    if (followUpText) parts.push(`\n\n[Follow-up: ${followUpText}]`);
    if (followUpResponse.trim()) parts.push(`\n\n${followUpResponse.trim()}`);
    saveAnswer(parts.join(""));
  };

  const handleSaveAsIs = () => saveAnswer(response.trim());

  const getCategoryProgress = (catId: string) => {
    if (!categoryBreakdown) return 0;
    const cat = categoryBreakdown.find((c) => c.categoryId === catId);
    return cat ? Math.round(cat.progress * 100) : 0;
  };

  const weightedAccuracy = progress?.overallAccuracy ?? 0;
  const currentThreshold = progress?.currentThreshold as any;
  const nextThresholdData = progress?.nextThreshold as any;
  const isWorking = phase === "loading_followup" || phase === "saving";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="mb-4 text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Home
        </Button>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-1">The Halliday Interview</h1>
            <p className="text-slate-400">Build your Digital Mind. One answer at a time.</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-blue-400">
              {Math.round(weightedAccuracy * 100)}%
            </div>
            <div className="text-sm text-slate-400">Identity Accuracy</div>
            {currentThreshold && (
              <Badge className={`mt-1 ${THRESHOLD_COLORS[currentThreshold.label] ?? "bg-slate-600"}`}>
                {currentThreshold.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Threshold Progress Bar */}
        {nextThresholdData && (
          <Card className="mb-6 bg-slate-800 border-slate-700">
            <CardContent className="pt-4 pb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-300">
                  Progress to <strong className="text-white">{nextThresholdData.label}</strong>
                </span>
                <span className="text-slate-400">{nextThresholdData.description}</span>
              </div>
              <Progress
                value={Math.round((progress?.progressToNextThreshold ?? 0) * 100)}
                className="h-3"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>{currentThreshold?.label}</span>
                <span>{nextThresholdData?.label}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mb-6">
          <TabsList className="bg-slate-800 border border-slate-700">
            <TabsTrigger value="interview" className="data-[state=active]:bg-blue-600 text-white">
              Interview
            </TabsTrigger>
            <TabsTrigger value="progress" className="data-[state=active]:bg-blue-600 text-white">
              <TrendingUp className="h-4 w-4 mr-1" />
              Progress Breakdown
            </TabsTrigger>
          </TabsList>

          {/* Interview Tab */}
          <TabsContent value="interview">
            {/* Category Selector */}
            <div className="grid grid-cols-5 gap-2 mb-6">
              {CATEGORIES.map((cat) => {
                const pct = getCategoryProgress(cat.id);
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setSelectedCategory(cat.id); resetConversation(); }}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      isSelected
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    <div className="text-xl mb-1">{cat.emoji}</div>
                    <div className="text-xs font-semibold leading-tight">{cat.name.split(" ")[0]}</div>
                    <div className="text-xs opacity-70 mt-1">{pct}%</div>
                    <div className="text-xs opacity-50">{cat.weight}% weight</div>
                  </button>
                );
              })}
            </div>

            {/* Question Card */}
            {questionLoading ? (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="pt-12 pb-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-400" />
                  <p className="text-slate-400">Loading next question...</p>
                </CardContent>
              </Card>
            ) : nextQuestion ? (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-slate-400 border-slate-600 text-xs">
                      {nextQuestion.questionId}
                    </Badge>
                    <Badge variant="outline" className="text-slate-400 border-slate-600 text-xs">
                      {CATEGORIES.find((c) => c.id === nextQuestion.category)?.name}
                    </Badge>
                  </div>
                  <CardTitle className="text-white text-xl leading-relaxed">
                    {nextQuestion.text}
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-12 space-y-5">
                  {/* ─── Conversation thread ─── */}
                  <div className="space-y-4">

                    {/* Initial answer area (always visible) */}
                    <div className="relative">
                      <Textarea
                        placeholder="Be specific. Name people, places, dates. Your specificity is your identity..."
                        value={response}
                        onChange={(e) => setResponse(e.target.value)}
                        disabled={phase !== "answering"}
                        className={`min-h-36 pr-12 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 text-base ${
                          phase !== "answering" ? "opacity-70" : ""
                        }`}
                      />
                      {phase === "answering" && (
                        <VoiceInput
                          className="absolute bottom-2 right-2"
                          onTranscript={(text) =>
                            setResponse((prev) => (prev ? prev + " " + text : text))
                          }
                        />
                      )}
                    </div>

                    {/* Specificity preview (only during initial answering) */}
                    {phase === "answering" && response.trim().length > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-400">Answer quality:</span>
                        {response.trim().split(/\s+/).length < 10 ? (
                          <span className="text-red-400 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Too short — add more detail
                          </span>
                        ) : response.trim().split(/\s+/).length < 30 ? (
                          <span className="text-yellow-400 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Getting there — add specifics
                          </span>
                        ) : (
                          <span className="text-green-400 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Good length
                          </span>
                        )}
                      </div>
                    )}

                    {/* AI follow-up loading */}
                    {phase === "loading_followup" && (
                      <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-800/40 rounded-lg">
                        <MessageCircle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="flex items-center gap-2 text-blue-300 text-sm">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Thinking of follow-up questions...
                        </div>
                      </div>
                    )}

                    {/* AI follow-up + user's follow-up response */}
                    {(phase === "following_up" || phase === "saving") && followUpText && (
                      <>
                        <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-800/40 rounded-lg">
                          <MessageCircle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                          <p className="text-blue-200 text-sm leading-relaxed">{followUpText}</p>
                        </div>

                        <div className="relative">
                          <Textarea
                            placeholder="Go deeper... share the why, the emotion, the specific details."
                            value={followUpResponse}
                            onChange={(e) => setFollowUpResponse(e.target.value)}
                            disabled={phase === "saving"}
                            className="min-h-24 pr-12 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 text-base"
                          />
                          {phase === "following_up" && (
                            <VoiceInput
                              className="absolute bottom-2 right-2"
                              onTranscript={(text) =>
                                setFollowUpResponse((prev) => (prev ? prev + " " + text : text))
                              }
                            />
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* ─── Action buttons ─── */}

                  {/* Phase: answering — show "Continue" + "Save as is" */}
                  {phase === "answering" && (
                    <div className="flex gap-3">
                      <Button
                        onClick={handleRequestFollowUp}
                        disabled={!response.trim()}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-base py-5"
                      >
                        Continue
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                      <Button
                        onClick={handleSaveAsIs}
                        disabled={!response.trim()}
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white py-5"
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save as is
                      </Button>
                    </div>
                  )}

                  {/* Phase: following_up — show "Save & Next" */}
                  {phase === "following_up" && (
                    <Button
                      onClick={handleSaveWithFollowUp}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-base py-5"
                    >
                      Save & Next Question
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}

                  {/* Phase: saving */}
                  {phase === "saving" && (
                    <Button disabled className="w-full bg-blue-600 text-base py-5 opacity-70">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving to your Digital Mind...
                    </Button>
                  )}

                  {lastSpecificity !== null && phase === "answering" && (
                    <div className="text-sm text-slate-400">
                      Last answer specificity:{" "}
                      <span className={
                        lastSpecificity >= 0.7 ? "text-green-400"
                          : lastSpecificity >= 0.4 ? "text-yellow-400"
                          : "text-red-400"
                      }>
                        {Math.round(lastSpecificity * 100)}%
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="pt-12 pb-12 text-center">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                  <h3 className="text-white text-xl font-semibold mb-2">Category Complete!</h3>
                  <p className="text-slate-400 mb-4">
                    You've answered all questions in this category. Switch to another category to continue building your Digital Mind.
                  </p>
                  <Button
                    onClick={() => {
                      const next = CATEGORIES.find((c) => c.id !== selectedCategory);
                      if (next) setSelectedCategory(next.id);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Continue in Next Category
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Progress Tab (unchanged) */}
          <TabsContent value="progress">
            <div className="space-y-4">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Identity Accuracy Thresholds</CardTitle>
                  <CardDescription>Your Digital Mind improves as you cross each threshold</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { pct: 0.20, label: "Seed", description: "Basic identity captured" },
                      { pct: 0.40, label: "Emerging", description: "Patterns starting to form" },
                      { pct: 0.60, label: "Developing", description: "Voice becoming distinct" },
                      { pct: 0.80, label: "Established", description: "Strong identity model" },
                      { pct: 1.00, label: "Complete", description: "Full Digital Mind achieved" },
                    ].map((threshold) => {
                      const achieved = weightedAccuracy >= threshold.pct;
                      const isCurrent =
                        weightedAccuracy < threshold.pct &&
                        weightedAccuracy >= threshold.pct - 0.2;
                      return (
                        <div
                          key={threshold.label}
                          className={`flex items-center gap-3 p-3 rounded-lg ${
                            achieved
                              ? "bg-green-900/30 border border-green-700"
                              : isCurrent
                              ? "bg-blue-900/30 border border-blue-700"
                              : "bg-slate-700/30 border border-slate-600"
                          }`}
                        >
                          <div className={`w-3 h-3 rounded-full ${
                            achieved ? "bg-green-400"
                              : isCurrent ? "bg-blue-400 animate-pulse"
                              : "bg-slate-500"
                          }`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold ${
                                achieved ? "text-green-300" : isCurrent ? "text-blue-300" : "text-slate-400"
                              }`}>
                                {threshold.label}
                              </span>
                              <span className="text-slate-500 text-sm">
                                {Math.round(threshold.pct * 100)}%
                              </span>
                            </div>
                            <p className="text-slate-400 text-sm">{threshold.description}</p>
                          </div>
                          {achieved && <CheckCircle className="h-5 w-5 text-green-400" />}
                          {isCurrent && <span className="text-blue-400 text-sm font-semibold">Current</span>}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Category Breakdown</CardTitle>
                  <CardDescription>Weighted contribution to your overall identity accuracy</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {CATEGORIES.map((cat) => {
                      const breakdown = categoryBreakdown?.find((c) => c.categoryId === cat.id);
                      const catProgress = breakdown?.progress ?? 0;
                      const specificity = breakdown?.avgSpecificity ?? 0;
                      const contribution = breakdown?.weightedContribution ?? 0;
                      return (
                        <div key={cat.id}>
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                              <span>{cat.emoji}</span>
                              <span className="text-white font-medium">{cat.name}</span>
                              <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                                {cat.weight}% weight
                              </Badge>
                            </div>
                            <div className="text-right text-sm">
                              <span className="text-slate-300">{Math.round(catProgress * 100)}% complete</span>
                              <span className="text-slate-500 ml-2">
                                · {Math.round(specificity * 100)}% specificity
                              </span>
                            </div>
                          </div>
                          <Progress value={Math.round(catProgress * 100)} className="h-2 mb-1" />
                          <div className="text-xs text-slate-500">
                            Weighted contribution:{" "}
                            <span className="text-blue-400">{(contribution * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-3xl font-bold text-white">
                        {progress?.totalQuestionsAnswered ?? 0}
                      </div>
                      <div className="text-slate-400 text-sm">Questions Answered</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-blue-400">
                        {Math.round(weightedAccuracy * 100)}%
                      </div>
                      <div className="text-slate-400 text-sm">Weighted Accuracy</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-green-400">
                        {currentThreshold?.label ?? "—"}
                      </div>
                      <div className="text-slate-400 text-sm">Current Stage</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
