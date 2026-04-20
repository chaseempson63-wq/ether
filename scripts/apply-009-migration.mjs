#!/usr/bin/env node
/**
 * One-off: apply migration 009 (ADD COLUMN label on memory_nodes).
 * Idempotent: uses IF NOT EXISTS. Safe to re-run.
 *
 * Usage:
 *   node --env-file=.env scripts/apply-009-migration.mjs
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "009_memory_node_labels.sql"
);
const migrationSQL = readFileSync(migrationPath, "utf8");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run with `node --env-file=.env ...`");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL, {
    connect_timeout: 20,
    max: 1,
    idle_timeout: 5,
  });

  console.log("Applying migration 009_memory_node_labels.sql...");
  await sql.unsafe(migrationSQL);
  console.log("✓ Applied.");

  // Verify
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'memory_nodes' AND column_name = 'label'
  `;
  if (cols.length === 0) {
    console.error("✗ Verification failed: label column not found");
    process.exit(1);
  }
  console.log(`✓ Verified: memory_nodes.label (${cols[0].data_type}, nullable=${cols[0].is_nullable})`);

  await sql.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
