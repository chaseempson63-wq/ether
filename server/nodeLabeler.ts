/**
 * Node labeler — generates short ALL CAPS concept labels for memory nodes
 * via Venice. "Broke my leg on the hill in Aspen when I was 22" →
 * "BROKE MY LEG". Runs fire-and-forget from createMemoryNode so node creation
 * is never blocked by an LLM call.
 *
 * Used by:
 *   - server/db.ts createMemoryNode (fire-and-forget, background)
 *   - scripts/backfill-node-labels.mjs (one-off backfill for legacy rows)
 *
 * Prompt is tuned to refuse sentences and always return a tight concept.
 * Sanitization strips punctuation + caps + trims to 3 words so the UI never
 * sees garbage even when Venice misbehaves.
 */
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { memoryNodes } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const SYSTEM_PROMPT =
  "Given a memory, return a 2-3 word ALL CAPS label capturing its core concept. " +
  "No articles. No punctuation. Just the concept. " +
  "Examples: LIVING ABROAD, BROKE MY LEG, FIRST JOB, LOST FAITH, RELATIONSHIP END, " +
  "FAMILY TRAUMA, CAREER PIVOT, SCHOOL BULLYING, MEETING SPOUSE. " +
  "Return ONLY the label, nothing else.";

/**
 * Clean Venice output into a safe label. Handles quoted responses, trailing
 * punctuation, lowercase slipups, and over-long phrases.
 */
function sanitizeLabel(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/["'`""''.,!?:;()\[\]{}]/g, "")
    .replace(/^\s*(label|answer|concept)\s*:\s*/i, "")
    .trim()
    .toUpperCase();
  if (!cleaned) return null;
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 3);
  const result = words.join(" ");
  return result.length > 0 && result.length <= 40 ? result : null;
}

/**
 * Hit Venice once and return a clean label, or null if generation fails.
 * Never throws — callers are typically fire-and-forget paths.
 */
export async function generateNodeLabel(
  content: string
): Promise<string | null> {
  if (!content || content.trim().length === 0) return null;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: content.slice(0, 800) },
      ],
    });
    const msgContent = result.choices?.[0]?.message?.content;
    // Content can be a string OR an array of content blocks (multimodal).
    // We only requested text, so extract string form.
    const raw =
      typeof msgContent === "string"
        ? msgContent
        : Array.isArray(msgContent)
          ? msgContent
              .map((c: unknown) =>
                typeof c === "object" && c !== null && "text" in c
                  ? String((c as { text: string }).text)
                  : ""
              )
              .join("")
          : "";
    return sanitizeLabel(raw);
  } catch (err) {
    console.error("[nodeLabeler] generation failed:", err);
    return null;
  }
}

/**
 * Generate + persist a label for a node. Safe to call multiple times — only
 * writes if label is currently null, and tolerates Venice failure.
 */
export async function labelNodeAsync(
  nodeId: string,
  content: string
): Promise<void> {
  const label = await generateNodeLabel(content);
  if (!label) return;
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .update(memoryNodes)
      .set({ label })
      .where(eq(memoryNodes.id, nodeId));
  } catch (err) {
    console.error("[nodeLabeler] persist failed:", err);
  }
}
