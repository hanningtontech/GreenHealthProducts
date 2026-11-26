/**
 * Authenticated-patient callable: confirm a diamond bank candidate fits the issue,
 * personalize wording, and optionally suggest matcher enrichments.
 * Never invents products beyond the candidate; rejects urgent / poor fits.
 */
import { HttpsError } from "firebase-functions/v2/https";
import { redactPii } from "./generateWellnessReply";

export type ConfirmDiamondInput = {
  language: "en" | "sw";
  issueText: string;
  concerns?: string[];
  age?: string;
  candidate: {
    id: string;
    title: string;
    replyOpening?: string;
    replyConcerns?: string;
    replyClosing?: string;
    summary?: string;
    summarySw?: string;
    productLines?: string[];
    triggersEn?: string[];
    triggersSw?: string[];
    keywords?: string[];
  };
};

export type ConfirmDiamondResult = {
  ok: boolean;
  reason?: string;
  personalizedReply: string;
  personalizedReplySw: string;
  enrich?: {
    triggersEn: string[];
    triggersSw: string[];
    keywords: string[];
  };
  source: "gemini" | "passthrough" | "reject";
};

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = String(raw || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model response");
  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
}

function asStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = String(item || "").trim().toLowerCase();
    if (!s || s.length > 80) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function assembleCandidateReply(c: ConfirmDiamondInput["candidate"]): string {
  return [
    c.replyOpening,
    c.replyConcerns,
    c.summary,
    (c.productLines || []).length ? `Product option:\n${(c.productLines || []).map((l) => `• ${l}`).join("\n")}` : "",
    c.replyClosing,
  ].filter(Boolean).join("\n\n").trim();
}

function passthrough(input: ConfirmDiamondInput): ConfirmDiamondResult {
  const en = assembleCandidateReply(input.candidate)
    || String(input.candidate.summary || "").trim()
    || "Thank you for sharing. Please review the guidance under My results.";
  const sw = String(input.candidate.summarySw || "").trim()
    || "Asante kwa kushiriki. Angalia mwongozo chini ya Matokeo yangu.";
  return {
    ok: true,
    personalizedReply: en,
    personalizedReplySw: input.language === "sw" ? (sw || en) : sw,
    source: "passthrough",
  };
}

const SYSTEM_INSTRUCTION = `You confirm whether an approved GreenHealthProducts diamond bank reply fits a patient's issue.
Return JSON only.

Rules:
- ok=true only when the candidate clearly fits a mild, non-urgent version of the issue.
- Reject (ok=false) for emergency/red-flag patterns, mismatched conditions, or when the candidate is a poor fit.
- When ok=true, rewrite personalizedReply / personalizedReplySw in warm plain language for the requested language.
- Keep the same medical caution level as the candidate. Do not invent diagnoses, prescriptions, or new product codes.
- You may mention only product lines already listed on the candidate.
- Suggest short enrich.triggersEn / enrich.triggersSw / enrich.keywords only for close phrasings of THIS issue that the matcher should learn (max 8 each). Do not invent unrelated topics.
- Never mention AI, models, Gemini, or internal bank systems in the reply text.`;

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
          temperature: 0.3,
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

export async function confirmDiamondReplyCore(
  input: ConfirmDiamondInput,
): Promise<ConfirmDiamondResult> {
  const base = passthrough(input);
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return base;

  const issue = redactPii(
    [input.issueText, ...(input.concerns || [])].filter(Boolean).join("\n"),
  ).slice(0, 3000);

  const prompt = JSON.stringify({
    language: input.language,
    ageBand: input.age ? "provided" : "unknown",
    currentIssue: issue,
    diamondCandidate: {
      id: input.candidate.id,
      title: input.candidate.title,
      bankReply: assembleCandidateReply(input.candidate).slice(0, 2500),
      summarySw: String(input.candidate.summarySw || "").slice(0, 1200),
      productLines: (input.candidate.productLines || []).slice(0, 4),
      knownTriggersEn: (input.candidate.triggersEn || []).slice(0, 20),
      knownTriggersSw: (input.candidate.triggersSw || []).slice(0, 20),
      knownKeywords: (input.candidate.keywords || []).slice(0, 20),
    },
    requiredJsonFields: [
      "ok",
      "reason",
      "personalizedReply",
      "personalizedReplySw",
      "enrich",
    ],
  });

  try {
    const raw = await callGemini(prompt, apiKey);
    const parsed = extractJsonObject(raw);
    const ok = Boolean(parsed.ok);
    if (!ok) {
      return {
        ok: false,
        reason: String(parsed.reason || "Candidate did not fit.").slice(0, 240),
        personalizedReply: "",
        personalizedReplySw: "",
        source: "reject",
      };
    }
    const personalizedReply = String(parsed.personalizedReply || "").trim() || base.personalizedReply;
    const personalizedReplySw = String(parsed.personalizedReplySw || "").trim() || base.personalizedReplySw;
    const enrichObj = (parsed.enrich && typeof parsed.enrich === "object")
      ? parsed.enrich as Record<string, unknown>
      : {};
    return {
      ok: true,
      personalizedReply: personalizedReply.slice(0, 6000),
      personalizedReplySw: personalizedReplySw.slice(0, 6000),
      enrich: {
        triggersEn: asStringList(enrichObj.triggersEn, 8),
        triggersSw: asStringList(enrichObj.triggersSw, 8),
        keywords: asStringList(enrichObj.keywords, 8),
      },
      source: "gemini",
    };
  } catch (err) {
    console.warn("confirmDiamondReply fallback", err instanceof Error ? err.message : "error");
    return base;
  }
}

export function assertConfirmDiamondInput(data: unknown): ConfirmDiamondInput {
  const d = (data || {}) as Record<string, unknown>;
  const language = d.language === "sw" ? "sw" : "en";
  const issueText = String(d.issueText || "").trim();
  const concerns = Array.isArray(d.concerns) ? d.concerns.map((c) => String(c)) : [];
  if (!issueText && !concerns.length) {
    throw new HttpsError("invalid-argument", "issueText or concerns required");
  }
  const c = (d.candidate || {}) as Record<string, unknown>;
  const id = String(c.id || "").trim();
  const title = String(c.title || "").trim();
  if (!id || !title) {
    throw new HttpsError("invalid-argument", "candidate.id and candidate.title required");
  }
  return {
    language,
    issueText,
    concerns,
    age: String(d.age || "").trim() || undefined,
    candidate: {
      id,
      title,
      replyOpening: String(c.replyOpening || ""),
      replyConcerns: String(c.replyConcerns || ""),
      replyClosing: String(c.replyClosing || ""),
      summary: String(c.summary || ""),
      summarySw: String(c.summarySw || ""),
      productLines: Array.isArray(c.productLines) ? c.productLines.map((x) => String(x)).slice(0, 4) : [],
      triggersEn: Array.isArray(c.triggersEn) ? c.triggersEn.map((x) => String(x)).slice(0, 40) : [],
      triggersSw: Array.isArray(c.triggersSw) ? c.triggersSw.map((x) => String(x)).slice(0, 40) : [],
      keywords: Array.isArray(c.keywords) ? c.keywords.map((x) => String(x)).slice(0, 40) : [],
    },
  };
}
