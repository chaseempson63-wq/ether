import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = resolve(__dirname, "../.post-history.json");

/**
 * @typedef {{ id: string, text: string, postedAt: string, source: 'auto'|'manual', commitHashes?: string[] }} PostEntry
 */

/** @returns {PostEntry[]} */
function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    return [];
  }
}

/** @param {PostEntry[]} entries */
function saveHistory(entries) {
  // Keep last 500 posts max
  const trimmed = entries.slice(-500);
  writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2));
}

/**
 * Record a posted tweet.
 * @param {PostEntry} entry
 */
export function recordPost(entry) {
  const history = loadHistory();
  history.push(entry);
  saveHistory(history);
}

/**
 * Get the last N posts.
 * @param {number} n
 * @returns {PostEntry[]}
 */
export function getRecentPosts(n = 10) {
  return loadHistory().slice(-n);
}

/**
 * Check if a commit hash has already been tweeted about.
 * @param {string} hash
 * @returns {boolean}
 */
export function hasPostedAboutCommit(hash) {
  return loadHistory().some(
    (entry) => entry.commitHashes?.includes(hash)
  );
}

/**
 * Get all commit hashes that have been posted about.
 * @returns {Set<string>}
 */
export function getPostedCommitHashes() {
  const hashes = new Set();
  for (const entry of loadHistory()) {
    if (entry.commitHashes) {
      for (const h of entry.commitHashes) hashes.add(h);
    }
  }
  return hashes;
}
