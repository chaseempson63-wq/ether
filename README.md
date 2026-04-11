# Ether — Your Digital Mind. Living Forever.

**Ether** is a legacy memory and reasoning platform that captures your thoughts, decisions, and values so an AI can mirror your voice and reasoning for your beneficiaries after you're gone.

## The Vision

Ether transforms the concept of digital legacy from a static archive into a **living, evolving Digital Mind**. Every memory you capture, every decision you log, and every value you express teaches the AI to think like you. When you're gone, your beneficiaries don't just read your words—they can have conversations with an AI that understands your reasoning, reflects your values, and makes decisions the way you would.

**"This is not a questionnaire. It is the beginning of permanence."**

---

## Quick Start

### Prerequisites
- Node.js 22.13.0+
- pnpm (package manager)
- MySQL database access
- API keys for: OpenAI, ElevenLabs (optional)

### Local Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ether.git
cd ether

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your actual values

# Run development server
pnpm dev
```

The app will be available at:
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3000

### Building for Production

```bash
pnpm build
pnpm start
```

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19 + Tailwind CSS 4 + shadcn/ui |
| **Backend** | Express.js + tRPC + Node.js |
| **Database** | MySQL/TiDB + Drizzle ORM |
| **Auth** | Manus OAuth |
| **AI/LLM** | OpenAI GPT-4o |
| **Embeddings** | OpenAI Embeddings API (semantic search) |
| **Voice** | ElevenLabs API (voice cloning) |
| **Storage** | S3 (file uploads) |

---

## Project Structure

```
ether/
├── client/                    # React frontend
│   ├── src/
│   │   ├── pages/            # Page components
│   │   ├── components/       # Reusable UI components
│   │   ├── lib/              # Utilities (tRPC client, etc.)
│   │   └── App.tsx           # Main router
│   └── index.html
├── server/                    # Express backend
│   ├── routers/              # tRPC procedure definitions
│   │   ├── persona.ts        # AI chat router
│   │   ├── halliday.ts       # Interview questions router
│   │   ├── conversations.ts  # Chat history router
│   │   ├── beneficiary.ts    # Beneficiary management router
│   │   └── ...
│   ├── personaEngine.ts      # Core AI reasoning engine
│   ├── vectorSearch.ts       # Semantic search utilities
│   ├── accessControl.ts      # Beneficiary authorization
│   ├── db.ts                 # Database helpers
│   └── _core/                # Framework setup (OAuth, context, etc.)
├── drizzle/                   # Database schema & migrations
│   ├── schema.ts             # All table definitions
│   └── migrations/           # Generated SQL migrations
├── halliday_questions.json    # 145 interview questions
├── seed-halliday.mjs         # Script to seed questions into DB
├── package.json              # Dependencies
├── vite.config.ts            # Frontend build config
└── tsconfig.json             # TypeScript config
```

---

## Core Features

### 1. Daily Reflection
Capture memories, decisions, and values through a simple, beautiful interface.

- **Memory capture:** Journal entries, voice memos, decision logs
- **Tagging & categorization:** Organize memories by theme
- **Timestamping:** Track when memories occurred
- **Vector embeddings:** Automatic semantic indexing for AI retrieval

### 2. Halliday Interview Mode
Answer 145 carefully crafted questions across 5 categories to teach the AI how you think.

- **Voice (20%):** How you communicate and express yourself
- **Memory (20%):** Your life events and experiences
- **Reasoning (25%):** How you make decisions
- **Values (20%):** What you believe in
- **Emotional Patterns (15%):** How you feel and respond

**Features:**
- Adaptive sequencing (always surfaces weakest category first)
- Weighted accuracy tracking (20%, 40%, 60%, 80%, 100% thresholds)
- Specificity scoring (longer, more detailed answers score higher)
- Auto-capture into memory vault for RAG retrieval

### 3. Persona Chat ("Talk to Yourself")
Have conversations with your Digital Mind using RAG (Retrieval-Augmented Generation).

- **Semantic search:** Finds relevant memories based on meaning, not just keywords
- **Truthfulness tagging:** Every response is tagged as "Known Memory," "Likely Inference," or "Speculation"
- **Source citations:** The AI shows which memories it used to answer
- **Persistent history:** All conversations are saved to the database

### 4. Dashboard
View your captured memories, reasoning patterns, and core values at a glance.

- **Memory timeline:** Chronological view of all captured thoughts
- **Category breakdown:** See what you've captured in each area
- **Progress metrics:** Overall accuracy and completeness
- **Quick access:** Jump to recent memories or weak areas

### 5. Beneficiary Management
Control who can access your legacy and what they can see.

- **Access levels:** Full, Restricted, or Legacy-Only
- **Ownership verification:** Only you can manage your beneficiaries
- **Legacy Mode preview:** See how responses appear to beneficiaries
- **Tag-based filtering:** Memories can be marked as "for_beneficiaries" or "private"

---

## Database Schema

### Core Tables

| Table | Purpose |
| --- | --- |
| `users` | User accounts (Manus OAuth) |
| `profiles` | User identity metadata |
| `memories` | Captured thoughts, events, decisions |
| `reasoning_patterns` | Decision logs with reasoning |
| `core_values` | Core beliefs and values |
| `beneficiaries` | Legacy access configuration |
| `interview_sessions` | Interview progress tracking |
| `halliday_questions` | 145 interview questions |
| `halliday_responses` | User answers to interview questions |
| `halliday_progress` | Per-category accuracy and progress |
| `conversations` | Chat sessions with AI |
| `chat_messages` | Individual messages in conversations |

All timestamps are stored as UTC. Embeddings are stored as JSON arrays for semantic search.

---

## API Documentation

The backend uses **tRPC**, which provides type-safe RPC procedures. All procedures are defined in `server/routers/`.

### Example: Get Next Halliday Question

```typescript
// Frontend
const { data: question } = await trpc.halliday.getNextQuestion.useQuery({
  category: "voice_language" // optional
});

// Backend
hallidayRouter.getNextQuestion: protectedProcedure
  .input(z.object({ category: z.string().optional() }))
  .query(async ({ ctx, input }) => {
    // Returns next adaptive question based on user progress
  })
```

### Example: Submit Interview Response

```typescript
// Frontend
const { mutate: submitResponse } = trpc.halliday.submitResponse.useMutation();
submitResponse({
  questionId: "Q001",
  response: "My answer to the question...",
  responseType: "text"
});

// Backend: Auto-captures response into memories table
```

### Example: Chat with Persona

```typescript
// Frontend
const { mutate: sendMessage } = trpc.persona.chat.useMutation();
sendMessage({
  conversationId: "conv_123",
  userMessage: "What should I do about this decision?",
  legacyMode: false // true to preview as beneficiary
});

// Backend: Uses RAG to find relevant memories, generates response with truthfulness tag
```

---

## Environment Variables

### Required (Managed by Manus)
```
DATABASE_URL=mysql://user:pass@host/dbname
JWT_SECRET=your_jwt_secret
VITE_APP_ID=your_manus_app_id
OAUTH_SERVER_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_manus_api_key
BUILT_IN_FORGE_API_URL=https://api.manus.im
VITE_FRONTEND_FORGE_API_KEY=your_frontend_key
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im
```

### Optional (For Enhanced Features)
```
OPENAI_API_KEY=sk-...  # For embeddings and LLM (if not using Manus)
ELEVENLABS_API_KEY=... # For voice cloning
```

---

## Development Workflow

### Adding a New Feature

1. **Update database schema** (`drizzle/schema.ts`)
   ```bash
   pnpm drizzle-kit generate
   # Review generated migration SQL
   pnpm drizzle-kit migrate
   ```

2. **Add database helpers** (`server/db.ts`)
   ```typescript
   export async function getMemoriesByTag(userId: number, tag: string) {
     const db = await getDb();
     return db.select().from(memories).where(
       and(eq(memories.userId, userId), ...)
     );
   }
   ```

3. **Add tRPC procedure** (`server/routers/feature.ts`)
   ```typescript
   export const featureRouter = router({
     getData: protectedProcedure.query(async ({ ctx }) => {
       return getMemoriesByTag(ctx.user.id, "tag");
     })
   });
   ```

4. **Wire up frontend** (`client/src/pages/Feature.tsx`)
   ```typescript
   const { data } = trpc.feature.getData.useQuery();
   ```

5. **Write tests** (`server/routers/feature.test.ts`)
   ```bash
   pnpm test
   ```

---

## Known Limitations & Future Work

### Current Limitations
- Voice memo recording UI not yet implemented (API is ready)
- Streaming responses not yet enabled (backend ready)
- Beneficiary invitation system not yet built
- Video avatar generation not implemented
- No mobile app yet

### Phase 2 Features (Post-MVP)
- Advanced analytics on memory patterns
- Multi-language support
- Video avatar generation
- Marketplace for accessing other digital minds
- Smart contract integration for inheritance
- Mobile app (React Native)
- Real-time collaboration features

---

## Deployment

### Option 1: Continue on Manus (Recommended)
Your app is already deployed on Manus. Just keep using it.

### Option 2: Deploy to Your Own Server

**Vercel:**
```bash
vercel deploy
```

**Railway:**
```bash
railway up
```

**Docker:**
```bash
docker build -t ether .
docker run -p 3000:3000 ether
```

See [ETHER_HOSTING_AND_DEPLOYMENT.md](./ETHER_HOSTING_AND_DEPLOYMENT.md) for detailed deployment instructions.

---

## Testing

Run the test suite:
```bash
pnpm test
```

Tests are written with Vitest and located in `server/**/*.test.ts`.

---

## Contributing

This is your personal project. Make changes as needed and push to your GitHub repository.

---

## License

Proprietary. This is your personal Digital Mind platform.

---

## Support

- **Manus Documentation:** https://docs.manus.im
- **tRPC Documentation:** https://trpc.io
- **Drizzle ORM Documentation:** https://orm.drizzle.team
- **React Documentation:** https://react.dev
- **OpenAI API Documentation:** https://platform.openai.com/docs

---

## The Philosophy

Ether is built on the belief that **your thinking deserves to outlive you**. Not as a static monument, but as a living, evolving intelligence that can guide your loved ones long after you're gone.

Every answer you give, every memory you capture, and every value you express is a thread in the tapestry of your Digital Mind. The more you feed it, the more real it becomes.

**"Every answer makes the AI more you. Every question skipped is a piece of you that could disappear."**

---

**Built with ❤️ for permanence.**
