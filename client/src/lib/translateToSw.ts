/**
 * English → Kiswahili helpers for bank replies and report summaries.
 * Prefers Cloud Function (google-translate-api-x server-side), then browser
 * package, then MyMemory public API as a last-resort fallback.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";
import { CLIENT_RATE, allowDebounced, takeClientRateLimit } from "./clientRateLimit";

const FUNCTIONS_REGION = "us-central1";
const MAX_CHUNK = 4500;

const WEAK_SW_PATTERNS = [
  /kulingana na content bank/i,
  /iliyoidhinishwa/i,
  /muhtasari wa msaada uko hapa chini/i,
  /^hii si utambuzi/i,
];

export function isWeakSwahiliSummary(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  if (t.length < 40) return true;
  return WEAK_SW_PATTERNS.some((re) => re.test(t));
}

function chunkText(text: string, size = MAX_CHUNK): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= size) return [cleaned];
  const parts: string[] = [];
  let rest = cleaned;
  while (rest.length) {
    if (rest.length <= size) {
      parts.push(rest);
      break;
    }
    let cut = rest.lastIndexOf("\n\n", size);
    if (cut < size * 0.4) cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.4) cut = rest.lastIndexOf(" ", size);
    if (cut < size * 0.4) cut = size;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return parts.filter(Boolean);
}

async function translateViaCloudFunction(text: string): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured");
  if (!allowDebounced("translate_cf", 800)) throw new Error("Translation busy");
  if (!takeClientRateLimit(CLIENT_RATE.callable.key, CLIENT_RATE.callable.limit, CLIENT_RATE.callable.windowMs).allowed) {
    throw new Error("Translation rate limited");
  }
  const fn = httpsCallable(getFunctions(getFirebaseApp(), FUNCTIONS_REGION), "translateToSwahili");
  const result = await fn({ text });
  const data = result.data as { text?: string };
  if (!data?.text?.trim()) throw new Error("Empty translation from Cloud Function");
  return data.text.trim();
}

async function translateViaPackage(text: string): Promise<string> {
  const { translate } = await import("google-translate-api-x");
  const chunks = chunkText(text);
  const out: string[] = [];
  for (const chunk of chunks) {
    const res = await translate(chunk, { from: "en", to: "sw", client: "gtx", forceBatch: true });
    const translated = Array.isArray(res) ? res.map((r) => r.text).join("\n") : res.text;
    out.push(String(translated || "").trim());
  }
  return out.filter(Boolean).join("\n\n");
}

async function translateViaMyMemory(text: string): Promise<string> {
  const chunks = chunkText(text, 450);
  const out: string[] = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|sw`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const json = (await res.json()) as { responseData?: { translatedText?: string } };
    const translated = json.responseData?.translatedText?.trim();
    if (!translated) throw new Error("Empty MyMemory translation");
    // MyMemory sometimes echoes the query on failure
    if (translated.toLowerCase() === chunk.toLowerCase() && /[a-z]{4,}/i.test(chunk)) {
      throw new Error("MyMemory returned untranslated text");
    }
    out.push(translated);
  }
  return out.join("\n\n");
}

/** Translate English wellness copy into Kiswahili. */
export async function translateEnglishToSwahili(english: string): Promise<string> {
  const text = String(english || "").trim();
  if (!text) return "";

  const errors: string[] = [];

  try {
    return await translateViaCloudFunction(text);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Cloud Function failed");
  }

  try {
    return await translateViaPackage(text);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Package translate failed");
  }

  try {
    return await translateViaMyMemory(text);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "MyMemory failed");
  }

  console.warn("EN→SW translation failed:", errors.join(" · "));
  return "";
}

/**
 * Prefer translating the full English assembled answer so Kiswahili matches it.
 * Falls back to an existing Swahili string only if translation fails.
 */
export async function ensureSwahiliSummary(
  english: string,
  existingSw?: string,
  opts?: { preferExisting?: boolean },
): Promise<string> {
  const existing = (existingSw || "").trim();
  if (opts?.preferExisting && !isWeakSwahiliSummary(existing) && existing.length >= Math.min(120, english.length * 0.45)) {
    return existing;
  }
  const translated = await translateEnglishToSwahili(english);
  return translated || existing;
}
