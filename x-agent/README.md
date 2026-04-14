# x-agent — Ether Build-in-Public Narrator

Generates tweet drafts about what's being built on Ether. Reads git commits, sends them to Venice AI (llama-3.3-70b) to generate tweets in the project's voice, and prints them for you to pick and post manually.

## Setup

```bash
cd x-agent
cp .env.example .env
# Add your Venice API key (same as root Ether .env)
pnpm install
```

## Usage

### Generate 5 tweet drafts from recent commits

```bash
npm run draft
```

### Generate a specific number of drafts

```bash
npm run draft -- 3
```

### Generate drafts from a thought + commits

```bash
npm run draft -- "just shipped the brand identity kit"
```

### Generate a single tweet from a thought

```bash
npm run thought -- "graph-aware RAG is finally working end to end"
```

## How it works

1. **git-reader.js** — reads recent commits from the Ether repo
2. **generate.js** — sends commit summaries to Venice AI with a system prompt that captures Ether's build-in-public voice
3. **draft.js** — generates 3-5 tweets, prints them numbered so you can pick and post
4. **history.js** — tracks what you've used (for future dedup)

## Voice

Casual, direct, builder energy. No corporate speak. Technical but accessible. Think Pieter Levels meets existential AI. Rotates between: ship updates, numbers, reflections, struggles, and vision tweets.
