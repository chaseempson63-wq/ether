import "dotenv/config";
import { getRecentCommits } from "./git-reader.js";
import { generateDraftBatch } from "./generate.js";

const HOURS = 48;
const COUNT = parseInt(process.argv.find((a) => a.match(/^\d+$/)) || "5", 10);
const thought = process.argv
  .slice(2)
  .filter((a) => !a.match(/^\d+$/))
  .join(" ")
  .trim() || null;

async function draft() {
  const commits = getRecentCommits(HOURS);

  if (commits.length === 0 && !thought) {
    console.log("\n  No recent commits and no thoughts provided. Nothing to draft.\n");
    process.exit(0);
  }

  const summary = commits.length > 0
    ? `${commits.length} commit(s):\n${commits.map((c) => `- ${c.subject} (${c.hash})`).join("\n")}`
    : null;

  console.log("\n\x1b[36m━━━ Ether Tweet Drafts ━━━\x1b[0m\n");

  if (commits.length > 0) {
    console.log(`\x1b[2m  Source: ${commits.length} commits from the last ${HOURS}h\x1b[0m`);
  }
  if (thought) {
    console.log(`\x1b[2m  Thought: "${thought}"\x1b[0m`);
  }
  console.log(`\x1b[2m  Generating ${COUNT} drafts...\x1b[0m\n`);

  const tweets = await generateDraftBatch(summary, thought, COUNT);

  for (let i = 0; i < tweets.length; i++) {
    const t = tweets[i];
    const charColor = t.length <= 280 ? "\x1b[32m" : "\x1b[31m";
    console.log(`  \x1b[1m${i + 1}.\x1b[0m ${t}`);
    console.log(`     ${charColor}${t.length} chars\x1b[0m\n`);
  }

  console.log("\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n");
}

draft().catch((err) => {
  console.error("[X-Agent] Fatal:", err.message);
  process.exit(1);
});
