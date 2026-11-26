import { listKnowledgeCases } from "./knowledgeBank";
import type { Intake, KnowledgeCase, Screening } from "./screeningTypes";

/** Short patient-facing heading from the main issue (not the person's name). */
export function shortIssueHeading(input: {
  intake?: Pick<Intake, "title" | "summary" | "freeText" | "concerns"> | null;
  caseItem?: Pick<KnowledgeCase, "conditionTitle" | "title"> | null;
  conclusion?: string;
  fallback?: string;
}): string {
  const fromCase = String(input.caseItem?.conditionTitle || input.caseItem?.title || "").trim();
  if (fromCase) return clipHeading(fromCase);

  const fromIntakeTitle = String(input.intake?.title || "").trim();
  if (fromIntakeTitle) return clipHeading(fromIntakeTitle);

  const concerns = (input.intake?.concerns || []).map((c) => c.trim()).filter(Boolean);
  if (concerns.length) return clipHeading(concerns.slice(0, 2).join(" · "));

  const note = String(input.intake?.freeText || input.intake?.summary || "").trim();
  if (note) return clipHeading(firstClause(note));

  const conclusion = String(input.conclusion || "").trim();
  if (conclusion) return clipHeading(firstClause(conclusion));

  return input.fallback || "Your wellness guidance";
}

export function patientFacingReportTitle(screening: Screening): string {
  const stored = String(screening.patientReportTitle || "").trim();
  if (stored) return stored;
  return shortIssueHeading({
    conclusion: screening.simpleConclusion || screening.bankDraftConclusion || "",
    fallback: "Your wellness report",
  });
}

export async function resolvePatientReportTitle(opts: {
  intake?: Intake | null;
  screening?: Screening | null;
  matchedCaseIds?: string[];
  conclusion?: string;
}): Promise<string> {
  let caseItem: KnowledgeCase | undefined;
  const ids = opts.matchedCaseIds?.length
    ? opts.matchedCaseIds
    : opts.screening?.bankMatchedCaseIds;
  if (ids?.length) {
    try {
      const bank = await listKnowledgeCases();
      caseItem = bank.find((c) => c.id === ids[0]);
    } catch {
      // ignore
    }
  }
  return shortIssueHeading({
    intake: opts.intake,
    caseItem,
    conclusion: opts.conclusion
      || opts.screening?.simpleConclusion
      || opts.screening?.bankDraftConclusion
      || "",
  });
}

function firstClause(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const cut = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return cut;
}

function clipHeading(value: string, max = 72): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function pulseDevice(pattern: number | number[] = [35, 50, 35]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore — desktop / denied
  }
}
