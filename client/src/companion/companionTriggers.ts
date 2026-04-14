import comments from "./companionComments.json";

// ─── Types ───

export type TriggerType = keyof typeof comments;

// ─── Session state (module-level, resets on page reload) ───

const sessionState = {
  visitedPages: new Set<string>(),
  memoriesCreated: 0,
  reflectionsSaved: 0,
  beneficiariesSaved: 0,
  lastCommentTime: 0,
  lastIdleCheck: Date.now(),
  lastShownComments: new Map<TriggerType, string>(),
};

// ─── Constants ───

const MIN_COMMENT_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

// ─── Helpers ───

function pickRandom(trigger: TriggerType): string {
  const pool = comments[trigger];
  if (!pool || pool.length === 0) return "";

  // Avoid repeating the last shown comment for this trigger
  const lastShown = sessionState.lastShownComments.get(trigger);
  const available = pool.filter((c) => c !== lastShown);
  const pick = available.length > 0 ? available : pool;

  const chosen = pick[Math.floor(Math.random() * pick.length)];
  sessionState.lastShownComments.set(trigger, chosen);
  return chosen;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
}

function canShowComment(): boolean {
  if (isInputFocused()) return false;
  const now = Date.now();
  return now - sessionState.lastCommentTime >= MIN_COMMENT_INTERVAL_MS;
}

function markCommentShown(): void {
  sessionState.lastCommentTime = Date.now();
}

// ─── Trigger checks ───

/**
 * Check if a page navigation should trigger a comment.
 * Returns { trigger, comment } or null.
 */
export function checkPageTrigger(
  path: string
): { trigger: TriggerType; comment: string } | null {
  if (!canShowComment()) return null;

  const isFirstVisit = !sessionState.visitedPages.has(path);
  sessionState.visitedPages.add(path);

  let trigger: TriggerType | null = null;

  if (path === "/dashboard") {
    trigger = isFirstVisit ? "DASHBOARD_FIRST_VISIT" : "DASHBOARD_RETURN";
  } else if (path === "/chat" && isFirstVisit) {
    trigger = "PERSONA_CHAT_FIRST";
  } else if (path === "/reflection" && isFirstVisit) {
    trigger = "REFLECTION_FIRST";
  }

  if (!trigger) return null;

  const comment = pickRandom(trigger);
  if (!comment) return null;
  markCommentShown();
  return { trigger, comment };
}

/**
 * Check if a mutation result should trigger a comment.
 * Call this after a tRPC mutation succeeds.
 */
export function checkMutationTrigger(
  mutationType: string
): { trigger: TriggerType; comment: string } | null {
  if (!canShowComment()) return null;

  let trigger: TriggerType | null = null;

  switch (mutationType) {
    case "memory.create": {
      sessionState.memoriesCreated++;
      trigger = sessionState.memoriesCreated >= 5 ? "MEMORY_STREAK" : "MEMORY_SAVED";
      break;
    }
    case "halliday.submitResponse": {
      trigger = "HALLIDAY_QUESTION_COMPLETE";
      break;
    }
    case "halliday.layerComplete": {
      trigger = "HALLIDAY_LAYER_COMPLETE";
      break;
    }
    case "reflection.save": {
      sessionState.reflectionsSaved++;
      trigger = sessionState.reflectionsSaved >= 3 ? "REFLECTION_STREAK" : "REFLECTION_FIRST";
      break;
    }
    case "beneficiary.create": {
      sessionState.beneficiariesSaved++;
      if (sessionState.beneficiariesSaved === 1) {
        trigger = "BENEFICIARY_FIRST";
      }
      break;
    }
    case "persona.goodResult": {
      trigger = "PERSONA_CHAT_GOOD_RESULT";
      break;
    }
    case "persona.poorResult": {
      trigger = "PERSONA_CHAT_POOR_RESULT";
      break;
    }
  }

  if (!trigger) return null;

  const comment = pickRandom(trigger);
  if (!comment) return null;
  markCommentShown();
  return { trigger, comment };
}

/**
 * Check if the user has been idle long enough to trigger a comment.
 * Call this from a periodic timer (e.g. every 60s).
 */
export function checkIdleTrigger(): { trigger: TriggerType; comment: string } | null {
  if (!canShowComment()) return null;

  const now = Date.now();
  const idleMs = now - sessionState.lastIdleCheck;

  // 10+ minutes of no interaction triggers IDLE_LONG
  if (idleMs >= 10 * 60 * 1000) {
    const comment = pickRandom("IDLE_LONG");
    if (!comment) return null;
    markCommentShown();
    return { trigger: "IDLE_LONG", comment };
  }

  return null;
}

/**
 * Reset the idle timer. Call on any user interaction.
 */
export function resetIdleTimer(): void {
  sessionState.lastIdleCheck = Date.now();
}
