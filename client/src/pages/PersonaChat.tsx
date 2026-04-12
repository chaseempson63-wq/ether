import { useEffect, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Send,
  MessageSquare,
  ArrowLeft,
  Plus,
  PanelLeft,
  Trash2,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { VoiceInput } from "@/components/VoiceInput";

type SourceMemory = { id: number; title: string; content: string };
type SourceMemoriesField = SourceMemory[] | number[] | null | undefined;

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  truthfulnessTag?: string;
  sourceMemories?: SourceMemoriesField;
  confidence?: number;
  createdAt?: Date;
}

const deriveTitle = (msg: string) => {
  const trimmed = msg.trim();
  if (trimmed.length <= 40) return trimmed;
  return trimmed.slice(0, 40) + "…";
};

const isRichSourceMemories = (
  s: SourceMemoriesField
): s is SourceMemory[] => Array.isArray(s) && s.length > 0 && typeof s[0] === "object";

export default function PersonaChat() {
  const [, setLocation] = useLocation();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const conversationsListQuery = trpc.conversations.list.useQuery();
  const conversationWithMessagesQuery =
    trpc.conversations.getWithMessages.useQuery(
      { conversationId: conversationId! },
      { enabled: conversationId !== null }
    );
  const createConversation = trpc.conversations.create.useMutation();
  const addMessage = trpc.conversations.addMessage.useMutation();
  const deleteConversation = trpc.conversations.delete.useMutation();
  const chatWithPersona = trpc.persona.chat.useMutation();

  // Load messages when a saved conversation is selected
  useEffect(() => {
    if (conversationId === null) return;
    if (conversationWithMessagesQuery.data?.messages) {
      const msgs: Message[] =
        conversationWithMessagesQuery.data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          truthfulnessTag: m.truthfulnessTag || undefined,
          sourceMemories: Array.isArray(m.sourceMemories)
            ? (m.sourceMemories as SourceMemoriesField)
            : null,
          confidence: m.confidence || undefined,
          createdAt: m.createdAt,
        }));
      setMessages(msgs);
    }
  }, [conversationWithMessagesQuery.data, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setInput("");
  };

  const handleSelectConversation = (id: number) => {
    if (id === conversationId) return;
    setConversationId(id);
    setMessages([]);
  };

  const handleConfirmDelete = async () => {
    if (pendingDeleteId === null) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      await deleteConversation.mutateAsync({ conversationId: id });
      await utils.conversations.list.invalidate();
      if (id === conversationId) {
        handleNewChat();
      }
      toast.success("Conversation deleted");
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      toast.error("Failed to delete conversation");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    let activeId = conversationId;

    try {
      // Lazy-create the conversation on first send
      if (activeId === null) {
        const created = await createConversation.mutateAsync({
          title: deriveTitle(userMessage),
        });
        activeId = created.id;
        setConversationId(activeId);
        await utils.conversations.list.invalidate();
      }

      // Optimistic user message
      const userMsg: Message = { role: "user", content: userMessage };
      setMessages((prev) => [...prev, userMsg]);

      // Persist user message
      await addMessage.mutateAsync({
        conversationId: activeId,
        role: "user",
        content: userMessage,
      });

      // Get AI response
      const response = await chatWithPersona.mutateAsync({
        message: userMessage,
        legacyMode: false,
      });

      const sources: SourceMemory[] = (response.sourceMemories || []).map(
        (m) => ({ id: m.id, title: m.title, content: m.content })
      );

      const aiMsg: Message = {
        role: "assistant",
        content: response.message,
        truthfulnessTag: response.truthfulnessTag,
        sourceMemories: sources,
        confidence: response.confidence,
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Persist AI message with rich citations
      await addMessage.mutateAsync({
        conversationId: activeId,
        role: "assistant",
        content: response.message,
        truthfulnessTag:
          (response.truthfulnessTag as
            | "Known Memory"
            | "Likely Inference"
            | "Speculation") || undefined,
        sourceMemories: sources,
        confidence: response.confidence,
      });

      await utils.conversations.list.invalidate();
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const currentTitle =
    conversationId !== null
      ? conversationWithMessagesQuery.data?.title || "Conversation"
      : "New Chat";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="mb-4 text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Home
        </Button>

        <div className="flex gap-4 h-[calc(100vh-140px)]">
          {/* Sidebar */}
          <aside
            className={cn(
              "bg-slate-800 border border-slate-700 rounded-lg flex flex-col transition-all duration-200 overflow-hidden",
              sidebarOpen ? "w-72" : "w-16"
            )}
          >
            <div className="p-3 border-b border-slate-700 flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen((o) => !o)}
                className="text-slate-400 hover:text-white hover:bg-slate-700 flex-shrink-0"
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              {sidebarOpen ? (
                <Button
                  onClick={handleNewChat}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewChat}
                  className="text-slate-400 hover:text-white hover:bg-slate-700 flex-shrink-0"
                  aria-label="New chat"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>

            {sidebarOpen && (
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {conversationsListQuery.isLoading ? (
                    <div className="p-4 text-center text-slate-500 text-sm">
                      Loading…
                    </div>
                  ) : conversationsListQuery.data &&
                    conversationsListQuery.data.length > 0 ? (
                    conversationsListQuery.data.map((conv) => (
                      <ConversationRow
                        key={conv.id}
                        title={conv.title || "Untitled"}
                        updatedAt={conv.updatedAt}
                        isActive={conv.id === conversationId}
                        onSelect={() => handleSelectConversation(conv.id)}
                        onDelete={() => setPendingDeleteId(conv.id)}
                      />
                    ))
                  ) : (
                    <div className="p-4 text-center text-slate-500 text-sm">
                      No past conversations
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </aside>

          {/* Main chat area */}
          <main className="flex-1 bg-slate-800 border border-slate-700 rounded-lg flex flex-col overflow-hidden">
            <header className="p-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-6 h-6 text-blue-400" />
                <h1 className="text-2xl font-bold text-white truncate">
                  {currentTitle}
                </h1>
              </div>
              <p className="text-slate-400 text-sm mt-1">
                Your AI is trained on your memories, decisions, and values.
              </p>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !isLoading ? (
                <div className="h-full flex items-center justify-center text-center">
                  <div>
                    <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400 mb-2">No messages yet.</p>
                    <p className="text-sm text-slate-500">
                      Start by asking your Digital Mind for advice or perspective.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <MessageBubble key={msg.id ?? `m-${idx}`} message={msg} />
                ))
              )}

              {isLoading && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-700 p-4 bg-slate-900/50">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  placeholder="Ask your Digital Mind..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  className="flex-1 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                />
                <VoiceInput
                  disabled={isLoading}
                  onTranscript={(text) =>
                    setInput((prev) => (prev ? prev + " " + text : text))
                  }
                />
                <Button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  size="icon"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </main>
        </div>
      </div>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(o) => !o && setPendingDeleteId(null)}
      >
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete this conversation?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently remove the conversation and all of its
              messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper components

function ConversationRow({
  title,
  updatedAt,
  isActive,
  onSelect,
  onDelete,
}: {
  title: string;
  updatedAt: Date | string;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const updated = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
  const stamp = formatDistanceToNow(updated, { addSuffix: true });
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group rounded-md px-3 py-2 cursor-pointer transition flex items-start gap-2",
        isActive
          ? "bg-slate-700"
          : "hover:bg-slate-700/50"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{stamp}</div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition flex-shrink-0 p-1"
        aria-label="Delete conversation"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-xl px-4 py-3 rounded-lg",
          isUser
            ? "bg-blue-600 text-white"
            : "bg-slate-800 border border-slate-700 text-slate-100"
        )}
      >
        <Streamdown>{message.content}</Streamdown>

        {!isUser && message.truthfulnessTag && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <TruthfulnessBadge
              tag={message.truthfulnessTag}
              confidence={message.confidence}
            />
          </div>
        )}

        {!isUser &&
          message.sourceMemories &&
          (Array.isArray(message.sourceMemories)
            ? message.sourceMemories.length
            : 0) > 0 && (
            <SourceCitations sources={message.sourceMemories} />
          )}
      </div>
    </div>
  );
}

function TruthfulnessBadge({
  tag,
  confidence,
}: {
  tag: string;
  confidence?: number;
}) {
  const className =
    tag === "Known Memory"
      ? "bg-green-900/40 text-green-300 border border-green-800"
      : tag === "Likely Inference"
      ? "bg-amber-900/40 text-amber-300 border border-amber-800"
      : tag === "Speculation"
      ? "bg-red-900/40 text-red-300 border border-red-800"
      : "bg-slate-700 text-slate-300 border border-slate-600";
  return (
    <Badge className={className}>
      {tag}
      {confidence !== undefined && ` (${Math.round(confidence * 100)}%)`}
    </Badge>
  );
}

function SourceCitations({ sources }: { sources: SourceMemoriesField }) {
  if (!sources || sources.length === 0) return null;

  if (!isRichSourceMemories(sources)) {
    return (
      <div className="mt-2 text-xs text-slate-400">
        Cited {sources.length} {sources.length === 1 ? "memory" : "memories"}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="text-xs text-slate-500 mr-1 self-center">Sources:</span>
      {sources.map((src, idx) => (
        <Popover key={`${src.id}-${idx}`}>
          <PopoverTrigger asChild>
            <Badge
              variant="outline"
              className="cursor-pointer border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white text-xs"
            >
              {src.title || `Memory ${src.id}`}
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="bg-slate-900 border-slate-700 text-slate-200 max-w-sm">
            <div className="text-xs text-slate-500 mb-1">Cited memory</div>
            <div className="text-sm whitespace-pre-wrap">{src.content}</div>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 flex gap-1.5 items-center">
        <span
          className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}
