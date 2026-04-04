import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Streamdown } from "streamdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  truthfulnessTag?: {
    type: "known_memory" | "likely_inference" | "speculation";
    confidence: number;
    source?: string;
  };
  sourceMemories?: string[];
}

export default function PersonaChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const personaChatMutation = trpc.persona.chat.useMutation();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) {
      toast.error("Please enter a message");
      return;
    }

    const userMessage = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await personaChatMutation.mutateAsync({
        query: userMessage,
        conversationHistory: messages,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.content,
          truthfulnessTag: response.truthfulnessTag,
          sourceMemories: response.sourceMemories,
        },
      ]);
    } catch (error) {
      toast.error("Failed to get response from your Digital Mind");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const getTruthfulnessColor = (type: string) => {
    switch (type) {
      case "known_memory":
        return "bg-green-100 text-green-800";
      case "likely_inference":
        return "bg-blue-100 text-blue-800";
      case "speculation":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Please log in to access your Digital Mind</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Your Digital Mind</h1>
          <p className="text-slate-600">Talk to yourself. Get advice based on your own reasoning and values.</p>
        </div>

        <Card className="h-[600px] flex flex-col">
          <CardHeader>
            <CardTitle>Second Mind Chat</CardTitle>
            <CardDescription>
              Your AI is trained on your memories, decisions, and values. Ask it anything.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 pr-4 mb-4 border rounded-lg p-4">
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-center">
                    <div>
                      <p className="text-slate-500 mb-2">No messages yet.</p>
                      <p className="text-sm text-slate-400">
                        Start by asking your Digital Mind for advice or perspective.
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        msg.role === "user"
                          ? "bg-blue-500 text-white"
                          : "bg-slate-200 text-slate-900"
                      }`}
                    >
                      <Streamdown>{msg.content}</Streamdown>

                      {msg.role === "assistant" && msg.truthfulnessTag && (
                        <div className="mt-3 space-y-2">
                          <Badge className={getTruthfulnessColor(msg.truthfulnessTag.type)}>
                            {msg.truthfulnessTag.type === "known_memory" && "Known Memory"}
                            {msg.truthfulnessTag.type === "likely_inference" && "Likely Inference"}
                            {msg.truthfulnessTag.type === "speculation" && "Speculation"}
                            {" "}
                            ({Math.round(msg.truthfulnessTag.confidence * 100)}%)
                          </Badge>
                          {msg.truthfulnessTag.source && (
                            <p className="text-xs text-slate-600">{msg.truthfulnessTag.source}</p>
                          )}
                        </div>
                      )}

                      {msg.role === "assistant" && msg.sourceMemories && msg.sourceMemories.length > 0 && (
                        <div className="mt-3 text-xs text-slate-600">
                          <p className="font-semibold mb-1">Based on:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {msg.sourceMemories.map((memory, i) => (
                              <li key={i} className="truncate">
                                {memory}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-200 text-slate-900 px-4 py-2 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}

                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Input
                placeholder="Ask your Digital Mind..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim()}
                size="icon"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
