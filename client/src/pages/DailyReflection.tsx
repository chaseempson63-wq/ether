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
import { Loader2 } from "lucide-react";

export default function DailyReflection() {
  const { user } = useAuth();
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
      <div className="flex items-center justify-center min-h-screen">
        <p>Please log in to access Daily Reflection</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Daily Reflection</h1>
          <p className="text-slate-600">Capture your thoughts, decisions, and values to build your Digital Mind</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
            <TabsTrigger value="values">Values</TabsTrigger>
          </TabsList>

          <TabsContent value="memory" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Capture a Memory</CardTitle>
                <CardDescription>Record a journal entry, voice memo, or important life event</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="source-type">Memory Type</Label>
                  <Select value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
                    <SelectTrigger id="source-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="journal">Journal Entry</SelectItem>
                      <SelectItem value="voice_memo">Voice Memo</SelectItem>
                      <SelectItem value="passive_import">Imported Content</SelectItem>
                      <SelectItem value="interview">Interview Response</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="memory-content">What do you want to remember?</Label>
                  <Textarea
                    id="memory-content"
                    placeholder="Write down your thoughts, experiences, or important moments..."
                    value={memoryContent}
                    onChange={(e) => setMemoryContent(e.target.value)}
                    className="min-h-[150px]"
                  />
                </div>

                <div>
                  <Label htmlFor="memory-tags">Tags (comma-separated)</Label>
                  <Input
                    id="memory-tags"
                    placeholder="e.g., family, career, growth"
                    value={memoryTags}
                    onChange={(e) => setMemoryTags(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleMemorySubmit}
                  disabled={createMemoryMutation.isPending}
                  className="w-full"
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
            <Card>
              <CardHeader>
                <CardTitle>Log a Decision</CardTitle>
                <CardDescription>Record a major decision and your reasoning behind it</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="decision">What was the decision?</Label>
                  <Input
                    id="decision"
                    placeholder="Describe the decision you made..."
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="logic-why">Why did you make this decision?</Label>
                  <Textarea
                    id="logic-why"
                    placeholder="Explain your reasoning, values, and thought process..."
                    value={logicWhy}
                    onChange={(e) => setLogicWhy(e.target.value)}
                    className="min-h-[150px]"
                  />
                </div>

                <div>
                  <Label htmlFor="outcome">What was the outcome? (optional)</Label>
                  <Textarea
                    id="outcome"
                    placeholder="How did this decision turn out?"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>

                <div>
                  <Label htmlFor="reasoning-tags">Tags (comma-separated)</Label>
                  <Input
                    id="reasoning-tags"
                    placeholder="e.g., risk, independence, growth"
                    value={reasoningTags}
                    onChange={(e) => setReasoningTags(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleReasoningSubmit}
                  disabled={createReasoningMutation.isPending}
                  className="w-full"
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
            <Card>
              <CardHeader>
                <CardTitle>Define a Core Value</CardTitle>
                <CardDescription>What principles are non-negotiable for you?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="value-statement">Value Statement</Label>
                  <Input
                    id="value-statement"
                    placeholder="e.g., 'Trust only yourself' or 'Family comes first'"
                    value={valueStatement}
                    onChange={(e) => setValueStatement(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="belief-context">Why is this important to you?</Label>
                  <Textarea
                    id="belief-context"
                    placeholder="Explain the context and importance of this value..."
                    value={beliefContext}
                    onChange={(e) => setBeliefContext(e.target.value)}
                    className="min-h-[120px]"
                  />
                </div>

                <div>
                  <Label htmlFor="priority">Priority Level</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                  className="w-full"
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
