import type { Intake, Patient, Screening } from "@/lib/screeningTypes";

export type ConversationItemKind = "intake" | "screening";

export type ConversationItem = {
  kind: ConversationItemKind;
  id: string;
  activityAt: number;
  preview: string;
  statusLabel: string;
  intake?: Intake;
  screening?: Screening;
};

export type ConversationThread = {
  key: string;
  patient: Patient | null;
  displayName: string;
  email?: string;
  phone?: string;
  items: ConversationItem[];
  lastActivityAt: number;
  lastPreview: string;
  unreadCount: number;
  hasPending: boolean;
  hasInReview: boolean;
  hasShared: boolean;
  hasAnswered: boolean;
};

function stamp(value: unknown, fallbackId = ""): number {
  if (value && typeof value === "object") {
    if ("toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
      const t = (value as { toDate: () => Date }).toDate().getTime();
      if (Number.isFinite(t)) return t;
    }
    if ("seconds" in value) {
      const t = Number((value as { seconds: number }).seconds) * 1000;
      if (Number.isFinite(t)) return t;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const t = new Date(value).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const m = String(fallbackId).match(/(\d{10,})$/);
  return m ? Number(m[1]) : 0;
}

export function isIntakeAdminUnread(intake: Intake): boolean {
  if (intake.status !== "pending") return false;
  return !intake.adminSeenAt;
}

export function conversationKeyForIntake(intake: Intake): string {
  if (intake.patientId) return `patient:${intake.patientId}`;
  if (intake.authUid) return `uid:${intake.authUid}`;
  if (intake.email?.trim()) return `email:${intake.email.trim().toLowerCase()}`;
  return `orphan:intake:${intake.id}`;
}

export function conversationKeyForScreening(screening: Screening): string {
  if (screening.patientId) return `patient:${screening.patientId}`;
  if (screening.subject?.email?.trim()) return `email:${screening.subject.email.trim().toLowerCase()}`;
  if (screening.subject?.phone?.trim()) return `phone:${screening.subject.phone.trim()}`;
  return `orphan:screening:${screening.id}`;
}

export function buildPatientLookup(patients: Patient[]): Map<string, Patient> {
  const map = new Map<string, Patient>();
  for (const p of patients) {
    if (p.id) map.set(`id:${p.id}`, p);
    if (p.authUid) map.set(`uid:${p.authUid}`, p);
    if (p.email) map.set(`email:${p.email.toLowerCase()}`, p);
    if (p.phone?.trim()) map.set(`phone:${p.phone.trim()}`, p);
  }
  return map;
}

export function resolvePatientForIntake(
  intake: Intake,
  lookup: Map<string, Patient>,
): Patient | null {
  if (intake.patientId && lookup.get(`id:${intake.patientId}`)) return lookup.get(`id:${intake.patientId}`)!;
  if (intake.authUid && lookup.get(`uid:${intake.authUid}`)) return lookup.get(`uid:${intake.authUid}`)!;
  if (intake.email && lookup.get(`email:${intake.email.toLowerCase()}`)) {
    return lookup.get(`email:${intake.email.toLowerCase()}`)!;
  }
  return null;
}

export function resolvePatientForScreening(
  screening: Screening,
  lookup: Map<string, Patient>,
): Patient | null {
  if (screening.patientId && lookup.get(`id:${screening.patientId}`)) {
    return lookup.get(`id:${screening.patientId}`)!;
  }
  const email = screening.subject?.email?.trim().toLowerCase();
  if (email && lookup.get(`email:${email}`)) return lookup.get(`email:${email}`)!;
  const phone = screening.subject?.phone?.trim();
  if (phone && lookup.get(`phone:${phone}`)) return lookup.get(`phone:${phone}`)!;
  return null;
}

function intakePreview(intake: Intake): string {
  return intake.summary
    || intake.title
    || (intake.concerns || []).slice(0, 2).join(", ")
    || (intake.freeText || "").slice(0, 120)
    || "Help note";
}

function screeningPreview(screening: Screening): string {
  const conclusion = (screening.simpleConclusion || screening.bankDraftConclusion || "").trim();
  if (conclusion) return conclusion.slice(0, 120);
  return `${screening.status} screening`;
}

function intakeStatusLabel(intake: Intake): string {
  return intake.status.replace(/_/g, " ");
}

/** Merge intakes + screenings into WhatsApp-style patient threads. */
export function buildConversationThreads(
  intakes: Intake[],
  screenings: Screening[],
  patients: Patient[],
): ConversationThread[] {
  const lookup = buildPatientLookup(patients);
  const buckets = new Map<string, {
    key: string;
    patient: Patient | null;
    displayName: string;
    email?: string;
    phone?: string;
    items: ConversationItem[];
  }>();

  const ensure = (
    key: string,
    patient: Patient | null,
    fallbackName: string,
    email?: string,
    phone?: string,
  ) => {
    const existing = buckets.get(key);
    if (existing) {
      if (!existing.patient && patient) existing.patient = patient;
      if (patient?.displayName) existing.displayName = patient.displayName;
      if (email && !existing.email) existing.email = email;
      if (phone && !existing.phone) existing.phone = phone;
      return existing;
    }
    const created = {
      key,
      patient,
      displayName: patient?.displayName || fallbackName || "Patient",
      email: email || patient?.email,
      phone: phone || patient?.phone,
      items: [] as ConversationItem[],
    };
    buckets.set(key, created);
    return created;
  };

  // Prefer grouping screenings that are already linked to an intake under the intake's key.
  const screeningIdsFromIntakes = new Set(
    intakes.map((i) => i.screeningId).filter(Boolean) as string[],
  );

  for (const intake of intakes) {
    const patient = resolvePatientForIntake(intake, lookup);
    const key = conversationKeyForIntake(intake);
    const bucket = ensure(
      key,
      patient,
      intake.displayName || patient?.displayName || "Patient",
      intake.email || patient?.email,
      patient?.phone,
    );
    bucket.items.push({
      kind: "intake",
      id: intake.id,
      activityAt: stamp(intake.updatedAt || intake.createdAt, intake.id),
      preview: intakePreview(intake),
      statusLabel: intakeStatusLabel(intake),
      intake,
    });
  }

  for (const screening of screenings) {
    // If a linked intake already carries this screening, still add the screening
    // as its own timeline item so shared/draft status is visible in the thread.
    const linkedIntake = intakes.find((i) => i.screeningId === screening.id || i.id === screening.sourceIntakeId);
    const patient = resolvePatientForScreening(screening, lookup)
      || (linkedIntake ? resolvePatientForIntake(linkedIntake, lookup) : null);
    const key = linkedIntake
      ? conversationKeyForIntake(linkedIntake)
      : conversationKeyForScreening(screening);
    const bucket = ensure(
      key,
      patient,
      screening.subject?.name || patient?.displayName || "Patient",
      screening.subject?.email || patient?.email,
      screening.subject?.phone || patient?.phone,
    );
    bucket.items.push({
      kind: "screening",
      id: screening.id,
      activityAt: stamp(screening.sharedAt || screening.updatedAt || screening.createdAt, screening.id),
      preview: screeningPreview(screening),
      statusLabel: screening.status,
      screening,
    });
    void screeningIdsFromIntakes;
  }

  const threads: ConversationThread[] = [...buckets.values()].map((bucket) => {
    const items = [...bucket.items].sort((a, b) => a.activityAt - b.activityAt);
    const last = items[items.length - 1];
    const intakeItems = items.filter((i) => i.kind === "intake" && i.intake);
    const unreadCount = intakeItems.filter((i) => i.intake && isIntakeAdminUnread(i.intake)).length;
    return {
      key: bucket.key,
      patient: bucket.patient,
      displayName: bucket.displayName,
      email: bucket.email,
      phone: bucket.phone,
      items,
      lastActivityAt: last?.activityAt || 0,
      lastPreview: last?.preview || "",
      unreadCount,
      hasPending: intakeItems.some((i) => i.intake?.status === "pending"),
      hasInReview: intakeItems.some((i) => i.intake?.status === "in_review"),
      hasShared: items.some((i) => i.screening?.status === "shared"),
      hasAnswered: intakeItems.some((i) => i.intake?.status === "answered"),
    };
  });

  return threads.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

/** Count conversations that still have unread pending help notes. */
export function countUnreadConversations(threads: ConversationThread[]): number {
  return threads.filter((t) => t.unreadCount > 0).length;
}

export function formatRelativeActivity(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(ms).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
}
