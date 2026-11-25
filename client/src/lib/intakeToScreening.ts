import { findPatientByAuthUid, upsertPatient } from "@/lib/patients";
import { getScreening, newScreeningId, saveScreening } from "@/lib/screenings";
import { saveIntake } from "@/lib/intakes";
import {
  HELP_CATEGORIES,
  concernLabel,
  findSymptomByConcern,
} from "@/lib/helpSymptoms";
import type { Intake, Patient, Screening, ScreeningGroup, ScreeningItem } from "@/lib/screeningTypes";

function todayLabel(): string {
  return new Date().toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

function normalizeConcernKey(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isSelectedConcern(label: string, selected: Set<string>): boolean {
  const key = normalizeConcernKey(label);
  if (selected.has(key)) return true;
  const found = findSymptomByConcern(label);
  if (!found) return false;
  return (
    selected.has(normalizeConcernKey(concernLabel(found.category, found.symptom, "en")))
    || selected.has(normalizeConcernKey(concernLabel(found.category, found.symptom, "sw")))
    || selected.has(normalizeConcernKey(found.symptom.en))
    || selected.has(normalizeConcernKey(found.symptom.sw))
  );
}

/**
 * Selected help symptoms → yellow.
 * Other symptoms in the same categories the patient touched → green
 * so full-details reports show both “okay” and “needs attention”.
 */
function concernsGroupsFromLabels(
  labels: string[],
  language: Intake["language"],
): ScreeningGroup[] {
  const selected = new Set(labels.map(normalizeConcernKey).filter(Boolean));
  if (!selected.size) return [];

  const touchedCategoryIds = new Set<string>();
  for (const label of labels) {
    const found = findSymptomByConcern(label);
    if (found) touchedCategoryIds.add(found.category.id);
  }

  const lang = language === "sw" ? "sw" : "en";
  const groups: ScreeningGroup[] = [];

  for (const category of HELP_CATEGORIES) {
    if (!touchedCategoryIds.has(category.id)) continue;
    const items: ScreeningItem[] = category.symptoms.map((symptom) => {
      const name = concernLabel(category, symptom, lang);
      const picked = isSelectedConcern(name, selected);
      return {
        name,
        flag: picked ? ("yellow" as const) : ("green" as const),
        value: picked ? "Selected" : "Not raised",
        normalRange: "Help form",
        followUp: picked
          ? (lang === "sw"
            ? "Mteja alichagua suala hili kwenye fomu ya msaada."
            : "The patient selected this concern on the help form.")
          : (lang === "sw"
            ? "Hakuchaguliwa kwenye fomu — hakuna suala lililoripotiwa hapa."
            : "Not selected on the help form — no issue raised in this area."),
      };
    });
    groups.push({
      id: `help-${category.id}`,
      title: lang === "sw" ? category.labelSw : category.labelEn,
      items,
    });
  }

  // Fallback when labels do not match the symptom catalogue.
  if (!groups.length) {
    groups.push({
      id: "patient-concerns",
      title: lang === "sw" ? "Masuala yaliyochaguliwa" : "Selected concerns",
      items: labels.map((name) => ({
        name,
        flag: "yellow" as const,
        value: "Selected",
        normalRange: "Help form",
        followUp: lang === "sw"
          ? "Mteja alichagua suala hili kwenye fomu ya msaada."
          : "The patient selected this concern on the help form.",
      })),
    });
  }

  return groups;
}

function concernsGroups(intake: Intake): ScreeningGroup[] {
  return concernsGroupsFromLabels(intake.concerns || [], intake.language);
}

/** Backfill greens on older help-form drafts that only stored yellows. */
export function withHelpFormGreenItems(screening: Screening): Screening {
  if (!screening.sourceIntakeId) return screening;
  const allItems = (screening.groups || []).flatMap((g) => g.items || []);
  if (allItems.some((item) => item.flag === "green")) return screening;
  const selectedLabels = allItems
    .filter((item) => item.flag === "yellow" || item.flag === "red")
    .map((item) => item.name)
    .filter(Boolean);
  if (!selectedLabels.length) return screening;

  const noteGroups = (screening.groups || []).filter((g) => g.id === "patient-note");
  const nextGroups = [
    ...concernsGroupsFromLabels(selectedLabels, "en"),
    ...noteGroups,
  ].filter((g) => (g.items || []).length > 0);

  if (!nextGroups.length) return screening;
  return { ...screening, groups: nextGroups };
}

function buildConclusion(intake: Intake): { en: string; sw: string } {
  const list = (intake.concerns || []).join(", ");
  if (intake.language === "sw") {
    return {
      en: [
        list ? `Patient reported: ${list}.` : "Patient submitted a help note.",
        intake.freeText ? `Their note: ${intake.freeText}` : "",
        "Review and complete the wellness product plan before sharing.",
      ].filter(Boolean).join("\n\n"),
      sw: [
        list ? `Mteja ameripoti: ${list}.` : "Mteja ametuma maelezo ya msaada.",
        intake.freeText ? `Maelezo yao: ${intake.freeText}` : "",
      ].filter(Boolean).join("\n\n"),
    };
  }
  return {
    en: [
      list ? `You told us you are dealing with: ${list}.` : "Thank you for sharing what you are going through.",
      intake.freeText ? `Your note: ${intake.freeText}` : "",
      "Our team will review this and share a wellness plan with product options when ready.",
    ].filter(Boolean).join("\n\n"),
    sw: [
      list ? `Umetuambia unapitia: ${list}.` : "Asante kwa kushiriki unachopitia.",
      intake.freeText ? `Maelezo yako: ${intake.freeText}` : "",
    ].filter(Boolean).join("\n\n"),
  };
}

export async function ensurePatientForIntake(intake: Intake): Promise<Patient> {
  if (intake.authUid) {
    const existing = await findPatientByAuthUid(intake.authUid);
    if (existing) {
      return upsertPatient({
        ...existing,
        displayName: intake.displayName || existing.displayName,
        email: (intake.email || existing.email || "").toLowerCase(),
        phone: existing.phone,
      });
    }
  }
  return upsertPatient({
    id: intake.patientId,
    authUid: intake.authUid,
    email: (intake.email || `help-${intake.id}@greenhealthproducts.local`).toLowerCase(),
    displayName: intake.displayName || "Patient",
  });
}

/** Create or return the screening draft for a help intake (same wizard/PDF path as uploads). */
export async function ensureScreeningDraftFromIntake(intake: Intake): Promise<Screening> {
  if (intake.screeningId) {
    const existing = await getScreening(intake.screeningId);
    if (existing) return existing;
  }

  const patient = await ensurePatientForIntake(intake);
  const conclusion = buildConclusion(intake);
  const groups = [
    ...concernsGroups(intake),
    {
      id: "patient-note",
      title: intake.language === "sw" ? "Maelezo ya mteja" : "Patient note",
      items: intake.freeText
        ? [{
          name: intake.language === "sw" ? "Maelezo" : "Details",
          flag: "yellow" as const,
          value: "",
          followUp: intake.freeText,
        }]
        : [],
    },
  ].filter((g) => g.items.length > 0);

  const screening: Screening = {
    id: newScreeningId(),
    patientId: patient.id,
    status: "draft",
    sourceIntakeId: intake.id,
    subject: {
      name: patient.displayName || intake.displayName || "Patient",
      email: patient.email || intake.email || "",
      phone: patient.phone || "",
      sex: patient.sex || "",
      age: patient.age ?? "",
      testDate: todayLabel(),
    },
    groups,
    simpleConclusion: conclusion.en,
    simpleConclusionSw: conclusion.sw,
    weekActions: (intake.concerns || []).slice(0, 3).map((c) =>
      (intake.language === "sw" ? `Fuatilia: ${c}` : `Follow up on: ${c}`),
    ),
    recommendations: [],
    rawTextExcerpt: [
      `Help intake ${intake.id}`,
      `Concerns: ${(intake.concerns || []).join(", ")}`,
      intake.freeText,
    ].filter(Boolean).join("\n"),
  };

  await saveScreening(screening);
  await saveIntake({
    ...intake,
    patientId: patient.id,
    screeningId: screening.id,
  });
  return screening;
}

/** After a screening is shared, mark the linked intake answered. */
export async function markIntakeAnsweredFromScreening(screening: Screening): Promise<void> {
  if (!screening.sourceIntakeId) return;
  const { getDoc, doc } = await import("firebase/firestore");
  const { getDb } = await import("./firebase");
  const snap = await getDoc(doc(getDb(), "intakes", screening.sourceIntakeId));
  if (!snap.exists()) return;
  const intake = { id: snap.id, ...(snap.data() as object) } as Intake;
  await saveIntake({
    ...intake,
    status: "answered",
    screeningId: screening.id,
    answeredAt: new Date().toISOString(),
    reply: screening.simpleConclusion,
    replySw: screening.simpleConclusionSw,
    recommendations: screening.recommendations,
  });
}
