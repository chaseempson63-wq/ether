# Ether — Personal Identity AI Platform

## What This Is
Full-stack app that preserves human identity through AI-powered conversational interviews. Users talk to "Halliday" (the interviewer persona), which extracts entities and builds a knowledge graph of who they are.

## Tech Stack
- **Frontend:** React + Vite, Tailwind CSS
- **Backend:** Node.js/Express
- **Database:** PostgreSQL via Supabase (pgvector extension enabled)
- **LLM:** Venice AI (primary) — always set `venice_parameters: { include_venice_system_prompt: false }`
- **Embeddings:** BGE-M3 at 1024 dimensions, HNSW indexing
- **Future:** ElevenLabs voice cloning (Phase 2)

## Architecture
- `memory_nodes` + `memory_edges` tables = knowledge graph
- pgvector HNSW indexing on embeddings
- Auto entity extraction from conversations
- Graph-aware RAG with 2-hop BFS traversal
- Halliday conversational interview flow

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm test` — run tests

## Deployment
- Railway (deployment was in progress, may need DB password propagation check)
- Branch: `claude/unruffled-napier` (commit 95c5326 was last known good)
- Landing page: ether-landing-kappa.vercel.app (Supabase waitlist connected)

## Key Rules
- NEVER use OpenAI as primary LLM — Venice AI is the provider. OpenAI is benchmark-only.
- NEVER include Venice system prompt — always pass `include_venice_system_prompt: false`
- Keep persona prompts protected — Ether's identity layer is sacred
- When compacting, preserve: modified file list, current deployment status, and any failing tests

## Project Docs
See `docs/` folder for:
- `docs/status.md` — current project status (update this at end of each session)
- `docs/decisions.md` — architecture decision log
- `docs/learnings.md` — gotchas and things that tripped us up
- `docs/roadmap.md` — what's next

## Workflow
- This repo uses Claude Code for execution
- Architecture decisions and prompt crafting happen in Claude.ai chat
- If stuck in an approval loop or spinning, STOP and ask for direction
- Prefer small commits with clear messages
