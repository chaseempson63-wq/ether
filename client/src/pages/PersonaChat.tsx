import { useEffect, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Pencil,
  Check,
  X,
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
  const generateTitle = trpc.conversations.generateTitle.useMutation();
  const updateTitle = trpc.conversations.updateTitle.useMutation();

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
      if (id === conversationId) handleNewChat();
      toast.success("Conversation deleted");
    } catch {
      toast.error("Failed to delete conversation");
    }
  };

  const handleRenameConversation = async (id: number, newTitle: string) => {
    try {
      await updateTitle.mutateAsync({ conversationId: id, title: newTitle });
      await utils.conversations.list.invalidate();
      if (id === conversationId) {
        await utils.conversations.getWithMessages.invalidate({ conversationId: id });
      }
    } catch {
      toast.error("Failed to rename conversation");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    let activeId = conversationId;
    const isFirstMessage = activeId === null;

    try {
      // Lazy-create with a placeholder title
      if (activeId === null) {
        const created = await createConversation.mutateAsync({
          title: "New Chat",
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

      // Auto-generate title from first message (fire-and-forget)
      if (isFirstMessage) {
        generateTitle
          .mutateAsync({ conversationId: activeId, firstMessage: userMessage })
          .then(() => utils.conversations.list.invalidate())
          .catch(() => {});
      }

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

      // Persist AI message
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
    } catch {
      toast.error("Failed to send message");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  // Fix #1: title derivation — use "New Chat" when no conversation is selected,
  // and pull from the list query (updates faster than getWithMessages) for active ones
  const currentTitle = (() => {
    if (conversationId === null) return "New Chat";
    const fromList = conversationsListQuery.data?.find((c) => c.id === conversationId);
    if (fromList?.title && fromList.title !== "New Chat") return fromList.title;
    const fromQuery = conversationWithMessagesQuery.data?.title;
    if (fromQuery && fromQuery !== "New Chat") return fromQuery;
    return "New Chat";
  })();

  return (
    <div className="min-h-screen bg-ether-bg p-6">
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="mb-4 text-slate-400 hover:text-white hover:bg-white/[0.04]"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Home
        </Button>

        <div className="flex gap-4 h-[calc(100vh-140px)]">
          {/* Sidebar */}
          <aside
            className={cn(
              "bg-white/[0.04] border border-white/[0.06] rounded-lg flex flex-col transition-all duration-200 overflow-hidden",
              sidebarOpen ? "w-72" : "w-16"
            )}
          >
            <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen((o) => !o)}
                className="text-slate-400 hover:text-white hover:bg-white/[0.04] flex-shrink-0"
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              {sidebarOpen ? (
                <Button
                  onClick={handleNewChat}
                  data-ether-variant="primary"
                  className="flex-1 bg-ether-violet hover:bg-ether-violet/90"
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
                  className="text-slate-400 hover:text-white hover:bg-white/[0.04] flex-shrink-0"
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
                    <div className="p-4 text-center text-slate-500 text-sm">Loading…</div>
                  ) : conversationsListQuery.data && conversationsListQuery.data.length > 0 ? (
                    conversationsListQuery.data.map((conv) => (
                      <ConversationRow
                        key={conv.id}
                        id={conv.id}
                        title={conv.title || "Untitled"}
                        updatedAt={conv.updatedAt}
                        isActive={conv.id === conversationId}
                        onSelect={() => handleSelectConversation(conv.id)}
                        onDelete={() => setPendingDeleteId(conv.id)}
                        onRename={(newTitle) => handleRenameConversation(conv.id, newTitle)}
                      />
                    ))
                  ) : (
                    <div className="p-4 text-center text-slate-500 text-sm">No past conversations</div>
                  )}
                </div>
              </ScrollArea>
            )}
          </aside>

          {/* Main chat area */}
          <main className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg flex flex-col overflow-hidden">
            <header className="p-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-6 h-6 text-ether-cyan" />
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

            <div className="border-t border-white/[0.06] p-4 bg-ether-bg/50">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  placeholder="Ask your Digital Mind..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  className="flex-1 bg-white/[0.04] border-white/[0.06] text-white placeholder:text-slate-500"
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
                  data-ether-variant="primary"
                  className="bg-ether-violet hover:bg-ether-violet/90"
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
        <AlertDialogContent className="bg-white/[0.06] border-white/[0.06] text-white backdrop-blur-xl">
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
            <AlertDialogCancel className="bg-white/[0.04] border-white/[0.06] text-white hover:bg-white/[0.06]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              data-ether-variant="destructive"
              className="bg-destructive hover:bg-destructive/90 text-white"
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
  id,
  title,
  updatedAt,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  id: number;
  title: string;
  updatedAt: Date | string;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const updated = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
  const stamp = formatDistanceToNow(updated, { addSuffix: true });

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(title);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const cancelEditing = () => {
    setEditValue(title);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="rounded-md px-3 py-2 bg-white/[0.04] flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") cancelEditing();
          }}
          onBlur={commitRename}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-sm text-white outline-none focus:border-ether-violet"
          autoFocus
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); commitRename(); }}
          className="text-green-400 hover:text-green-300 p-0.5 flex-shrink-0"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
          className="text-slate-400 hover:text-slate-300 p-0.5 flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group rounded-md px-3 py-2 cursor-pointer transition flex items-start gap-2",
        isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{stamp}</div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={startEditing}
          className="text-slate-500 hover:text-ether-cyan transition p-1"
          aria-label="Rename conversation"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-slate-500 hover:text-red-400 transition p-1"
          aria-label="Delete conversation"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
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
            ? "bg-ether-violet text-white"
            : "bg-white/[0.04] border border-white/[0.06] text-white"
        )}
      >
        <Streamdown>{message.content}</Streamdown>

        {!isUser && message.sourceMemories && Array.isArray(message.sourceMemories) && message.sourceMemories.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Based on {message.sourceMemories.length} {message.sourceMemories.length === 1 ? "memory" : "memories"}
          </p>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-3 flex gap-1.5 items-center">
        <span className="w-2 h-2 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
