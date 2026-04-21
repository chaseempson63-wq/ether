import "dotenv/config";
import { evaluateAchievements, listEarnedAchievements } from "../server/achievements.ts";

const earned = await evaluateAchievements(1);
console.log(`Newly earned for user 1: ${earned.length}`);
for (const a of earned) console.log(`  - ${a.achievementId} @ ${a.earnedAt}`);

const all = await listEarnedAchievements(1);
console.log(`\nAll earned for user 1: ${all.length}`);
for (const a of all) console.log(`  - ${a.achievementId}`);
process.exit(0);
