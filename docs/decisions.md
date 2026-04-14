# Ether — Architecture Decisions

Format: Decision → Reasoning → Alternatives considered → Key implementation details

---

## LLM Provider: Venice AI (llama-3.3-70b)

**Why:** Persona authenticity and privacy. Venice doesn't log prompts or train on user data, which matters when users are sharing deeply personal memories, beliefs, and emotional patterns. The platform stores the most intimate details of someone's identity — the LLM provider can't be one that mines that data.

**Alternatives considered:**
- **OpenAI GPT-4o** — Better raw capability, but logs prompts and trains on data by default. Privacy policy incompatible with Ether's promise. Kept as a future benchmarking option only (roadmap item: add `OPENAI_API_KEY` for accuracy comparisons).
- **Anthropic Claude** — Strong privacy stance but more expensive at scale. No self-hosted option.
- **Local models** — Too slow for real-time chat. Would need GPU infrastructure.

**Key rule:** Every Venice API request must include `venice_parameters: { include_venice_system_prompt: false }`. If omitted, Venice injects its own system prompt which corrupts Ether's carefully crafted persona prompts. This is enforced in both the main server (`server/graphPipeline.ts`, `server/personaEngine.ts`, `server/embeddingService.ts`) and the x-agent (`x-agent/src/generate.js`).

---

## Database: PostgreSQL via Supabase

**Why:** Needed PostgreSQL specifically for pgvector (embedding storage + cosine similarity search). Supabase provides managed PostgreSQL with built-in auth, storage buckets, and row-level security — all things Ether needs — without running separate services.

**Alternatives considered:**
- **MySQL/TiDB** — Original choice. Migrated away because MySQL has no native vector extension. Would have needed a separate vector store (Pinecone, Weaviate) adding complexity and latency.
- **Pinecone + MySQL** — Split storage: MySQL for relational, Pinecone for vectors. More operational complexity, harder to do joins between graph nodes and their embeddings.
- **Neon** — Serverless PostgreSQL with pgvector support. Viable but Supabase's auth + storage + RLS bundle was more valuable than Neon's serverless scaling (Ether is single-user for now).
- **SQLite + sqlite-vec** — Too limited for production. No concurrent access, no managed hosting.

**Migration note:** MySQL → PostgreSQL required schema adjustments. MySQL syntax doesn't transfer directly — `AUTO_INCREMENT` → `SERIAL`, `JSON` → `JSONB`, `FLOAT` → `REAL`, enum handling differs (pgEnum vs inline). See learnings.md for specifics.

---

## Embeddings: BGE-M3 at 1024 Dimensions

**Why:** BGE-M3 is multilingual, handles long documents well, and produces high-quality embeddings at 1024 dimensions — a good balance between accuracy and storage/compute cost. Venice AI hosts it, so no separate embedding service needed.

**Alternatives considered:**
- **OpenAI text-embedding-3-large (3072d)** — Higher dimensional but 3x the storage per vector. Marginal quality gain doesn't justify the cost at Ether's scale. Also ties embeddings to OpenAI's infrastructure.
- **OpenAI text-embedding-3-small (1536d)** — Good middle ground but same vendor lock-in concern.
- **Sentence-transformers (self-hosted)** — Would need GPU hosting. Not worth the infrastructure overhead for a solo founder.

**Implementation:** `server/embeddingService.ts` calls Venice's OpenAI-compatible `/embeddings` endpoint. HNSW index on the `embedding` column in `memory_nodes` enables fast approximate nearest neighbor search via `supabase/migrations/002_graph_memory.sql`.

---

## Knowledge Graph: memory_nodes + memory_edges

**Why:** A person's identity isn't a flat list of facts — it's a web of connections. Your mother (person node) is connected to your hometown (place node) which is connected to your core memory of learning to cook (event node) which shaped your belief about family (belief node). Graph structure captures these relationships. Flat vector search alone misses the connections.

**Alternatives considered:**
- **Neo4j** — Purpose-built graph database. Overkill for current scale, adds another service to manage, and can't do vector search natively (would still need pgvector).
- **Flat memory table + vector search only** — Simpler but loses relationship context. A query about "your mother" would only find nodes that mention "mother" directly, not the connected memories about home, cooking, family values.
- **JSON document store** — No graph traversal capability. Would have to materialize relationships in application code.

**How it works:** `memory_nodes` stores entities with embeddings. `memory_edges` stores typed relationships (taught_by, influenced_by, reminds_of, etc.) with strength values (0-1). The persona engine does 2-hop BFS from vector search hits to pull in related context before generating responses. Combined scoring: `vectorSimilarity * 0.6 + edgeStrength * 0.3 + recency * 0.1`.

---

## Onboarding: 7-Step Conversational Flow with Graph Pipeline

**Why:** Users need to seed their digital mind with foundational identity data before the AI persona can be useful. A cold start with zero memories produces generic responses. The 7 steps cover each identity layer so the first persona chat already has meaningful context to draw from.

**Alternatives considered:**
- **Skip onboarding, let users add memories organically** — Cold start problem. First persona chat would be useless. Users would bounce before seeing value.
- **Long-form questionnaire** — Feels like a form, not a conversation. Lower completion rates. Doesn't match the intimate, personal nature of the data being collected.
- **Import from social media** — Privacy concerns (ironic for a privacy-focused platform). Also, social media posts are performative — they don't represent who someone actually is.

**Implementation details:**
- Each answer creates a `memory_node` with the appropriate `nodeType` and `hallidayLayer`, then fires `processContent()` for entity extraction + embedding generation.
- Depth meter nudges users toward richer answers (200+ chars = "Rich detail" in emerald).
- Companion moment after step 6 (the vulnerable "secret memory" step) — companion says something supportive before the final voice style question.
- Digital Mind reveal card uses the 7 answers to render a glassmorphism profile summary. `onboarding_complete` only set when user clicks a CTA to leave the reveal card, ensuring they see the payoff.

---

## Companion Agent: Phase 1 Static, Phase 2 AI-Generated

**Why:** Users building their digital mind spend time alone in the app entering personal data. A companion that notices what they're doing and reacts makes the experience feel less transactional. Phase 1 uses pre-written comments to ship fast without AI latency/cost. Phase 2 will use Venice to generate contextual comments.

**Alternatives considered:**
- **No companion** — The app feels cold and utilitarian. Users enter deeply personal data into a silent void.
- **AI companion from day one** — Every comment would cost a Venice API call. Latency would make comments feel sluggish. Risk of AI saying something inappropriate about sensitive memories.
- **Notification system** — Too formal. Push notifications for "you saved a memory" feel like a productivity app, not a companion.

**Phase 1 specifics:** 52 pre-written comments across 13 trigger types. Rate-limited to one comment per 3 minutes. Input-focus guard prevents interrupting while user is typing. Auto-dismiss after 10 seconds. LocalStorage toggle for opt-out.

---

## Auth: Supabase Auth (Client-Side SDK + Server-Side Verification)

**Why:** Supabase Auth is free tier, handles email/password, and integrates with the PostgreSQL database we're already using. Client handles signup/login UI, server verifies the JWT on every tRPC request.

**Alternatives considered:**
- **Manus OAuth** — Original auth system (referenced in CLAUDE.md). Replaced because Supabase Auth is simpler to set up and doesn't require running a separate OAuth server.
- **NextAuth/Auth.js** — Designed for Next.js. Ether uses Express + Vite, not Next.js.
- **Clerk** — Good DX but paid. Supabase auth is free and already in the stack.
- **Custom JWT** — More control but more surface area for security bugs. Not worth it for a solo founder.

**Flow:** Client calls `supabase.auth.signUp()` / `signInWithPassword()`. Session token stored by Supabase client SDK. Every tRPC request sends `Authorization: Bearer <token>`. Server's `createContext()` calls `sdk.authenticateRequest(req)` to verify and extract user. `protectedProcedure` middleware throws `UNAUTHORIZED` if no user in context.

---

## Auth Redirect Flow: Register → /onboarding, Login → /dashboard

**Why:** New users need to complete onboarding before the app is useful. Returning users have already onboarded and should go straight to their dashboard. The home page (`/`) is marketing-only — authenticated users should never see it.

**Three problems this solved:**
1. Register previously redirected to `/` which showed the marketing page, not the app.
2. Login previously redirected to `/` which also showed the marketing page.
3. Home page showed authenticated nav cards that were redundant with the dashboard.

**Implementation:** `Register.tsx` → `window.location.href = "/onboarding"`. `Login.tsx` → `window.location.href = "/dashboard"`. `Home.tsx` → `setLocation("/dashboard")` if authenticated. `AuthGuard` queries `trpc.onboarding.status` and redirects to `/onboarding` if `onboardingComplete === false`.

---

## Voice: ElevenLabs (Confirmed for Phase 2)

**Why:** ElevenLabs has the best voice cloning quality. Users will be able to clone their voice so their AI persona speaks in their actual voice — not just thinks like them but sounds like them.

**Not yet implemented.** Waiting for core identity features to stabilize before adding voice.

---

## Landing Page: Static React on Vercel

**Why:** The landing page needs to load fast and be independently deployable. It doesn't need the full app server. Vercel's free tier handles static hosting well.

**Design:** Dark theme (#080b14 background), blue accent (#3b82f6), Sora + Source Serif 4 fonts, glassmorphism cards. Single JSX artifact — no build pipeline, no framework, just React rendered to static HTML.

**Live at:** `ether-landing-kappa.vercel.app`

---

## Build Approach: AI-First Development

**Why:** Solo founder shipping fast. Claude Code for execution (writing code, debugging, refactoring). Claude.ai chat for architecture (system design, API design, decision-making). No traditional developers — iterate with AI tools, ship daily.

**What this means in practice:**
- Features go from idea to shipped in a single session
- Architecture decisions are made in conversation, then documented in these docs
- Code quality comes from clear specs and AI execution, not code review
- The CLAUDE.md file and docs/ folder are the primary onboarding mechanism — they're how the AI context stays consistent across sessions

---

> Add new decisions above the line. Keep entries short but include the "why" and what was rejected.
