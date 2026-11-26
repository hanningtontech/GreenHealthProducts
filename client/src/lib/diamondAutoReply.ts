/**
 * Automatic patient replies for diamond bank matches (no admin share).
 * Requires age + sex on profile/patient; urgent patterns stay admin-only.
 */
import { callConfirmDiamondReply } from "./confirmDiamondReplyClient";
import { formatBankProductOptionLine, resolveBankProducts } from "./bankProducts";
import { detectUrgentCare } from "./bankUrgent";
import { fetchProfile } from "./auth";
import {
  findSimilarCases,
  listKnowledgeCases,
  saveKnowledgeCase,
} from "./knowledgeBank";
import { ensurePatientForIntake, markIntakeAnsweredFromScreening } from "./intakeToScreening";
import { upsertPatient } from "./patients";
import { isDisclaimerClosing, sanitizePatientConclusion } from "./reportCopy";
import { shortIssueHeading } from "./patientReportTitle";
import { ensureSeedKnowledgeBank } from "./seedKnowledge";
import { saveScreening, setScreeningStatus } from "./screenings";
import type { Intake, KnowledgeCase, Screening } from "./screeningTypes";

export type DiamondAutoReplyResult = {
  shared: boolean;
  reason: string;
  screening?: Screening;
  matchedCaseId?: string;
};

function hasValue(...values: Array<string | number | undefined | null>): boolean {
  return values.some((v) => String(v ?? "").trim().length > 0);
}

function mergeUnique(existing: string[] | undefined, incoming: string[] | undefined, max = 48): string[] {
  const out: string[] = [];
  for (const item of [...(existing || []), ...(incoming || [])]) {
    const t = String(item || "").trim();
    if (!t) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function assembleBankReply(caseItem: KnowledgeCase): string {
  const opening = (caseItem.replyOpening || "").trim();
  const concerns = (caseItem.replyConcerns || "").trim();
  const summary = (caseItem.summary || "").trim();
  const closing = isDisclaimerClosing(caseItem.replyClosing) ? "" : (caseItem.replyClosing || "").trim();
  const body = concerns || summary;
  return [opening, body, closing].filter(Boolean).join("\n\n").trim();
}

/** Apply matcher enrichments: diamond merges immediately; green stores pendingEnrich. */
export async function applyDiamondOrGreenEnrichment(
  caseItem: KnowledgeCase,
  enrich: { triggersEn?: string[]; triggersSw?: string[]; keywords?: string[] } | undefined,
): Promise<KnowledgeCase> {
  const triggersEn = mergeUnique(undefined, enrich?.triggersEn, 12);
  const triggersSw = mergeUnique(undefined, enrich?.triggersSw, 12);
  const keywords = mergeUnique(undefined, enrich?.keywords, 12);

  if (caseItem.qualityFlag === "diamond") {
    const next: KnowledgeCase = {
      ...caseItem,
      triggersEn: mergeUnique(caseItem.triggersEn, triggersEn),
      triggersSw: mergeUnique(caseItem.triggersSw, triggersSw),
      keywords: mergeUnique(caseItem.keywords, keywords),
      autoHitCount: (caseItem.autoHitCount || 0) + 1,
      reviewedAt: Date.now(),
      reviewNote: triggersEn.length || triggersSw.length || keywords.length
        ? "Diamond matcher enriched from a close patient phrasing."
        : caseItem.reviewNote,
    };
    await saveKnowledgeCase(next);
    return next;
  }

  const next: KnowledgeCase = {
    ...caseItem,
    autoHitCount: (caseItem.autoHitCount || 0) + 1,
    pendingEnrich: (triggersEn.length || triggersSw.length || keywords.length)
      ? {
        triggersEn: mergeUnique(caseItem.pendingEnrich?.triggersEn, triggersEn),
        triggersSw: mergeUnique(caseItem.pendingEnrich?.triggersSw, triggersSw),
        keywords: mergeUnique(caseItem.pendingEnrich?.keywords, keywords),
        note: "Suggested matcher enrichments from a similar question — review before diamond promote.",
        updatedAt: Date.now(),
      }
      : caseItem.pendingEnrich,
  };
  await saveKnowledgeCase(next);
  return next;
}

/**
 * After a help intake creates a draft screening, try diamond auto-share.
 */
export async function tryDiamondAutoReply(opts: {
  intake: Intake;
  screening: Screening;
  authUid?: string;
}): Promise<DiamondAutoReplyResult> {
  const { intake } = opts;
  const screening = opts.screening;

  // Ensure the five diamond seeds exist in local/Firestore before matching.
  try {
    await ensureSeedKnowledgeBank();
  } catch (err) {
    console.warn("Diamond seed refresh skipped", err instanceof Error ? err.message : err);
  }

  const patient = await ensurePatientForIntake(intake);
  const profile = opts.authUid ? await fetchProfile(opts.authUid) : null;
  const age = String(profile?.age || patient.age || screening.subject.age || "").trim();
  const sex = String(profile?.sex || patient.sex || screening.subject.sex || "").trim();
  if (!hasValue(age) || !hasValue(sex)) {
    return {
      shared: false,
      reason: "Age and sex required on profile — waiting for admin review.",
    };
  }

  const issueText = [...(intake.concerns || []), intake.freeText || ""].join("\n").trim();
  if (!issueText) {
    return { shared: false, reason: "Empty issue text." };
  }
  if (detectUrgentCare(issueText)) {
    return { shared: false, reason: "Urgent pattern — admin path." };
  }

  const bank = await listKnowledgeCases();
  const diamondHits = findSimilarCases(bank, issueText, 5, {
    diamondOnly: true,
    minScore: 3,
  });
  const primary = diamondHits[0];
  if (!primary) {
    return { shared: false, reason: "No diamond match." };
  }

  const { display } = resolveBankProducts(primary.recommendations || []);
  const productLines = display.map(formatBankProductOptionLine);
  const bankReply = assembleBankReply(primary)
    || primary.summary
    || "Thank you for sharing. Please review the guidance under My results.";
  const bankReplySw = primary.summarySw
    || "Asante kwa kushiriki. Angalia mwongozo chini ya Matokeo yangu.";

  let personalizedReply = bankReply;
  let personalizedReplySw = bankReplySw;
  let enrich: { triggersEn?: string[]; triggersSw?: string[]; keywords?: string[] } | undefined;

  const confirmed = await callConfirmDiamondReply({
    language: intake.language === "sw" ? "sw" : "en",
    issueText,
    concerns: intake.concerns,
    age,
    candidate: {
      id: primary.id,
      title: primary.conditionTitle || primary.title,
      replyOpening: primary.replyOpening,
      replyConcerns: primary.replyConcerns,
      replyClosing: isDisclaimerClosing(primary.replyClosing) ? "" : primary.replyClosing,
      summary: primary.summary,
      summarySw: primary.summarySw,
      productLines,
      triggersEn: primary.triggersEn,
      triggersSw: primary.triggersSw,
      keywords: primary.keywords,
    },
  });

  // Diamond cases are already trusted: personalize when confirm succeeds,
  // otherwise still deliver the curated bank reply (callable miss / soft reject).
  if (confirmed?.ok && confirmed.personalizedReply?.trim()) {
    personalizedReply = confirmed.personalizedReply;
    personalizedReplySw = confirmed.personalizedReplySw?.trim() || bankReplySw;
    enrich = confirmed.enrich;
  }

  const photoUrl = profile?.photoUrl || patient.photoUrl || screening.subject.photoUrl || "";
  await upsertPatient({
    ...patient,
    displayName: profile?.displayName || patient.displayName,
    email: (profile?.email || patient.email || "").toLowerCase(),
    phone: profile?.phone || patient.phone,
    age,
    sex,
    photoUrl,
  });

  const toSave: Screening = {
    ...screening,
    patientId: patient.id,
    subject: {
      ...screening.subject,
      name: profile?.displayName || patient.displayName || screening.subject.name || "Patient",
      email: (profile?.email || patient.email || screening.subject.email || "").toLowerCase(),
      phone: profile?.phone || patient.phone || screening.subject.phone || "",
      age,
      sex,
      photoUrl,
    },
    simpleConclusion: sanitizePatientConclusion(personalizedReply),
    simpleConclusionSw: sanitizePatientConclusion(personalizedReplySw),
    recommendations: display.map((row) => ({
      code: row.code,
      productId: row.code.toLowerCase(),
      name: row.name,
      concern: row.concern,
      role: row.role,
      qty: 1,
    })),
    weekActions: (intake.concerns || []).slice(0, 3).map((c) =>
      (intake.language === "sw" ? `Fuatilia: ${c}` : `Follow up on: ${c}`),
    ),
    bankMatchedCaseIds: [primary.id],
    bankMatchedAt: Date.now(),
    bankDraftConclusion: sanitizePatientConclusion(personalizedReply),
    bankDraftConclusionSw: sanitizePatientConclusion(personalizedReplySw),
    patientReportTitle: shortIssueHeading({
      intake,
      caseItem: primary,
      conclusion: personalizedReply,
    }),
    status: "shared",
    adminNotes: `auto:diamond:${primary.id}`,
  };

  await saveScreening(toSave);
  await setScreeningStatus(toSave.id, "shared");
  await markIntakeAnsweredFromScreening(toSave);

  try {
    await applyDiamondOrGreenEnrichment(primary, enrich);
  } catch (err) {
    console.warn("diamond enrich failed", err instanceof Error ? err.message : err);
  }

  return {
    shared: true,
    reason: "Guidance shared automatically.",
    screening: toSave,
    matchedCaseId: primary.id,
  };
}
