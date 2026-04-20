import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, createMemoryNode, getMemoryNodesByUserId } from "../db";
import { invokeLLM } from "../_core/llm";
import { processContent } from "../graphPipeline";
import { checkRateLimit } from "../rateLimit";
import { invalidateRecommendationCache } from "./home";
import { TRPCError } from "@trpc/server";
import {
  interviewLevels,
  interviewQuestions,
  interviewGenerationLogs,
  hallidayLayerEnum,
} from "../../drizzle/schema";
import { eq, and, asc, isNull, count } from "drizzle-orm";

const HALLIDAY_LAYERS = hallidayLayerEnum.enumValues;

// ─── Level metadata ───

const LEVEL_META: Record<number, { title: string; description: string; questionCount: number }> = {
  1: { title: "Foundation", description: "Broad questions across all 5 identity layers", questionCount: 20 },
  2: { title: "Depth", description: "Personalized follow-ups based on your answers", questionCount: 15 },
  3: { title: "Synthesis", description: "Connecting patterns across your identity", questionCount: 10 },
};

// ─── Layer → nodeType mapping ───

const LAYER_TO_NODE_TYPE: Record<string, string> = {
  voice_and_language: "concept",
  memory_and_life_events: "memory",
  reasoning_and_decisions: "reasoning_pattern",
  values_and_beliefs: "value",
  emotional_patterns: "emotion",
};

// ─── Level 1 seed questions ───

export const LEVEL_1_SEED: Array<{
  question: string;
  layer: typeof HALLIDAY_LAYERS[number];
  orderIndex: number;
  helperText: string;
  exampleAnswers: [string, string, string];
}> = [
  // Voice & Language (4)
  {
    question: "What language do you think in?",
    layer: "voice_and_language",
    orderIndex: 1,
    helperText: "Think about your inner voice — the one narrating right now, or the one you argue with yourself in. Does it switch depending on what you're feeling?",
    exampleAnswers: [
      "English normally, but when I'm stressed I catch myself counting in Cantonese. My grandma taught me numbers before anyone taught me in school, and that's the one that stuck.",
      "Mostly English, but all my swearing is in Spanish. My mom says she can tell when I stub my toe from three rooms away.",
      "It's mostly pictures honestly. I don't have much of a running monologue — I see the thing I'm thinking about, and words come later when I have to say it out loud.",
    ],
  },
  {
    question: "What phrase do you say that nobody else does?",
    layer: "voice_and_language",
    orderIndex: 2,
    helperText: "Not a catchphrase — something you catch yourself saying that friends have teased you for, or that shows up in your texts more than you realize.",
    exampleAnswers: [
      "\"Sweet as, sweet as.\" Always twice. I don't even know why. My partner started imitating me and now I notice it every single day.",
      "\"In fairness\" at the start of almost every sentence where I'm disagreeing with someone. It makes me sound more reasonable than I actually feel.",
      "I call everyone 'my guy' — dogs, strangers, my 68-year-old dad. Started as a joke in college and I never stopped.",
    ],
  },
  {
    question: "How would your closest friend describe your voice?",
    layer: "voice_and_language",
    orderIndex: 3,
    helperText: "Imagine them at dinner trying to explain to someone what you sound like — not just the tone, but the rhythm, the jokes, the tells. What would they land on?",
    exampleAnswers: [
      "Flat until I'm excited, then I talk with my whole body. Jake says I go from courtroom to sports commentary in about two sentences.",
      "Soft and slow. A friend once said I sound like I'm reading everyone a bedtime story, even when I'm complaining about work.",
      "Dry, kind of deadpan, lots of pauses. They'd say I wait a beat too long before the punchline, but the punchline's usually worth it.",
    ],
  },
  {
    question: "What word do you overuse?",
    layer: "voice_and_language",
    orderIndex: 4,
    helperText: "The tic your partner or coworkers have pointed out. The word that shows up in every email. The one you reach for when you can't think of the right one.",
    exampleAnswers: [
      "\"Literally.\" I use it when I'm not being literal, which is honestly most of the time. My sister made me put a dollar in a jar for a week and I owed her $34.",
      "\"Interesting.\" It's my noncommittal default when I don't agree but also don't want to argue. A friend called me out — she said it's code for 'I'm already disagreeing with you.'",
      "\"Basically.\" I start every explanation with it, like I need to warn people I'm about to oversimplify. My boss once asked me to try not saying it in a whole meeting and I made it maybe four minutes.",
    ],
  },
  // Memory & Life Events (4)
  {
    question: "Where did you grow up?",
    layer: "memory_and_life_events",
    orderIndex: 5,
    helperText: "Not the postcode — the feel of the place. What the air smelled like, who was around, what you did when you were bored.",
    exampleAnswers: [
      "Small town in the Waikato, 2000 people, one pub. I used to walk the dog along the stopbank after school and there was always one kid fishing who never caught anything.",
      "Queens, New York. A shared third-floor walk-up with four of us in two bedrooms. My mom worked nights so I got really good at cooking by ten.",
      "On a farm outside Armidale. Hours from anywhere. We had a big tin water tank I used to climb on and watch storms roll in from the west — you could see them coming for forty-five minutes.",
    ],
  },
  {
    question: "What's a moment that split your life into before and after?",
    layer: "memory_and_life_events",
    orderIndex: 6,
    helperText: "Not necessarily the biggest event — the moment where something shifted and you knew afterwards you were a different person. Could be tiny, could be huge.",
    exampleAnswers: [
      "My dad calling me from the hospital at 6am telling me grandpa had died. I was 19, in a dorm shower, and the whole day I kept thinking the hot water wouldn't run out this time.",
      "The morning I decided to leave my marriage. I was making coffee, watched him scroll his phone without looking up, and realized I'd been waiting for a reason that wasn't coming. I didn't leave for eight more months but that's when it ended.",
      "Getting cut from the national squad at 17. I'd organized my whole identity around making it. I flew home the next day and started applying for jobs I'd never thought about, and honestly I've been happier ever since.",
    ],
  },
  {
    question: "What's your earliest memory?",
    layer: "memory_and_life_events",
    orderIndex: 7,
    helperText: "Not the one you've been told about — the one that's actually yours. The fragment that plays in your head when you try to remember being small.",
    exampleAnswers: [
      "Sitting in a wet nappy on the lino in the kitchen, watching my mum cook. I can't have been more than two. I remember the smell of onions and the feeling of the floor being cold.",
      "My granddad's ute. I was in the passenger seat with no seatbelt — early 90s, country road — and he was singing something in te reo that I didn't understand but I knew he was happy.",
      "A goldfish dying. Orange, floating at the top of the tank, and I pressed my face against the glass for so long my nose went numb. I think I was four. First time I understood dead meant not coming back.",
    ],
  },
  {
    question: "What's something that happened to you that you still don't fully understand?",
    layer: "memory_and_life_events",
    orderIndex: 8,
    helperText: "Not a mystery to solve — a thing that happened that you still turn over in your head. The moment whose meaning keeps shifting depending on when you revisit it.",
    exampleAnswers: [
      "My uncle came over one Christmas, sat on the couch for three hours, didn't say a word, left. Nobody else in the family thought it was weird. We never talked about it. He died two years later and I still don't know what he was doing there.",
      "I got into a school I hadn't applied to. Paperwork error, apparently. I went anyway because my parents thought I had, and I met my wife there. I've never figured out if that's serendipity or if I'd have had the same life either way.",
      "My best friend stopped talking to me senior year of high school. No fight, no event, just — done. We'd been inseparable for six years. I ran into her at a wedding eight years later and she hugged me like nothing had happened. I still don't know.",
    ],
  },
  // Reasoning & Decision Making (4)
  {
    question: "How do you make big decisions?",
    layer: "reasoning_and_decisions",
    orderIndex: 9,
    helperText: "Don't tell me the framework — tell me what you actually do. Do you talk it out? Make lists? Wait for a gut call? Who do you consult, and at what stage?",
    exampleAnswers: [
      "I pretend I've already decided each option for a week. Sunday I'd wake up having said yes, following Sunday having said no. Whichever one felt like a relief by Wednesday, that was the answer.",
      "Spreadsheets, always. I need to see the tradeoffs in cells. My wife calls it avoidance dressed up as analysis and she's not wrong, but it still works for me.",
      "I call my sister. She's blunt to a fault and usually right. I don't even need her advice most of the time — I just need to say it out loud to somebody who'll push back.",
    ],
  },
  {
    question: "What's a belief you held strongly that you later changed?",
    layer: "reasoning_and_decisions",
    orderIndex: 10,
    helperText: "Not a position you softened — one you flipped. The one you'd have argued hard for at 22 and can't defend now.",
    exampleAnswers: [
      "I used to think therapy was for people who couldn't handle their own problems. Two years of it after my divorce and I'd now say the opposite — not going is the avoidance.",
      "That hard work alone gets you what you want. I watched my dad grind himself to nothing and end up with nothing. Luck and timing are at least half of it, and I say that to everyone under 30 I mentor now.",
      "I was convinced ambition and contentment were opposites — that if you were happy you'd stopped wanting. My brother is both at once and it rewired how I think about it.",
    ],
  },
  {
    question: "What do you do for work and why?",
    layer: "reasoning_and_decisions",
    orderIndex: 11,
    helperText: "Both halves matter. The 'what' is easy — the 'why' is the real thing. What would you say if a kid asked you and you had to give a real answer?",
    exampleAnswers: [
      "I'm a nurse in a pediatric ICU. I do it because I'm good at staying calm when other people can't, and because somewhere around 25 I realized I needed my work to matter in a way I could see at the end of the day.",
      "I run a small accounting firm. I didn't pick it for any noble reason — my dad had one, I was decent at numbers, and it lets me coach my kids' teams and not miss dinner. That's the 'why' honestly.",
      "Software engineer at a startup. I like building things that work, I like being paid well, and I've made peace with the fact that those are my actual reasons and I don't need a bigger story.",
    ],
  },
  {
    question: "What's a risk you took that paid off?",
    layer: "reasoning_and_decisions",
    orderIndex: 12,
    helperText: "Not the obvious career one — any risk where you had real skin in it and the outcome wasn't guaranteed. What made you pull the trigger?",
    exampleAnswers: [
      "Moved to Melbourne at 24 with no job, no flat, and about four grand in savings. My parents thought I was losing my mind. Met my business partner there in week three and we've been building the company seven years now.",
      "Told my boss I'd quit if they didn't let me work remote from my parents' farm for six months while my dad had chemo. I was 100% ready to leave. She said yes. I stayed another four years.",
      "Asked someone out who I was positive would say no. She did, the first time. Four years later we're married. Turns out the 'no' was about timing and I got the 'ask again' read wrong.",
    ],
  },
  // Values & Beliefs (4)
  {
    question: "What would you never compromise on?",
    layer: "values_and_beliefs",
    orderIndex: 13,
    helperText: "The line you've already been tested on and held. Not a theoretical line — one you've actually enforced, probably at a cost.",
    exampleAnswers: [
      "Not lying to my kids about hard stuff. We told my six-year-old his grandma was dying in plain words. My in-laws hated it. He handled it better than any of the adults did.",
      "Staying off my phone after 9pm when I'm with my wife. Sounds small. I've killed a few late-night work conversations over it and my team has learned to work around it.",
      "Never working for a company I wouldn't tell my mum the truth about. Turned down a $200k offer last year from a gambling company. I could feel the shape of the lie I'd have to tell her at Sunday lunch.",
    ],
  },
  {
    question: "What do you want to be remembered for?",
    layer: "values_and_beliefs",
    orderIndex: 14,
    helperText: "Not the eulogy headline — the small thing a specific person would say. What would your best friend say when someone asked what you were like?",
    exampleAnswers: [
      "That I was the one who'd actually show up. Not nice texts on your birthday — driving three hours when your dog died. I've built my whole adult life around being that person for a small number of people.",
      "For making people laugh at funerals. I don't mean that as a joke. I've done it at three now and people remember it. If you can do that you've given the room something real.",
      "That I left things better than I found them. Bigger or smaller scale doesn't matter — the kitchen, the codebase, the kid I coached. I want that to be the pattern someone sees when they stack it all up.",
    ],
  },
  {
    question: "What's worth suffering for?",
    layer: "values_and_beliefs",
    orderIndex: 15,
    helperText: "Not in the abstract — something you've actually suffered for and would do again. The thing whose cost you've paid and still thought yes, worth it.",
    exampleAnswers: [
      "Raising my kids with real presence. I've turned down promotions twice, taken less money, worked jobs I didn't love to be home for dinner. Six years in and I've never regretted any of it.",
      "The marriage, specifically the bad years. Year four and five were awful — we nearly didn't make it. What's on the other side is the best thing in my life and I wouldn't trade the 18 months of pain for an easier decade elsewhere.",
      "Telling the truth to people who didn't want to hear it. I've lost at least three friendships and one job over things I knew I had to say. The version of me that didn't say them — I don't want to be him.",
    ],
  },
  {
    question: "Where does your sense of right and wrong come from?",
    layer: "values_and_beliefs",
    orderIndex: 16,
    helperText: "Not 'my parents raised me well' — specifically, trace it. A person, a moment, a book, a religion, a mistake. What actually formed it?",
    exampleAnswers: [
      "My mum. Not from what she told me — from watching her give away food we couldn't afford to give and not mention it to anyone. I realized at maybe 12 that what you do when nobody's watching is the whole thing.",
      "Getting caught stealing from a shop when I was 9. The shopkeeper called my dad in and instead of punishing me he paid for it and made me go back alone the next day and apologize. That walk back in has stayed with me for 30 years.",
      "Honestly, not religion or family — more a trained revulsion. Once I could clearly picture a person as a person with their own inner life, I stopped being able to treat them as a means to anything. I don't know where that came from exactly.",
    ],
  },
  // Emotional Patterns (4)
  {
    question: "What makes you angry that doesn't bother most people?",
    layer: "emotional_patterns",
    orderIndex: 17,
    helperText: "The small thing that gets you unreasonably worked up. The thing your friends roll their eyes at when you start in on it.",
    exampleAnswers: [
      "People who don't return their shopping trolley to the bay. I know it's nothing. I know. And yet I have stood in a carpark and watched a man leave his trolley in a disabled space and felt actual rage.",
      "Being interrupted while someone else is talking — specifically in meetings, by men, to women. I've made it a thing to call out on behalf of people and apparently it's exhausting for others to watch.",
      "Lateness without acknowledgement. Be 40 minutes late, I don't care, just don't walk in like it's normal. My brother is chronically late and we've had fights about it since we were teenagers.",
    ],
  },
  {
    question: "How do you handle being wrong?",
    layer: "emotional_patterns",
    orderIndex: 18,
    helperText: "Not what you wish you did — what actually happens. The first five minutes, the next day, who you tell, what you notice about yourself in the middle of it.",
    exampleAnswers: [
      "Badly at first. I get quiet and defensive for about ten minutes. Then I go for a walk, and by the time I'm back I can say it out loud. My wife has learned not to push me during the quiet part.",
      "Honestly? Better than most. I grew up in a family that argued about everything and the only way to win was to update your position fast when the evidence moved. I kind of enjoy being proven wrong — it means I've learned something.",
      "It depends who's right. With strangers on the internet, badly. With my wife or my two closest friends, fine. My therapist pointed out this pattern and I haven't figured out why it tracks so cleanly.",
    ],
  },
  {
    question: "What's your relationship with fear?",
    layer: "emotional_patterns",
    orderIndex: 19,
    helperText: "Not 'what are you scared of' — how fear works in you. Does it freeze you, sharpen you, make you reckless? Do you notice it early or only after?",
    exampleAnswers: [
      "It sharpens me. I do my best work when I'm quietly terrified of failing. I've tried to get to a place where I don't need it to perform but honestly I haven't, and I've stopped pretending I want to.",
      "I get very still. Outside it looks like calm and inside my stomach is a rock. A few people in my life have learned to read the difference and it's how I know who actually sees me.",
      "I act fast to get out of it. Which has worked for me — I've left jobs and relationships that weren't working while friends are still agonizing. It's also cost me a few things I probably should have sat with longer.",
    ],
  },
  {
    question: "When do you feel most like yourself?",
    layer: "emotional_patterns",
    orderIndex: 20,
    helperText: "The activity or setting where the performance drops and you're just there. Could be mundane, doesn't have to be profound.",
    exampleAnswers: [
      "Driving on the motorway alone at night with music I know all the words to. No one to perform for, no need to be anything. Half my big realizations have happened between exits.",
      "Cooking for four or five people who aren't in a rush. Hands busy, a glass of wine, everyone chatting around me — I lose track of time and my face relaxes in a way my partner has pointed out.",
      "In the gym on heavy squat day. Nothing works in your head when the bar is on your back. I feel more like me in that 30 seconds than most of the rest of the week.",
    ],
  },
];

// ─── Helpers ───

async function ensureLevelsExist(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  // Check if levels exist
  const existing = await db
    .select()
    .from(interviewLevels)
    .where(eq(interviewLevels.userId, userId))
    .orderBy(asc(interviewLevels.level));

  if (existing.length > 0) return existing;

  // Create 3 levels: L1 = in_progress, L2/L3 = locked
  const rows = await db
    .insert(interviewLevels)
    .values([
      { userId, level: 1, status: "in_progress" as const, startedAt: new Date() },
      { userId, level: 2, status: "locked" as const },
      { userId, level: 3, status: "locked" as const },
    ])
    .returning();

  // Seed Level 1 questions
  await db.insert(interviewQuestions).values(
    LEVEL_1_SEED.map((q) => ({
      userId,
      level: 1,
      question: q.question,
      layer: q.layer,
      orderIndex: q.orderIndex,
      helperText: q.helperText,
      exampleAnswers: q.exampleAnswers,
    }))
  );

  return rows.sort((a, b) => a.level - b.level);
}

// ─── Venice generation for L2/L3 ───
// Phase 2 overhaul (Apr 2026): pass raw L1 answers as primary source,
// demand 4 fields (question, layer, helperText, exampleAnswers),
// mirror not reframe, persist full prompt+response for auditability.

const GENERATION_SYSTEM_PROMPT_BASE = `You are generating interview questions for a personal identity AI platform.
The user has already answered 20 Level 1 questions in their own words. Their raw answers are your PRIMARY source.
A list of auto-extracted entities from their broader memory graph is your SUPPLEMENTAL context.

CRITICAL RULES:
1. MIRROR, DO NOT REFRAME. Use the user's own words and phrases. Quote fragments of what they said when useful.
   Do NOT correct, moderate, soften, reinterpret, or editorialize their content. Do not add your own framing to their beliefs.
   If you cannot generate a neutral follow-up for a specific topic they raised, SKIP it and generate a question about
   a different topic instead. A missing question is better than a reframed one.
2. Reference actual words. Good: "You said your grandmother taught you to count in Cantonese — when was the last
   time you used that?" Bad: "Why is language important to you?" Bad questions will be rejected.
3. Each question must feel personalized. If a question could apply to anyone without reading this user's answers, rewrite it or skip it.

OUTPUT FORMAT — respond with ONLY a JSON object, no markdown, no preamble:
{
  "questions": [
    {
      "question": "string — 8-15 words (L2) or 10-20 words (L3). Direct, not therapeutic. Must reference the user's actual words.",
      "layer": "one of: LAYER_ENUM",
      "helperText": "string — a probe that helps the user unlock how to answer this specific question. Like 'Think about the last time you…' or 'Not the obvious version — the one where…'. Reference the user's own words when possible. 1-2 sentences.",
      "exampleAnswers": [
        "string — a realistic example answer: specific, personal, textured, real casual voice, 2-3 concrete details, uses 'I'.",
        "string — a different personality/angle than example 1. Varied life, voice, depth.",
        "string — a third distinct angle. Three varied examples per question — no clones."
      ]
    }
  ]
}
Rules for exampleAnswers: each must be in a real human voice (casual, fragments OK, contractions, not essay-like). Must be specific (names, places, concrete details — not abstractions). Must use "I" / "my". No one-liners — each 2-3 sentences of texture. 3 examples per question, VARIED.`;

function buildPrompt(
  level: 2 | 3,
  answers: Array<{ order: number; question: string; answer: string; layer: string }>,
  supplemental: string,
): string {
  const questionCount = level === 2 ? 15 : 10;
  const wordRange = level === 2 ? "8-15 words per question" : "10-20 words per question";
  const framing = level === 2
    ? `Generate exactly ${questionCount} follow-up questions that go DEEPER into specific things this user shared in their Level 1 answers. Probe the nuance behind what they said, the story they skipped, the tension they glossed over.`
    : `Generate exactly ${questionCount} SYNTHESIS questions that find patterns across different things this user shared. Each question should connect ideas from 2+ Level 1 answers or memory graph entries — tensions, throughlines, surprising links in who they are.`;

  const answersBlock = answers
    .map((a) => `[L1 Q${a.order}] (${a.layer})\n  Q: ${a.question}\n  A: ${a.answer}`)
    .join("\n\n");

  return `${GENERATION_SYSTEM_PROMPT_BASE.replace("LAYER_ENUM", HALLIDAY_LAYERS.join(" | "))}

${framing} ${wordRange}.

═══ PRIMARY SOURCE — USER'S RAW LEVEL 1 ANSWERS ═══
${answersBlock}

═══ SUPPLEMENTAL — AUTO-EXTRACTED ENTITIES FROM MEMORY GRAPH ═══
${supplemental || "(none)"}

Generate the JSON now.`;
}

export async function generateLevelQuestions(
  userId: number,
  level: 2 | 3,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Primary source: raw L1 Q+A pairs
  const l1Answers = await db
    .select({
      orderIndex: interviewQuestions.orderIndex,
      question: interviewQuestions.question,
      answer: interviewQuestions.answer,
      layer: interviewQuestions.layer,
    })
    .from(interviewQuestions)
    .where(and(eq(interviewQuestions.userId, userId), eq(interviewQuestions.level, 1)))
    .orderBy(asc(interviewQuestions.orderIndex));

  const answeredL1 = l1Answers
    .filter((r) => r.answer != null && r.answer.trim().length > 0)
    .map((r) => ({
      order: r.orderIndex,
      question: r.question,
      answer: r.answer as string,
      layer: r.layer as string,
    }));

  if (answeredL1.length === 0) {
    await db.insert(interviewGenerationLogs).values({
      userId, level, prompt: "(skipped)", response: null,
      validCount: 0, rejectedCount: 0,
      error: "No answered L1 questions — cannot generate personalized follow-ups",
    });
    return;
  }

  // Supplemental: entity summaries from the memory graph
  const nodes = await getMemoryNodesByUserId(userId, undefined, 300);
  const supplemental = nodes
    .map((n) => {
      const name = (n.metadata as Record<string, unknown>)?.name as string | undefined;
      return `[${n.hallidayLayer}] ${name ?? n.summary ?? n.content.slice(0, 100)}`;
    })
    .slice(0, 60)
    .join("\n");

  const prompt = buildPrompt(level, answeredL1, supplemental);
  const questionCount = level === 2 ? 15 : 10;

  let responseText = "";
  const rejectionNotes: string[] = [];
  let validated: Array<{
    question: string;
    layer: typeof HALLIDAY_LAYERS[number];
    helperText: string;
    exampleAnswers: [string, string, string];
  }> = [];
  let errorText: string | null = null;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Generate the JSON now." },
      ],
    });

    const raw = result.choices?.[0]?.message?.content;
    responseText = typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.filter((p): p is { type: "text"; text: string } => typeof p === "object" && p.type === "text").map((p) => p.text).join("")
        : "";

    // Parse — tolerate markdown code fences
    const stripped = responseText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    // Find the JSON object — prefer {"questions": [...]} shape, fall back to a bare array
    let parsedQuestions: any[] = [];
    try {
      const objMatch = stripped.match(/\{[\s\S]*\}/);
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]);
        if (Array.isArray(parsed.questions)) parsedQuestions = parsed.questions;
      }
    } catch {
      // ignore, try array
    }
    if (parsedQuestions.length === 0) {
      const arrMatch = stripped.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try { parsedQuestions = JSON.parse(arrMatch[0]); } catch { /* ignore */ }
      }
    }

    if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
      errorText = "Failed to parse Venice response as JSON with questions array";
    } else {
      // Validate each entry — reject if ANY of the 4 fields is malformed
      for (let idx = 0; idx < parsedQuestions.length; idx++) {
        const q = parsedQuestions[idx];
        const note = (reason: string) => `idx ${idx}: ${reason}`;
        if (typeof q?.question !== "string" || q.question.trim().length < 10) {
          rejectionNotes.push(note("question missing / < 10 chars"));
          continue;
        }
        if (!HALLIDAY_LAYERS.includes(q.layer)) {
          rejectionNotes.push(note(`invalid layer: ${q.layer}`));
          continue;
        }
        if (typeof q.helperText !== "string" || q.helperText.trim().length === 0) {
          rejectionNotes.push(note("helperText missing or empty"));
          continue;
        }
        if (!Array.isArray(q.exampleAnswers) || q.exampleAnswers.length !== 3) {
          rejectionNotes.push(note(`exampleAnswers must be array of 3 (got ${Array.isArray(q.exampleAnswers) ? q.exampleAnswers.length : typeof q.exampleAnswers})`));
          continue;
        }
        if (!q.exampleAnswers.every((e: any) => typeof e === "string" && e.trim().length > 0)) {
          rejectionNotes.push(note("exampleAnswers contain empty/non-string entries"));
          continue;
        }
        validated.push({
          question: q.question.trim(),
          layer: q.layer,
          helperText: q.helperText.trim(),
          exampleAnswers: [
            q.exampleAnswers[0].trim(),
            q.exampleAnswers[1].trim(),
            q.exampleAnswers[2].trim(),
          ],
        });
        if (validated.length >= questionCount) break;
      }
    }
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    console.error(`[interviewMode] Generation failed for level ${level}:`, err);
  }

  // Persist everything — success or failure — before inserting questions
  await db.insert(interviewGenerationLogs).values({
    userId,
    level,
    prompt,
    response: responseText || null,
    validCount: validated.length,
    rejectedCount: rejectionNotes.length,
    rejectionNotes: rejectionNotes.length > 0 ? rejectionNotes : null,
    error: errorText,
  });

  if (validated.length === 0) {
    console.error(`[interviewMode] No valid L${level} questions after validation (user=${userId}). Rejections: ${rejectionNotes.length}`);
    return;
  }

  await db.insert(interviewQuestions).values(
    validated.map((q, i) => ({
      userId,
      level,
      question: q.question,
      layer: q.layer,
      orderIndex: i + 1,
      helperText: q.helperText,
      exampleAnswers: q.exampleAnswers,
    }))
  );
}

// ─── Router ───

export const interviewModeRouter = router({
  /**
   * Returns level statuses and progress for all 3 levels.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const levels = await ensureLevelsExist(ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Get question counts per level
    const questions = await db
      .select()
      .from(interviewQuestions)
      .where(eq(interviewQuestions.userId, ctx.user.id));

    const levelData = levels.map((l) => {
      const qs = questions.filter((q) => q.level === l.level);
      const answered = qs.filter((q) => q.answer != null).length;
      const total = qs.length;
      return {
        level: l.level,
        title: LEVEL_META[l.level]?.title ?? `Level ${l.level}`,
        description: LEVEL_META[l.level]?.description ?? "",
        status: l.status,
        answered,
        total,
        startedAt: l.startedAt,
        completedAt: l.completedAt,
      };
    });

    const currentLevel = levelData.find((l) => l.status === "in_progress")?.level ?? null;

    return { levels: levelData, currentLevel };
  }),

  /**
   * Returns questions for a specific level.
   */
  getQuestions: protectedProcedure
    .input(z.object({ level: z.number().min(1).max(3) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify level is accessible
      const levelRow = await db
        .select()
        .from(interviewLevels)
        .where(and(eq(interviewLevels.userId, ctx.user.id), eq(interviewLevels.level, input.level)))
        .limit(1);

      if (!levelRow[0] || levelRow[0].status === "locked") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Level is locked" });
      }

      const questions = await db
        .select()
        .from(interviewQuestions)
        .where(
          and(
            eq(interviewQuestions.userId, ctx.user.id),
            eq(interviewQuestions.level, input.level),
          )
        )
        .orderBy(asc(interviewQuestions.orderIndex));

      return { questions, status: levelRow[0].status };
    }),

  /**
   * Submit an answer to an interview question.
   */
  answer: protectedProcedure
    .input(z.object({
      questionId: z.string().uuid(),
      answer: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const rl = checkRateLimit(`interview:${ctx.user.id}`, 20, 60_000);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limited. Retry after ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s.`,
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Find the question
      const [question] = await db
        .select()
        .from(interviewQuestions)
        .where(
          and(
            eq(interviewQuestions.id, input.questionId),
            eq(interviewQuestions.userId, ctx.user.id),
          )
        )
        .limit(1);

      if (!question) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });
      }

      if (question.answer != null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already answered" });
      }

      // Save the answer
      await db
        .update(interviewQuestions)
        .set({ answer: input.answer, answeredAt: new Date() })
        .where(eq(interviewQuestions.id, input.questionId));

      // Create memory node
      const nodeType = (LAYER_TO_NODE_TYPE[question.layer] ?? "memory") as any;
      const fullContent = `[Interview L${question.level}] ${question.question}\n\nAnswer: ${input.answer}`;

      const node = await createMemoryNode(ctx.user.id, {
        nodeType,
        hallidayLayer: question.layer,
        content: fullContent,
        sourceType: "interview",
        confidence: 1.0,
        metadata: {
          source: "interview_mode",
          level: question.level,
          questionId: question.id,
        },
      });

      // Fire-and-forget entity extraction
      processContent(ctx.user.id, input.answer, "interview");
      invalidateRecommendationCache(ctx.user.id);

      // Check if level is now complete
      const remaining = await db
        .select({ cnt: count() })
        .from(interviewQuestions)
        .where(
          and(
            eq(interviewQuestions.userId, ctx.user.id),
            eq(interviewQuestions.level, question.level),
            isNull(interviewQuestions.answer),
          )
        );

      // Subtract 1 because we just answered one but the count might be stale
      const unanswered = (remaining[0]?.cnt ?? 0);
      const levelComplete = unanswered === 0;

      if (levelComplete) {
        // Mark level complete
        await db
          .update(interviewLevels)
          .set({ status: "completed", completedAt: new Date() })
          .where(
            and(
              eq(interviewLevels.userId, ctx.user.id),
              eq(interviewLevels.level, question.level),
            )
          );

        // Unlock + generate next level (async, don't block response)
        if (question.level < 3) {
          const nextLevel = (question.level + 1) as 2 | 3;
          db.update(interviewLevels)
            .set({ status: "in_progress", startedAt: new Date() })
            .where(
              and(
                eq(interviewLevels.userId, ctx.user.id),
                eq(interviewLevels.level, nextLevel),
              )
            )
            .then(() => generateLevelQuestions(ctx.user.id, nextLevel))
            .catch((err) => console.error("[interviewMode] Unlock failed:", err));
        }
      }

      return { success: true as const, nodeId: node.id, levelComplete };
    }),
});
