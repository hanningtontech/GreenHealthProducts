import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { findPatientByAuthUid } from "@/lib/patients";
import { subscribeSharedScreeningsForPatient } from "@/lib/screenings";
import { countUnseenShared, screeningStamp } from "@/lib/patientNotifications";

export default function PatientNotifyBell() {
  const { user } = useAuthContext();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const patient = await findPatientByAuthUid(user.uid);
      if (!patient || cancelled) return;
      unsub = subscribeSharedScreeningsForPatient(patient.id, (items) => {
        const hints = items.map((item) => ({ id: item.id, stamp: screeningStamp(item) }));
        setCount(countUnseenShared(items.map((i) => i.id), hints));
      });
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user]);

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
