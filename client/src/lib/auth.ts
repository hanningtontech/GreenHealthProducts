import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getDb, getFirebaseAuth, isFirebaseConfigured } from "./firebase";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  city?: string;
  notes?: string;
  age?: string;
  sex?: string;
  /** Public HTTPS Backblaze B2 URL for the profile avatar (media/profiles/{uid}/avatar.jpg). */
  photoUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type AuthSnapshot = {
  user: User | null;
  isAdmin: boolean;
  profile: UserProfile | null;
  loading: boolean;
};

async function readAdminFlag(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(getDb(), "admins", uid));
  return snap.exists();
}

export async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getDb(), "profiles", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function upsertProfile(input: {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  city?: string;
  notes?: string;
  age?: string;
  sex?: string;
  photoUrl?: string;
}): Promise<UserProfile> {
  const ref = doc(getDb(), "profiles", input.uid);
  const existing = await getDoc(ref);
  const existingData = existing.exists() ? (existing.data() as UserProfile) : null;
  const payload: UserProfile = {
    uid: input.uid,
    email: input.email,
    displayName: input.displayName.trim(),
    phone: input.phone?.trim() || "",
    city: input.city?.trim() || "",
    notes: input.notes?.trim() || "",
    age: input.age?.trim() || "",
    sex: input.sex?.trim() || "",
    photoUrl: input.photoUrl !== undefined ? input.photoUrl : existingData?.photoUrl || "",
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  };
  await setDoc(ref, payload, { merge: true });
  if (getFirebaseAuth().currentUser) {
    await updateProfile(getFirebaseAuth().currentUser!, {
      displayName: payload.displayName,
      ...(payload.photoUrl && !payload.photoUrl.startsWith("data:")
        ? { photoURL: payload.photoUrl }
        : {}),
    });
  }
  return payload;
}

export async function signInAdmin(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  const isAdmin = await readAdminFlag(cred.user.uid);
  if (!isAdmin) {
    await signOut(getFirebaseAuth());
    throw new Error("This account is not an admin. Ask the owner to add your UID under admins/.");
  }
  return cred.user;
}

export async function signUpCustomer(email: string, password: string, displayName: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  if (displayName.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() });
  }
  return cred.user;
}

export async function signInCustomer(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return cred.user;
}

/** Continue with Google (popup). Profile can be completed later. */
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(getFirebaseAuth(), provider);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}

export function subscribeAuth(onChange: (snap: AuthSnapshot) => void): () => void {
  if (!isFirebaseConfigured()) {
    onChange({ user: null, isAdmin: false, profile: null, loading: false });
    return () => undefined;
  }

  onChange({ user: null, isAdmin: false, profile: null, loading: true });
  return onAuthStateChanged(getFirebaseAuth(), async (user) => {
    if (!user) {
      onChange({ user: null, isAdmin: false, profile: null, loading: false });
      return;
    }
    try {
      const [isAdmin, profile] = await Promise.all([readAdminFlag(user.uid), fetchProfile(user.uid)]);
      onChange({ user, isAdmin, profile, loading: false });
    } catch {
      onChange({ user, isAdmin: false, profile: null, loading: false });
    }
  });
}
