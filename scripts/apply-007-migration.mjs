#!/usr/bin/env node
/**
 * One-off: applies migration 007 (ALTER + backfill).
 * - Adds helper_text + example_answers columns to interview_questions_v2
 * - Backfills existing L1 rows by matching question text against LEVEL_1_SEED
 *
 * Idempotent: uses IF NOT EXISTS on ALTER, WHERE on UPDATE. Safe to re-run.
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the migration SQL
const migrationPath = join(__dirname, "..", "supabase", "migrations", "007_interview_scaffolding.sql");
const migrationSQL = readFileSync(migrationPath, "utf8");

// Import the seed constant (tsx would be cleanest but pnpm doesn't run .mjs through tsx easily,
// so we duplicate the pairs here — deterministic static content). Keep in sync with
// server/routers/interviewMode.ts LEVEL_1_SEED.
const SEED = [
  { question: "What language do you think in?", helperText: "Think about your inner voice — the one narrating right now, or the one you argue with yourself in. Does it switch depending on what you're feeling?", exampleAnswers: ["English normally, but when I'm stressed I catch myself counting in Cantonese. My grandma taught me numbers before anyone taught me in school, and that's the one that stuck.","Mostly English, but all my swearing is in Spanish. My mom says she can tell when I stub my toe from three rooms away.","It's mostly pictures honestly. I don't have much of a running monologue — I see the thing I'm thinking about, and words come later when I have to say it out loud."]},
  { question: "What phrase do you say that nobody else does?", helperText: "Not a catchphrase — something you catch yourself saying that friends have teased you for, or that shows up in your texts more than you realize.", exampleAnswers: ["\"Sweet as, sweet as.\" Always twice. I don't even know why. My partner started imitating me and now I notice it every single day.","\"In fairness\" at the start of almost every sentence where I'm disagreeing with someone. It makes me sound more reasonable than I actually feel.","I call everyone 'my guy' — dogs, strangers, my 68-year-old dad. Started as a joke in college and I never stopped."]},
  { question: "How would your closest friend describe your voice?", helperText: "Imagine them at dinner trying to explain to someone what you sound like — not just the tone, but the rhythm, the jokes, the tells. What would they land on?", exampleAnswers: ["Flat until I'm excited, then I talk with my whole body. Jake says I go from courtroom to sports commentary in about two sentences.","Soft and slow. A friend once said I sound like I'm reading everyone a bedtime story, even when I'm complaining about work.","Dry, kind of deadpan, lots of pauses. They'd say I wait a beat too long before the punchline, but the punchline's usually worth it."]},
  { question: "What word do you overuse?", helperText: "The tic your partner or coworkers have pointed out. The word that shows up in every email. The one you reach for when you can't think of the right one.", exampleAnswers: ["\"Literally.\" I use it when I'm not being literal, which is honestly most of the time. My sister made me put a dollar in a jar for a week and I owed her $34.","\"Interesting.\" It's my noncommittal default when I don't agree but also don't want to argue. A friend called me out — she said it's code for 'I'm already disagreeing with you.'","\"Basically.\" I start every explanation with it, like I need to warn people I'm about to oversimplify. My boss once asked me to try not saying it in a whole meeting and I made it maybe four minutes."]},
  { question: "Where did you grow up?", helperText: "Not the postcode — the feel of the place. What the air smelled like, who was around, what you did when you were bored.", exampleAnswers: ["Small town in the Waikato, 2000 people, one pub. I used to walk the dog along the stopbank after school and there was always one kid fishing who never caught anything.","Queens, New York. A shared third-floor walk-up with four of us in two bedrooms. My mom worked nights so I got really good at cooking by ten.","On a farm outside Armidale. Hours from anywhere. We had a big tin water tank I used to climb on and watch storms roll in from the west — you could see them coming for forty-five minutes."]},
  { question: "What's a moment that split your life into before and after?", helperText: "Not necessarily the biggest event — the moment where something shifted and you knew afterwards you were a different person. Could be tiny, could be huge.", exampleAnswers: ["My dad calling me from the hospital at 6am telling me grandpa had died. I was 19, in a dorm shower, and the whole day I kept thinking the hot water wouldn't run out this time.","The morning I decided to leave my marriage. I was making coffee, watched him scroll his phone without looking up, and realized I'd been waiting for a reason that wasn't coming. I didn't leave for eight more months but that's when it ended.","Getting cut from the national squad at 17. I'd organized my whole identity around making it. I flew home the next day and started applying for jobs I'd never thought about, and honestly I've been happier ever since."]},
  { question: "What's your earliest memory?", helperText: "Not the one you've been told about — the one that's actually yours. The fragment that plays in your head when you try to remember being small.", exampleAnswers: ["Sitting in a wet nappy on the lino in the kitchen, watching my mum cook. I can't have been more than two. I remember the smell of onions and the feeling of the floor being cold.","My granddad's ute. I was in the passenger seat with no seatbelt — early 90s, country road — and he was singing something in te reo that I didn't understand but I knew he was happy.","A goldfish dying. Orange, floating at the top of the tank, and I pressed my face against the glass for so long my nose went numb. I think I was four. First time I understood dead meant not coming back."]},
  { question: "What's something that happened to you that you still don't fully understand?", helperText: "Not a mystery to solve — a thing that happened that you still turn over in your head. The moment whose meaning keeps shifting depending on when you revisit it.", exampleAnswers: ["My uncle came over one Christmas, sat on the couch for three hours, didn't say a word, left. Nobody else in the family thought it was weird. We never talked about it. He died two years later and I still don't know what he was doing there.","I got into a school I hadn't applied to. Paperwork error, apparently. I went anyway because my parents thought I had, and I met my wife there. I've never figured out if that's serendipity or if I'd have had the same life either way.","My best friend stopped talking to me senior year of high school. No fight, no event, just — done. We'd been inseparable for six years. I ran into her at a wedding eight years later and she hugged me like nothing had happened. I still don't know."]},
  { question: "How do you make big decisions?", helperText: "Don't tell me the framework — tell me what you actually do. Do you talk it out? Make lists? Wait for a gut call? Who do you consult, and at what stage?", exampleAnswers: ["I pretend I've already decided each option for a week. Sunday I'd wake up having said yes, following Sunday having said no. Whichever one felt like a relief by Wednesday, that was the answer.","Spreadsheets, always. I need to see the tradeoffs in cells. My wife calls it avoidance dressed up as analysis and she's not wrong, but it still works for me.","I call my sister. She's blunt to a fault and usually right. I don't even need her advice most of the time — I just need to say it out loud to somebody who'll push back."]},
  { question: "What's a belief you held strongly that you later changed?", helperText: "Not a position you softened — one you flipped. The one you'd have argued hard for at 22 and can't defend now.", exampleAnswers: ["I used to think therapy was for people who couldn't handle their own problems. Two years of it after my divorce and I'd now say the opposite — not going is the avoidance.","That hard work alone gets you what you want. I watched my dad grind himself to nothing and end up with nothing. Luck and timing are at least half of it, and I say that to everyone under 30 I mentor now.","I was convinced ambition and contentment were opposites — that if you were happy you'd stopped wanting. My brother is both at once and it rewired how I think about it."]},
  { question: "What do you do for work and why?", helperText: "Both halves matter. The 'what' is easy — the 'why' is the real thing. What would you say if a kid asked you and you had to give a real answer?", exampleAnswers: ["I'm a nurse in a pediatric ICU. I do it because I'm good at staying calm when other people can't, and because somewhere around 25 I realized I needed my work to matter in a way I could see at the end of the day.","I run a small accounting firm. I didn't pick it for any noble reason — my dad had one, I was decent at numbers, and it lets me coach my kids' teams and not miss dinner. That's the 'why' honestly.","Software engineer at a startup. I like building things that work, I like being paid well, and I've made peace with the fact that those are my actual reasons and I don't need a bigger story."]},
  { question: "What's a risk you took that paid off?", helperText: "Not the obvious career one — any risk where you had real skin in it and the outcome wasn't guaranteed. What made you pull the trigger?", exampleAnswers: ["Moved to Melbourne at 24 with no job, no flat, and about four grand in savings. My parents thought I was losing my mind. Met my business partner there in week three and we've been building the company seven years now.","Told my boss I'd quit if they didn't let me work remote from my parents' farm for six months while my dad had chemo. I was 100% ready to leave. She said yes. I stayed another four years.","Asked someone out who I was positive would say no. She did, the first time. Four years later we're married. Turns out the 'no' was about timing and I got the 'ask again' read wrong."]},
  { question: "What would you never compromise on?", helperText: "The line you've already been tested on and held. Not a theoretical line — one you've actually enforced, probably at a cost.", exampleAnswers: ["Not lying to my kids about hard stuff. We told my six-year-old his grandma was dying in plain words. My in-laws hated it. He handled it better than any of the adults did.","Staying off my phone after 9pm when I'm with my wife. Sounds small. I've killed a few late-night work conversations over it and my team has learned to work around it.","Never working for a company I wouldn't tell my mum the truth about. Turned down a $200k offer last year from a gambling company. I could feel the shape of the lie I'd have to tell her at Sunday lunch."]},
  { question: "What do you want to be remembered for?", helperText: "Not the eulogy headline — the small thing a specific person would say. What would your best friend say when someone asked what you were like?", exampleAnswers: ["That I was the one who'd actually show up. Not nice texts on your birthday — driving three hours when your dog died. I've built my whole adult life around being that person for a small number of people.","For making people laugh at funerals. I don't mean that as a joke. I've done it at three now and people remember it. If you can do that you've given the room something real.","That I left things better than I found them. Bigger or smaller scale doesn't matter — the kitchen, the codebase, the kid I coached. I want that to be the pattern someone sees when they stack it all up."]},
  { question: "What's worth suffering for?", helperText: "Not in the abstract — something you've actually suffered for and would do again. The thing whose cost you've paid and still thought yes, worth it.", exampleAnswers: ["Raising my kids with real presence. I've turned down promotions twice, taken less money, worked jobs I didn't love to be home for dinner. Six years in and I've never regretted any of it.","The marriage, specifically the bad years. Year four and five were awful — we nearly didn't make it. What's on the other side is the best thing in my life and I wouldn't trade the 18 months of pain for an easier decade elsewhere.","Telling the truth to people who didn't want to hear it. I've lost at least three friendships and one job over things I knew I had to say. The version of me that didn't say them — I don't want to be him."]},
  { question: "Where does your sense of right and wrong come from?", helperText: "Not 'my parents raised me well' — specifically, trace it. A person, a moment, a book, a religion, a mistake. What actually formed it?", exampleAnswers: ["My mum. Not from what she told me — from watching her give away food we couldn't afford to give and not mention it to anyone. I realized at maybe 12 that what you do when nobody's watching is the whole thing.","Getting caught stealing from a shop when I was 9. The shopkeeper called my dad in and instead of punishing me he paid for it and made me go back alone the next day and apologize. That walk back in has stayed with me for 30 years.","Honestly, not religion or family — more a trained revulsion. Once I could clearly picture a person as a person with their own inner life, I stopped being able to treat them as a means to anything. I don't know where that came from exactly."]},
  { question: "What makes you angry that doesn't bother most people?", helperText: "The small thing that gets you unreasonably worked up. The thing your friends roll their eyes at when you start in on it.", exampleAnswers: ["People who don't return their shopping trolley to the bay. I know it's nothing. I know. And yet I have stood in a carpark and watched a man leave his trolley in a disabled space and felt actual rage.","Being interrupted while someone else is talking — specifically in meetings, by men, to women. I've made it a thing to call out on behalf of people and apparently it's exhausting for others to watch.","Lateness without acknowledgement. Be 40 minutes late, I don't care, just don't walk in like it's normal. My brother is chronically late and we've had fights about it since we were teenagers."]},
  { question: "How do you handle being wrong?", helperText: "Not what you wish you did — what actually happens. The first five minutes, the next day, who you tell, what you notice about yourself in the middle of it.", exampleAnswers: ["Badly at first. I get quiet and defensive for about ten minutes. Then I go for a walk, and by the time I'm back I can say it out loud. My wife has learned not to push me during the quiet part.","Honestly? Better than most. I grew up in a family that argued about everything and the only way to win was to update your position fast when the evidence moved. I kind of enjoy being proven wrong — it means I've learned something.","It depends who's right. With strangers on the internet, badly. With my wife or my two closest friends, fine. My therapist pointed out this pattern and I haven't figured out why it tracks so cleanly."]},
  { question: "What's your relationship with fear?", helperText: "Not 'what are you scared of' — how fear works in you. Does it freeze you, sharpen you, make you reckless? Do you notice it early or only after?", exampleAnswers: ["It sharpens me. I do my best work when I'm quietly terrified of failing. I've tried to get to a place where I don't need it to perform but honestly I haven't, and I've stopped pretending I want to.","I get very still. Outside it looks like calm and inside my stomach is a rock. A few people in my life have learned to read the difference and it's how I know who actually sees me.","I act fast to get out of it. Which has worked for me — I've left jobs and relationships that weren't working while friends are still agonizing. It's also cost me a few things I probably should have sat with longer."]},
  { question: "When do you feel most like yourself?", helperText: "The activity or setting where the performance drops and you're just there. Could be mundane, doesn't have to be profound.", exampleAnswers: ["Driving on the motorway alone at night with music I know all the words to. No one to perform for, no need to be anything. Half my big realizations have happened between exits.","Cooking for four or five people who aren't in a rush. Hands busy, a glass of wine, everyone chatting around me — I lose track of time and my face relaxes in a way my partner has pointed out.","In the gym on heavy squat day. Nothing works in your head when the bar is on your back. I feel more like me in that 30 seconds than most of the rest of the week."]},
];

const sql = postgres(process.env.DATABASE_URL, { connect_timeout: 15 });

(async () => {
  try {
    console.log("Applying ALTER TABLE...");
    await sql.unsafe(migrationSQL);
    console.log("✓ Columns added (idempotent)");

    console.log(`\nBackfilling ${SEED.length} L1 seed rows across all users...`);
    let totalUpdated = 0;
    for (const entry of SEED) {
      const updated = await sql`
        UPDATE interview_questions_v2
        SET helper_text = ${entry.helperText},
            example_answers = ${JSON.stringify(entry.exampleAnswers)}::jsonb
        WHERE level = 1
          AND question = ${entry.question}
          AND (helper_text IS NULL OR example_answers IS NULL)
        RETURNING id
      `;
      totalUpdated += updated.length;
      console.log(`  [${entry.question.slice(0, 60)}...] → ${updated.length} row(s)`);
    }
    console.log(`\n✓ Backfilled ${totalUpdated} total rows`);

    // Audit: any L1 rows still missing?
    const missing = await sql`
      SELECT count(*) as cnt FROM interview_questions_v2
      WHERE level = 1 AND (helper_text IS NULL OR example_answers IS NULL)
    `;
    console.log(`L1 rows still NULL after backfill: ${missing[0].cnt}`);
    if (missing[0].cnt > 0) {
      console.log("  ↑ These are L1 rows whose question text doesn't match any seed entry (stale test data or off-seed rows).");
    }

    const l2l3Null = await sql`
      SELECT level, count(*) as cnt FROM interview_questions_v2
      WHERE level > 1 AND (helper_text IS NULL OR example_answers IS NULL)
      GROUP BY level ORDER BY level
    `;
    console.log(`L2/L3 NULL (expected — UI handles):`);
    l2l3Null.forEach(r => console.log(`  level=${r.level}: ${r.cnt} rows`));
  } catch (e) {
    console.error("FAIL:", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
