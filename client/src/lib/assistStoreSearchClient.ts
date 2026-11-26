import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";
import { buildGeminiCatalogCandidates } from "./geminiBankFallback";
import { findSimilarCases, isRetrievalEligible, listKnowledgeCases } from "./knowledgeBank";
import { draftIntakeFromContentBank } from "./replyFromBank";
import { detectUrgentCare } from "./bankUrgent";
import { filterVisibleProducts, writeLastStoreSearch } from "./pickFeaturedProducts";
import { loadProducts, type Product } from "./catalog";
import { CLIENT_RATE, allowDebounced, takeClientRateLimit } from "./clientRateLimit";
import type { Intake } from "./screeningTypes";

const FUNCTIONS_REGION = "us-central1";
export const HELP_PREFILL_KEY = "ghp_help_prefill";

export type StoreSearchAssistResult = {
  /** intent = ask expert vs look for product (no guidance/results yet). */
  mode: "products" | "wellness" | "urgent" | "intent";
  products: Product[];
  summary: string;
  nextSteps: string;
  needsConfirm: boolean;
  matchedCaseIds: string[];
  source: "catalog" | "bank" | "gemini" | "fallback";
  query: string;
};

type AssistCallableResponse = {
  ok?: boolean;
  mode: "products" | "wellness" | "urgent";
  productCodes: string[];
  summary: string;
  nextSteps: string;
  needsConfirm: boolean;
  matchedCaseIds?: string[];
  source?: "gemini" | "fallback";
};

/** True when the query reads like a symptom / how-you-feel note rather than a product name. */
export function looksLikeFeeling(query: string, catalogHits: number): boolean {
  const q = query.trim();
  if (q.length >= 28) return true;
  if (catalogHits >= 2 && q.split(/\s+/).length <= 3) return false;
  return /\b(i feel|feeling|pain|ache|hurt|tired|dizzy|headache|migraine|nausea|fever|cough|sleep|anxiety|stress|pressure|sugar|diabetes|bp\b|maumivu|nina|kichwa|tumbo|usingizi|homa|shinikizo)\b/i.test(q);
}

export function writeHelpPrefill(text: string): void {
  try {
    sessionStorage.setItem(HELP_PREFILL_KEY, text.slice(0, 2000));
  } catch {
    // ignore
  }
}

export function readHelpPrefill(): string {
  try {
    const v = String(sessionStorage.getItem(HELP_PREFILL_KEY) || "");
    sessionStorage.removeItem(HELP_PREFILL_KEY);
    return v;
  } catch {
    return "";
  }
}

async function callAssistStoreSearch(input: {
  language: "en" | "sw";
  query: string;
  catalogCandidates: Array<{ code: string; name: string; documentedUse: string }>;
  bankHints: Array<{ conditionTitle: string; guidance: string }>;
}): Promise<AssistCallableResponse | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const fn = httpsCallable(getFunctions(getFirebaseApp(), FUNCTIONS_REGION), "assistStoreSearch");
    const result = await fn(input);
    return result.data as AssistCallableResponse;
  } catch (err) {
    console.warn("assistStoreSearch failed", err instanceof Error ? err.message : err);
    return null;
  }
}

function productsFromCodes(all: Product[], codes: string[]): Product[] {
  const map = new Map(all.filter((p) => p.visible).map((p) => [p.code.toUpperCase(), p]));
  const out: Product[] = [];
  for (const code of codes) {
    const hit = map.get(code.toUpperCase());
    if (hit && !out.some((p) => p.id === hit.id)) out.push(hit);
  }
  return out;
}

/** Run top-bar / store search: catalog first, then bank, then Gemini assist with confirm. */
export async function runStoreSearchAssist(
  query: string,
  options?: { language?: "en" | "sw"; products?: Product[] },
): Promise<StoreSearchAssistResult> {
  const q = query.trim();
  writeLastStoreSearch(q);
  const language = options?.language || (/[à-ÿ]|nina|tumbo|kichwa|maumivu|usingizi/i.test(q) ? "sw" : "en");
  const all = options?.products?.length ? options.products : loadProducts();
  const catalogHits = filterVisibleProducts(all, q).slice(0, 8);

  if (!looksLikeFeeling(q, catalogHits.length) && catalogHits.length) {
    return {
      mode: "products",
      products: catalogHits,
      summary: language === "sw" ? "Bidhaa zinazolingana." : "Matching products.",
      nextSteps: "",
      needsConfirm: false,
      matchedCaseIds: [],
      source: "catalog",
      query: q,
    };
  }

  const urgent = detectUrgentCare(q);
  if (urgent) {
    return {
      mode: "urgent",
      products: [],
      summary: language === "sw" ? urgent.actionSw : urgent.actionEn,
      nextSteps: language === "sw"
        ? "Tafuta huduma ya dharura sasa."
        : "Seek emergency care now.",
      needsConfirm: true,
      matchedCaseIds: [],
      source: "fallback",
      query: q,
    };
  }

  const synthetic: Intake = {
    id: "search-preview",
    authUid: "",
    patientId: "",
    email: "",
    displayName: "",
    language,
    freeText: q,
    concerns: [],
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const bankDraft = await draftIntakeFromContentBank(synthetic);
  if (bankDraft.matchedCaseIds.length && !bankDraft.urgent) {
    const codes = (bankDraft.recommendations || [])
      .map((r) => r.code)
      .filter(Boolean) as string[];
    return {
      mode: "wellness",
      products: productsFromCodes(all, codes).slice(0, 1),
      summary: bankDraft.reply,
      nextSteps: "",
      needsConfirm: true,
      matchedCaseIds: bankDraft.matchedCaseIds,
      source: "bank",
      query: q,
    };
  }

  // Prefer catalog / bank. Only call Gemini when under client rate limits.
  let aiOk = false;
  let remote: AssistCallableResponse | null = null;
  if (allowDebounced(CLIENT_RATE.aiSearch.key, CLIENT_RATE.aiSearch.debounceMs)) {
    const aiToken = takeClientRateLimit(
      CLIENT_RATE.aiSearch.key,
      CLIENT_RATE.aiSearch.limit,
      CLIENT_RATE.aiSearch.windowMs,
    );
    const callToken = takeClientRateLimit(
      CLIENT_RATE.callable.key,
      CLIENT_RATE.callable.limit,
      CLIENT_RATE.callable.windowMs,
    );
    aiOk = aiToken.allowed && callToken.allowed;
    if (aiOk) {
      const bank = await listKnowledgeCases();
      const soft = findSimilarCases(bank.filter(isRetrievalEligible), q, 3, { minScore: 1 });
      const candidates = buildGeminiCatalogCandidates(q);
      remote = await callAssistStoreSearch({
        language,
        query: q,
        catalogCandidates: candidates,
        bankHints: soft.map((c) => ({
          conditionTitle: c.conditionTitle || c.title,
          guidance: c.replyConcerns || c.summary || "",
        })),
      });
    }
  }

  if (remote) {
    return {
      mode: remote.mode,
      products: productsFromCodes(all, remote.productCodes || []),
      summary: remote.summary,
      nextSteps: remote.nextSteps || "",
      needsConfirm: remote.mode === "products" ? Boolean(remote.needsConfirm) : true,
      matchedCaseIds: remote.matchedCaseIds || [],
      source: remote.source === "gemini" ? "gemini" : "fallback",
      query: q,
    };
  }

  if (catalogHits.length) {
    return {
      mode: "products",
      products: catalogHits,
      summary: language === "sw" ? "Bidhaa zinazolingana." : "Matching products.",
      nextSteps: "",
      needsConfirm: false,
      matchedCaseIds: [],
      source: "catalog",
      query: q,
    };
  }

  const limitedNote = !aiOk
    ? (language === "sw"
      ? " Usaidizi wa AI umepunguzwa kwa sasa — tumia Get help au WhatsApp."
      : " AI assist is temporarily limited — use Get help or WhatsApp.")
    : "";

  return {
    mode: "wellness",
    products: [],
    summary: `${bankDraft.reply}${limitedNote}`.trim(),
    nextSteps: language === "sw"
      ? "Thibitisha na uendelee kwenye Get help."
      : "Confirm and continue in Get help.",
    needsConfirm: true,
    matchedCaseIds: bankDraft.matchedCaseIds,
    source: "fallback",
    query: q,
  };
}
