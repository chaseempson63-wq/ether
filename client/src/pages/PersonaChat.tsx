import { useEffect, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, MessageSquare } from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  truthfulnessTag?: string;
  sourceMemories?: number[];
  confidence?: number;
  createdAt?: Date;
}

export default function PersonaChat() {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // tRPC queries and mutations
  const createConversation = trpc.conversations.create.useMutation();
  const getConversationWithMessages = trpc.conversations.getWithMessages.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId }
  );
  const addMessage = trpc.conversations.addMessage.useMutation();
  const chatWithPersona = trpc.persona.chat.useMutation();

  // Initialize conversation on mount
  useEffect(() => {
    const initializeConversation = async () => {
      try {
        const newConv = await createConversation.mutateAsync({
          title: "Chat with Your Digital Mind",
        });
        setConversationId(newConv.id);
      } catch (error) {
        console.error("Failed to create conversation:", error);
        toast.error("Failed to initialize chat");
      } finally {
        setIsInitializing(false);
      }
    };

    initializeConversation();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (getConversationWithMessages.data?.messages) {
      const msgs = getConversationWithMessages.data.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        truthfulnessTag: m.truthfulnessTag || undefined,
        sourceMemories: Array.isArray(m.sourceMemories) ? m.sourceMemories : [],
        confidence: m.confidence || undefined,
        createdAt: m.createdAt
      }));
      setMessages(msgs);
    }
  }, [getConversationWithMessages.data]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !conversationId || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      // Add user message to UI immediately
      const userMsg: Message = {
        role: "user",
        content: userMessage,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Save user message to database
      await addMessage.mutateAsync({
        conversationId,
        role: "user",
        content: userMessage,
      });

      // Get AI response
      const response = await chatWithPersona.mutateAsync({
        message: userMessage,
        legacyMode: false,
      });

      // Add AI response to UI
      const aiMsg: Message = {
        role: "assistant",
        content: response.message,
        truthfulnessTag: response.truthfulnessTag,
        sourceMemories: response.sourceMemories?.map((m) => m.id) || [],
        confidence: response.confidence,
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Save AI message to database
      await addMessage.mutateAsync({
        conversationId,
        role: "assistant",
        content: response.message,
        truthfulnessTag: (response.truthfulnessTag as "Known Memory" | "Likely Inference" | "Speculation") || undefined,
        sourceMemories: response.sourceMemories?.map((m) => m.id) || [],
        confidence: response.confidence,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
      // Remove the user message if there was an error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const getTruthfulnessColor = (tag?: string) => {
    switch (tag) {
      case "Known Memory":
        return "bg-green-100 text-green-800";
      case "Likely Inference":
        return "bg-blue-100 text-blue-800";
      case "Speculation":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-slate-600">Initializing your Digital Mind...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <MessageSquare className="w-8 h-8 text-blue-500" />
            <h1 className="text-4xl font-bold text-slate-900">Your Digital Mind</h1>
          </div>
          <p className="text-slate-600">
            Talk to yourself. Get advice based on your own reasoning and values. Your conversation is saved automatically.
          </p>
        </div>

        <Card className="h-[600px] flex flex-col shadow-lg">
          <CardHeader className="border-b">
            <CardTitle>Second Mind Chat</CardTitle>
            <CardDescription>
              Your AI is trained on your memories, decisions, and values. Ask it anything.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center">
                  <div>
                    <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 mb-2">No messages yet.</p>
                    <p className="text-sm text-slate-400">
                      Start by asking your Digital Mind for advice or perspective.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                        msg.role === "user"
                          ? "bg-blue-500 text-white"
                          : "bg-slate-100 text-slate-900"
                      }`}
                    >
                      <Streamdown>{msg.content}</Streamdown>

                      {msg.role === "assistant" && msg.truthfulnessTag && (
                        <div className="mt-3 pt-3 border-t border-slate-300 space-y-2">
                          <Badge className={getTruthfulnessColor(msg.truthfulnessTag)}>
                            {msg.truthfulnessTag}
                            {msg.confidence && ` (${Math.round(msg.confidence * 100)}%)`}
                          </Badge>
                        </div>
                      )}

                      {msg.role === "assistant" && msg.sourceMemories && msg.sourceMemories.length > 0 && (
                        <div className="mt-2 text-xs text-slate-600">
                          <p className="font-semibold">Sources: {msg.sourceMemories.length} memory(ies)</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 text-slate-900 px-4 py-2 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t p-4 bg-slate-50">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  placeholder="Ask your Digital Mind..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  size="icon"
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
