import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Camera, MessageCircleHeart, Pencil, UserRound } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import BrandMark from "@/components/BrandMark";
import ProfilePhotoCropper from "@/components/ProfilePhotoCropper";
import SiteNavActions from "@/components/SiteNavActions";
import { initialsFromName } from "@/lib/patientAvatar";
import { isDisplayableMediaUrl, resolveMediaUrl } from "@/lib/mediaStorage";
import { uploadProfilePhoto } from "@/lib/profilePhoto";

type Draft = {
  displayName: string;
  phone: string;
  city: string;
  notes: string;
  age: string;
  sex: string;
  /** Saved remote URL or local object URL for preview. */
  photoPreview: string;
  /** Cropped blob waiting to upload on Save (null = keep existing remote photo). */
  pendingPhoto: Blob | null;
};

const emptyDraft = (): Draft => ({
  displayName: "",
  phone: "",
  city: "",
  notes: "",
  age: "",
  sex: "",
  photoPreview: "",
  pendingPhoto: null,
});

export default function Profile() {
  const {
    user,
    profile,
    loading,
    signInAsCustomer,
    registerCustomer,
    continueWithGoogle,
    saveProfile,
    signOut,
  } = useAuthContext();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const draftFromProfile = (): Draft => {
    revokeObjectUrl();
    return {
      displayName: profile?.displayName || user?.displayName || "",
      phone: profile?.phone || "",
      city: profile?.city || "",
      notes: profile?.notes || "",
      age: profile?.age || "",
      sex: profile?.sex || "",
      photoPreview: profile?.photoUrl || user?.photoURL || "",
      pendingPhoto: null,
    };
  };

  useEffect(() => {
    if (!user) {
      setEditing(false);
      setDraft(emptyDraft());
      return;
    }
    if (!profile) {
      setDraft({
        displayName: user.displayName || "",
        phone: "",
        city: "",
        notes: "",
        age: "",
        sex: "",
        photoPreview: user.photoURL || "",
        pendingPhoto: null,
      });
      setEditing(true);
      return;
    }
    if (!editing) {
      setDraft(draftFromProfile());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only rehydrate when profile/user identity changes
  }, [user?.uid, profile?.uid, profile?.updatedAt]);

  useEffect(() => () => revokeObjectUrl(), []);

  const authSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        await registerCustomer(email, password, draft.displayName);
        setMessage("Account created. Complete your profile below — nothing saves until you click Save.");
        setEditing(true);
      } else {
        await signInAsCustomer(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const googleContinue = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await continueWithGoogle();
      setMessage("Signed in with Google. You can finish your profile now or later — click Save when ready.");
      setEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const profileSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!String(draft.age || "").trim()) {
      setError("Age is required.");
      return;
    }
    if (!String(draft.sex || "").trim()) {
      setError("Sex is required.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let photoUrl = profile?.photoUrl || "";
      if (draft.pendingPhoto) {
        setMessage("Uploading photo…");
        photoUrl = await uploadProfilePhoto(draft.pendingPhoto, user.uid);
      } else if (draft.photoPreview && /^https?:\/\//i.test(draft.photoPreview)) {
        photoUrl = draft.photoPreview;
      }
      await saveProfile({
        displayName: draft.displayName,
        phone: draft.phone,
        city: draft.city,
        notes: draft.notes,
        age: draft.age,
        sex: draft.sex,
        photoUrl,
      });
      revokeObjectUrl();
      setDraft((d) => ({ ...d, pendingPhoto: null, photoPreview: photoUrl }));
      setMessage(profile ? "Profile updated." : "Profile saved.");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
      setMessage("");
    } finally {
      setBusy(false);
    }
  };

  const onPickPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError("");
    setMessage("");
    const src = URL.createObjectURL(file);
    setCropSrc(src);
  };

  const onCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const onCropConfirm = (blob: Blob, previewUrl: string) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    revokeObjectUrl();
    objectUrlRef.current = previewUrl;
    setDraft((d) => ({ ...d, pendingPhoto: blob, photoPreview: previewUrl }));
    setMessage("Photo ready. Click Save / Update profile to keep it.");
  };

  const startEdit = () => {
    setDraft(draftFromProfile());
    setMessage("");
    setError("");
    setEditing(true);
  };

  const cancelEdit = () => {
    if (!profile) return;
    setDraft(draftFromProfile());
    setError("");
    setMessage("");
    setEditing(false);
  };

  if (loading) {
    return <div className="admin-shell"><main className="container admin-main"><p className="muted">Loading…</p></main></div>;
  }

  const showCard = Boolean(user && profile && !editing);
  const avatarLabel = draft.displayName || profile?.displayName || user?.email || "You";
  const cardPhoto = resolveMediaUrl(profile?.photoUrl);
  const editPhoto = resolveMediaUrl(draft.photoPreview);

  return (
    <div className="admin-shell">
      <header className="admin-header profile-header">
        <div className="admin-header-bar">
          <div>
            <Link href="/" className="brand">
              <BrandMark />
              <span>GreenHealth<em>Products</em></span>
            </Link>
            <p className="admin-kicker">Your profile</p>
          </div>
          <SiteNavActions
            variant="patient"
            menuItems={[
              { href: "/", label: "Store", icon: "store" },
              { href: "/help", label: "Get help", icon: "help" },
              { href: "/results", label: "My results", icon: "results" },
            ]}
          />
        </div>
      </header>

      <main className="container admin-main">
        {!user ? (
          <section className="auth-panel">
            <p className="eyebrow">Your account</p>
            <h1>{mode === "register" ? "Create an account" : "Sign in"}</h1>
            <p>Continue with Google or email. Age and sex are required before automatic guidance — nothing autosaves.</p>
            <button
              type="button"
              className="button button-secondary auth-google-btn"
              onClick={() => void googleContinue()}
              disabled={busy}
            >
              <GoogleGlyph /> Continue with Google
            </button>
            <div className="auth-divider"><span>or</span></div>
            <div className="auth-tabs">
              <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button>
              <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button>
            </div>
            <form className="auth-form" onSubmit={authSubmit}>
              {mode === "register" && (
                <label className="form-field"><span>Display name</span><input value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} required /></label>
              )}
              <label className="form-field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
              <label className="form-field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "register" ? "new-password" : "current-password"} /></label>
              {error && <p className="auth-error">{error}</p>}
              {message && <p className="sync-note">{message}</p>}
              <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</button>
            </form>
          </section>
        ) : showCard ? (
          <section className="profile-card">
            <div className="profile-card-banner" />
            <div className="profile-card-body">
              <div className="profile-card-avatar-wrap">
                {cardPhoto ? (
                  <img src={cardPhoto} alt="" className="profile-card-photo" />
                ) : (
                  <span className="profile-card-initials">{initialsFromName(profile?.displayName || user.email || "You")}</span>
                )}
              </div>
              <div className="profile-card-head">
                <div>
                  <p className="eyebrow">Profile</p>
                  <h1>{profile?.displayName || "Your profile"}</h1>
                  <p className="profile-card-email">{user.email}</p>
                </div>
                <button type="button" className="button button-secondary" onClick={startEdit}>
                  <Pencil size={16} /> Edit
                </button>
              </div>
              <dl className="profile-card-details">
                <div>
                  <dt>Age</dt>
                  <dd>{profile?.age || "—"}</dd>
                </div>
                <div>
                  <dt>Sex</dt>
                  <dd>{profile?.sex || "—"}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{profile?.phone || "—"}</dd>
                </div>
                <div>
                  <dt>City</dt>
                  <dd>{profile?.city || "—"}</dd>
                </div>
                <div className="profile-card-notes">
                  <dt>Notes</dt>
                  <dd>{profile?.notes || "—"}</dd>
                </div>
              </dl>
              <Link href="/help" className="button button-primary profile-feeling-btn">
                <MessageCircleHeart size={18} /> Tell us what you are feeling today
              </Link>
              {message && <p className="sync-note">{message}</p>}
            </div>
          </section>
        ) : (
          <section className="auth-panel profile-edit-panel">
            <p className="eyebrow">Profile</p>
            <h1>{profile ? "Update profile" : "Create your profile"}</h1>
            <p>
              Signed in as {user.email}. Edit freely — changes stay on this screen until you click{" "}
              {profile ? "Update profile" : "Save profile"}.
            </p>
            <Link href="/help" className="button button-primary profile-feeling-btn">
              <MessageCircleHeart size={18} /> Tell us what you are feeling today
            </Link>

            <div className="profile-photo-picker">
              <button
                type="button"
                className="profile-photo-btn"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-label="Add profile photo"
              >
                {editPhoto ? (
                  <img src={editPhoto} alt="" className="profile-card-photo" />
                ) : (
                  <span className="profile-card-initials">{initialsFromName(avatarLabel)}</span>
                )}
                <span className="profile-photo-overlay"><Camera size={18} /> {isDisplayableMediaUrl(draft.photoPreview) || draft.pendingPhoto ? "Change" : "Add photo"}</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
              <p className="profile-photo-hint">Crop and zoom after you pick a photo. Upload happens only when you save.</p>
            </div>

            <form className="auth-form" onSubmit={profileSubmit}>
              <label className="form-field"><span>Display name</span><input value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} required /></label>
              <div className="profile-field-row">
                <label className="form-field"><span>Age *</span><input type="number" min={1} max={120} inputMode="numeric" value={draft.age} onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))} placeholder="Required" required /></label>
                <label className="form-field"><span>Sex *</span>
                  <select value={draft.sex} onChange={(e) => setDraft((d) => ({ ...d, sex: e.target.value }))} required>
                    <option value="">Select…</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
              </div>
              <label className="form-field"><span>Phone</span><input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="Optional" /></label>
              <label className="form-field"><span>City</span><input value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} placeholder="Optional" /></label>
              <label className="form-field field-wide"><span>Notes for the owner</span><textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} rows={3} placeholder="Optional delivery or preference notes" /></label>
              {error && <p className="auth-error">{error}</p>}
              {message && <p className="sync-note">{message}</p>}
              <div className="profile-edit-actions">
                {profile && (
                  <button type="button" className="button button-secondary" onClick={cancelEdit} disabled={busy}>Cancel</button>
                )}
                <button className="button button-primary" type="submit" disabled={busy}>
                  <UserRound size={16} /> {busy ? "Saving…" : profile ? "Update profile" : "Save profile"}
                </button>
              </div>
            </form>
          </section>
        )}
      </main>

      {cropSrc && (
        <ProfilePhotoCropper
          imageSrc={cropSrc}
          onCancel={onCropCancel}
          onConfirm={onCropConfirm}
        />
      )}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.1 5.5l.1.1 6.2 5.2C39.2 36.3 44 31 44 24c0-1.3-.1-2.5-.4-3.5z" />
    </svg>
  );
}
