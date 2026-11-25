import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, updateProfile, getAuth } from "firebase/auth";
import { initializeApp, deleteApp, getApps } from "firebase/app";
import { getDb, getFirebaseApp, isFirebaseConfigured } from "./firebase";
import type { Patient } from "./screeningTypes";

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const next = { ...value };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

export async function listPatients(): Promise<Patient[]> {
  if (!isFirebaseConfigured()) return [];
  const snap = await getDocs(collection(getDb(), "patients"));
  return snap.docs.map((item) => ({ id: item.id, ...(item.data() as DocumentData) }) as Patient);
}

export async function getPatient(patientId: string): Promise<Patient | null> {
  const snap = await getDoc(doc(getDb(), "patients", patientId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as DocumentData) } as Patient;
}

export async function findPatientByEmail(email: string): Promise<Patient | null> {
  const q = query(collection(getDb(), "patients"), where("email", "==", email.trim().toLowerCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const first = snap.docs[0];
  return { id: first.id, ...(first.data() as DocumentData) } as Patient;
}

export async function findPatientByAuthUid(authUid: string): Promise<Patient | null> {
  try {
    const q = query(collection(getDb(), "patients"), where("authUid", "==", authUid));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const first = snap.docs[0];
    return { id: first.id, ...(first.data() as DocumentData) } as Patient;
  } catch {
    return null;
  }
}

export async function upsertPatient(input: Omit<Patient, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<Patient> {
  const requestedId = input.id || `patient-${Date.now()}`;
  let existing: Patient | null = null;
  if (input.id) {
    try {
      existing = await getPatient(input.id);
    } catch {
      existing = null;
    }
  }
  const email = (input.email || "").trim().toLowerCase();
  let byEmail: Patient | null = null;
  if (email) {
    try {
      byEmail = await findPatientByEmail(email);
    } catch {
      byEmail = null;
    }
  }
  // Prefer an already-linked patient (by id or email) so screenings merge into one conversation.
  const id = byEmail?.id || existing?.id || requestedId;
  const authUid =
    input.authUid?.trim()
    || existing?.authUid?.trim()
    || byEmail?.authUid?.trim()
    // Admin-created / upload patients may not have Firebase Auth yet.
    || `pending-${id}`;
  const ref = doc(getDb(), "patients", id);
  const exists = Boolean(existing || byEmail);
  const payload = stripUndefined({
    email: email || `pending-${id}@greenhealthproducts.local`,
    displayName: (input.displayName || existing?.displayName || byEmail?.displayName || "Patient").trim(),
    phone: input.phone?.trim() || existing?.phone || byEmail?.phone || "",
    sex: input.sex || existing?.sex || byEmail?.sex || "",
    age: input.age ?? existing?.age ?? byEmail?.age ?? "",
    notes: input.notes || existing?.notes || byEmail?.notes || "",
    authUid,
    updatedAt: serverTimestamp(),
    ...(exists ? {} : { createdAt: serverTimestamp() }),
  });
  await setDoc(ref, payload, { merge: true });
  return { id, ...payload } as Patient;
}

/**
 * Create a Firebase Auth user without replacing the admin session (secondary app).
 * Returns the new uid. Temporary password should be changed via reset email by the patient.
 */
export async function createPatientAuthAccount(email: string, displayName: string, temporaryPassword: string): Promise<string> {
  const primary = getFirebaseApp();
  const config = primary.options;
  const secondaryName = `patient-create-${Date.now()}`;
  const secondary = initializeApp(config, secondaryName);
  try {
    const auth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), temporaryPassword);
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    return cred.user.uid;
  } finally {
    await deleteApp(secondary);
    // Clean orphaned secondary apps if any linger
    getApps().filter((app) => app.name.startsWith("patient-create-")).forEach((app) => {
      void deleteApp(app);
    });
  }
}
