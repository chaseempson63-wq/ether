# Ether — Current Status

> **Last updated:** 2026-04-15

## What's Working
- Server boots clean on PostgreSQL/Supabase
- Graph memory architecture (memory_nodes + memory_edges with pgvector HNSW)
- Venice AI LLM integration (llama-3.3-70b)
- Auto entity extraction → node resolution → edge creation → embedding pipeline
- Graph-aware RAG with 2-hop BFS traversal
- Halliday conversational interview flow (145 questions, 5 layers)
- Persona chat with truthfulness tags and rewritten system prompt
- 7-step onboarding flow with depth meter, companion moment, and Digital Mind reveal card
- Companion Agent Phase 1 (static contextual comments, rate-limited, toggleable)
- Supabase Auth (signup, login, server-side token verification, auto-provisioning)
- Centralized ENV handling with fail-fast validation at startup
- Structured tRPC error logging on all procedures
- GET /health endpoint with DB connectivity check
- SPA catch-all safely skips /api/* and /health
- Image uploads on Daily Reflection (Supabase Storage)
- Tweet drafting tool (x-agent) with founder-voice prompt — `npm run draft` from root
- Landing page live at ether-landing-kappa.vercel.app

## In Progress
- Railway deployment (stalled on DB password propagation delay)
- Seed Halliday questions (`seed-halliday.mjs`)

## Blocked
- Railway deploy needs DB password propagation to clear — wait and retry

## Last Session Summary
Built the 7-step onboarding flow (intent split, depth meter, companion moment, Digital Mind reveal card), the Companion Agent Phase 1 (static comments triggered by user actions with 3-min rate limit), fixed the redirect flow so new users land on /onboarding and authenticated users never see the landing page, rewrote the x-agent tweet prompt to match founder voice, and added project docs.
