# Ether — Current Status

> **Last updated:** 2025-04-15

---

## What's Working

### Server Core
- **Entry point** (`server/_core/index.ts`): Express server on port 3000 (auto-finds available port if busy). 50MB JSON body limit. tRPC middleware mounted at `/api/trpc`. Vite dev middleware in development, static file serving in production.
- **Health endpoint** (`GET /health`): Runs `SELECT 1` against the database to verify connectivity. Returns `{ status: "ok", db: "connected" }` or `{ status: "ok", db: "disconnected" }`. SPA catch-all explicitly skips `/health` and `/api/*` paths so they don't get swallowed.
- **Centralized ENV** (`server/_core/env.ts`): All `process.env` reads go through a single `ENV` object. `validateEnv()` checks for required vars (`DATABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VENICE_API_KEY`) and throws with a list of missing ones at startup. Uses `?? ""` defaults so importing the module doesn't crash test runners.
- **Structured error logging** (`server/_core/trpc.ts`): `errorLogger` middleware wraps every tRPC procedure. On error, logs structured JSON: `{ procedure, userId, errorCode, errorMessage }`. Separate `publicProcedure`, `protectedProcedure`, and `adminProcedure` base procedures.

### Authentication
- **Supabase Auth** (`client/src/lib/supabase.ts`, `server/_core/context.ts`): Client-side `signUp()`/`signInWithPassword()` via `@supabase/supabase-js`. Server-side: `createContext()` extracts Bearer token from `Authorization` header, verifies via Supabase SDK, attaches user to tRPC context.
- **Auto-provisioning** (`server/db.ts` → `upsertUser()`): On first authenticated request, creates a user row keyed by Supabase `openId`. Uses `.onConflictDoUpdate()` (PostgreSQL upsert).
- **Auth redirect chain** (`client/src/pages/Register.tsx`, `Login.tsx`, `Home.tsx`, `components/AuthGuard.tsx`):
  - Register → `/onboarding`
  - Login → `/dashboard`
  - Home (`/`) → redirects to `/dashboard` if authenticated
  - `AuthGuard` queries `trpc.onboarding.status` and redirects to `/onboarding` if `onboardingComplete === false`

### Graph Memory Architecture
- **Schema** (`drizzle/schema.ts`): `memoryNodes` table — UUID primary key, `userId`, `nodeType` (11 variants: person, place, event, concept, emotion, belief, value, skill, memory, reasoning_pattern, decision), `hallidayLayer` (5 layers: voice_and_language, memory_and_life_events, reasoning_and_decisions, values_and_beliefs, emotional_patterns), `content` (text), `summary` (varchar 500), `embedding` (vector 1024), `metadata` (jsonb), timestamps. `memoryEdges` table — source/target UUID foreign keys, `relationshipType`, `strength` (real, 0-1), `metadata` (jsonb).
- **Supabase migration** (`supabase/migrations/002_graph_memory.sql`): Enables pgvector extension. Creates tables with 6 indexes including HNSW index on embeddings for fast approximate nearest neighbor search.

### Embedding Pipeline
- **Embedding service** (`server/embeddingService.ts`): Uses Venice AI `text-embedding-bge-m3` model, 1024 dimensions. Exports `generateEmbedding(text)` for single texts and `generateEmbeddingsBatch(texts)` for batch processing.
- **Graph pipeline** (`server/graphPipeline.ts`): `processContent(userId, content, sourceType)` — fire-and-forget pipeline:
  1. **Extract entities** — Venice LLM returns JSON array of `{ name, node_type, halliday_layer, summary }`
  2. **Resolve or create nodes** — fuzzy-matches existing nodes by name, creates new ones or merges aliases
  3. **Propose & create edges** — Venice generates relationships (taught_by, influenced_by, etc.) with strength 0-1
  4. **Generate embeddings** — calls `generateEmbedding()` for each new/updated node
  5. Retry logic: 1 retry with 3-second delay on failure

### Graph-Aware RAG & Persona Chat
- **Persona engine** (`server/personaEngine.ts`): Full RAG pipeline:
  1. **Vector search** — cosine similarity via pgvector, returns top-5 nodes
  2. **2-hop BFS traversal** — walks graph edges from vector hits to pull related context (hop1, hop2)
  3. **Dedup & rank** — combined score = `vectorSimilarity * 0.6 + edgeStrength * 0.3 + recency * 0.1`
  4. **Context block** — groups results by `halliday_layer` for the system prompt
- **Truthfulness tags**: Every AI response tagged as `Known Memory` (green), `Likely Inference` (amber), or `Speculation` (red) with confidence score and source reference.
- **System prompt** (`buildPersonaSystemPrompt(userId)`): Fetches user's values, reasoning patterns, voice style to construct a persona-specific system prompt for Venice AI.

### Halliday Interview
- **145 questions across 5 identity layers** (`server/routers.ts` → halliday sub-router): Questions organized by layer, progress tracked per user per layer. Procedures: `getQuestions`, `submitResponse`, `getProgress`.
- **Progress tracking** (`drizzle/schema.ts` → `hallidayProgress`): Per-layer completion percentages, overall accuracy, last question answered timestamp.

### 7-Step Onboarding Flow
- **Onboarding page** (`client/src/pages/Onboarding.tsx`, 458 lines): Four phases — `intent` (split screen: "Build my digital mind" vs "Just exploring"), `steps` (7 questions), `companion` (after step 6, companion moment), `reveal` (glassmorphism Digital Mind card).
- **Step-to-graph mapping** (`server/routers.ts` → `onboarding.submitStep`): Each step maps to a node type and halliday layer:
  - Step 1 (name) → concept / voice_and_language, also sets profile headline
  - Step 2 (home) → place / memory_and_life_events
  - Step 3 (occupation) → concept / reasoning_and_decisions
  - Step 4 (important people) → person / memory_and_life_events
  - Step 5 (core belief) → belief / values_and_beliefs
  - Step 6 (secret memory) → memory / emotional_patterns
  - Step 7 (voice style) → concept / voice_and_language, also saves voiceStyle to profile
- **Depth meter**: Color-coded quality indicator — red (<20 chars), amber (20-79), green (80-199), emerald (200+) with contextual hints per step.
- **Digital Mind reveal card**: Glassmorphism card showing name, location (MapPin icon), occupation (Briefcase), core value (Compass), voice badge (Zap), "Foundation: 7 memories captured". Two CTAs: "Go Deeper" → `/halliday`, "Start Capturing" → `/quick`. `onboarding_complete` set only when user clicks a CTA.

### Companion Agent (Phase 1 — Static Comments)
- **CompanionProvider** (`client/src/companion/CompanionProvider.tsx`): React context managing comment state, enabled/disabled toggle (persisted to `localStorage` key `ether:companion:enabled`), auto-dismiss after 10 seconds, 800ms delay before showing on page change. Global click/keydown/scroll listeners reset idle timer.
- **CompanionBubble** (`client/src/companion/CompanionBubble.tsx`): Fixed position bottom-6 right-6 z-50. Speech bubble (bg-slate-800/90 backdrop-blur) + Brain avatar circle (bg-blue-600/20). Fade in/out via opacity/translate-y transitions. X dismiss button.
- **Trigger engine** (`client/src/companion/companionTriggers.ts`): Three trigger categories:
  - **Page triggers** — dashboard first visit/return, persona chat first, reflection first
  - **Mutation triggers** — memory saved, memory streak (5+), halliday question/layer complete, reflection first/streak (3+), beneficiary first
  - **Idle trigger** — 10+ minutes of no interaction
  - Rate limit: 3-minute minimum between comments. Input-focus guard blocks comments while typing.
- **Comment bank** (`client/src/companion/companionComments.json`): 13 trigger types, 4 comments each (52 total). `pickRandom()` avoids repeating last shown comment per trigger.
- **Integration points**: Dashboard (toggle button), DailyReflection, QuickMemory, HallidayInterview, BeneficiaryManagement — all call `notifyMutation()` after successful operations.

### Other Features
- **Image uploads** (`client/src/pages/DailyReflection.tsx`): Uploads to Supabase Storage bucket `reflections` (5MB limit, JPEG/PNG/WebP). RLS policies restrict access to the uploading user.
- **Tweet drafting tool** (`x-agent/`): `npm run draft` from root. Reads last 48 hours of git commits, generates 5 tweet drafts via Venice AI in founder voice (all lowercase, max 180 chars, no corporate speak). 5 style formats: SHIP IT, NUMBERS, THOUGHT, STRUGGLE, VISION. Post history tracking (`.post-history.json`, max 500 entries) prevents repetition.
- **Rate limiting** (`server/rateLimit.ts`): In-memory sliding-window buckets. `checkRateLimit(key, limit, windowMs)` returns `{ allowed }` or `{ retryAfterMs }`. Auto-cleanup every 5 minutes. Applied to `memory.create` (20/min).
- **Access control** (`server/accessControl.ts`): Three levels — `full`, `restricted`, `legacy_only`. `canAccessMemory()` checks metadata tags. `getMemoriesForBeneficiary()` filters by access level. Ownership verification on all beneficiary operations.
- **Landing page**: Live at `ether-landing-kappa.vercel.app`. Single React JSX artifact, dark theme (#080b14), blue accent (#3b82f6), Sora + Source Serif 4 fonts, glassmorphism cards.

---

## In Progress
- **Railway deployment**: Stalled on DB password propagation delay after Supabase password reset. Config exists but deploy fails on connection.
- **Seed Halliday questions**: `seed-halliday.mjs` script needs to be run against production DB to populate the 145 questions.

## Blocked
- Railway deploy needs DB password propagation to clear — wait and retry before debugging further.

---

## Last Session Summary
Built the 7-step onboarding flow (intent split, depth meter, companion moment, Digital Mind reveal card), the Companion Agent Phase 1 (static comments triggered by user actions with 3-min rate limit and idle detection), fixed the auth redirect chain (Register → /onboarding, Login → /dashboard, Home redirects auth users), rewrote the x-agent tweet prompt to match founder voice with 5 draft formats, and set up project docs (CLAUDE.md + docs/).
