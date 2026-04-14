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

---

> Add new learnings as they come up. Be specific — include the fix, not just the problem.
