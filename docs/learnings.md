# Ether — Learnings & Gotchas

Things that tripped us up so we don't repeat them. Every entry includes the exact error and the exact fix.

---

## Railway Deployment — DB Password Propagation Delay

**Problem:** After resetting the Supabase database password, Railway deploys fail with a connection error even though the new password is correct in the env vars.

**Root cause:** Supabase's password propagation can lag by several minutes after a reset. The connection string is correct but the password hasn't propagated to all Supabase nodes yet.

**Fix:** Wait 5-10 minutes and retry the deploy. Don't waste time debugging connection strings or Drizzle config — the password just hasn't propagated yet.

---

## Venice AI — System Prompt Injection

**Problem:** Ether's persona prompts get corrupted. The AI responds with Venice's default personality instead of the user's digital mind persona.

**Root cause:** Venice injects its own system prompt by default. If you don't explicitly disable it, the Venice system prompt overrides or conflicts with your custom system prompt.

**Fix:** Every Venice API request must include:
```json
{
  "venice_parameters": {
    "include_venice_system_prompt": false
  }
}
```

**Files affected:** `server/graphPipeline.ts`, `server/personaEngine.ts`, `server/embeddingService.ts`, `x-agent/src/generate.js`. Check all four if persona behavior seems off.

---

## Supabase — MySQL to PostgreSQL Migration

**Problem:** After migrating from MySQL to PostgreSQL via Supabase, schema definitions and queries break with syntax errors.

**Specific differences that bit us:**
```
MySQL                          →  PostgreSQL
-------------------------------------------
AUTO_INCREMENT                 →  SERIAL (or serial())
INT                            →  INTEGER (or integer())
FLOAT                          →  REAL (or real())
JSON                           →  JSONB (or jsonb())
TIMESTAMP                      →  TIMESTAMP WITH TIME ZONE
.onUpdateNow()                 →  Removed (use triggers)
.onDuplicateKeyUpdate()        →  .onConflictDoUpdate()
mysqlTable()                   →  pgTable()
mysqlEnum()                    →  pgEnum() (defined before tables)
```

**In Drizzle ORM specifically:**
```typescript
// MySQL
import { mysqlTable, int, float, json } from "drizzle-orm/mysql-core";

// PostgreSQL
import { pgTable, integer, real, jsonb, serial } from "drizzle-orm/pg-core";
```

**Column naming:** MySQL schema used camelCase column names in the DB. PostgreSQL migration used snake_case. Drizzle schema needs the DB column name as the first argument:
```typescript
// The JS property stays camelCase, but the DB column string is snake_case
userId: integer("user_id").notNull()
```

---

## Supabase — pgvector Extension

**Problem:** `CREATE INDEX ... USING hnsw` fails with "operator class not found" or similar error.

**Fix:** pgvector must be explicitly enabled in the Supabase dashboard before running migrations. Go to Database → Extensions → search "vector" → enable. The migration file (`002_graph_memory.sql`) includes `CREATE EXTENSION IF NOT EXISTS vector;` but this only works if the extension is available.

---

## ENV Validation vs Tests — Module Import Crash

**Problem:** Any test that imports a file that imports `server/db.ts` crashes immediately:
```
Error: Missing required environment variables: DATABASE_URL
```

**Root cause:** `validateEnv()` originally ran at module import time (top-level side effect). When vitest imports the module tree, it hits `validateEnv()` which throws because test environments don't have production env vars set.

**Fix:** Make validation lazy. The `ENV` object uses `?? ""` defaults that are safe for import:
```typescript
// server/_core/env.ts
export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  supabaseUrl: process.env.VITE_SUPABASE_URL ?? "",
  // ... all with ?? "" defaults
};

// validateEnv() is a separate function, called explicitly at server startup only
export function validateEnv() {
  const missing: string[] = [];
  if (!ENV.databaseUrl) missing.push("DATABASE_URL");
  if (!ENV.supabaseUrl) missing.push("VITE_SUPABASE_URL");
  // ...
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
```

In `server/_core/index.ts`, `validateEnv()` is called at the top of the `startServer()` function — not at module level.

---

## SPA Catch-All vs Server Routes — Route Swallowing

**Problem:** `/health` returns HTML instead of JSON. `/api/trpc/*` requests return 200 with HTML content instead of tRPC responses.

**Root cause:** Express `app.use("*")` catch-alls in both the Vite dev middleware (`setupVite`) and the production static file handler (`serveStatic`) match every request, including server routes. They serve `index.html` for everything.

**Fix:** Add explicit guards at the top of both catch-all handlers:
```typescript
// In both setupVite() and production static handler
app.use("*", (req, res, next) => {
  const url = req.originalUrl;
  if (url.startsWith("/api/") || url === "/health") {
    next();
    return;
  }
  // ... serve index.html for everything else
});
```

**Important:** This guard must be in **both** the dev (Vite middleware) and production (static files) catch-alls. Missing either one means routes work in dev but break in prod, or vice versa.

---

## React 19 — useRef Without Initial Argument

**Problem:** TypeScript error in `CompanionProvider.tsx`:
```
TS2554: Expected 1 arguments, but got 0.
```
On this line:
```typescript
const dismissTimer = useRef<ReturnType<typeof setTimeout>>();
```

**Root cause:** React 19 tightened the `useRef` type signature. `useRef<T>()` without an initial argument now requires the type to include `undefined`. In React 18, this was silently allowed.

**Fix:** Always pass an explicit initial value:
```typescript
const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
```

This applies everywhere `useRef` is used without an initial value. Check for this pattern when upgrading to React 19.

---

## Auth Redirect — Register Lands on Marketing Page

**Problem:** New users register successfully but land on the home page (`/`) which shows the marketing landing page instead of the app.

**Root cause:** `Register.tsx` had `window.location.href = "/"` after successful `signUp()`. The home page component rendered marketing content for all users, not just unauthenticated ones.

**Three fixes applied together:**
1. `Register.tsx`: Changed redirect from `"/"` to `"/onboarding"`
2. `Login.tsx`: Changed redirect from `"/"` to `"/dashboard"`
3. `Home.tsx`: Added `if (isAuthenticated) { setLocation("/dashboard"); return null; }` at the top
4. `AuthGuard.tsx`: Added `trpc.onboarding.status` query that redirects to `/onboarding` if `onboardingComplete === false`

**Edge case:** Existing users who registered before onboarding was built needed their `onboarding_complete` column set to `true` manually, or they'd get stuck in an onboarding loop:
```sql
UPDATE profiles SET onboarding_complete = true WHERE id IN (1, 2, 3);
```

---

## Drizzle — prepare: false for Supabase Pooler

**Problem:** Database queries fail intermittently with errors about prepared statements when using Supabase's connection pooler in transaction mode.

**Root cause:** Supabase's connection pooler (PgBouncer in transaction mode) doesn't support prepared statements because connections are shared across clients.

**Fix:** Pass `prepare: false` to the postgres client:
```typescript
const client = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(client);
```

---

## Claude Code Sessions — Context Overflow

**Problem:** Claude Code gets stuck in approval loops or loses track of what it's doing mid-refactor.

**Patterns we've seen:**
- Asks for the same permission more than twice → stop and redirect with a clearer instruction
- Context fills up on large refactors → use `/compact` proactively before it happens
- Scope investigations narrowly — "look at server/routers.ts lines 50-100" beats "look at the routing"

**Fix:** If CC asks for permission more than twice on the same thing, stop the loop and give a more specific instruction. Use `/compact` before large tasks, not after context is already full. Scope file reads to specific line ranges.

---

## X-Agent — Root Script Delegation

**Problem:** `npm run draft` from the repo root fails with "script not found". The draft/thought scripts only exist in `x-agent/package.json`.

**Fix:** Added delegation scripts to root `package.json`:
```json
{
  "scripts": {
    "draft": "node x-agent/src/draft.js",
    "thought": "node x-agent/src/draft.js"
  }
}
```

Both scripts point to the same entrypoint — `draft.js` accepts an optional thought argument. When called without args, it reads recent git commits. When called with a string arg, it treats it as a raw thought to turn into a tweet.

---

## Onboarding — Completion Timing

**Problem:** Users who complete step 7 of onboarding never see the Digital Mind reveal card because `onboarding_complete` is set immediately after the last answer, and `AuthGuard` redirects them to `/dashboard`.

**Fix:** Moved the `completeOnboarding` mutation call from after step 7 to the reveal card CTA click handlers ("Go Deeper" and "Start Capturing"). This ensures the reveal card is the last thing users see before `onboarding_complete` is set to true and they enter the app.

---

## Pre-Existing TypeScript Errors (Not From Our Changes)

These errors exist in the codebase but are not blocking and were verified as pre-existing:

1. **`DashboardLayout.tsx`** — `Property 'name' does not exist on type 'User'`. The User type from Supabase doesn't have a `name` property.
2. **`graphPipeline.ts`** — `Type 'IterableIterator<...>' can only be iterated through when using the '--downlevelIteration' flag`. Map iteration needs `downlevelIteration: true` in tsconfig or a `for...of` refactor.
3. **`rateLimit.ts`** — Same Map iteration issue + implicit `any` type on a parameter.

These don't prevent the server from running (tsx handles them at runtime) but would fail a strict `tsc --noEmit` check.

---

> Add new learnings as they come up. Be specific — include the fix, not just the problem.
