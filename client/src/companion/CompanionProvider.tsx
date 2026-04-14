import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  checkPageTrigger,
  checkMutationTrigger,
  checkIdleTrigger,
  resetIdleTimer,
  type TriggerType,
} from "./companionTriggers";

// ─── Context shape ───

interface CompanionComment {
  trigger: TriggerType;
  text: string;
  id: number; // unique per comment for animation key
}

interface CompanionContextValue {
  /** Current comment to display, or null */
  comment: CompanionComment | null;
  /** Whether companion is enabled */
  enabled: boolean;
  /** Toggle companion on/off (persists to localStorage) */
  setEnabled: (enabled: boolean) => void;
  /** Dismiss the current comment */
  dismiss: () => void;
  /** Notify the companion of a successful mutation */
  notifyMutation: (mutationType: string) => void;
}

const CompanionContext = createContext<CompanionContextValue>({
  comment: null,
  enabled: true,
  setEnabled: () => {},
  dismiss: () => {},
  notifyMutation: () => {},
});

export function useCompanion() {
  return useContext(CompanionContext);
}

// ─── Constants ───

const STORAGE_KEY = "ether:companion:enabled";
const AUTO_DISMISS_MS = 10_000;
const IDLE_CHECK_INTERVAL_MS = 60_000;

// ─── Provider ───

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const [comment, setComment] = useState<CompanionComment | null>(null);
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== "false";
    } catch {
      return true;
    }
  });
  const commentIdRef = useRef(0);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [location] = useLocation();
  const prevLocationRef = useRef(location);

  // Persist enabled preference
  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
    if (!value) setComment(null);
  }, []);

  // Show a comment (with auto-dismiss)
  const showComment = useCallback(
    (trigger: TriggerType, text: string) => {
      if (!enabled) return;
      const id = ++commentIdRef.current;
      setComment({ trigger, text, id });

      // Clear previous auto-dismiss
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
      autoDismissRef.current = setTimeout(() => {
        setComment((prev) => (prev?.id === id ? null : prev));
      }, AUTO_DISMISS_MS);
    },
    [enabled]
  );

  // Dismiss current comment
  const dismiss = useCallback(() => {
    setComment(null);
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
  }, []);

  // Notify from mutation (called by pages after tRPC success)
  const notifyMutation = useCallback(
    (mutationType: string) => {
      if (!enabled) return;
      resetIdleTimer();
      const result = checkMutationTrigger(mutationType);
      if (result) showComment(result.trigger, result.comment);
    },
    [enabled, showComment]
  );

  // Track page transitions
  useEffect(() => {
    if (location === prevLocationRef.current) return;
    prevLocationRef.current = location;

    if (!enabled) return;
    resetIdleTimer();

    // Small delay so the page has time to render before showing comment
    const timer = setTimeout(() => {
      const result = checkPageTrigger(location);
      if (result) showComment(result.trigger, result.comment);
    }, 800);

    return () => clearTimeout(timer);
  }, [location, enabled, showComment]);

  // Idle detection — check every 60s
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const result = checkIdleTrigger();
      if (result) showComment(result.trigger, result.comment);
    }, IDLE_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, showComment]);

  // Reset idle timer on any user interaction
  useEffect(() => {
    const handler = () => resetIdleTimer();
    window.addEventListener("click", handler, { passive: true });
    window.addEventListener("keydown", handler, { passive: true });
    window.addEventListener("scroll", handler, { passive: true });
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("scroll", handler);
    };
  }, []);

  return (
    <CompanionContext.Provider
      value={{ comment, enabled, setEnabled, dismiss, notifyMutation }}
    >
      {children}
    </CompanionContext.Provider>
  );
}
