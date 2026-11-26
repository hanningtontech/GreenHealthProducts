/**
 * Patient-safe store search assist (not admin-only).
 * Gemini may draft wellness wording; product codes must stay in the eligible catalog set.
 */
import { HttpsError } from "firebase-functions/v2/https";
import { redactPii } from "./generateWellnessReply";

export type AssistStoreSearchInput = {
  language: "en" | "sw";
  query: string;
  catalogCandidates: Array<{ code: string; name: string; documentedUse: string }>;
  bankHints?: Array<{ conditionTitle: string; guidance: string }>;
};

export type AssistStoreSearchResult = {
  mode: "products" | "wellness" | "urgent";
  productCodes: string[];
  summary: string;
  nextSteps: string;
  needsConfirm: boolean;
  matchedCaseIds: string[];
  source: "gemini" | "fallback";
};

const SYSTEM_INSTRUCTION = `You help GreenHealthProducts store search.
Given a short shopper query (product name OR how they feel), return JSON only.

Rules:
- Recommend product codes ONLY from eligibleCatalogCandidates. Never invent codes.
- If the query is clearly a product browse (brand/code/ingredient), set mode "products", pick up to 4 matching codes, keep summary short.
- If the query describes symptoms or feelings, set mode "wellness", write a short summary + nextSteps, pick at most ONE product code when a candidate clearly fits, else null/empty.
- If red-flag emergency wording, set mode "urgent", empty productCodes, tell them to seek emergency care now.
- needsConfirm must be true whenever mode is wellness or when you relied on general knowledge beyond bankHints.
- Do not claim diagnosis or prescription. Plain language only.
- Return JSON fields: mode, productCodes, summary, nextSteps, needsConfirm.`;

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(body.slice(start, end + 1));
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text.trim()) throw new Error("Empty Gemini response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function fallback(input: AssistStoreSearchInput): AssistStoreSearchResult {
  const q = input.query.toLowerCase();
  const urgent = /chest pain|can't breathe|cannot breathe|stroke|suicide|unconscious|seizure|bleeding heavily/i.test(q);
  if (urgent) {
    return {
      mode: "urgent",
      productCodes: [],
      summary: input.language === "sw"
        ? "Hii inaweza kuwa dharura. Tafuta huduma ya dharura sasa."
        : "This may be an emergency. Seek emergency care now.",
      nextSteps: input.language === "sw"
        ? "Piga huduma ya dharura au nenda hospitali iliyo karibu."
        : "Call emergency services or go to the nearest emergency department.",
      needsConfirm: true,
      matchedCaseIds: [],
      source: "fallback",
    };
  }
  const codes = input.catalogCandidates
    .filter((c) => {
      const hay = `${c.code} ${c.name} ${c.documentedUse}`.toLowerCase();
      return q.split(/\s+/).filter((w) => w.length > 2).some((w) => hay.includes(w));
    })
    .slice(0, 4)
    .map((c) => c.code.toUpperCase());
  if (codes.length) {
    return {
      mode: "products",
      productCodes: codes,
      summary: input.language === "sw" ? "Bidhaa zinazofanana na utafutaji wako." : "Products that match your search.",
      nextSteps: "",
      needsConfirm: false,
      matchedCaseIds: [],
      source: "fallback",
    };
  }
  return {
    mode: "wellness",
    productCodes: [],
    summary: input.language === "sw"
      ? "Tumepokea maelezo yako. Thibitisha ili tuendelee kukusaidia, au tuma kwenye Get help."
      : "We have your note. Confirm to continue, or send it through Get help.",
    nextSteps: input.language === "sw"
      ? "Fungua Get help ili kuweka maelezo yako na akaunti yako."
      : "Open Get help so we can keep your note with your account.",
    needsConfirm: true,
    matchedCaseIds: [],
    source: "fallback",
  };
}

export async function assistStoreSearchCore(
  input: AssistStoreSearchInput,
): Promise<AssistStoreSearchResult> {
  const eligible = new Set(
    (input.catalogCandidates || []).map((c) => String(c.code || "").trim().toUpperCase()).filter(Boolean),
  );
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return fallback(input);

  const prompt = JSON.stringify({
    language: input.language,
    query: redactPii(input.query).slice(0, 800),
    eligibleCatalogCandidates: (input.catalogCandidates || []).slice(0, 12).map((c) => ({
      code: String(c.code || "").toUpperCase(),
      name: String(c.name || "").slice(0, 120),
      documentedUse: String(c.documentedUse || "").slice(0, 400),
    })),
    bankHints: (input.bankHints || []).slice(0, 4).map((h) => ({
      conditionTitle: String(h.conditionTitle || "").slice(0, 120),
      guidance: redactPii(String(h.guidance || "")).slice(0, 600),
    })),
  });

  try {
    const raw = await callGemini(prompt, apiKey);
    const parsed = extractJsonObject(raw) as Record<string, unknown>;
    const modeRaw = String(parsed.mode || "wellness").toLowerCase();
    const mode: AssistStoreSearchResult["mode"] =
      modeRaw === "products" || modeRaw === "urgent" ? modeRaw : "wellness";
    const codesRaw = Array.isArray(parsed.productCodes)
      ? parsed.productCodes
      : parsed.productCode
        ? [parsed.productCode]
        : [];
    const productCodes = codesRaw
      .map((c) => String(c || "").trim().toUpperCase())
      .filter((c) => eligible.has(c))
      .slice(0, mode === "wellness" ? 1 : 4);
    const needsConfirm = mode !== "products"
      ? true
      : Boolean(parsed.needsConfirm);
    return {
      mode,
      productCodes: mode === "urgent" ? [] : productCodes,
      summary: String(parsed.summary || "").trim().slice(0, 2000)
        || fallback(input).summary,
      nextSteps: String(parsed.nextSteps || "").trim().slice(0, 2000),
      needsConfirm,
      matchedCaseIds: [],
      source: "gemini",
    };
  } catch (err) {
    console.warn("assistStoreSearch fallback", err instanceof Error ? err.message : "error");
    return fallback(input);
  }
}

export function assertAssistStoreSearchInput(data: unknown): AssistStoreSearchInput {
  const d = (data || {}) as Record<string, unknown>;
  const query = String(d.query || "").trim();
  if (!query) throw new HttpsError("invalid-argument", "query required");
  return {
    language: d.language === "sw" ? "sw" : "en",
    query: query.slice(0, 800),
    catalogCandidates: Array.isArray(d.catalogCandidates)
      ? (d.catalogCandidates as AssistStoreSearchInput["catalogCandidates"]).slice(0, 24)
      : [],
    bankHints: Array.isArray(d.bankHints)
      ? (d.bankHints as Array<{ conditionTitle: string; guidance: string }>).slice(0, 6)
      : [],
  };
}
