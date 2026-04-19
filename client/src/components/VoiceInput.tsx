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

    recognition.onresult = (event) => {
      // Walk new results since resultIndex; emit finals, accumulate interim for live display.
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript;
        } else {
          interimChunk += result[0].transcript;
        }
      }
      const trimmedFinal = finalChunk.trim();
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
};

export function VoiceInput({
  onTranscript,
  disabled,
  className,
  label = "Voice input",
}: VoiceInputProps) {
  const { isRecording, supported, toggle, interimText } = useVoiceRecognition({
    onTranscript,
  });

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
        onClick={toggle}
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
