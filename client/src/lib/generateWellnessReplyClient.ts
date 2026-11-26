import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";
import { CLIENT_RATE, allowDebounced, takeClientRateLimit } from "./clientRateLimit";
import type { WellnessReplyStructured } from "./screeningTypes";

const FUNCTIONS_REGION = "us-central1";

export type GenerateWellnessReplyRequest = {
  language: "en" | "sw";
  issueText: string;
  concerns?: string[];
  references: Array<{
    conditionTitle: string;
    guidance: string;
    precautions: string;
    matchHintsEn?: string[];
    matchHintsSw?: string[];
    productCodes?: string[];
  }>;
  catalogCandidates: Array<{
    code: string;
    name: string;
    documentedUse: string;
  }>;
  urgency?: { id: string; title: string; action: string } | null;
  suppressProducts?: boolean;
};

export type GenerateWellnessReplyResponse = WellnessReplyStructured & {
  ok: boolean;
  source: "gemini" | "fallback";
  conditionTitle?: string | null;
  keywordsEn?: string[];
  keywordsSw?: string[];
  diseases?: string[];
};

export async function callGenerateWellnessReply(
  input: GenerateWellnessReplyRequest,
): Promise<GenerateWellnessReplyResponse | null> {
  if (!isFirebaseConfigured()) return null;
  if (!allowDebounced(CLIENT_RATE.aiAdmin.key, CLIENT_RATE.aiAdmin.debounceMs)) return null;
  if (!takeClientRateLimit(CLIENT_RATE.aiAdmin.key, CLIENT_RATE.aiAdmin.limit, CLIENT_RATE.aiAdmin.windowMs).allowed) {
    console.warn("generateWellnessReply skipped: client AI rate limit");
    return null;
  }
  if (!takeClientRateLimit(CLIENT_RATE.callable.key, CLIENT_RATE.callable.limit, CLIENT_RATE.callable.windowMs).allowed) {
    return null;
  }
  try {
    const fn = httpsCallable(getFunctions(getFirebaseApp(), FUNCTIONS_REGION), "generateWellnessReply");
    const result = await fn(input);
    const data = result.data as GenerateWellnessReplyResponse;
    if (!data?.summary) return null;
    return data;
  } catch (err) {
    console.warn("generateWellnessReply callable failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Map structured reply into the plain-text conclusion fields used by Wizard / PDF. */
export function formatStructuredConclusion(reply: WellnessReplyStructured, productLine?: string): string {
  const precautions = reply.precautions?.trim() || "";
  const skipPrecautions = /wellness information only|not a diagnosis|taarifa ya ustawi/i.test(precautions);
  void productLine;
  const parts = [
    reply.summary?.trim(),
    reply.nextSteps?.trim() ? `Next steps:\n${reply.nextSteps.trim()}` : "",
    precautions && !skipPrecautions ? `Precautions:\n${precautions}` : "",
    reply.followUpQuestion?.trim() ? `Follow-up:\n${reply.followUpQuestion.trim()}` : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}
