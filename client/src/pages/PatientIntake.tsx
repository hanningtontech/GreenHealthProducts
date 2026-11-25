import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Bone,
  Brain,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Droplets,
  Eye,
  Flower2,
  Heart,
  Leaf,
  List,
  LogOut,
  Menu,
  PersonStanding,
  Ribbon,
  Search,
  Shield,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
  Utensils,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import BrandMark from "@/components/BrandMark";
import { findPatientByAuthUid } from "@/lib/patients";
import { deleteIntake, listIntakesForUser, newIntakeId, saveIntake } from "@/lib/intakes";
import { ensureScreeningDraftFromIntake } from "@/lib/intakeToScreening";
import {
  buildIntakeTitleSummary,
  detectIntakeSource,
  downloadIntakeText,
  formatIntakeDate,
  isDuplicateIntake,
} from "@/lib/intakeSummary";
import {
  HELP_CATEGORIES,
  concernLabel,
  findSymptomByConcern,
  type HelpCategory,
  type HelpSymptom,
} from "@/lib/helpSymptoms";
import { WELLNESS_DISCLAIMER, type Intake } from "@/lib/screeningTypes";

const ICON_MAP: Record<HelpCategory["icon"], LucideIcon> = {
  brain: Brain,
  stomach: Utensils,
  bone: Bone,
  heart: Heart,
  leg: PersonStanding,
  skin: Leaf,
  zap: Zap,
  shield: Shield,
  flower: Flower2,
  user: UserRound,
  droplets: Droplets,
  eye: Eye,
  back: PersonStanding,
  ribbon: Ribbon,
  list: List,
};

type SubmitMode = "note" | "categories";

export default function PatientIntake() {
  const { user, profile, loading, signOut } = useAuthContext();
  const [language, setLanguage] = useState<"en" | "sw">("en");
  const [concerns, setConcerns] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [mine, setMine] = useState<Intake[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeCategory = useMemo(
    () => HELP_CATEGORIES.find((item) => item.id === activeCategoryId) || null,
    [activeCategoryId],
  );

  const filteredMine = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    const sorted = [...mine].sort((a, b) => String(b.id).localeCompare(String(a.id)));
    if (!q) return sorted;
    return sorted.filter((item) =>
      [
        item.title,
        item.summary,
        item.freeText,
        ...(item.concerns || []),
      ].join(" ").toLowerCase().includes(q));
  }, [mine, historyQuery]);

  useEffect(() => {
    if (!user) return;
    void listIntakesForUser(user.uid).then(setMine);
  }, [user]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [menuOpen]);

  useEffect(() => {
    if (!activeCategoryId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [activeCategoryId]);

  useEffect(() => {
    setConcerns((current) =>
      current.map((label) => {
        const match = findSymptomByConcern(label);
        return match ? concernLabel(match.category, match.symptom, language) : label;
      }),
    );
  }, [language]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.max(160, Math.floor(window.innerHeight * 0.55));
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [freeText]);

  const toggleConcern = (label: string) => {
    setConcerns((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  };

  const toggleSymptom = (category: HelpCategory, symptom: HelpSymptom) => {
    toggleConcern(concernLabel(category, symptom, language));
  };

  const isSymptomSelected = (category: HelpCategory, symptom: HelpSymptom) =>
    concerns.includes(concernLabel(category, symptom, "en"))
    || concerns.includes(concernLabel(category, symptom, "sw"));

  const selectedCountFor = (category: HelpCategory) =>
    category.symptoms.filter((symptom) => isSymptomSelected(category, symptom)).length;

  const submit = async (mode: SubmitMode) => {
    if (!user) return;
    const noteText = mode === "note" ? freeText.trim() : "";
    const selected = mode === "categories" ? concerns : (mode === "note" ? [] : concerns);
    const payloadConcerns = mode === "note" ? [] : selected;
    const payloadText = mode === "categories" ? "" : noteText;

    if (mode === "note" && !payloadText) {
      setError(language === "sw" ? "Andika maelezo kwanza." : "Write your note first.");
      return;
    }
    if (mode === "categories" && !payloadConcerns.length) {
      setError(language === "sw" ? "Chagua angalau suala moja." : "Select at least one issue.");
      return;
    }

    if (isDuplicateIntake(mine, payloadConcerns, payloadText)) {
      setError(language === "sw"
        ? "Huwezi kutuma. Maelezo haya yametumwa tayari."
        : "Can't send. This exact note was already submitted.");
      return;
    }

    setBusy(true);
    setError("");
    setNote("");
    try {
      const patient = await findPatientByAuthUid(user.uid);
      const { title, summary } = buildIntakeTitleSummary(payloadConcerns, payloadText, language);
      const intake: Intake = {
        id: newIntakeId(),
        authUid: user.uid,
        patientId: patient?.id,
        email: user.email || profile?.email || "",
        displayName: profile?.displayName || user.displayName || "",
        language,
        concerns: payloadConcerns,
        freeText: payloadText,
        title,
        summary,
        source: detectIntakeSource(payloadConcerns, payloadText),
        status: "pending",
      };
      await saveIntake(intake);
      try {
        await ensureScreeningDraftFromIntake(intake);
      } catch (draftErr) {
        console.warn("Help intake saved, but screening draft failed:", draftErr);
      }
      setMine(await listIntakesForUser(user.uid));
      if (mode === "note") setFreeText("");
      if (mode === "categories") {
        setConcerns([]);
        setCategoriesOpen(false);
      }
      setNote(
        language === "sw"
          ? "Imetumwa. Tutakagua na kukushirikisha ripoti kwenye Matokeo yangu."
          : "Sent. We’ll review and share your report under My results when ready.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not submit";
      setError(
        /permission|insufficient/i.test(message)
          ? (language === "sw"
            ? "Ruhusa haitoshi. Jaribu tena baada ya kuingia upya."
            : "Missing permissions. Sign in again and retry.")
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (intake: Intake) => {
    if (!window.confirm(language === "sw" ? "Futa ombi hili?" : "Delete this submission?")) return;
    try {
      await deleteIntake(intake.id);
      setMine((current) => current.filter((item) => item.id !== intake.id));
      if (expandedId === intake.id) setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  };

  const menu = (
    <div className="profile-header-menu help-header-menu" ref={menuRef}>
      <button
        type="button"
        className="icon-button profile-menu-spin"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
      {menuOpen && (
        <div className="profile-menu-panel" role="menu">
          <Link href="/" className="profile-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
            <Store size={18} /><span>{language === "sw" ? "Duka" : "Store"}</span>
          </Link>
          <Link href="/profile" className="profile-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
            <UserRound size={18} /><span>{language === "sw" ? "Wasifu" : "My profile"}</span>
          </Link>
          <Link href="/results" className="profile-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
            <ClipboardList size={18} /><span>{language === "sw" ? "Matokeo" : "My results"}</span>
          </Link>
          {user && (
            <button
              type="button"
              className="profile-menu-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void signOut();
              }}
            >
              <LogOut size={18} /><span>{language === "sw" ? "Toka" : "Sign out"}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (loading) {
    return <div className="admin-shell"><main className="container admin-main"><p className="muted">Loading…</p></main></div>;
  }

  if (!user) {
    return (
      <div className="admin-shell">
        <header className="admin-header profile-header">
          <div>
            <Link href="/" className="brand"><BrandMark /><span>GreenHealth<em>Products</em></span></Link>
            <p className="admin-kicker">Get help</p>
          </div>
          {menu}
        </header>
        <main className="container admin-main">
          <section className="auth-panel help-gate">
            <p className="eyebrow">{language === "sw" ? "Tuambie" : "Tell us"}</p>
            <h1>{language === "sw" ? "Unapitia nini?" : "What are you going through?"}</h1>
            <p>{language === "sw" ? "Ingia ili tuweke maelezo yako na akaunti yako." : "Sign in so we can keep your note with your account."}</p>
            <Link href="/profile" className="button button-primary">
              {language === "sw" ? "Ingia / fungua akaunti" : "Sign in / create account"}
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header profile-header">
        <div>
          <Link href="/" className="brand"><BrandMark /><span>GreenHealth<em>Products</em></span></Link>
          <p className="admin-kicker">Get help</p>
        </div>
        {menu}
      </header>

      <main className="container admin-main help-main">
        <section className="help-intake">
          <div className="help-intro">
            <p className="eyebrow">{language === "sw" ? "Tuambie" : "Tell us"}</p>
            <h1>{language === "sw" ? "Unapitia nini?" : "What are you going through?"}</h1>
            <p>
              {language === "sw"
                ? "Andika maelezo yako, au fungua kategoria na chagua unachohisi — kila sehemu ina kitufe chake cha kutuma."
                : "Write your note, or open categories and tick what you feel — each section has its own send button."}
            </p>
            <div className="auth-tabs">
              <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button>
              <button type="button" className={language === "sw" ? "active" : ""} onClick={() => setLanguage("sw")}>Kiswahili</button>
            </div>
          </div>

          <div className="help-form">
            <label className="help-context-box">
              <span>{language === "sw" ? "Andika unachopitia" : "Describe what you are going through"}</span>
              <textarea
                ref={textareaRef}
                rows={3}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder={
                  language === "sw"
                    ? "Eleza hisia, muda, na chochote muhimu…"
                    : "Describe feelings, how long, and anything that matters…"
                }
              />
              <button
                type="button"
                className="button button-primary help-submit"
                disabled={busy}
                onClick={() => void submit("note")}
              >
                {busy ? (language === "sw" ? "Inatuma…" : "Sending…") : (language === "sw" ? "Tuma maelezo" : "Send note")}
              </button>
            </label>

            <div className="help-categories-panel">
              <button
                type="button"
                className="help-categories-toggle"
                aria-expanded={categoriesOpen}
                onClick={() => setCategoriesOpen((open) => !open)}
              >
                <span>
                  <b>{language === "sw" ? "Chagua kategoria" : "Choose a category"}</b>
                  <small>
                    {concerns.length
                      ? (language === "sw" ? `${concerns.length} yamechaguliwa` : `${concerns.length} selected`)
                      : (language === "sw" ? "Fungua kuona orodha" : "Tap to open options")}
                  </small>
                </span>
                {categoriesOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>

              {categoriesOpen && (
                <div className="help-categories-body">
                  <div className="help-category-grid" role="list">
                    {HELP_CATEGORIES.map((category) => {
                      const Icon = ICON_MAP[category.icon];
                      const count = selectedCountFor(category);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          className={`help-category-card ${count ? "has-picks" : ""}`}
                          onClick={() => setActiveCategoryId(category.id)}
                        >
                          <span className="help-category-icon"><Icon size={20} /></span>
                          <span className="help-category-copy">
                            <b>{language === "sw" ? category.labelSw : category.labelEn}</b>
                            <small>
                              {count
                                ? (language === "sw" ? `${count} yamechaguliwa` : `${count} selected`)
                                : (language === "sw" ? "Fungua chaguo" : "Open options")}
                            </small>
                          </span>
                          {count > 0 && <span className="help-category-count">{count}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {concerns.length > 0 && (
                    <div className="help-selected">
                      <div className="help-selected-head">
                        <b>{language === "sw" ? "Ulichochagua" : "Selected"}</b>
                        <button type="button" className="text-link" onClick={() => setConcerns([])}>
                          {language === "sw" ? "Futa" : "Clear"}
                        </button>
                      </div>
                      <div className="help-chip-row">
                        {concerns.map((item) => (
                          <button key={item} type="button" className="help-chip" onClick={() => toggleConcern(item)}>
                            <span>{item}</span>
                            <X size={14} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="button button-primary help-submit"
                    disabled={busy}
                    onClick={() => void submit("categories")}
                  >
                    {busy
                      ? (language === "sw" ? "Inatuma…" : "Sending…")
                      : (language === "sw" ? "Tuma masuala yaliyochaguliwa" : "Send selected issues")}
                  </button>
                </div>
              )}
            </div>

            {error && <p className="auth-error">{error}</p>}
            {note && <p className="sync-note">{note}</p>}
          </div>

          <div className="notice help-disclaimer">
            <ShieldCheck size={17} />
            <span>{WELLNESS_DISCLAIMER}</span>
          </div>
        </section>

        <section className="help-history">
          <p className="eyebrow">{language === "sw" ? "Uliotuma" : "Your submissions"}</p>
          <div className="help-history-search">
            <Search size={16} />
            <input
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              placeholder={language === "sw" ? "Tafuta ulichotuma…" : "Search what you sent…"}
            />
          </div>
          {filteredMine.map((item) => {
            const open = expandedId === item.id;
            return (
              <article key={item.id} className={`help-history-card ${open ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="help-history-summary"
                  onClick={() => setExpandedId(open ? null : item.id)}
                >
                  <div>
                    <small>{formatIntakeDate(item.createdAt, language)}</small>
                    <b>{item.title || (language === "sw" ? "Maelezo" : "Help note")}</b>
                    <p>{item.summary || item.freeText || (item.concerns || []).join(" · ") || "—"}</p>
                  </div>
                  <span className={`status ${item.status === "answered" ? "status-good" : ""}`}>
                    {item.status === "pending"
                      ? (language === "sw" ? "Inasubiri" : "Pending")
                      : item.status === "in_review"
                        ? (language === "sw" ? "Inakaguliwa" : "In review")
                        : item.status === "answered"
                          ? (language === "sw" ? "Imejibiwa" : "Answered")
                          : item.status}
                  </span>
                </button>
                {open && (
                  <div className="help-history-detail">
                    {(item.concerns || []).length > 0 && (
                      <p><b>{language === "sw" ? "Masuala" : "Issues"}:</b> {(item.concerns || []).join(" · ")}</p>
                    )}
                    {item.freeText && <p className="help-body">{item.freeText}</p>}
                    <div className="help-history-actions">
                      <button type="button" className="button button-secondary" onClick={() => downloadIntakeText(item)}>
                        <Download size={16} /> {language === "sw" ? "Pakua" : "Download"}
                      </button>
                      <button type="button" className="button button-secondary" onClick={() => void onDelete(item)}>
                        <Trash2 size={16} /> {language === "sw" ? "Futa" : "Delete"}
                      </button>
                      {item.screeningId && item.status === "answered" && (
                        <Link href={`/results/${item.screeningId}`} className="button button-secondary">
                          {language === "sw" ? "Fungua ripoti" : "Open report"}
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {!filteredMine.length && (
            <p className="muted">
              {historyQuery
                ? (language === "sw" ? "Hakuna matokeo." : "No matching submissions.")
                : (language === "sw" ? "Bado hakuna maombi." : "No submissions yet.")}
            </p>
          )}
        </section>
      </main>

      {activeCategory && (
        <div className="help-sheet-backdrop" onClick={() => setActiveCategoryId(null)}>
          <div
            className="help-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="help-sheet-bar">
              <div>
                <p className="eyebrow">{language === "sw" ? "Kategoria" : "Category"}</p>
                <h2 id="help-sheet-title">
                  {language === "sw" ? activeCategory.labelSw : activeCategory.labelEn}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button help-sheet-close"
                aria-label="Close"
                onClick={() => setActiveCategoryId(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="help-sheet-prompt">
              {language === "sw" ? activeCategory.promptSw : activeCategory.promptEn}
            </p>
            <div className="help-sheet-list" role="group">
              {activeCategory.symptoms.map((symptom) => {
                const checked = isSymptomSelected(activeCategory, symptom);
                return (
                  <label key={symptom.id} className={`help-issue-row ${checked ? "is-checked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSymptom(activeCategory, symptom)}
                    />
                    <span>{language === "sw" ? symptom.sw : symptom.en}</span>
                  </label>
                );
              })}
            </div>
            <div className="help-sheet-actions">
              <button type="button" className="button button-primary" onClick={() => setActiveCategoryId(null)}>
                {language === "sw" ? "Imekamilika" : "Done"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
