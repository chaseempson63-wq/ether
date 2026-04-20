#!/usr/bin/env node
/**
 * One-off: backfill the new `label` column on memory_nodes for every row that
 * doesn't have one yet. Hits Venice once per row (2-3 word ALL CAPS concept
 * label), sanitizes the output, and writes it back.
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-node-labels.mjs
 *
 * Idempotent: selects only rows where label IS NULL or empty, so re-running
 * only fills the gaps from transient Venice failures.
 *
 * Depends on migration 009 (ALTER TABLE memory_nodes ADD COLUMN label text)
 * having been applied. Run scripts/apply-009-migration.mjs first if needed.
 */
import postgres from "postgres";

const VENICE_API_URL = "https://api.venice.ai/api/v1/chat/completions";
const VENICE_MODEL = "llama-3.3-70b";

const SYSTEM_PROMPT =
  "Given a memory, return a 2-3 word ALL CAPS label capturing its core concept. " +
  "No articles. No punctuation. Just the concept. " +
  "Examples: LIVING ABROAD, BROKE MY LEG, FIRST JOB, LOST FAITH, RELATIONSHIP END, " +
  "FAMILY TRAUMA, CAREER PIVOT, SCHOOL BULLYING, MEETING SPOUSE. " +
  "Return ONLY the label, nothing else.";

function sanitizeLabel(raw) {
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

async function labelFor(content) {
  const res = await fetch(VENICE_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.VENICE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VENICE_MODEL,
      max_tokens: 30,
      venice_parameters: { include_venice_system_prompt: false },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: content.slice(0, 800) },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Venice ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content ?? "";
  return sanitizeLabel(raw);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run with `node --env-file=.env ...`");
    process.exit(1);
  }
  if (!process.env.VENICE_API_KEY) {
    console.error("VENICE_API_KEY is not set. Run with `node --env-file=.env ...`");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL, {
    connect_timeout: 20,
    max: 1,
    idle_timeout: 5,
  });

  const rows = await sql`
    SELECT id, content, summary
    FROM memory_nodes
    WHERE label IS NULL OR label = ''
    ORDER BY created_at DESC
  `;

  console.log(`Backfilling ${rows.length} nodes...\n`);

  let done = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (const r of rows) {
    const src = (r.summary || r.content || "").toString();
    if (!src.trim()) {
      failed++;
      console.log(`✗ ${r.id.slice(0, 8)} → empty source`);
      continue;
    }
    try {
      const label = await labelFor(src);
      if (label) {
        await sql`UPDATE memory_nodes SET label = ${label} WHERE id = ${r.id}`;
        done++;
        const total = done + failed;
        console.log(`✓ [${total}/${rows.length}] ${r.id.slice(0, 8)} → ${label}`);
      } else {
        failed++;
        console.log(`✗ ${r.id.slice(0, 8)} → Venice returned nothing`);
      }
    } catch (err) {
      failed++;
      console.log(`✗ ${r.id.slice(0, 8)} → ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s: ${done} labeled, ${failed} failed.`);
  await sql.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
