import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Mic,
  Square,
  Search,
  Save,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { VoiceInput, useVoiceRecognition } from "@/components/VoiceInput";

const QUICK_TAG = "quick";

type MemoryRow = {
  id: number;
  content: string;
  tags: string[] | null | unknown;
  createdAt: Date | string;
};

const hasQuickTag = (m: MemoryRow): boolean => {
  // Drizzle JSON columns come back parsed via mysql2; defensive against legacy
  // rows where tags might still be a JSON string.
  let tags: unknown = m.tags;
  if (typeof tags === "string") {
    try {
      tags = JSON.parse(tags);
    } catch {
      return false;
    }
  }
  return Array.isArray(tags) && tags.includes(QUICK_TAG);
};

export default function QuickMemory() {
  const [, setLocation] = useLocation();
  const [transcript, setTranscript] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const utils = trpc.useUtils();
  const memoriesQuery = trpc.memory.list.useQuery();
  const createMemory = trpc.memory.create.useMutation();

  const {
    isRecording: bigRecording,
    supported: bigSupported,
    toggle: bigToggle,
  } = useVoiceRecognition({
    onTranscript: (text) =>
      setTranscript((prev) => (prev ? prev + " " + text : text)),
  });

  const quickMemories = useMemo<MemoryRow[]>(() => {
    const all = (memoriesQuery.data ?? []) as unknown as MemoryRow[];
    return all
      .filter(hasQuickTag)
      .sort(
        (a, b) =>
          +new Date(b.createdAt as string) - +new Date(a.createdAt as string)
      );
  }, [memoriesQuery.data]);

  const filteredMemories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return quickMemories;
    return quickMemories.filter((m) => m.content.toLowerCase().includes(q));
  }, [quickMemories, searchQuery]);

  const handleSave = async () => {
    if (!transcript.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await createMemory.mutateAsync({
        content: transcript.trim(),
        sourceType: "voice_memo",
        tags: [QUICK_TAG],
      });
      toast.success("Saved to Ether");
      setTranscript("");
      await utils.memory.list.invalidate();
    } catch (e) {
      console.error("Failed to save quick memory", e);
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setTranscript("");
  };

  const bigBtnTooltip = !bigSupported
    ? "Voice input not supported in this browser"
    : bigRecording
    ? "Tap to stop"
    : "Tap to capture";

  const hintText = !bigSupported
    ? "Voice input is not available in this browser"
    : bigRecording
    ? "Listening… speak now"
    : "Tap to capture a thought";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6">
      <div className="max-w-2xl mx-auto">
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
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-7 h-7 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">Quick Memory</h1>
          </div>
          <p className="text-slate-400">Capture a thought before it's gone.</p>
        </div>

        {/* Recall search */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <Input
            placeholder="Recall a memory…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-12 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
          />
          <VoiceInput
            className="absolute right-1 top-1/2 -translate-y-1/2"
            label="Recall by voice"
            onTranscript={(text) =>
              setSearchQuery((prev) => (prev ? prev + " " + text : text))
            }
          />
        </div>

        {/* Big mic button */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative inline-flex">
            {bigRecording && (
              <span
                className="absolute inset-0 rounded-full bg-red-500/40 animate-ping pointer-events-none"
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              onClick={bigToggle}
              disabled={!bigSupported}
              title={bigBtnTooltip}
              aria-label={bigBtnTooltip}
              aria-pressed={bigRecording}
              className={cn(
                "relative z-10 h-24 w-24 rounded-full flex items-center justify-center transition-all shadow-lg",
                bigRecording
                  ? "bg-red-600 hover:bg-red-700 text-white scale-105"
                  : "bg-blue-600 hover:bg-blue-700 text-white",
                !bigSupported && "opacity-40 cursor-not-allowed"
              )}
            >
              {bigRecording ? (
                <Square className="h-10 w-10 fill-current" />
              ) : (
                <Mic className="h-10 w-10" />
              )}
            </button>
          </div>
          <p className="text-slate-400 text-sm mt-4">{hintText}</p>
        </div>

        {/* Transcript card */}
        {transcript && (
          <div className="mb-8 bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-500 mb-2">Transcript</div>
            <p className="text-slate-100 whitespace-pre-wrap mb-4">
              {transcript}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving…" : "Save"}
              </Button>
              <Button
                onClick={handleClear}
                disabled={isSaving}
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Recent quick memories */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            Recent
          </h2>
          <span className="text-xs text-slate-500">
            {filteredMemories.length}{" "}
            {filteredMemories.length === 1 ? "memory" : "memories"}
          </span>
        </div>

        <ScrollArea className="h-[40vh]">
          <div className="space-y-2 pr-2">
            {memoriesQuery.isLoading ? (
              <div className="text-center text-slate-500 text-sm py-8">
                Loading…
              </div>
            ) : filteredMemories.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-8">
                {searchQuery.trim().length > 0
                  ? `No matches for "${searchQuery.trim()}"`
                  : "No quick memories yet. Tap the mic to capture your first one."}
              </div>
            ) : (
              filteredMemories.map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3"
                >
                  <div className="text-xs text-slate-500 mb-1">
                    {formatDistanceToNow(new Date(m.createdAt as string), {
                      addSuffix: true,
                    })}
                  </div>
                  <p className="text-sm text-slate-200 line-clamp-3 whitespace-pre-wrap">
                    {m.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
