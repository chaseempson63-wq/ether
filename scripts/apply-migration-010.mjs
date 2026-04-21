import postgres from "postgres";
import { readFileSync } from "fs";
import "dotenv/config";

const sql = postgres(process.env.DATABASE_URL);
try {
  const migration = readFileSync(
    new URL("../supabase/migrations/010_user_achievements.sql", import.meta.url),
    "utf8",
  );
  await sql.unsafe(migration);
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM user_achievements`;
  console.log(`Migration 010 applied. user_achievements rows: ${count}`);
} finally {
  await sql.end();
}
