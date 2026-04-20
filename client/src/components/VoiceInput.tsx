import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Browser API typing — non-standard, webkit prefix on Chrome/Edge/Safari, plain
// on some Chromium builds. Firefox does not implement it at all.

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
    length: number;
  }>;
};

function getRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: shared recording state machine

export function useVoiceRecognition({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}): {
  isRecording: boolean;
  supported: boolean;
  interimText: string;
  toggle: () => void;
} {
  const [isRecording, setIsRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Cumulative final transcript committed so far, across all onresult events
  // in the current recognition session. Used to emit only the *new* suffix on
  // each event — some browsers re-send previously-finalized results with
  // resultIndex stuck at 0, which would otherwise duplicate ("I I always I always say...").
  const committedFinalRef = useRef("");

  // Keep a ref to the latest callback so recognition handlers don't capture
  // a stale closure when the parent re-renders with a new function identity.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      toast.error("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    committedFinalRef.current = "";

    recognition.onresult = (event) => {
      // Walk the full results array (not just from resultIndex) and build the
      // cumulative final transcript. Some browsers re-emit finalized results
      // on every event with resultIndex=0, so trusting resultIndex alone causes
      // the whole phrase to be appended repeatedly. Emit only the new suffix
      // beyond what we've already committed this session.
      let fullFinal = "";
      let interimChunk = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          fullFinal += result[0].transcript;
        } else {
          interimChunk += result[0].transcript;
        }
      }

      // Dedup against two Android/Samsung Chrome quirks:
      //   1. "Flicker" events where previously-final results briefly reappear
      //      as interim (fullFinal=""). Must not reset committed — otherwise
      //      the next growth re-emits the entire phrase.
      //   2. "Revisions" where the recognizer retroactively rewrites an earlier
      //      final (e.g. "last night" → "the last night"). Since we've already
      //      emitted the older version, emitting the revised text duplicates.
      //      Silently advance the baseline instead so subsequent growth is
      //      relative to the new text (accepts minor word loss over dup noise).
      const committed = committedFinalRef.current;
      let newFinal = "";
      if (fullFinal.length > committed.length) {
        if (fullFinal.startsWith(committed)) {
          // Clean monotonic growth — emit the suffix.
          newFinal = fullFinal.slice(committed.length);
        }
        // else: revised (diverged but longer). Don't emit, just rebaseline.
        committedFinalRef.current = fullFinal;
      }
      // else: shorter or equal to committed → flicker/repeat → ignore entirely.

      const trimmedFinal = newFinal.trim();
      if (trimmedFinal.length > 0) {
        onTranscriptRef.current(trimmedFinal);
      }
      setInterimText(interimChunk);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        toast.error("Microphone permission denied.");
      } else if (
        event.error !== "no-speech" &&
        event.error !== "aborted"
      ) {
        toast.error(`Voice input error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText("");
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start speech recognition", err);
      toast.error("Could not start voice input.");
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    if (isRecording) stop();
    else start();
  }, [isRecording, start, stop]);

  return { isRecording, supported, toggle, interimText };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component: small inline ghost button for textarea/input adjacency

type VoiceInputProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  /** Tooltip / aria-label for the idle state. Defaults to "Voice input". */
  label?: string;
  /** Fires whenever the user clicks the mic button (before recording starts/stops).
   *  Used by consumers that want to react to user intent even before a transcript arrives —
   *  e.g. stopping a typing-placeholder animation on first mic press. */
  onToggle?: () => void;
};

export function VoiceInput({
  onTranscript,
  disabled,
  className,
  label = "Voice input",
  onToggle,
}: VoiceInputProps) {
  const { isRecording, supported, toggle, interimText } = useVoiceRecognition({
    onTranscript,
  });

  const handleClick = () => {
    onToggle?.();
    toggle();
  };

  const isDisabled = disabled || !supported;
  const tooltip = !supported
    ? "Voice input not supported in this browser"
    : isRecording
    ? "Stop recording"
    : label;

  return (
    <div className={cn("relative inline-flex", className)}>
      {isRecording && interimText && (
        <span
          className="absolute bottom-full right-0 mb-2 w-max max-w-xs px-2.5 py-1.5 rounded-md text-[11px] text-slate-300 italic pointer-events-none whitespace-normal leading-snug"
          style={{
            background: "rgba(8,11,20,0.92)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          aria-live="polite"
        >
          {interimText}
        </span>
      )}
      {isRecording && (
        <span
          className="absolute inset-0 rounded-md bg-red-500/40 animate-ping pointer-events-none"
          aria-hidden="true"
        />
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={handleClick}
        disabled={isDisabled}
        title={tooltip}
        aria-label={tooltip}
        aria-pressed={isRecording}
        className={cn(
          "relative z-10 transition-colors",
          isRecording
            ? "bg-red-600 hover:bg-red-700 text-white"
            : "text-slate-400 hover:text-white hover:bg-slate-700",
          isDisabled && "opacity-40 cursor-not-allowed"
        )}
      >
        {isRecording ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
