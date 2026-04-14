import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

/**
 * Get recent git commits from the Ether repo.
 * @param {number} hours — how far back to look (default: 6)
 * @returns {{ hash: string, date: string, subject: string, body: string }[]}
 */
export function getRecentCommits(hours = 6) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Use %x00 (null byte) as record separator to handle multi-line bodies
  const raw = execSync(
    `git log --since="${since}" --pretty=format:"%H%x01%aI%x01%s%x00" --no-merges`,
    { cwd: REPO_ROOT, encoding: "utf-8" }
  ).trim();

  if (!raw) return [];

  return raw
    .split("\0")
    .filter((record) => record.trim())
    .map((record) => {
      const [hash, date, subject] = record.trim().split("\x01");
      return {
        hash: hash.slice(0, 8),
        date,
        subject,
      };
    });
}

/**
 * Get the diff stat for a specific commit.
 * @param {string} hash
 * @returns {string}
 */
export function getCommitDiffStat(hash) {
  return execSync(`git diff --stat ${hash}~1..${hash} 2>/dev/null || echo "(initial commit)"`, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  }).trim();
}

/**
 * Get a summary of what changed: files touched, insertions, deletions.
 * @param {number} hours
 * @returns {string}
 */
export function getChangeSummary(hours = 6) {
  const commits = getRecentCommits(hours);
  if (commits.length === 0) return "No commits in the last " + hours + " hours.";

  const lines = commits.map(
    (c) => `- ${c.subject} (${c.hash})`
  );

  return `${commits.length} commit(s) in the last ${hours}h:\n${lines.join("\n")}`;
}
