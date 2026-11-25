import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchProfile,
  signInAdmin,
  signInCustomer,
  signInWithGoogle,
  signOutUser,
  signUpCustomer,
  subscribeAuth,
  upsertProfile,
  type AuthSnapshot,
  type UserProfile,
} from "@/lib/auth";

type AuthContextValue = AuthSnapshot & {
  signInAsAdmin: (email: string, password: string) => Promise<void>;
  signInAsCustomer: (email: string, password: string) => Promise<void>;
  registerCustomer: (email: string, password: string, displayName: string) => Promise<void>;
  continueWithGoogle: () => Promise<void>;
  saveProfile: (input: Omit<UserProfile, "uid" | "email" | "createdAt" | "updatedAt"> & { email?: string }) => Promise<UserProfile>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<AuthSnapshot>({
    user: null,
    isAdmin: false,
    profile: null,
    loading: true,
  });

  useEffect(() => subscribeAuth(setSnap), []);

  const value = useMemo<AuthContextValue>(() => ({
    ...snap,
    signInAsAdmin: async (email, password) => {
      await signInAdmin(email, password);
    },
    signInAsCustomer: async (email, password) => {
      await signInCustomer(email, password);
    },
    registerCustomer: async (email, password, displayName) => {
      await signUpCustomer(email, password, displayName);
    },
    continueWithGoogle: async () => {
      await signInWithGoogle();
    },
    saveProfile: async (input) => {
      if (!snap.user) throw new Error("Sign in before creating a profile.");
      const profile = await upsertProfile({
        uid: snap.user.uid,
        email: input.email || snap.user.email || "",
        displayName: input.displayName,
        phone: input.phone,
        city: input.city,
        notes: input.notes,
        age: input.age,
        sex: input.sex,
        photoUrl: input.photoUrl,
      });
      setSnap((current) => ({ ...current, profile }));
      return profile;
    },
    refreshProfile: async () => {
      if (!snap.user) return;
      const profile = await fetchProfile(snap.user.uid);
      setSnap((current) => ({ ...current, profile }));
    },
    signOut: async () => {
      await signOutUser();
    },
  }), [snap]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}
