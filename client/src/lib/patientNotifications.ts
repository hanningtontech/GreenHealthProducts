const STORAGE_KEY = "gh_results_last_seen";
const SEEN_IDS_KEY = "gh_results_seen_ids";

function readSeenIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeSeenIds(ids: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SEEN_IDS_KEY, JSON.stringify([...ids]));
}

/** @deprecated Prefer markScreeningSeen — kept for migration of old watermark. */
export function getResultsLastSeen(): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = localStorage.getItem(STORAGE_KEY);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** @deprecated Prefer markScreeningSeen for per-report clearing. */
export function markResultsSeen(now = Date.now()): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(now));
}

export function markScreeningSeen(id: string): void {
  if (!id) return;
  const ids = readSeenIds();
  ids.add(id);
  writeSeenIds(ids);
}

export function isScreeningSeen(id: string, stamp = 0): boolean {
  if (readSeenIds().has(id)) return true;
  // Migrate old watermark: treat older stamps as already seen once.
  const last = getResultsLastSeen();
  return Boolean(last && stamp && stamp <= last);
}

/** Count shared reports the patient has not opened yet. */
export function countUnseenShared(
  ids: string[],
  sharedHints: Array<{ id: string; stamp: number }>,
): number {
  const hintById = new Map(sharedHints.map((h) => [h.id, h.stamp]));
  return ids.filter((id) => !isScreeningSeen(id, hintById.get(id) || 0)).length;
}

export function screeningStamp(item: { id: string; sharedAt?: unknown; updatedAt?: unknown }): number {
  const raw = item.sharedAt || item.updatedAt;
  if (raw && typeof raw === "object" && "seconds" in (raw as object)) {
    return Number((raw as { seconds: number }).seconds) * 1000;
  }
  if (typeof raw === "string" || typeof raw === "number") {
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const m = String(item.id).match(/(\d{10,})$/);
  return m ? Number(m[1]) : 0;
}
