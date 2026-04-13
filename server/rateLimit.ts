/**
 * Simple in-memory sliding-window rate limiter.
 * Not persistent across restarts — fine for a single-process deployment.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const buckets = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 120_000; // keep 2min of history max
  for (const [key, entry] of buckets) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) buckets.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Check whether a request should be allowed under the rate limit.
 *
 * @param key     Unique key (e.g., `"persona:${userId}"`)
 * @param limit   Max requests allowed in the window
 * @param windowMs Window size in milliseconds
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = buckets.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    buckets.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    // Oldest timestamp in the window — user can retry after it ages out
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}
