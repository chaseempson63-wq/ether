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

## Voice
**ElevenLabs confirmed for Phase 2.** Not yet implemented.

## Landing Page
**Single React JSX artifact** deployed to Vercel. Dark theme (#080b14), blue accent (#3b82f6), Sora + Source Serif 4 fonts, glassmorphism cards.

## Build Approach
**AI-first development.** Claude Code for execution, Claude.ai chat for architecture. No traditional developers — ship fast, iterate with AI tools.

---

> Add new decisions above the line. Keep entries short.
