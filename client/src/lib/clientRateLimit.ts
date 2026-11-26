/**
 * Browser-side rate limits to cut needless callable / AI traffic before it hits the server.
 */

type Bucket = { count: number; windowStart: number };

function readBucket(key: string): Bucket {
  try {
    const raw = sessionStorage.getItem(`ghp_rl_${key}`);
    if (!raw) return { count: 0, windowStart: Date.now() };
    const parsed = JSON.parse(raw) as Bucket;
    return {
      count: Number(parsed.count) || 0,
      windowStart: Number(parsed.windowStart) || Date.now(),
    };
  } catch {
    return { count: 0, windowStart: Date.now() };
  }
}

function writeBucket(key: string, bucket: Bucket): void {
  try {
    sessionStorage.setItem(`ghp_rl_${key}`, JSON.stringify(bucket));
  } catch {
    // ignore quota / private mode
  }
}

export type ClientRateResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

/** Consume one token from a sliding window. */
export function takeClientRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): ClientRateResult {
  const now = Date.now();
  const bucket = readBucket(key);
  let { count, windowStart } = bucket;
  if (!windowStart || now - windowStart >= windowMs) {
    windowStart = now;
    count = 0;
  }
  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, windowStart + windowMs - now),
    };
  }
  count += 1;
  writeBucket(key, { count, windowStart });
  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    retryAfterMs: 0,
  };
}

/** Peek without consuming. */
export function peekClientRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): ClientRateResult {
  const now = Date.now();
  const bucket = readBucket(key);
  let { count, windowStart } = bucket;
  if (!windowStart || now - windowStart >= windowMs) {
    return { allowed: true, remaining: limit, retryAfterMs: 0 };
  }
  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, windowStart + windowMs - now),
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    retryAfterMs: 0,
  };
}

/** Debounce map for in-flight / rapid-fire actions. */
const lastFire = new Map<string, number>();

export function allowDebounced(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const prev = lastFire.get(key) || 0;
  if (now - prev < minIntervalMs) return false;
  lastFire.set(key, now);
  return true;
}

export const CLIENT_RATE = {
  /** Gemini-bound store search assists per browser session hour. */
  aiSearch: { key: "ai_search", limit: 5, windowMs: 60 * 60 * 1000, debounceMs: 2500 },
  /** Confirm-diamond / similar AI personalization. */
  aiDiamond: { key: "ai_diamond", limit: 10, windowMs: 60 * 60 * 1000, debounceMs: 1500 },
  /** Admin generateWellnessReply. */
  aiAdmin: { key: "ai_admin", limit: 15, windowMs: 60 * 60 * 1000, debounceMs: 2000 },
  /** Generic callable traffic. */
  callable: { key: "callable", limit: 80, windowMs: 60 * 60 * 1000, debounceMs: 300 },
} as const;
