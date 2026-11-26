import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Bell } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { findPatientByAuthUid } from "@/lib/patients";
import { subscribeSharedScreeningsForPatient } from "@/lib/screenings";
import { countUnseenShared, screeningStamp } from "@/lib/patientNotifications";
import { pulseDevice } from "@/lib/patientReportTitle";

export default function PatientNotifyBell() {
  const { user } = useAuthContext();
  const [count, setCount] = useState(0);
  const sharedRef = useRef<Array<{ id: string; stamp: number }>>([]);
  const prevCountRef = useRef(0);
  const countPrimedRef = useRef(false);

  const refreshCount = useCallback(() => {
    const hints = sharedRef.current;
    const next = countUnseenShared(
      hints.map((h) => h.id),
      hints,
    );
    if (countPrimedRef.current && next > prevCountRef.current) pulseDevice([30, 40, 30]);
    countPrimedRef.current = true;
    prevCountRef.current = next;
    setCount(next);
  }, []);

  useEffect(() => {
    if (!user) {
      sharedRef.current = [];
      setCount(0);
      return;
    }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const patient = await findPatientByAuthUid(user.uid);
      if (!patient || cancelled) return;
      unsub = subscribeSharedScreeningsForPatient(patient.id, (items) => {
        sharedRef.current = items.map((item) => ({ id: item.id, stamp: screeningStamp(item) }));
        refreshCount();
      });
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user, refreshCount]);

  useEffect(() => {
    const onSeen = () => refreshCount();
    window.addEventListener("ghp:results-seen", onSeen);
    return () => window.removeEventListener("ghp:results-seen", onSeen);
  }, [refreshCount]);

  const href = user ? "/results" : "/profile";
  const label = !user
    ? "Sign in for notifications"
    : count
      ? `${count} new reports`
      : "My results";

  return (
    <Link href={href} className="nav-icon-btn patient-notify-bell" aria-label={label}>
      <Bell size={24} strokeWidth={1.85} />
      {count > 0 && <span className="nav-badge">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
