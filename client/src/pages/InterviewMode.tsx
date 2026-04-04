import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, ChevronRight, CheckCircle2 } from "lucide-react";

interface InterviewQuestion {
  id: string;
  category: "values" | "decisions" | "lessons" | "beliefs";
  question: string;
  answered: boolean;
  response?: string;
}

export default function InterviewMode() {
  const { user } = useAuth();
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([
    {
      id: "1",
      category: "values",
      question: "What is the most important value that guides your life?",
      answered: false,
    },
    {
      id: "2",
      category: "decisions",
      question: "Describe a major decision you made and why you made it that way.",
      answered: false,
    },
    {
      id: "3",
      category: "lessons",
      question: "What is the most important lesson you've learned in your life?",
      answered: false,
    },
    {
      id: "4",
      category: "beliefs",
      question: "What do you believe about human nature?",
      answered: false,
    },
    {
      id: "5",
      category: "values",
      question: "How do you define success?",
      answered: false,
    },
  ]);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [response, setResponse] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const saveInterviewResponseMutation = trpc.interview.saveResponse.useMutation();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Please log in to access Interview Mode</p>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = questions.filter((q) => q.answered).length;
  const progress = (answeredCount / questions.length) * 100;

  const handleSubmitResponse = async () => {
    if (!response.trim()) {
      toast.error("Please provide a response");
      return;
    }

    setIsSubmitting(true);
    try {
      await saveInterviewResponseMutation.mutateAsync({
        sessionId,
        questionId: currentQuestion.id,
        question: currentQuestion.question,
        category: currentQuestion.category,
        response,
      });

      const updatedQuestions = [...questions];
      updatedQuestions[currentQuestionIndex] = {
        ...currentQuestion,
        answered: true,
        response,
      };
      setQuestions(updatedQuestions);
      setResponse("");

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        toast.success("Response saved! Moving to next question.");
      } else {
        toast.success("Interview complete! All responses saved.");
      }
    } catch (error) {
      toast.error("Failed to save response");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "values":
        return "bg-purple-100 text-purple-800";
      case "decisions":
        return "bg-blue-100 text-blue-800";
      case "lessons":
        return "bg-green-100 text-green-800";
      case "beliefs":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Interview Mode</h1>
          <p className="text-slate-600">
            Answer these questions to help your Digital Mind understand your reasoning and values.
          </p>
        </div>

        {/* Progress */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">
                  {answeredCount} of {questions.length} questions answered
                </span>
                <span className="text-sm font-bold text-slate-900">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Question Card */}
        {currentQuestionIndex < questions.length ? (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl mb-2">{currentQuestion.question}</CardTitle>
                  <CardDescription>
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </CardDescription>
                </div>
                <Badge className={getCategoryColor(currentQuestion.category)}>
                  {currentQuestion.category.charAt(0).toUpperCase() + currentQuestion.category.slice(1)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Textarea
                  placeholder="Share your thoughts here. Be honest and detailed—this helps your Digital Mind understand your reasoning."
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <div className="flex gap-4">
                  <Button
                    onClick={handleSubmitResponse}
                    disabled={isSubmitting || !response.trim()}
                    size="lg"
                    className="flex-1"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Save Response
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  {currentQuestionIndex > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCurrentQuestionIndex(currentQuestionIndex - 1);
                        setResponse(questions[currentQuestionIndex - 1].response || "");
                      }}
                      disabled={isSubmitting}
                    >
                      Previous
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-8">
            <CardContent className="pt-12 pb-12 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Interview Complete!</h2>
              <p className="text-slate-600 mb-6">
                Your responses have been saved and will help shape your Digital Mind.
              </p>
              <Button onClick={() => window.location.href = "/"} size="lg">
                Return to Home
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Question List */}
        <Card>
          <CardHeader>
            <CardTitle>All Questions</CardTitle>
            <CardDescription>Track your progress through the interview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    idx === currentQuestionIndex
                      ? "border-blue-500 bg-blue-50"
                      : q.answered
                        ? "border-green-500 bg-green-50"
                        : "border-slate-200 bg-slate-50"
                  }`}
                  onClick={() => {
                    setCurrentQuestionIndex(idx);
                    setResponse(q.response || "");
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {q.answered ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-slate-300 flex-shrink-0" />
                      )}
                      <span className="text-sm text-slate-700 line-clamp-1">{q.question}</span>
                    </div>
                    <Badge variant="outline" className="text-xs ml-2">
                      {q.category}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
