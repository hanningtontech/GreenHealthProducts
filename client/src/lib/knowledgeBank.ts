import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./firebase";
import type {
  BankHygieneFinding,
  BankReviewStatus,
  KnowledgeCase,
  Screening,
  ScreeningRecommendation,
} from "./screeningTypes";

/** Minimum keyword score before a bank entry is used for drafting. */
export const BANK_RETRIEVAL_MIN_SCORE = 4;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/;
const RECORD_ID_RE = /\b(?:screening|intake|patient|uid)[-_:]?[a-z0-9]{6,}\b/i;
const NAME_TITLE_RE = /^screening\s*[·•\-–—]\s*.+/i;

/** Local-first bank: edits sit in the browser, then flush to Firestore after a quiet period. */
const BANK_LOCAL_KEY = "ghp-knowledge-bank-v1";
const BANK_PENDING_KEY = "ghp-knowledge-bank-pending-ids";
const BANK_SYNC_DELAY_MS = 12_000;

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const next = { ...value };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

function readLocalCases(): KnowledgeCase[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(BANK_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KnowledgeCase[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.title != null) : [];
  } catch {
    return [];
  }
}

function writeLocalCases(cases: KnowledgeCase[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BANK_LOCAL_KEY, JSON.stringify(cases));
  } catch {
    // Quota / private mode — keep in-memory pending sync only.
  }
}

function readPendingIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(BANK_PENDING_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function writePendingIds(ids: Set<string>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BANK_PENDING_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

function markPending(id: string) {
  const pending = readPendingIds();
  pending.add(id);
  writePendingIds(pending);
}

function upsertLocalCase(input: KnowledgeCase): KnowledgeCase[] {
  const current = readLocalCases();
  const index = current.findIndex((item) => item.id === input.id);
  const next = index >= 0
    ? current.map((item, i) => (i === index ? input : item))
    : [input, ...current];
  writeLocalCases(next);
  return next;
}

function mergeBankCases(local: KnowledgeCase[], remote: KnowledgeCase[], pending: Set<string>): KnowledgeCase[] {
  const map = new Map<string, KnowledgeCase>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) {
    if (pending.has(item.id) || !map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}

async function fetchKnowledgeCasesFromFirestore(): Promise<KnowledgeCase[]> {
  if (!isFirebaseConfigured()) return [];
  const snap = await getDocs(collection(getDb(), "knowledgeBank"));
  return snap.docs.map((item) => ({ id: item.id, ...(item.data() as DocumentData) }) as KnowledgeCase);
}

async function writeKnowledgeCaseToFirestore(input: KnowledgeCase): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const ref = doc(getDb(), "knowledgeBank", input.id);
  const { id: _id, ...rest } = input;
  await setDoc(
    ref,
    stripUndefined({
      ...rest,
      updatedAt: serverTimestamp(),
      approvedAt: rest.qualityFlag === "green"
        ? (rest.approvedAt ?? serverTimestamp())
        : rest.approvedAt,
      createdAt: rest.createdAt ?? serverTimestamp(),
    } as Record<string, unknown>),
    { merge: true },
  );
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let flushListenersBound = false;

export function getKnowledgeBankPendingCount(): number {
  return readPendingIds().size;
}

export function getKnowledgeBankSyncState(): {
  pendingCount: number;
  localCount: number;
  syncScheduled: boolean;
} {
  return {
    pendingCount: readPendingIds().size,
    localCount: readLocalCases().length,
    syncScheduled: Boolean(syncTimer),
  };
}

/** Push pending local bank edits to Firestore (no-op if nothing queued). */
export async function flushKnowledgeBankToFirestore(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  const pending = readPendingIds();
  if (!pending.size) return { synced: 0, failed: 0 };
  if (!isFirebaseConfigured()) return { synced: 0, failed: pending.size };

  syncing = true;
  let synced = 0;
  let failed = 0;
  const stillPending = new Set<string>();
  const local = readLocalCases();

  try {
    for (const id of pending) {
      const item = local.find((row) => row.id === id);
      if (!item) continue;
      try {
        await writeKnowledgeCaseToFirestore(item);
        synced += 1;
      } catch {
        stillPending.add(id);
        failed += 1;
      }
    }
    writePendingIds(stillPending);
  } finally {
    syncing = false;
  }
  return { synced, failed };
}

function scheduleFirestoreSync(delayMs = BANK_SYNC_DELAY_MS) {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void flushKnowledgeBankToFirestore();
  }, delayMs);
}

/** Call once from the app shell so pending bank edits flush when the tab hides. */
export function bindKnowledgeBankSyncListeners() {
  if (typeof window === "undefined" || flushListenersBound) return;
  flushListenersBound = true;
  const flushSoon = () => {
    void flushKnowledgeBankToFirestore();
  };
  window.addEventListener("pagehide", flushSoon);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSoon();
  });
  // Catch up any leftovers from a previous session.
  if (readPendingIds().size) scheduleFirestoreSync(2_500);
}

async function refreshBankFromFirestoreInBackground() {
  try {
    const remote = await fetchKnowledgeCasesFromFirestore();
    if (!remote.length) return;
    const pending = readPendingIds();
    const merged = mergeBankCases(readLocalCases(), remote, pending);
    writeLocalCases(merged);
  } catch {
    // Keep serving local bank if Firestore is unreachable.
  }
}

/**
 * Read bank from local storage first (fast, offline-capable).
 * Cold start pulls Firestore once; later refreshes happen in the background.
 */
export async function listKnowledgeCases(): Promise<KnowledgeCase[]> {
  const local = readLocalCases();
  if (local.length) {
    void refreshBankFromFirestoreInBackground();
    return local;
  }

  try {
    const remote = await fetchKnowledgeCasesFromFirestore();
    if (remote.length) {
      writeLocalCases(remote);
      return remote;
    }
  } catch {
    // fall through
  }
  return local;
}

/**
 * Save to the local bank immediately; Firestore sync waits until edits settle
 * (or the tab is hidden / flush is called).
 */
export async function saveKnowledgeCase(input: KnowledgeCase): Promise<KnowledgeCase> {
  upsertLocalCase(input);
  markPending(input.id);
  scheduleFirestoreSync();
  return input;
}

const STOP_WORDS = new Set([
  "i", "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "my", "me",
  "is", "am", "are", "was", "were", "have", "has", "had", "this", "that", "it", "as",
  "at", "be", "by", "from", "not", "but", "so", "very", "just", "also", "about",
  "nina", "na", "ya", "wa", "kwa", "ni", "sijisikii", "tafadhali",
]);

/** Words too generic to match alone — approval must never promote these from a test question. */
const GENERIC_MATCH_STOP = new Set([
  ...STOP_WORDS,
  "blood", "high", "low", "home", "keeps", "running", "feeling", "feel", "pain",
  "bad", "get", "got", "like", "often", "sometimes", "always", "help", "need",
  "please", "thanks", "thank", "body", "day", "days", "week", "weeks",
  "damu", "sana", "mimi", "yangu", "langu",
]);

const CURATED_PHRASES = [
  "bad stomach", "light sensitivity", "low mood", "low energy", "loose stool",
  "blood pressure", "blood sugar", "chest pain", "slurred speech", "vision changes",
  "kichwa kinaniuma", "tumbo langu", "ninaumwa tumbo", "kuhara", "shinikizo la damu",
];

/**
 * Suggest curated phrases found in a question — for reviewer display only.
 * Never auto-merge these into bank keywords on approve.
 */
export function keywordsFromQuestion(question: string, _language: "en" | "sw" = "en"): string[] {
  const raw = question.toLowerCase();
  const phrases = CURATED_PHRASES.filter((phrase) => raw.includes(phrase));
  return [...new Set(phrases)].slice(0, 14);
}

export function looksLikeSwahili(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(nina|ninaumwa|naumwa|tumbo|kichwa|uchovu|tafadhali|asante|usingizi|maumivu|kuhara|sijisikii|nimekuwa|langu|yangu|mmeng'enyo|utumbo|choo|shinikizo)\b/i.test(t);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function triggerMatchScore(hay: string, trigger: string, isDisease: boolean): number {
  const t = trigger.trim().toLowerCase();
  if (!t || t.length < 3) return 0;
  if (GENERIC_MATCH_STOP.has(t)) return 0;

  if (t.includes(" ") || t.includes("·") || t.includes("/")) {
    if (!hay.includes(t)) return 0;
    const base = t.length > 16 ? 10 : t.length > 10 ? 8 : 6;
    return isDisease ? base + 2 : base;
  }

  // Single tokens: require word boundary; short tokens score low / skip if too generic.
  if (t.length < 5) return 0;
  const re = new RegExp(`\\b${escapeRegExp(t)}\\b`, "i");
  if (!re.test(hay)) return 0;
  const base = t.length >= 10 ? 4 : 2;
  return isDisease ? base + 2 : base;
}

export class BankApprovalSelectionError extends Error {
  matchedCaseIds: string[];
  constructor(matchedCaseIds: string[]) {
    super("Select which matched bank entry to approve before changing approval status.");
    this.name = "BankApprovalSelectionError";
    this.matchedCaseIds = matchedCaseIds;
  }
}

/**
 * Update approval / review metadata only (green or yellow).
 * Preserves keywords, structured reply fields, and product links.
 * Multi-match requires an explicit selectedCaseId.
 */
export async function approveBankCase(input: {
  matchedCaseIds: string[];
  existingCases: KnowledgeCase[];
  selectedCaseId?: string | null;
  reviewNote?: string;
  qualityFlag?: "green" | "yellow";
}): Promise<KnowledgeCase> {
  const ids = (input.matchedCaseIds || []).filter(Boolean);
  if (ids.length > 1 && !input.selectedCaseId) {
    throw new BankApprovalSelectionError(ids);
  }
  const targetId = input.selectedCaseId || ids[0];
  if (!targetId) throw new Error("No bank entry selected to approve.");
  const existing = input.existingCases.find((c) => c.id === targetId);
  if (!existing) throw new Error(`Bank entry not found: ${targetId}`);
  const flag = input.qualityFlag || "green";

  const next: KnowledgeCase = {
    ...existing,
    // Explicitly keep curated content untouched.
    triggersEn: [...(existing.triggersEn || [])],
    triggersSw: [...(existing.triggersSw || [])],
    keywords: [...(existing.keywords || [])],
    diseases: [...(existing.diseases || [])],
    replyOpening: existing.replyOpening,
    replyConcerns: existing.replyConcerns,
    replyRecommendationsIntro: existing.replyRecommendationsIntro,
    replyClosing: existing.replyClosing,
    summary: existing.summary,
    summarySw: existing.summarySw,
    recommendations: [...(existing.recommendations || [])],
    qualityFlag: flag,
    reviewStatus: flag === "green" ? "approved" : (existing.reviewStatus === "quarantined" ? "quarantined" : "needs_review"),
    active: flag === "green" ? true : existing.active !== false,
    approvedAt: flag === "green" ? Date.now() : existing.approvedAt,
    reviewedAt: Date.now(),
    reviewNote: input.reviewNote
      || (flag === "green"
        ? "Approved in bank testing (metadata only)."
        : "Marked yellow / unconfirmed (metadata only)."),
  };
  await saveKnowledgeCase(next);
  return next;
}

/** Normalize legacy bank docs so retrieval gates have stable defaults. */
export function normalizeBankCase(item: KnowledgeCase): KnowledgeCase {
  const reviewStatus: BankReviewStatus =
    item.reviewStatus
    || (item.qualityFlag === "green" ? "approved"
      : item.qualityFlag === "red" ? "needs_review"
        : item.qualityFlag === "yellow" ? "needs_review"
          : "approved");
  return {
    ...item,
    conditionTitle: item.conditionTitle || item.title,
    reviewStatus,
    active: item.active !== false,
  };
}

/** Eligible for patient-facing draft retrieval. */
export function isRetrievalEligible(item: KnowledgeCase): boolean {
  const n = normalizeBankCase(item);
  if (n.active === false) return false;
  if (n.reviewStatus === "quarantined" || n.reviewStatus === "needs_review") {
    // Legacy green without explicit reviewStatus already mapped to approved above.
    return false;
  }
  if (n.qualityFlag === "red") return false;
  return n.reviewStatus === "approved";
}

/** Strip common PII patterns before model / logs (client-side helper). */
export function redactPiiForModel(text: string): string {
  return String(text || "")
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(RECORD_ID_RE, "[record]")
    .replace(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, "[name]")
    .trim();
}

function textLooksLikePatientNote(value: string): boolean {
  const t = value.toLowerCase();
  return (
    /\b(my name is|i am |i've been|nimekuwa|jina langu)\b/.test(t)
    || EMAIL_RE.test(value)
    || PHONE_RE.test(value)
  );
}

/**
 * Mark suspect legacy entries needs_review / quarantined without deleting patient records.
 * Returns how many local bank rows were updated (queued for Firestore sync).
 */
export async function migrateBankPrivacyFlags(cases?: KnowledgeCase[]): Promise<{
  updated: number;
  quarantined: number;
  needsReview: number;
}> {
  const list = (cases || await listKnowledgeCases()).map(normalizeBankCase);
  let updated = 0;
  let quarantined = 0;
  let needsReview = 0;
  for (const item of list) {
    const findings = buildBankHygieneReport([item]);
    const hasPii = findings.some((f) => f.kind === "pii-suspected" || f.kind === "patient-note-copy");
    const patientTitle = NAME_TITLE_RE.test(item.title || "");
    let nextStatus = item.reviewStatus;
    let nextActive = item.active !== false;
    let changed = false;

    if (hasPii || patientTitle) {
      nextStatus = "quarantined";
      nextActive = false;
      quarantined += 1;
      changed = true;
    } else if (item.qualityFlag === "red" || findings.some((f) => f.kind === "bad-product-link")) {
      nextStatus = "needs_review";
      needsReview += 1;
      changed = true;
    } else if (!item.reviewStatus && item.qualityFlag === "green") {
      nextStatus = "approved";
      changed = true;
    }

    if (!changed && item.conditionTitle) continue;
    if (!changed && nextStatus === item.reviewStatus && nextActive === (item.active !== false)) continue;

    await saveKnowledgeCase({
      ...item,
      conditionTitle: item.conditionTitle
        || (patientTitle ? (item.diseases?.[0] || item.triggersEn?.[0] || "Wellness guidance") : item.title),
      title: patientTitle
        ? (item.diseases?.[0] || item.triggersEn?.[0] || "Wellness guidance")
        : item.title,
      reviewStatus: nextStatus,
      active: nextActive,
      provenanceNote: item.provenanceNote
        || (hasPii || patientTitle ? "Auto-quarantined: suspected PII or patient-derived title." : item.provenanceNote),
    });
    updated += 1;
  }
  return { updated, quarantined, needsReview };
}

export type BankCorrectionFields = {
  replyOpening?: string;
  replyConcerns?: string;
  replyRecommendationsIntro?: string;
  replyClosing?: string;
  summarySw?: string;
  recommendations?: ScreeningRecommendation[];
};

/**
 * Red · edit & correct — save only reviewer-changed structured fields.
 * Leaves the entry ready for review (yellow). Green approve later preserves these fields.
 * Never merges test-question words into keywords/triggers.
 */
export async function saveBankCorrection(input: {
  matchedCaseIds: string[];
  existingCases: KnowledgeCase[];
  selectedCaseId?: string | null;
  fields: BankCorrectionFields;
  reviewNote?: string;
}): Promise<KnowledgeCase> {
  const ids = (input.matchedCaseIds || []).filter(Boolean);
  if (ids.length > 1 && !input.selectedCaseId) {
    throw new BankApprovalSelectionError(ids);
  }
  const targetId = input.selectedCaseId || ids[0];
  const existing = targetId ? input.existingCases.find((c) => c.id === targetId) : undefined;

  const base: KnowledgeCase = existing
    ? { ...existing }
    : {
      id: `learned-${Date.now()}`,
      title: (input.fields.replyOpening || "Corrected bank answer").slice(0, 72),
      triggersEn: [],
      triggersSw: [],
      keywords: [],
      diseases: [],
      summary: "",
      recommendations: input.fields.recommendations || [],
    };

  const next: KnowledgeCase = {
    ...base,
    // Curated match keys stay as-is (never polluted from the test question).
    triggersEn: [...(base.triggersEn || [])],
    triggersSw: [...(base.triggersSw || [])],
    keywords: [...(base.keywords || [])],
    diseases: [...(base.diseases || [])],
    replyOpening: input.fields.replyOpening ?? base.replyOpening,
    replyConcerns: input.fields.replyConcerns ?? base.replyConcerns,
    replyRecommendationsIntro: input.fields.replyRecommendationsIntro ?? base.replyRecommendationsIntro,
    replyClosing: input.fields.replyClosing ?? base.replyClosing,
      summary: (input.fields.replyConcerns ?? base.replyConcerns ?? base.summary ?? "").slice(0, 500),
    summarySw: input.fields.summarySw ?? base.summarySw,
    recommendations: input.fields.recommendations ?? base.recommendations ?? [],
    qualityFlag: "yellow",
    reviewedAt: Date.now(),
    reviewNote: input.reviewNote || "Correction saved — ready for Green approval.",
  };

  await saveKnowledgeCase(next);
  return next;
}

/**
 * @deprecated Prefer approveBankCase / saveBankCorrection.
 * Kept for older call sites; green path no longer pollutes keywords.
 */
export async function learnFromBankTest(input: {
  question: string;
  replyEn: string;
  replySw: string;
  matchedCaseIds: string[];
  existingCases: KnowledgeCase[];
  qualityFlag: "green" | "yellow" | "red";
  recommendations?: ScreeningRecommendation[];
  selectedCaseId?: string | null;
  structured?: BankCorrectionFields;
}): Promise<KnowledgeCase> {
  if (input.qualityFlag === "green") {
    return approveBankCase({
      matchedCaseIds: input.matchedCaseIds,
      existingCases: input.existingCases,
      selectedCaseId: input.selectedCaseId,
      reviewNote: "Approved in bank testing.",
    });
  }

  const paragraphs = input.replyEn.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const structured: BankCorrectionFields = input.structured || {
    replyOpening: paragraphs[0] || input.replyEn.slice(0, 220),
    replyConcerns: paragraphs.slice(1, -1).join("\n\n") || paragraphs[1] || input.replyEn,
    replyClosing: paragraphs.length > 2 ? paragraphs[paragraphs.length - 1] : "",
    summarySw: input.replySw,
    recommendations: input.recommendations,
  };

  return saveBankCorrection({
    matchedCaseIds: input.matchedCaseIds,
    existingCases: input.existingCases,
    selectedCaseId: input.selectedCaseId,
    fields: structured,
    reviewNote: input.qualityFlag === "red"
      ? "Red correction saved — ready for review."
      : "Yellow / unconfirmed save — ready for review.",
  });
}

/** Reviewable list of suspected approval-added keywords, PII, and duplicated reply text. */
export function buildBankHygieneReport(cases: KnowledgeCase[]): BankHygieneFinding[] {
  const findings: BankHygieneFinding[] = [];
  for (const item of cases) {
    const curated = new Set(
      [...(item.triggersEn || []), ...(item.triggersSw || []), ...(item.diseases || [])]
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    );
    for (const key of item.keywords || []) {
      const k = key.trim().toLowerCase();
      if (!k) continue;
      if (GENERIC_MATCH_STOP.has(k) || (k.length < 5 && !k.includes(" "))) {
        findings.push({
          caseId: item.id,
          title: item.title,
          kind: "suspected-approval-keyword",
          detail: "Short or generic keyword likely added from a test question during old approvals.",
          value: key,
        });
        continue;
      }
      if (!curated.has(k) && !k.includes(" ") && k.length <= 6) {
        findings.push({
          caseId: item.id,
          title: item.title,
          kind: "suspected-approval-keyword",
          detail: "Standalone short keyword not present in curated triggers/diseases.",
          value: key,
        });
      }
    }

    const opening = (item.replyOpening || "").trim();
    const closing = (item.replyClosing || "").trim();
    const concerns = (item.replyConcerns || "").trim();
    if (opening && concerns && concerns.startsWith(opening)) {
      findings.push({
        caseId: item.id,
        title: item.title,
        kind: "duplicated-reply-text",
        detail: "replyConcerns appears to repeat replyOpening.",
        value: opening.slice(0, 120),
      });
    }
    if (closing && concerns && concerns.endsWith(closing)) {
      findings.push({
        caseId: item.id,
        title: item.title,
        kind: "duplicated-reply-text",
        detail: "replyConcerns appears to repeat replyClosing.",
        value: closing.slice(0, 120),
      });
    }
    if (opening && closing && opening === closing) {
      findings.push({
        caseId: item.id,
        title: item.title,
        kind: "duplicated-reply-text",
        detail: "replyOpening and replyClosing are identical.",
        value: opening.slice(0, 120),
      });
    }

    const blob = [item.title, item.summary, opening, concerns, closing, item.summarySw || ""].join("\n");
    if (EMAIL_RE.test(blob) || PHONE_RE.test(blob) || RECORD_ID_RE.test(blob)) {
      findings.push({
        caseId: item.id,
        title: item.title,
        kind: "pii-suspected",
        detail: "Email, phone, or record-id pattern found in reusable bank text.",
        value: blob.slice(0, 120),
      });
    }
    if (NAME_TITLE_RE.test(item.title || "") || textLooksLikePatientNote(blob)) {
      findings.push({
        caseId: item.id,
        title: item.title,
        kind: "patient-note-copy",
        detail: "Title or body looks like a copied patient note or named screening.",
        value: (item.title || "").slice(0, 120),
      });
    }
    for (const rec of item.recommendations || []) {
      const code = String(rec.code || "").trim();
      if (!code) {
        findings.push({
          caseId: item.id,
          title: item.title,
          kind: "bad-product-link",
          detail: "Recommendation missing product code.",
          value: rec.name || "(empty)",
        });
      }
    }
    if (item.reviewStatus === "quarantined" || item.active === false) {
      findings.push({
        caseId: item.id,
        title: item.title,
        kind: "quarantine-candidate",
        detail: "Entry is quarantined or inactive and excluded from retrieval.",
        value: item.reviewStatus || "inactive",
      });
    }
  }
  return findings;
}

/** Persist many bank entries (import / bulk update). */
export async function saveKnowledgeCases(cases: KnowledgeCase[]): Promise<number> {
  let saved = 0;
  for (const item of cases) {
    if (!item?.id || !item.title?.trim()) continue;
    await saveKnowledgeCase(item);
    saved += 1;
  }
  return saved;
}

/**
 * Build a needs_review bank case from an admin Gemini fallback teach payload.
 * Never auto-publishes — green approve required before retrieval.
 */
export function knowledgeCaseFromGeminiTeach(input: {
  id?: string;
  conditionTitle?: string | null;
  keywordsEn?: string[];
  keywordsSw?: string[];
  diseases?: string[];
  summary: string;
  summarySw?: string;
  nextSteps?: string;
  precautions?: string;
  recommendations?: ScreeningRecommendation[];
  sourceScreeningId?: string;
  sourceIntakeId?: string;
  issueSnippet?: string;
}): KnowledgeCase {
  const conditionTitle = redactPiiForModel(
    (input.conditionTitle || input.diseases?.[0] || "Gemini wellness guidance").trim(),
  ).slice(0, 80) || "Gemini wellness guidance";
  const keywordsEn = [...new Set((input.keywordsEn || []).map((k) => redactPiiForModel(k).trim()).filter(Boolean))].slice(0, 24);
  const keywordsSw = [...new Set((input.keywordsSw || []).map((k) => redactPiiForModel(k).trim()).filter(Boolean))].slice(0, 24);
  const diseases = [...new Set((input.diseases || []).map((d) => redactPiiForModel(d).trim()).filter(Boolean))].slice(0, 12);
  const summary = redactPiiForModel(input.summary || "").slice(0, 1200);
  const nextSteps = redactPiiForModel(input.nextSteps || "");
  const precautions = redactPiiForModel(input.precautions || "");
  const stamp = Date.now().toString(36);
  return {
    id: input.id || `gemini-${stamp}`,
    title: conditionTitle,
    conditionTitle,
    triggersEn: keywordsEn.slice(0, 20),
    triggersSw: keywordsSw.slice(0, 20),
    keywords: keywordsEn,
    diseases: diseases.length ? diseases : [conditionTitle],
    summary,
    summarySw: redactPiiForModel(input.summarySw || ""),
    replyOpening: summary.split(/\n\n+/)[0] || summary.slice(0, 280),
    replyConcerns: [nextSteps, summary].filter(Boolean).join("\n\n").slice(0, 2000),
    replyRecommendationsIntro: "",
    replyClosing: precautions.slice(0, 600),
    recommendations: (input.recommendations || []).map((rec) => ({
      code: rec.code,
      productId: rec.productId || rec.code.toLowerCase(),
      name: rec.name || rec.code,
      concern: rec.concern || "",
      role: rec.role || "",
      qty: rec.qty || 1,
      productReviewStatus: rec.productReviewStatus || "needs_review",
    })),
    sourceScreeningId: input.sourceScreeningId,
    sourceIntakeId: input.sourceIntakeId,
    reviewStatus: "needs_review",
    active: false,
    qualityFlag: "yellow",
    provenanceNote: `Gemini-taught — awaiting admin approval.${input.issueSnippet ? ` Issue hint: ${redactPiiForModel(input.issueSnippet).slice(0, 120)}` : ""}`,
  };
}

/**
 * Build reusable guidance from a reviewed screening.
 * Never embeds patient names; starts as needs_review + inactive until admin approves.
 */
export function knowledgeCaseFromScreening(screening: Screening): KnowledgeCase {
  const flagged = (screening.groups || [])
    .flatMap((group) => (group.items || []).map((item) => ({ ...item, groupTitle: group.title || "" })))
    .filter((item) => item.flag === "yellow" || item.flag === "red");
  const flagNames = flagged.map((item) => item.name).filter(Boolean);
  const groupTitles = [...new Set(flagged.map((item) => item.groupTitle).filter(Boolean))];
  const conditionTitle = (flagNames[0] || groupTitles[0] || "Screening wellness guidance")
    .replace(/^.*[·•\-–—]\s*/, "")
    .trim()
    .slice(0, 80);
  const conclusion = redactPiiForModel(
    (screening.simpleConclusion || screening.bankDraftConclusion || "").trim(),
  );
  const paragraphs = conclusion.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const bullets = paragraphs.filter((p) => p.startsWith("- ") || p.startsWith("• "));
  const nonBullets = paragraphs.filter((p) => !p.startsWith("- ") && !p.startsWith("• "));
  const replyOpening = redactPiiForModel(
    nonBullets[0]
    || `Thank you for completing the screening. Flagged items: ${flagNames.slice(0, 4).join("; ") || "see report"}.`,
  );
  const replyConcerns = redactPiiForModel(
    bullets.length
      ? bullets.map((b) => b.replace(/^[-•]\s*/, "")).join("\n")
      : (nonBullets.slice(1, -1).join("\n\n") || conclusion || "Review flagged items with care."),
  );
  const replyClosing = redactPiiForModel(
    nonBullets.length > 1 ? nonBullets[nonBullets.length - 1] : "",
  );

  return {
    id: `from-${screening.id}`,
    title: conditionTitle,
    conditionTitle,
    triggersEn: [...new Set([...flagNames, ...groupTitles])].slice(0, 20),
    triggersSw: [],
    keywords: [...new Set(flagNames.map((name) => name.replace(/^.*[·•\-–—]\s*/, "").trim()))].slice(0, 20),
    diseases: flagNames.slice(0, 12),
    summary: conclusion.slice(0, 500) || flagNames.join("; "),
    summarySw: redactPiiForModel(screening.simpleConclusionSw || screening.bankDraftConclusionSw || ""),
    replyOpening,
    replyConcerns,
    replyRecommendationsIntro: "",
    replyClosing,
    recommendations: (screening.recommendations || []).map((rec) => ({
      code: rec.code,
      productId: rec.productId || rec.code.toLowerCase(),
      name: rec.name || rec.code,
      concern: rec.concern || "",
      role: rec.role || "",
      qty: rec.qty || 1,
    })),
    sourceScreeningId: screening.id,
    sourceIntakeId: screening.sourceIntakeId,
    reviewStatus: "needs_review",
    active: false,
    qualityFlag: "yellow",
    provenanceNote: "Created from shared screening as reusable guidance — not patient-facing until approved.",
  };
}

function triggerAppearsNegated(hay: string, trigger: string): boolean {
  const t = trigger.trim().toLowerCase();
  if (!t) return false;
  const idx = hay.indexOf(t);
  if (idx < 0) return false;
  const window = hay.slice(Math.max(0, idx - 24), idx);
  return /\b(no|not|without|denies|hakuna|si\s)\b/i.test(window);
}

export function scoreKnowledgeMatch(caseItem: KnowledgeCase, text: string): number {
  const hay = text.toLowerCase();
  const diseaseSet = new Set((caseItem.diseases || []).map((d) => d.trim().toLowerCase()));
  const triggers = [
    ...(caseItem.triggersEn || []),
    ...(caseItem.triggersSw || []),
    ...(caseItem.keywords || []),
    ...(caseItem.diseases || []),
  ];
  let score = 0;
  for (const trigger of triggers) {
    const t = trigger.trim().toLowerCase();
    if (triggerAppearsNegated(hay, t)) continue;
    score += triggerMatchScore(hay, t, diseaseSet.has(t));
  }
  // Prefer admin-approved (green) replies; soft-penalize red until corrected.
  if (score > 0) {
    if (caseItem.urgent) score += 20;
    if (caseItem.qualityFlag === "green" || caseItem.reviewStatus === "approved") score += 4;
    else if (caseItem.qualityFlag === "yellow") score += 1;
    else if (caseItem.qualityFlag === "red") score -= 2;
  }
  return score;
}

/**
 * Retrieve approved+active bank references for drafting.
 * Pass `{ forAdminReview: true }` to include non-approved entries (bank test UI).
 */
export function findSimilarCases(
  cases: KnowledgeCase[],
  text: string,
  limit = 5,
  options?: { forAdminReview?: boolean; minScore?: number },
): KnowledgeCase[] {
  const minScore = options?.minScore ?? BANK_RETRIEVAL_MIN_SCORE;
  const pool = options?.forAdminReview
    ? cases
    : cases.filter(isRetrievalEligible);
  return pool
    .map((item) => ({ item: normalizeBankCase(item), score: scoreKnowledgeMatch(item, text) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.item);
}

/** De-identified reference facts safe to send to the model (no ids in patient text). */
export function toReferenceFacts(cases: KnowledgeCase[]): Array<{
  conditionTitle: string;
  guidance: string;
  precautions: string;
  matchHintsEn: string[];
  matchHintsSw: string[];
  productCodes: string[];
}> {
  return cases.map((c) => ({
    conditionTitle: c.conditionTitle || c.title,
    guidance: [c.replyConcerns || c.summary, c.replyOpening].filter(Boolean).join("\n").slice(0, 1200),
    precautions: [c.replyClosing, c.urgent ? "Urgent-care priority entry." : ""].filter(Boolean).join(" ").slice(0, 600),
    matchHintsEn: [...(c.triggersEn || []), ...(c.diseases || [])].slice(0, 12),
    matchHintsSw: [...(c.triggersSw || [])].slice(0, 12),
    productCodes: (c.recommendations || []).map((r) => r.code).filter(Boolean).slice(0, 4),
  }));
}

export function mergeRecommendations(lists: ScreeningRecommendation[][]): ScreeningRecommendation[] {
  const seen = new Set<string>();
  const out: ScreeningRecommendation[] = [];
  for (const list of lists) {
    for (const rec of list) {
      const key = `${rec.code}:${rec.concern}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rec);
    }
  }
  return out;
}
