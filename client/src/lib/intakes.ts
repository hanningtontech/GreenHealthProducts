import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  serverTimestamp,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./firebase";
import type { Intake } from "./screeningTypes";

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const next = { ...value };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

function mapIntakeDocs(docs: { id: string; data: () => DocumentData }[]): Intake[] {
  return docs.map((item) => ({ id: item.id, ...(item.data() as DocumentData) }) as Intake);
}

export async function listIntakesForUser(authUid: string): Promise<Intake[]> {
  if (!isFirebaseConfigured()) return [];
  const q = query(collection(getDb(), "intakes"), where("authUid", "==", authUid));
  const snap = await getDocs(q);
  return mapIntakeDocs(snap.docs);
}

function intakeSortRank(status: Intake["status"]): number {
  if (status === "pending") return 0;
  if (status === "in_review") return 1;
  if (status === "answered") return 2;
  return 3;
}

function sortIntakes(items: Intake[]): Intake[] {
  return [...items].sort((a, b) => {
    const rank = intakeSortRank(a.status) - intakeSortRank(b.status);
    if (rank !== 0) return rank;
    return String(b.id).localeCompare(String(a.id));
  });
}

export async function listAllIntakes(): Promise<Intake[]> {
  if (!isFirebaseConfigured()) return [];
  const snap = await getDocs(collection(getDb(), "intakes"));
  return sortIntakes(mapIntakeDocs(snap.docs));
}

/** Live list of all intakes (newest / pending first). */
export function subscribeAllIntakes(onChange: (intakes: Intake[]) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    onChange([]);
    return () => undefined;
  }
  return onSnapshot(
    collection(getDb(), "intakes"),
    (snap) => onChange(sortIntakes(mapIntakeDocs(snap.docs))),
    () => onChange([]),
  );
}

/** Live count of pending help requests for the admin bell (legacy). */
export function subscribePendingIntakeCount(onChange: (count: number) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    onChange(0);
    return () => undefined;
  }
  const q = query(collection(getDb(), "intakes"), where("status", "==", "pending"));
  return onSnapshot(
    q,
    (snap) => onChange(snap.size),
    () => onChange(0),
  );
}

/**
 * Live count of conversations with unread pending help notes
 * (pending and not yet admin-seen). Used for the admin bell.
 */
export function subscribeUnreadConversationCount(onChange: (count: number) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    onChange(0);
    return () => undefined;
  }
  return onSnapshot(
    collection(getDb(), "intakes"),
    (snap) => {
      const pendingUnread = mapIntakeDocs(snap.docs).filter(
        (item) => item.status === "pending" && !item.adminSeenAt,
      );
      const keys = new Set(
        pendingUnread.map((item) => {
          if (item.patientId) return `patient:${item.patientId}`;
          if (item.authUid) return `uid:${item.authUid}`;
          if (item.email?.trim()) return `email:${item.email.trim().toLowerCase()}`;
          return `orphan:intake:${item.id}`;
        }),
      );
      onChange(keys.size);
    },
    () => onChange(0),
  );
}

export async function getIntake(id: string): Promise<Intake | null> {
  if (!isFirebaseConfigured() || !id) return null;
  const snap = await getDoc(doc(getDb(), "intakes", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as DocumentData) } as Intake;
}

/** Mark pending intakes in a conversation as admin-seen (badge clear on open). */
export async function markIntakesAdminSeen(intakes: Intake[]): Promise<void> {
  const now = Date.now();
  await Promise.all(
    intakes
      .filter((item) => item.status === "pending" && !item.adminSeenAt)
      .map((item) => saveIntake({ ...item, adminSeenAt: now })),
  );
}

export async function saveIntake(intake: Intake): Promise<Intake> {
  const ref = doc(getDb(), "intakes", intake.id);
  const { id, ...rest } = intake;
  await setDoc(
    ref,
    stripUndefined({
      ...rest,
      updatedAt: serverTimestamp(),
      createdAt: rest.createdAt ?? serverTimestamp(),
    } as Record<string, unknown>),
    { merge: true },
  );
  return intake;
}

export async function deleteIntake(intakeId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "intakes", intakeId));
}

export function newIntakeId(): string {
  return `intake-${Date.now()}`;
}
