# Ether — Architecture Decisions

Format: Date → Decision → Reasoning (keep it tight)

---

## LLM Provider
**Venice AI is primary.** Chosen for persona authenticity and privacy. OpenAI kept as future benchmark only. Every Venice request must include `venice_parameters: { include_venice_system_prompt: false }` to protect Ether's persona prompts.

## Database
**PostgreSQL via Supabase.** Migrated from MySQL. pgvector extension enabled for embedding storage and similarity search.

## Embeddings
**BGE-M3 at 1024 dimensions.** HNSW indexing for fast approximate nearest neighbor search.

## Knowledge Graph
**memory_nodes + memory_edges tables.** Graph-aware RAG uses 2-hop BFS traversal to pull related context before generating responses.

## Onboarding
**7-step conversational flow with graph pipeline.** Each answer creates a memory_node and fires processContent() for entity extraction + embedding. Intent split screen lets users skip if they want. Companion moment after the vulnerable step (secret memory). Digital Mind reveal card at the end — onboarding_complete only set when user clicks a CTA to leave.

## Companion Agent
**Phase 1 is static comments only.** No AI calls. Pre-written comment bank (56 comments across 14 trigger types) with rate limiting (3min cooldown), idle detection (10min), input-focus guard, and localStorage opt-out. Wrapped inside AuthGuard so it only runs for authenticated users. Phase 2 will add Venice-generated comments.

## Auth Redirect Flow
**Register → /onboarding, Login → /dashboard, Home (/) → /dashboard for auth users.** AuthGuard checks onboarding_complete via tRPC query and redirects to /onboarding if false. Home page is marketing-only for unauthenticated visitors.

## Voice
**ElevenLabs confirmed for Phase 2.** Not yet implemented.

## Landing Page
**Single React JSX artifact** deployed to Vercel. Dark theme (#080b14), blue accent (#3b82f6), Sora + Source Serif 4 fonts, glassmorphism cards.

## Build Approach
**AI-first development.** Claude Code for execution, Claude.ai chat for architecture. No traditional developers — ship fast, iterate with AI tools.

---

> Add new decisions above the line. Keep entries short.
