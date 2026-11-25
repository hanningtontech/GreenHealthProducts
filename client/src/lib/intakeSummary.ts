import type { Intake, IntakeSource } from "@/lib/screeningTypes";

function truncate(text: string, max = 140): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

/** Build list title + summary from concerns and free text (no LLM). */
export function buildIntakeTitleSummary(
  concerns: string[],
  freeText: string,
  language: "en" | "sw",
): { title: string; summary: string } {
  const note = freeText.trim();
  const firstLine = note.split(/\n/).map((l) => l.trim()).find(Boolean) || "";
  const topConcern = concerns[0] || "";

  const title = topConcern
    || (firstLine ? truncate(firstLine, 72) : "")
    || (language === "sw" ? "Maelezo ya msaada" : "Help note");

  const summary = note
    ? truncate(note)
    : concerns.length
      ? truncate(concerns.join(" · "))
      : (language === "sw" ? "Hakuna maelezo." : "No details provided.");

  return { title, summary };
}

export function detectIntakeSource(concerns: string[], freeText: string): IntakeSource {
  const hasNote = Boolean(freeText.trim());
  const hasConcerns = concerns.length > 0;
  if (hasNote && hasConcerns) return "mixed";
  if (hasConcerns) return "categories";
  return "note";
}

export function normalizeIntakeSignature(concerns: string[], freeText: string): string {
  const sorted = [...concerns].map((c) => c.trim().toLowerCase()).filter(Boolean).sort();
  return `${sorted.join("|")}::${freeText.trim().toLowerCase()}`;
}

export function hasOpenIntake(items: Intake[]): boolean {
  return items.some((item) => item.status === "pending" || item.status === "in_review");
}

export function isDuplicateIntake(
  items: Intake[],
  concerns: string[],
  freeText: string,
): boolean {
  const signature = normalizeIntakeSignature(concerns, freeText);
  if (!signature.replace("::", "").trim()) return false;
  return items.some(
    (item) => normalizeIntakeSignature(item.concerns || [], item.freeText || "") === signature,
  );
}

export function formatIntakeDate(value: unknown, language: "en" | "sw" = "en"): string {
  let date: Date | null = null;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    date = (value as { toDate: () => Date }).toDate();
  } else if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  }
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(language === "sw" ? "sw-KE" : "en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function downloadIntakeText(intake: Intake): void {
  const lines = [
    intake.title || "Help submission",
    `Date: ${formatIntakeDate(intake.createdAt, intake.language)}`,
    `Status: ${intake.status}`,
    "",
    "Concerns:",
    ...(intake.concerns?.length ? intake.concerns.map((c) => `- ${c}`) : ["- (none)"]),
    "",
    "Note:",
    intake.freeText || "(none)",
    "",
    intake.summary ? `Summary: ${intake.summary}` : "",
  ].filter((line) => line !== undefined);

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(intake.title || "help-note").replace(/[^\w\-]+/g, "_").slice(0, 40)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
