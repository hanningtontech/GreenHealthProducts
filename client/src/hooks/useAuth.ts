import { useEffect, useState } from "react";
import { subscribeAuth, type AuthSnapshot } from "@/lib/auth";

const initial: AuthSnapshot = {
  user: null,
  isAdmin: false,
  profile: null,
  loading: true,
};

export function useAuth(): AuthSnapshot {
  const [snap, setSnap] = useState<AuthSnapshot>(initial);

  useEffect(() => subscribeAuth(setSnap), []);

  return snap;
}
