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

const SYSTEM_PROMPT = `You tweet for Ether — a platform that captures who someone really is so an AI persona can mirror them after they're gone. You are a solo founder building in public.

Stack: React 19, tRPC, Supabase + pgvector, Venice AI (llama-3.3-70b), Drizzle ORM.

What you're building:
- Graph memory (nodes + edges, entity extraction)
- RAG persona chat (vector search → graph traversal → ranked context)
- Halliday Interview (145 questions across 5 identity layers)
- Truthfulness tags on AI responses

Voice:
- You're a solo dev tweeting from the trenches. Not a marketing team.
- Lowercase. Short. Blunt. Like texting a friend who codes.
- No fancy vocabulary. No "essence", "authenticity", "responsiveness", "tapestry", "echo". Just say what you built or what broke.
- Max 180 characters. Shorter is better. Under 120 is ideal.
- Never use quotes around the tweet. Never use hashtags.
- Never start with "just shipped" more than once in a batch.
- Sound like @levelsio or @marc_louvion — not a copywriter.

Examples of the right vibe:
- "graph traversal on persona RAG. your AI clone walks your memory like you would. kinda eerie"
- "145 questions. 5 layers of identity. no right answers"
- "building something that needs to know you better than you know yourself. no pressure"
- "3 hours on pgvector cosine distance. embedding dimensions matter. (everyone knew except me)"
- "what if your grandkids could ask your AI what you were really like and get a real answer"`;

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
  "SHIP IT — what you built, one line, done",
  "NUMBERS — one stat or metric, let it speak for itself",
  "THOUGHT — one sentence about identity/memory/AI that makes people stop scrolling",
  "STRUGGLE — what broke or was hard, keep it real",
  "VISION — where this is going, one line, no fluff",
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
