#!/usr/bin/env node
/**
 * One-off: regenerate user 1's Level 2 with the new Phase 2 prompt.
 * - Deletes user 1's existing L2 rows from interview_questions_v2
 * - Resets user 1's L2 interview_levels row to in_progress + startedAt=now
 * - Calls generateLevelQuestions(1, 2) via dynamic import of the tsx-compiled module
 * - Reports the resulting questions + the audit log row
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const USER_ID = 1;
const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = postgres(process.env.DATABASE_URL, {
  connect_timeout: 20, max: 1, idle_timeout: 5,
});

async function main() {
  // 1. Delete existing L2 rows
  const deleted = await sql`
    DELETE FROM interview_questions_v2
    WHERE user_id = ${USER_ID} AND level = 2
    RETURNING id
  `;
  console.log(`Deleted ${deleted.length} existing L2 rows for user ${USER_ID}`);

  // 2. Reset L2 level row
  await sql`
    UPDATE interview_levels
    SET status = 'in_progress', started_at = now(), completed_at = NULL
    WHERE user_id = ${USER_ID} AND level = 2
  `;
  console.log(`Reset L2 interview_levels row → in_progress`);

  // 3. Call generateLevelQuestions via child node process with tsx.
  // We can't easily import TS from .mjs, so spawn a tsx process.
  await sql.end();

  const { execSync } = await import("child_process");
  const trigger = `
    import('./server/routers/interviewMode.ts').then(async (m) => {
      console.log('Starting generation...');
      await m.generateLevelQuestions(${USER_ID}, 2);
      console.log('Generation complete.');
    });
  `;
  execSync(`npx tsx --env-file=.env -e "${trigger.replace(/\n/g, " ")}"`, {
    stdio: "inherit",
    cwd: join(__dirname, ".."),
  });

  // 4. Report
  const sql2 = postgres(process.env.DATABASE_URL, {
    connect_timeout: 20, max: 1, idle_timeout: 5,
  });

  const questions = await sql2`
    SELECT order_index, question, layer, helper_text,
           example_answers::text as ex_raw
    FROM interview_questions_v2
    WHERE user_id = ${USER_ID} AND level = 2
    ORDER BY order_index
  `;
  console.log(`\n${'='.repeat(70)}\nNEW L2 QUESTIONS (${questions.length})\n${'='.repeat(70)}`);
  questions.forEach((q) => {
    console.log(`\n[Q${q.order_index}] (${q.layer})`);
    console.log(`  Q: ${q.question}`);
    console.log(`  helperText: ${(q.helper_text || "(null)").slice(0, 160)}`);
    const ex = q.ex_raw ? JSON.parse(q.ex_raw) : [];
    const exArr = Array.isArray(ex) ? ex : (typeof ex === "string" ? JSON.parse(ex) : []);
    console.log(`  examples (${exArr.length}):`);
    exArr.forEach((e, i) => console.log(`    ${i + 1}. ${String(e).slice(0, 140)}...`));
  });

  const log = await sql2`
    SELECT id, valid_count, rejected_count, rejection_notes,
           error, LENGTH(prompt) as prompt_len, LENGTH(response) as response_len,
           created_at
    FROM interview_generation_logs
    WHERE user_id = ${USER_ID} AND level = 2
    ORDER BY created_at DESC
    LIMIT 1
  `;
  console.log(`\n${'='.repeat(70)}\nGENERATION LOG\n${'='.repeat(70)}`);
  if (log.length > 0) {
    const l = log[0];
    console.log(`  id:             ${l.id}`);
    console.log(`  created_at:     ${l.created_at}`);
    console.log(`  valid_count:    ${l.valid_count}`);
    console.log(`  rejected_count: ${l.rejected_count}`);
    console.log(`  rejection_notes: ${JSON.stringify(l.rejection_notes)}`);
    console.log(`  error:          ${l.error || "(none)"}`);
    console.log(`  prompt length:  ${l.prompt_len} chars`);
    console.log(`  response length: ${l.response_len} chars`);
  } else {
    console.log("  (no log row found — investigate)");
  }

  await sql2.end();
}

main().catch((e) => {
  console.error("REGEN FAIL:", e);
  process.exit(1);
});
