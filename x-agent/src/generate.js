import { getRecentPosts } from "./history.js";

const VENICE_API_URL = "https://api.venice.ai/api/v1/chat/completions";
const VENICE_MODEL = "llama-3.3-70b";

function getApiKey() {
  const key = process.env.VENICE_API_KEY;
  if (!key) throw new Error("Missing VENICE_API_KEY in environment");
  return key;
}

/**
 * Call Venice AI chat completions (OpenAI-compatible).
 * @param {{ role: string, content: string }[]} messages
 * @returns {Promise<string>} — assistant message text
 */
async function chat(messages, temperature = 0.9) {
  const response = await fetch(VENICE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: VENICE_MODEL,
      messages,
      max_tokens: 200,
      temperature,
      venice_parameters: {
        include_venice_system_prompt: false,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Venice API error: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const data = await response.json();
  // Strip wrapping quotes — LLMs sometimes return "tweet text" with quotes
  const raw = (data.choices?.[0]?.message?.content ?? "").trim();
  return raw.replace(/^["']|["']$/g, "");
}

const SYSTEM_PROMPT = `You are @chazzeyempson tweeting about Ether — a platform that builds your digital mind so an AI can think and talk like you. Solo founder, building in public.

Stack: React 19, tRPC, Supabase + pgvector, Venice AI (llama-3.3-70b), Drizzle ORM, graph memory.

What you're building:
- Graph memory: nodes + edges, LLM entity extraction, 2-hop BFS traversal
- RAG persona chat: vector search → graph walk → ranked context → persona response
- Halliday Interview: 145 questions across 5 identity layers
- Onboarding flow that seeds your digital mind from day one
- Companion agent that watches what you do and reacts

VOICE RULES — follow these exactly:
- All lowercase. Always. No exceptions.
- Short and punchy. One or two sentences max.
- Talk like you're texting a friend who codes. Not a press release.
- NEVER use: hashtags, emojis, "excited to announce", "thrilled", "game-changing", "leverage", "essence", "authenticity", "tapestry", "echo", "unleash", "revolutionize"
- NEVER use quotes around the tweet text
- NEVER start two tweets in a batch the same way
- Max 180 characters. Under 120 is better. Shortest possible.
- Sound like a tired founder at 2am who just got something working. Not a marketing team.
- Be specific about what you built. Name the tech. Say what it does.

Examples of EXACTLY the right voice:
- "just wired up 2-hop BFS traversal for Ether's memory graph. your AI self now finds connections the way your brain does"
- "been building for 14 hours straight. graph memory is finally clicking"
- "everyone's building AI wrappers. we're building AI minds. different game"
- "pgvector cosine search + graph traversal in one query. your digital mind remembers things you forgot you said"
- "145 questions. 5 layers of who you are. no right answers"
- "3am. onboarding flow done. new users seed 7 memories before they even start"
- "what if your grandkids could ask your AI what you were really like and get a real answer"

If the tweet sounds like it could come from a corporate account, throw it away and try again.`;

/**
 * Generate a tweet from recent git activity.
 * @param {string} changeSummary — formatted summary of recent commits
 * @returns {Promise<string>} — tweet text (max 280 chars)
 */
export async function generateFromCommits(changeSummary) {
  const recentPosts = getRecentPosts(5);
  const recentPostsContext = recentPosts.length > 0
    ? `\n\nRecent posts (avoid repeating similar content):\n${recentPosts.map((p) => `- "${p.text}"`).join("\n")}`
    : "";

  const text = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Recent work:\n\n${changeSummary}${recentPostsContext}\n\nOne tweet. Under 180 chars. No quotes around it. Just the raw tweet text.`,
    },
  ]);

  if (text.length > 280) {
    const shorter = await chat([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `This tweet is ${text.length} chars, needs to be under 280:\n\n"${text}"\n\nRewrite it shorter. Return ONLY the tweet text.`,
      },
    ]);
    return shorter.length > 280 ? shorter.slice(0, 280) : shorter;
  }

  return text;
}

/**
 * Generate a tweet from a raw thought / manual input.
 * @param {string} thought — the raw thought to turn into a tweet
 * @returns {Promise<string>}
 */
export async function generateFromThought(thought) {
  const text = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Turn this into a tweet. Under 180 chars. No quotes around it.\n\n${thought}`,
    },
  ]);

  return text.length > 280 ? text.slice(0, 280) : text;
}

const FORMATS = [
  "SHIP IT — what you built today, one line, lowercase, done",
  "NUMBERS — one specific stat or metric from the work. let it hit",
  "THOUGHT — one sentence about identity, memory, or digital minds that makes devs stop scrolling",
  "STRUGGLE — what broke, what took too long, what sucked. keep it real and specific",
  "VISION — the big picture in one punchy line. why this matters. no corporate speak",
];

/**
 * Generate a batch of diverse tweet drafts.
 * @param {string} changeSummary — recent commits summary
 * @param {string} [thought] — optional manual thought to weave in
 * @param {number} [count=5] — how many drafts
 * @returns {Promise<string[]>}
 */
export async function generateDraftBatch(changeSummary, thought, count = 5) {
  const recentPosts = getRecentPosts(5);
  const recentCtx = recentPosts.length > 0
    ? `\n\nRecent posts (avoid repeating):\n${recentPosts.map((p) => `- "${p.text}"`).join("\n")}`
    : "";

  const drafts = [];

  for (let i = 0; i < count; i++) {
    const format = FORMATS[i % FORMATS.length];
    const alreadyGenerated = drafts.length > 0
      ? `\n\nYou already wrote these — write something COMPLETELY DIFFERENT:\n${drafts.map((d) => `- "${d}"`).join("\n")}`
      : "";

    let prompt;
    if (thought && changeSummary) {
      prompt = `Recent work:\n${changeSummary}\n\nExtra context: ${thought}`;
    } else if (thought) {
      prompt = `Thought: ${thought}`;
    } else {
      prompt = `Recent work:\n${changeSummary}`;
    }

    const text = await chat([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${prompt}${recentCtx}${alreadyGenerated}\n\nStyle: ${format}\nOne tweet. Under 180 chars. Different angle than above. No quotes. Just the tweet.`,
      },
    ], 1.0);

    drafts.push(text.length > 280 ? text.slice(0, 280) : text);
  }

  return drafts;
}
