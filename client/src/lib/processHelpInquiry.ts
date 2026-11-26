/**
 * When a patient help note arrives, match guidance immediately so:
 * - diamond hits auto-share to My results
 * - other hits land as a ready draft for admin confirm/tweak
 */
import { tryDiamondAutoReply } from "./diamondAutoReply";
import {
  applyAdminDraftToScreening,
  resolveIntakeTestWithGeminiFallback,
} from "./geminiBankFallback";
import { ensureScreeningDraftFromIntake } from "./intakeToScreening";
import { saveIntake } from "./intakes";
import { resolvePatientReportTitle } from "./patientReportTitle";
import { saveScreening } from "./screenings";
import type { Intake, Screening } from "./screeningTypes";

export type ProcessHelpInquiryResult = {
  screening: Screening;
  intake: Intake;
  diamondShared: boolean;
  matched: boolean;
  reason: string;
};

/** True when this screening still needs an automatic bank/Gemini draft. */
export function screeningNeedsAutoMatch(screening: Screening | null | undefined): boolean {
  if (!screening) return true;
  if (screening.status === "shared") return false;
  if ((screening.bankMatchedCaseIds || []).length > 0) return false;
  if (screening.bankMatchedAt) return false;
  return true;
}

/**
 * Create/link the screening draft, try diamond auto-reply, otherwise
 * pre-match the best bank (or Gemini teach) answer onto the draft.
 */
export async function processHelpInquiry(opts: {
  intake: Intake;
  authUid?: string;
}): Promise<ProcessHelpInquiryResult> {
  let intake = opts.intake;
  let screening = await ensureScreeningDraftFromIntake(intake);
  intake = {
    ...intake,
    screeningId: screening.id,
    patientId: screening.patientId || intake.patientId,
  };

  try {
    const auto = await tryDiamondAutoReply({
      intake,
      screening,
      authUid: opts.authUid,
    });
    if (auto.shared && auto.screening) {
      return {
        screening: auto.screening,
        intake: {
          ...intake,
          status: "answered",
          screeningId: auto.screening.id,
        },
        diamondShared: true,
        matched: true,
        reason: auto.reason,
      };
    }
  } catch (err) {
    console.warn("Diamond auto-reply skipped:", err instanceof Error ? err.message : err);
  }

  // Re-read in case diamond partially wrote, then skip if already matched.
  if (!screeningNeedsAutoMatch(screening)) {
    return {
      screening,
      intake,
      diamondShared: false,
      matched: (screening.bankMatchedCaseIds || []).length > 0,
      reason: "Draft already matched.",
    };
  }

  const resolved = await resolveIntakeTestWithGeminiFallback(intake);
  const next = applyAdminDraftToScreening(screening, resolved);
  const patientReportTitle = await resolvePatientReportTitle({
    intake,
    screening: next,
    matchedCaseIds: resolved.matchedCaseIds,
    conclusion: resolved.conclusion,
  });
  const toSave: Screening = {
    ...next,
    patientReportTitle,
    status: next.status === "shared" ? "shared" : "draft",
    adminNotes: [
      (next.adminNotes || "").trim(),
      resolved.matchedCaseIds.length
        ? `auto:match:${resolved.source}:${resolved.matchedCaseIds.join(",")}`
        : `auto:match:${resolved.source}:none`,
    ].filter(Boolean).join("\n"),
  };
  await saveScreening(toSave);

  // Keep intake pending/unread for admin, but link the prepared draft.
  const intakeNext: Intake = {
    ...intake,
    screeningId: toSave.id,
    patientId: toSave.patientId || intake.patientId,
  };
  await saveIntake(intakeNext);

  return {
    screening: toSave,
    intake: intakeNext,
    diamondShared: false,
    matched: resolved.matchedCaseIds.length > 0 || Boolean(resolved.conclusion?.trim()),
    reason: resolved.message,
  };
}
