import { fetchProfile, type UserProfile } from "./auth";
import { findPatientByAuthUid, getPatient, upsertPatient } from "./patients";
import type { Patient, Screening, ScreeningSubject } from "./screeningTypes";

/** Merge profile + patient into a screening subject (age, sex, photo, contacts). */
export function mergeSubjectFromProfile(
  subject: ScreeningSubject,
  profile: UserProfile | null | undefined,
  patient: Patient | null | undefined,
): ScreeningSubject {
  return {
    ...subject,
    name: (profile?.displayName || patient?.displayName || subject.name || "Patient").trim(),
    email: (profile?.email || patient?.email || subject.email || "").toLowerCase().trim(),
    phone: profile?.phone || patient?.phone || subject.phone || "",
    age: profile?.age || patient?.age || subject.age || "",
    sex: profile?.sex || patient?.sex || subject.sex || "",
    photoUrl: profile?.photoUrl || patient?.photoUrl || subject.photoUrl || "",
  };
}

/**
 * Load the linked user's profile (by authUid / patient) and write full details onto the screening.
 */
export async function hydrateScreeningFromUserProfile(screening: Screening): Promise<Screening> {
  let patient: Patient | null = null;
  try {
    if (screening.patientId) patient = await getPatient(screening.patientId);
  } catch {
    patient = null;
  }

  let profile: UserProfile | null = null;
  const authUid = patient?.authUid;
  if (authUid) {
    try {
      profile = await fetchProfile(authUid);
    } catch {
      profile = null;
    }
    if (!patient) {
      try {
        patient = await findPatientByAuthUid(authUid);
      } catch {
        patient = null;
      }
    }
  }

  const subject = mergeSubjectFromProfile(screening.subject, profile, patient);

  if (patient && (profile || subject.photoUrl || subject.age || subject.sex)) {
    try {
      patient = await upsertPatient({
        ...patient,
        displayName: subject.name,
        email: subject.email || patient.email,
        phone: subject.phone,
        age: subject.age,
        sex: subject.sex,
        photoUrl: subject.photoUrl,
      });
    } catch {
      // keep local merge even if patient write fails
    }
  }

  return {
    ...screening,
    patientId: patient?.id || screening.patientId,
    subject,
  };
}

export function profileHasRequiredDemographics(
  profile: Pick<UserProfile, "age" | "sex"> | null | undefined,
): boolean {
  return Boolean(String(profile?.age || "").trim() && String(profile?.sex || "").trim());
}
