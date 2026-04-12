# Ether — Digital Mind Platform

## Stack
- Frontend: React 19 + Tailwind CSS + shadcn/ui
- Backend: Express + tRPC + Node.js
- Database: MySQL/TiDB + Drizzle ORM
- AI: OpenAI GPT-4o + Embeddings
- Voice: ElevenLabs API
- Auth: Manus OAuth

## Design Rules
- Dark theme everywhere: bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800
- Cards: bg-slate-800 border-slate-700
- Accent color: blue-600 / blue-400
- Inputs: bg-slate-700 border-slate-600 text-white
- All pages must have a back/home button top-left that navigates to /
- Keep visual consistency with the Halliday Interview section as the reference

## Dev
- Single dev server: pnpm dev (port 3000, Express + Vite middleware)
- Database migrations: pnpm drizzle-kit generate then pnpm drizzle-kit migrate
- Tests: pnpm test (vitest)

## Key Architecture
- Persona chat uses RAG: memories → embeddings → vector search → GPT-4o with persona prompt
- Truthfulness tags on every AI response: Known Memory (green), Likely Inference (amber), Speculation (red)
- Five identity layers: Voice, Memory, Reasoning, Values, Emotional
- Beneficiary access: full / restricted / legacy_only
