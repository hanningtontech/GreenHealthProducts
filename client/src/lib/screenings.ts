import {
  collection,
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
import { isHttpUrl, uploadMediaFile } from "./mediaStorage";
import type { Screening, ScreeningStatus } from "./screeningTypes";

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const next = { ...value };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

export async function getScreening(id: string): Promise<Screening | null> {
  const snap = await getDoc(doc(getDb(), "screenings", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as DocumentData) } as Screening;
}

export async function listScreeningsForPatient(patientId: string): Promise<Screening[]> {
  if (!isFirebaseConfigured()) return [];
  const q = query(collection(getDb(), "screenings"), where("patientId", "==", patientId));
  const snap = await getDocs(q);
  return snap.docs
    .map((item) => ({ id: item.id, ...(item.data() as DocumentData) }) as Screening)
    .sort((a, b) => String(b.subject?.testDate || "").localeCompare(String(a.subject?.testDate || "")));
}

export async function listSharedScreeningsForPatient(patientId: string): Promise<Screening[]> {
  const all = await listScreeningsForPatient(patientId);
  return all.filter((item) => item.status === "shared");
}

/** Live shared screenings for a patient (storefront notifications + results). */
export function subscribeSharedScreeningsForPatient(
  patientId: string,
  onChange: (items: Screening[]) => void,
): Unsubscribe {
  if (!isFirebaseConfigured() || !patientId) {
    onChange([]);
    return () => undefined;
  }
  const q = query(collection(getDb(), "screenings"), where("patientId", "==", patientId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((item) => ({ id: item.id, ...(item.data() as DocumentData) }) as Screening)
        .filter((item) => item.status === "shared")
        .sort((a, b) => String(b.id).localeCompare(String(a.id)));
      onChange(items);
    },
    () => onChange([]),
  );
}

export async function listAllScreenings(): Promise<Screening[]> {
  if (!isFirebaseConfigured()) return [];
  const snap = await getDocs(collection(getDb(), "screenings"));
  return snap.docs.map((item) => ({ id: item.id, ...(item.data() as DocumentData) }) as Screening);
}

/** Live list of all screenings for admin conversation threads. */
export function subscribeAllScreenings(onChange: (items: Screening[]) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    onChange([]);
    return () => undefined;
  }
  return onSnapshot(
    collection(getDb(), "screenings"),
    (snap) => {
      onChange(snap.docs.map((item) => ({ id: item.id, ...(item.data() as DocumentData) }) as Screening));
    },
    () => onChange([]),
  );
}

export async function saveScreening(screening: Screening): Promise<Screening> {
  const refDoc = doc(getDb(), "screenings", screening.id);
  let exists = false;
  try {
    exists = (await getDoc(refDoc)).exists();
  } catch {
    exists = false;
  }
  const { id, ...rest } = screening;
  const payload = stripUndefined({
    ...rest,
    updatedAt: serverTimestamp(),
    ...(exists ? {} : { createdAt: serverTimestamp() }),
  } as Record<string, unknown>);
  await setDoc(refDoc, payload, { merge: true });
  return screening;
}

export async function setScreeningStatus(id: string, status: ScreeningStatus): Promise<void> {
  const payload: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (status === "shared") payload.sharedAt = serverTimestamp();
  await setDoc(doc(getDb(), "screenings", id), payload, { merge: true });
}

/** Upload screening source PDF/text to B2 → media/screenings/{id}/source/... */
export async function uploadScreeningFile(
  screeningId: string,
  file: File,
): Promise<{ publicUrl: string; key?: string }> {
  try {
    const result = await uploadMediaFile(file, {
      purpose: "screening",
      fileName: file.name || "source.bin",
      screeningId,
    });
    return result;
  } catch (err) {
    // Keep the draft usable offline; mark clearly so UI does not treat it as HTTPS.
    console.warn("B2 screening source upload failed:", err);
    return { publicUrl: `local://${file.name}` };
  }
}

/** Upload generated patient-report.pdf to B2 → media/screenings/{id}/reports/patient-report.pdf */
export async function uploadScreeningReportPdf(
  screeningId: string,
  pdf: Blob,
  fileName = "patient-report.pdf",
): Promise<{ publicUrl: string; key: string }> {
  return uploadMediaFile(pdf, {
    purpose: "report",
    fileName,
    screeningId,
  });
}

export async function readReportText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const isText =
    file.type.startsWith("text/")
    || name.endsWith(".txt")
    || name.endsWith(".md")
    || name.endsWith(".csv");
  if (isText) return file.text();
  const { extractPdfText } = await import("./parseScreeningReport");
  try {
    return await extractPdfText(file);
  } catch {
    return file.text();
  }
}

export async function getScreeningFileUrl(path: string): Promise<string> {
  if (isHttpUrl(path)) return path;
  if (path.startsWith("local://")) throw new Error("This screening file was not uploaded to media storage.");
  return path;
}

export function newScreeningId(): string {
  return `screening-${Date.now()}`;
}
