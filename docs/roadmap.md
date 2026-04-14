# Ether — Roadmap

---

## Phase 1: Core App (Complete)

### Graph Memory Architecture
- [x] `memory_nodes` table with UUID PK, node_type enum (11 types), halliday_layer enum (5 layers), vector(1024) embedding column, jsonb metadata
- [x] `memory_edges` table with source/target UUID foreign keys, relationship_type, strength (0-1)
- [x] pgvector extension enabled, HNSW index on embeddings for approximate nearest neighbor search
- [x] 6 database indexes (user_id, node_type, halliday_layer, embedding HNSW, edge source, edge target)

### Venice AI Integration
- [x] Chat completions via OpenAI-compatible API (`server/graphPipeline.ts`, `server/personaEngine.ts`)
- [x] `include_venice_system_prompt: false` enforced on all requests
- [x] Embeddings via `text-embedding-bge-m3` at 1024 dimensions (`server/embeddingService.ts`)
- [x] Batch embedding support for bulk node processing

### Entity Extraction + Embedding Pipeline
- [x] `processContent(userId, content, sourceType)` fire-and-forget pipeline (`server/graphPipeline.ts`)
- [x] LLM-based entity extraction returning `{ name, node_type, halliday_layer, summary }`
- [x] Fuzzy node resolution — matches existing nodes by name before creating new ones
- [x] Edge proposal — Venice generates typed relationships with strength values
- [x] Embedding generation for all new/updated nodes
- [x] Retry logic: 1 retry with 3s delay on pipeline failure

### Graph-Aware RAG
- [x] Vector search via pgvector cosine similarity, returns top-5 nodes (`server/personaEngine.ts`)
- [x] 2-hop BFS traversal from vector hits through memory_edges
- [x] Dedup and rank: combined score = `vectorSimilarity * 0.6 + edgeStrength * 0.3 + recency * 0.1`
- [x] Context block grouped by halliday_layer for system prompt injection

### Halliday Interview Flow
- [x] 145 questions across 5 identity layers (voice_and_language, memory_and_life_events, reasoning_and_decisions, values_and_beliefs, emotional_patterns)
- [x] Per-layer progress tracking (`halliday_progress` table)
- [x] tRPC procedures: getQuestions, submitResponse, getProgress
- [ ] **Seed Halliday questions** — `seed-halliday.mjs` script exists but needs to be run against production DB

### Persona Chat
- [x] RAG pipeline feeds ranked context into Venice LLM with persona system prompt (`server/personaEngine.ts`)
- [x] `buildPersonaSystemPrompt(userId)` fetches user values, reasoning patterns, voice style
- [x] Truthfulness tags on every response: Known Memory (green), Likely Inference (amber), Speculation (red)
- [x] Confidence score and source memory reference per tag

### Supabase Auth
- [x] Client-side `signUp()` / `signInWithPassword()` via `@supabase/supabase-js`
- [x] Server-side Bearer token verification in `createContext()`
- [x] Auto-provisioning: `upsertUser()` creates user row on first authenticated request
- [x] `protectedProcedure` middleware throws UNAUTHORIZED if no user in context
- [x] `adminProcedure` middleware for admin-only operations

### Infrastructure
- [x] Centralized ENV handling (`server/_core/env.ts`) with lazy validation
- [x] Structured tRPC error logging on all procedures (`server/_core/trpc.ts`)
- [x] `GET /health` endpoint with DB connectivity check (`server/_core/index.ts`)
- [x] SPA catch-all safely skips `/api/*` and `/health` in both dev and production
- [x] Rate limiting: in-memory sliding-window, applied to `memory.create` (20/min)
- [x] Access control: three levels (full, restricted, legacy_only) for beneficiary access

### Other
- [x] Image uploads on Daily Reflection — Supabase Storage bucket `reflections`, 5MB limit, JPEG/PNG/WebP
- [x] Tweet drafting tool (`x-agent/`) — 5 style formats, git commit reader, post history tracking, founder-voice prompt
- [x] Landing page live at `ether-landing-kappa.vercel.app`
- [ ] **Railway deployment** — stalled on DB password propagation delay
- [ ] **Add OPENAI_API_KEY** — for benchmarking persona accuracy against GPT-4o

---

## Phase 2: Onboarding, Companion & Voice (Current)

### 7-Step Onboarding Flow (Done)
- [x] Intent split screen: "Build my digital mind" vs "Just exploring" (`client/src/pages/Onboarding.tsx`)
- [x] 7 questions mapping to node types and halliday layers (name → concept/voice, home → place/memory, occupation → concept/reasoning, people → person/memory, belief → belief/values, secret → memory/emotional, voice → concept/voice)
- [x] Each answer creates memory_node + fires processContent() for entity extraction + embedding
- [x] Step 1 sets profile headline, Step 7 saves voiceStyle to profile
- [x] tRPC procedures: `onboarding.status`, `onboarding.submitStep`, `onboarding.complete`

### Answer Depth Meter (Done)
- [x] Color-coded quality indicator based on character count (`client/src/pages/Onboarding.tsx`)
- [x] Four levels: red (<20 chars "Keep going..."), amber (20-79 "Good start"), green (80-199 "Great depth"), emerald (200+ "Rich detail")
- [x] Contextual hints per step (e.g., Step 2: "Not just the place — what makes it home?")

### Digital Mind Reveal Card (Done)
- [x] Glassmorphism profile card shown after all 7 steps (`client/src/pages/Onboarding.tsx`)
- [x] Displays: name, location (MapPin), occupation (Briefcase), core value (Compass), voice badge (Zap)
- [x] "Foundation: 7 memories captured" tagline
- [x] Two CTAs: "Go Deeper" → `/halliday`, "Start Capturing" → `/quick`
- [x] `onboarding_complete` set only on CTA click (ensures user sees the reveal)

### Auth Redirect Flow (Done)
- [x] Register → `/onboarding` (`client/src/pages/Register.tsx`)
- [x] Login → `/dashboard` (`client/src/pages/Login.tsx`)
- [x] Home (`/`) → `/dashboard` for authenticated users (`client/src/pages/Home.tsx`)
- [x] AuthGuard checks `onboarding_complete` and redirects to `/onboarding` if false (`client/src/components/AuthGuard.tsx`)

### Companion Agent Phase 1 — Static Comments (Done)
- [x] CompanionProvider: React context, localStorage persistence, auto-dismiss, idle detection (`client/src/companion/CompanionProvider.tsx`)
- [x] CompanionBubble: floating UI with speech bubble + Brain avatar, fade transitions (`client/src/companion/CompanionBubble.tsx`)
- [x] Trigger engine: page triggers, mutation triggers, idle trigger (`client/src/companion/companionTriggers.ts`)
- [x] Comment bank: 13 trigger types, 4 comments each, 52 total (`client/src/companion/companionComments.json`)
- [x] Rate limiting: 3-minute minimum between comments, input-focus guard
- [x] Integration: Dashboard toggle, DailyReflection, QuickMemory, HallidayInterview, BeneficiaryManagement all call `notifyMutation()`

### Companion Agent Phase 2 — AI-Generated Comments (TODO)
- [ ] Venice AI integration for contextual comment generation
- [ ] Context-aware prompts using current page, recent user actions, and memory graph state
- [ ] Fallback to static comments if Venice API is slow or unavailable
- [ ] Cost control: batch or cache generated comments, don't call Venice on every trigger
- [ ] Tone calibration: companion should feel supportive, not intrusive — test with real usage patterns

### ElevenLabs Voice Cloning (TODO)
- [ ] ElevenLabs API integration for text-to-speech
- [ ] Voice cloning flow: user records voice samples, creates a custom voice model
- [ ] Persona chat audio output: AI responses spoken in user's cloned voice
- [ ] Voice sample storage in Supabase Storage
- [ ] Playback UI in PersonaChat page

### Identity Layers Visualization (TODO)
- [ ] Visual representation of the 5 halliday layers and their completion levels
- [ ] Graph visualization showing memory_nodes and memory_edges relationships
- [ ] Layer-specific views: drill into voice, memory, reasoning, values, emotional data
- [ ] Progress indicators showing how "complete" each layer is based on node count and coverage

### UI/UX Refinement Pass (TODO)
- [ ] Responsive design audit (currently desktop-focused)
- [ ] Loading states and skeleton screens for all data-fetching pages
- [ ] Error handling UI: user-facing error messages for tRPC failures
- [ ] Accessibility audit: keyboard navigation, screen reader support, color contrast
- [ ] Animation polish: page transitions, micro-interactions
- [ ] Mobile navigation pattern (hamburger menu or bottom nav)

---

## Phase 3: Scale

### Multi-User Support
- [ ] User isolation audit: verify all queries filter by userId
- [ ] Rate limiting per user (currently per request identifier)
- [ ] Usage quotas: API calls per user per day/month
- [ ] Admin dashboard: user management, usage metrics
- [ ] Abuse prevention: content moderation on stored memories

### Data Export / Identity Portability
- [ ] Full data export: all memory_nodes, memory_edges, embeddings, interview responses
- [ ] Export formats: JSON (machine-readable), PDF (human-readable summary)
- [ ] Import from export: allow users to migrate between Ether instances
- [ ] GDPR compliance: right to deletion, right to data portability
- [ ] Data encryption at rest for sensitive memory content

### API Access for Third Parties
- [ ] Public API for querying a user's persona (with user consent)
- [ ] API key management and rate limiting
- [ ] OAuth2 scopes: read-only, persona-chat, full-access
- [ ] API documentation and developer portal
- [ ] Webhook support: notify third parties when new memories are added

### Beneficiary Access (Full Flow)
- [ ] Invite token generation and email delivery
- [ ] Token-based registration for beneficiaries
- [ ] Access level enforcement on all memory queries (full, restricted, legacy_only)
- [ ] Beneficiary-specific persona chat: AI responds as the user, filtered by access level
- [ ] Revocation flow: user can revoke beneficiary access
- [ ] Audit log: track what beneficiaries access and when

---

> Update checkboxes as things ship. Add new items under the right phase.
