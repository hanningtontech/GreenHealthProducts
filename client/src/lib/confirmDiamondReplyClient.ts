import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";
import { CLIENT_RATE, allowDebounced, takeClientRateLimit } from "./clientRateLimit";

const FUNCTIONS_REGION = "us-central1";

export type ConfirmDiamondRequest = {
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

export type ConfirmDiamondResponse = {
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

export async function callConfirmDiamondReply(
  input: ConfirmDiamondRequest,
): Promise<ConfirmDiamondResponse | null> {
  if (!isFirebaseConfigured()) return null;
  if (!allowDebounced(CLIENT_RATE.aiDiamond.key, CLIENT_RATE.aiDiamond.debounceMs)) return null;
  if (!takeClientRateLimit(CLIENT_RATE.aiDiamond.key, CLIENT_RATE.aiDiamond.limit, CLIENT_RATE.aiDiamond.windowMs).allowed) {
    console.warn("confirmDiamondReply skipped: client AI rate limit");
    return null;
  }
  if (!takeClientRateLimit(CLIENT_RATE.callable.key, CLIENT_RATE.callable.limit, CLIENT_RATE.callable.windowMs).allowed) {
    return null;
  }
  try {
    const fn = httpsCallable(getFunctions(getFirebaseApp(), FUNCTIONS_REGION), "confirmDiamondReply");
    const result = await fn(input);
    return result.data as ConfirmDiamondResponse;
  } catch (err) {
    console.warn("confirmDiamondReply callable failed", err instanceof Error ? err.message : err);
    return null;
  }
}
