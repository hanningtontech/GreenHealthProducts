export type ScreeningFlag = "green" | "yellow" | "red" | "unknown";

export type ScreeningItem = {
  name: string;
  normalRange?: string;
  value?: string;
  flag: ScreeningFlag;
  followUp?: string;
};

export type ScreeningGroup = {
  id: string;
  title: string;
  items: ScreeningItem[];
};

export type ScreeningSubject = {
  name: string;
  email?: string;
  sex?: string;
  age?: number | string;
  height?: string;
  weight?: string;
  testDate?: string;
  testTime?: string;
  phone?: string;
};

export type ScreeningRecommendation = {
  productId?: string;
  /** Admin catalogue code (W01…) — not shown on patient PDF / results. */
  code: string;
  name?: string;
  role: string;
  concern: string;
  /** Quantity for the patient quote / PDF (default 1). */
  qty?: number;
  /** Editable unit price (KSh) for the quote; defaults to catalogue retail. */
  unitPrice?: number;
  /** Lower = preferred when multiple eligible options exist. */
  rank?: number;
  /** Plain-language why this product fits (EN) — label-supported. */
  reasonEn?: string;
  /** Plain-language why this product fits (SW). */
  reasonSw?: string;
  /** Phrases that support choosing this option for the current question. */
  suitableWhen?: string[];
  /** Phrases that rule this option out for the current question. */
  excludeWhen?: string[];
  /** Catalog-facing review gate for this option. */
  productReviewStatus?: "verified" | "needs_review" | "unsuitable";
};

export type ScreeningStatus = "parsing" | "draft" | "shared" | "archived";

export type Screening = {
  id: string;
  patientId: string;
  status: ScreeningStatus;
  /** Public HTTPS URL (or legacy local://) for the uploaded source PDF/text in B2. */
  sourceFilePath?: string;
  /** B2 object key for the source file (media/screenings/.../source/...). */
  sourceFileKey?: string;
  /** Public HTTPS URL for the generated patient-report.pdf in B2. */
  reportPdfUrl?: string;
  /** B2 object key for the patient report PDF. */
  reportPdfKey?: string;
  /** When the draft was created from a patient /help submission. */
  sourceIntakeId?: string;
  subject: ScreeningSubject;
  groups: ScreeningGroup[];
  simpleConclusion: string;
  simpleConclusionSw?: string;
  /** Up to 3 plain-language “this week” actions for the patient report. */
  weekActions?: string[];
  /** Extra reviewer notes — included on the full-details PDF only. */
  adminNotes?: string;
  recommendations: ScreeningRecommendation[];
  /** Draft assembled from content bank (keywords/diseases) — not patient-visible until shared. */
  bankDraftConclusion?: string;
  bankDraftConclusionSw?: string;
  bankDraftRecommendations?: ScreeningRecommendation[];
  /** Case IDs used the last time the content bank matched this draft. */
  bankMatchedCaseIds?: string[];
  /** Epoch ms when bankMatchedCaseIds / bank draft were last applied. */
  bankMatchedAt?: number;
  /** Legacy field names kept for older drafts */
  aiDraftConclusion?: string;
  aiDraftConclusionSw?: string;
  aiDraftRecommendations?: ScreeningRecommendation[];
  rawTextExcerpt?: string;
  learnApproved?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  sharedAt?: unknown;
};

export type Patient = {
  id: string;
  authUid?: string;
  email: string;
  displayName: string;
  phone?: string;
  sex?: string;
  age?: number | string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type IntakeStatus = "pending" | "in_review" | "answered" | "archived";

export type IntakeSource = "note" | "categories" | "mixed";

export type Intake = {
  id: string;
  patientId?: string;
  authUid: string;
  email?: string;
  displayName?: string;
  language: "en" | "sw";
  concerns: string[];
  freeText: string;
  status: IntakeStatus;
  /** Short heading for lists (client-built from concerns / note). */
  title?: string;
  /** One-line summary for collapsed cards. */
  summary?: string;
  /** Which compose section produced this intake. */
  source?: IntakeSource;
  /** Linked screening draft / shared report created from this help request. */
  screeningId?: string;
  reply?: string;
  replySw?: string;
  recommendations?: ScreeningRecommendation[];
  bankDraftReply?: string;
  aiDraftReply?: string;
  learnApproved?: boolean;
  /** When an admin opened this conversation / item (clears unread badge without answering). */
  adminSeenAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  answeredAt?: unknown;
};

/** Retrieval / quarantine status for reusable bank guidance (not patient records). */
export type BankReviewStatus = "approved" | "quarantined" | "needs_review";

export type KnowledgeCase = {
  id: string;
  title: string;
  /** Neutral condition label for admin lists (preferred over patient-derived titles). */
  conditionTitle?: string;
  /** English keywords the matcher uses */
  triggersEn: string[];
  /** Kiswahili keywords */
  triggersSw: string[];
  /** Extra keyword aliases (symptoms, flags, slang) */
  keywords?: string[];
  /** Disease / condition labels used for matching and display */
  diseases?: string[];
  summary: string;
  summarySw?: string;
  /** Structured reply sections the system assembles when this case matches */
  replyOpening?: string;
  replyConcerns?: string;
  replyRecommendationsIntro?: string;
  replyClosing?: string;
  recommendations: ScreeningRecommendation[];
  sourceScreeningId?: string;
  sourceIntakeId?: string;
  /**
   * Admin quality mark from bank testing:
   * green = approved reply pattern, yellow = usable but unconfirmed / ready for review, red = needs rewrite.
   */
  qualityFlag?: "green" | "yellow" | "red";
  /** Explicit retrieval gate — only `approved` + active entries are used for patient drafts. */
  reviewStatus?: BankReviewStatus;
  /** When false, excluded from retrieval (defaults true for legacy docs). */
  active?: boolean;
  /** When qualityFlag became green (approval metadata only). */
  approvedAt?: unknown;
  /** Last bank-test review note (approval / correction). */
  reviewNote?: string;
  /** Who/when last reviewed in bank testing. */
  reviewedAt?: unknown;
  /** Entry is urgent-care priority (suppress routine products when it matches). */
  urgent?: boolean;
  /** Admin-only provenance (never sent to models or patients). */
  provenanceNote?: string;
  /** Why this entry intentionally has no product recommendation. */
  emptyProductReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type BankProductDisplay = {
  code: string;
  name: string;
  /** Canonical “W38 Super Co-Q10 Capsule” (code once). */
  displayLabel: string;
  packSize: string;
  /** Package weight / pack note — not the active ingredient amount. */
  packNote: string;
  concern: string;
  role: string;
  precautions: string;
  labelChecks: string;
  unresolved: boolean;
};

export type BankHygieneFinding = {
  caseId: string;
  title: string;
  kind:
    | "suspected-approval-keyword"
    | "duplicated-reply-text"
    | "pii-suspected"
    | "patient-note-copy"
    | "bad-product-link"
    | "quarantine-candidate";
  detail: string;
  value: string;
};

/** Structured wellness reply from generateWellnessReply (Gemini). */
export type WellnessReplyStructured = {
  language: "en" | "sw";
  summary: string;
  nextSteps: string;
  precautions: string;
  urgency: "routine" | "soon" | "urgent";
  followUpQuestion?: string | null;
  productCode?: string | null;
  productReason?: string | null;
  needsAdminReview?: boolean;
  /** Neutral condition label for bank teaching. */
  conditionTitle?: string | null;
  keywordsEn?: string[];
  keywordsSw?: string[];
  diseases?: string[];
};

export const COMMON_CONCERNS_EN = [
  "Low energy / tiredness",
  "Digestive discomfort",
  "Poor sleep or stress",
  "Joint or movement discomfort",
  "Nutrition / vitamins",
  "Circulation wellness",
  "Immune support",
  "Skin or hair concerns",
  "Other",
] as const;

export const COMMON_CONCERNS_SW = [
  "Uchovu / nguvu kidogo",
  "Matatizo ya mmeng'enyo",
  "Usingizi mbaya au msongo",
  "Maumivu ya viungo",
  "Lishe / vitamini",
  "Mzunguko wa damu",
  "Kinga ya mwili",
  "Ngozi au nywele",
  "Nyingine",
] as const;

export const WELLNESS_DISCLAIMER =
  "This screening and advice are for wellness information only. They are not a medical diagnosis or treatment. Follow current package labels. For serious or urgent symptoms, see a qualified health professional.";
