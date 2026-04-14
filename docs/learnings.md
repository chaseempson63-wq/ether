# Ether — Learnings & Gotchas

Things that tripped us up so we don't repeat them.

---

## Railway Deployment
- DB password propagation can lag after a Supabase password reset. If deploy fails on DB connection, wait and retry before debugging further.

## Venice AI
- Must always pass `include_venice_system_prompt: false` — if omitted, Venice injects its own system prompt which corrupts Ether's persona.

## Supabase
- MySQL → PostgreSQL migration required schema adjustments. Don't assume MySQL syntax works.
- pgvector extension must be explicitly enabled in Supabase dashboard.

## Claude Code Sessions
- CC can get stuck in approval loops — if it asks for permission more than twice on the same thing, stop and redirect.
- Context fills up fast on large refactors. Use `/compact` proactively and scope investigations narrowly.

## ENV Validation vs Tests
- `validateEnv()` originally threw at module import time, which broke any test that imported db.ts. Fix: make validation lazy — ENV object uses `?? ""` defaults safe for import, `validateEnv()` called explicitly at server startup only.

## SPA Catch-All vs Server Routes
- Express `app.use("*")` catch-alls in both dev (setupVite) and production (serveStatic) can swallow server routes like /health and /api/*. Fix: add explicit `if (url.startsWith("/api/") || url === "/health") { next(); return; }` to both catch-alls.

## Drizzle useRef in React 19
- `useRef<T>()` without an initial argument is a TS error in React 19's stricter types. Fix: `useRef<T | undefined>(undefined)`.

## Auth Redirect on Register
- After `supabase.auth.signUp()`, redirecting to `/` lands on the marketing page, not the app. Fix: redirect to `/onboarding` for new users, `/dashboard` for returning users. The AuthGuard on protected routes handles the onboarding check.

---

> Add new learnings as they come up. Be specific — include the fix, not just the problem.
