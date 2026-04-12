import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { VoiceInput } from "@/components/VoiceInput";

export default function DailyReflection() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"memory" | "reasoning" | "values">("memory");

  // Memory form state
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryTags, setMemoryTags] = useState("");
  const [sourceType, setSourceType] = useState<"journal" | "voice_memo" | "passive_import" | "interview">("journal");

  // Reasoning form state
  const [decision, setDecision] = useState("");
  const [logicWhy, setLogicWhy] = useState("");
  const [outcome, setOutcome] = useState("");
  const [reasoningTags, setReasoningTags] = useState("");

  // Values form state
  const [valueStatement, setValueStatement] = useState("");
  const [beliefContext, setBeliefContext] = useState("");
  const [priority, setPriority] = useState("1");

  // tRPC mutations
  const createMemoryMutation = trpc.memory.create.useMutation();
  const createReasoningMutation = trpc.reasoning.create.useMutation();
  const createValueMutation = trpc.values.create.useMutation();

  const handleMemorySubmit = async () => {
    if (!memoryContent.trim()) {
      toast.error("Please enter a memory");
      return;
    }

    try {
      await createMemoryMutation.mutateAsync({
        content: memoryContent,
        sourceType,
        tags: memoryTags ? memoryTags.split(",").map(t => t.trim()) : undefined,
      });
      toast.success("Memory saved successfully");
      setMemoryContent("");
      setMemoryTags("");
    } catch (error) {
      toast.error("Failed to save memory");
    }
  };

  const handleReasoningSubmit = async () => {
    if (!decision.trim() || !logicWhy.trim()) {
      toast.error("Please fill in decision and reasoning");
      return;
    }

    try {
      await createReasoningMutation.mutateAsync({
        decision,
        logicWhy,
        outcome: outcome || undefined,
        tags: reasoningTags ? reasoningTags.split(",").map(t => t.trim()) : undefined,
      });
      toast.success("Reasoning pattern saved");
      setDecision("");
      setLogicWhy("");
      setOutcome("");
      setReasoningTags("");
    } catch (error) {
      toast.error("Failed to save reasoning");
    }
  };

  const handleValueSubmit = async () => {
    if (!valueStatement.trim()) {
      toast.error("Please enter a value statement");
      return;
    }

    try {
      await createValueMutation.mutateAsync({
        valueStatement,
        beliefContext: beliefContext || undefined,
        priority: parseInt(priority),
      });
      toast.success("Core value saved");
      setValueStatement("");
      setBeliefContext("");
      setPriority("1");
    } catch (error) {
      toast.error("Failed to save value");
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <p className="text-slate-400">Please log in to access Daily Reflection</p>
      </div>
    );
  }

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

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Daily Reflection</h1>
          <p className="text-slate-400">Capture your thoughts, decisions, and values to build your Digital Mind</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-800 border border-slate-700">
            <TabsTrigger value="memory" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300">Memory</TabsTrigger>
            <TabsTrigger value="reasoning" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300">Reasoning</TabsTrigger>
            <TabsTrigger value="values" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300">Values</TabsTrigger>
          </TabsList>

          <TabsContent value="memory" className="space-y-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Capture a Memory</CardTitle>
                <CardDescription className="text-slate-400">Record a journal entry, voice memo, or important life event</CardDescription>
              </CardHeader>
              <CardContent className="p-12 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="source-type" className="text-slate-300">Memory Type</Label>
                  <Select value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
                    <SelectTrigger id="source-type" className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="journal">Journal Entry</SelectItem>
                      <SelectItem value="voice_memo">Voice Memo</SelectItem>
                      <SelectItem value="passive_import">Imported Content</SelectItem>
                      <SelectItem value="interview">Interview Response</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="memory-content" className="text-slate-300">What do you want to remember?</Label>
                  <div className="relative">
                    <Textarea
                      id="memory-content"
                      placeholder="Write down your thoughts, experiences, or important moments..."
                      value={memoryContent}
                      onChange={(e) => setMemoryContent(e.target.value)}
                      className="min-h-[150px] pr-12 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    />
                    <VoiceInput
                      className="absolute bottom-2 right-2"
                      onTranscript={(text) =>
                        setMemoryContent((prev) => (prev ? prev + " " + text : text))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="memory-tags" className="text-slate-300">Tags (comma-separated)</Label>
                  <Input
                    id="memory-tags"
                    placeholder="e.g., family, career, growth"
                    value={memoryTags}
                    onChange={(e) => setMemoryTags(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>

                <Button
                  onClick={handleMemorySubmit}
                  disabled={createMemoryMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {createMemoryMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Memory"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reasoning" className="space-y-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Log a Decision</CardTitle>
                <CardDescription className="text-slate-400">Record a major decision and your reasoning behind it</CardDescription>
              </CardHeader>
              <CardContent className="p-12 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="decision" className="text-slate-300">What was the decision?</Label>
                  <Input
                    id="decision"
                    placeholder="Describe the decision you made..."
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="logic-why" className="text-slate-300">Why did you make this decision?</Label>
                  <div className="relative">
                    <Textarea
                      id="logic-why"
                      placeholder="Explain your reasoning, values, and thought process..."
                      value={logicWhy}
                      onChange={(e) => setLogicWhy(e.target.value)}
                      className="min-h-[150px] pr-12 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    />
                    <VoiceInput
                      className="absolute bottom-2 right-2"
                      onTranscript={(text) =>
                        setLogicWhy((prev) => (prev ? prev + " " + text : text))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="outcome" className="text-slate-300">What was the outcome? (optional)</Label>
                  <div className="relative">
                    <Textarea
                      id="outcome"
                      placeholder="How did this decision turn out?"
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value)}
                      className="min-h-[100px] pr-12 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    />
                    <VoiceInput
                      className="absolute bottom-2 right-2"
                      onTranscript={(text) =>
                        setOutcome((prev) => (prev ? prev + " " + text : text))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reasoning-tags" className="text-slate-300">Tags (comma-separated)</Label>
                  <Input
                    id="reasoning-tags"
                    placeholder="e.g., risk, independence, growth"
                    value={reasoningTags}
                    onChange={(e) => setReasoningTags(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>

                <Button
                  onClick={handleReasoningSubmit}
                  disabled={createReasoningMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {createReasoningMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Reasoning"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="values" className="space-y-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Define a Core Value</CardTitle>
                <CardDescription className="text-slate-400">What principles are non-negotiable for you?</CardDescription>
              </CardHeader>
              <CardContent className="p-12 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="value-statement" className="text-slate-300">Value Statement</Label>
                  <Input
                    id="value-statement"
                    placeholder="e.g., 'Trust only yourself' or 'Family comes first'"
                    value={valueStatement}
                    onChange={(e) => setValueStatement(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="belief-context" className="text-slate-300">Why is this important to you?</Label>
                  <div className="relative">
                    <Textarea
                      id="belief-context"
                      placeholder="Explain the context and importance of this value..."
                      value={beliefContext}
                      onChange={(e) => setBeliefContext(e.target.value)}
                      className="min-h-[120px] pr-12 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                    />
                    <VoiceInput
                      className="absolute bottom-2 right-2"
                      onTranscript={(text) =>
                        setBeliefContext((prev) => (prev ? prev + " " + text : text))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="priority" className="text-slate-300">Priority Level</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="priority" className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="1">Critical (1)</SelectItem>
                      <SelectItem value="2">Very Important (2)</SelectItem>
                      <SelectItem value="3">Important (3)</SelectItem>
                      <SelectItem value="4">Moderate (4)</SelectItem>
                      <SelectItem value="5">Low (5)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleValueSubmit}
                  disabled={createValueMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {createValueMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Value"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
