import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import ButtonBusyMark from "@/components/ButtonBusyMark";
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
  PersonStanding,
  Ribbon,
  Search,
  Shield,
  Trash2,
  UserRound,
  Utensils,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import BrandMark from "@/components/BrandMark";
import ListPager from "@/components/ListPager";
import SiteNavActions from "@/components/SiteNavActions";
import { PAGE_SIZE_DEFAULT, pageCount, slicePage } from "@/lib/listPaging";
import { findPatientByAuthUid } from "@/lib/patients";
import { deleteIntake, listIntakesForUser, newIntakeId, saveIntake } from "@/lib/intakes";
import { processHelpInquiry } from "@/lib/processHelpInquiry";
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
import { readHelpPrefill } from "@/lib/assistStoreSearchClient";
import { patientFacingReportTitle, pulseDevice } from "@/lib/patientReportTitle";
import { subscribeSharedScreeningsForPatient } from "@/lib/screenings";
import type { Intake } from "@/lib/screeningTypes";

type ReportWaitState = {
  intakeId: string;
  screeningId?: string;
  status: "waiting" | "ready";
  title: string;
};

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
  const { user, profile, loading } = useAuthContext();
  const [, setLocation] = useLocation();
  const [language, setLanguage] = useState<"en" | "sw">("en");
  const [concerns, setConcerns] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [mine, setMine] = useState<Intake[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryVisibleCount, setCategoryVisibleCount] = useState(5);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reportWait, setReportWait] = useState<ReportWaitState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLElement | null>(null);

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

  const historyTotalPages = pageCount(filteredMine.length, PAGE_SIZE_DEFAULT);
  const pagedMine = useMemo(
    () => slicePage(filteredMine, historyPage, PAGE_SIZE_DEFAULT),
    [filteredMine, historyPage],
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [historyQuery]);

  useEffect(() => {
    if (!user) return;
    void listIntakesForUser(user.uid).then(setMine);
  }, [user]);

  useEffect(() => {
    const prefill = readHelpPrefill();
    if (!prefill) return;
    setFreeText(prefill);
    const t = window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!reportWait || reportWait.status !== "waiting" || !user) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      const patient = await findPatientByAuthUid(user.uid);
      if (!patient || cancelled) return;
      unsub = subscribeSharedScreeningsForPatient(patient.id, (list) => {
        const hit = list.find((item) =>
          (reportWait.screeningId && item.id === reportWait.screeningId)
          || item.sourceIntakeId === reportWait.intakeId
        );
        if (!hit || hit.status !== "shared") return;
        pulseDevice([40, 70, 40, 70, 80]);
        setReportWait({
          intakeId: reportWait.intakeId,
          screeningId: hit.id,
          status: "ready",
          title: patientFacingReportTitle(hit),
        });
        void listIntakesForUser(user.uid).then(setMine);
      });
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [reportWait, user]);

  useEffect(() => {
    if (reportWait?.status !== "ready") return;
    const t = window.setTimeout(() => {
      historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [reportWait?.status]);

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

  const sortedCategories = useMemo(() => {
    const order = new Map(HELP_CATEGORIES.map((cat, index) => [cat.id, index]));
    return [...HELP_CATEGORIES].sort((a, b) => {
      const countA = selectedCountFor(a);
      const countB = selectedCountFor(b);
      const picksA = countA > 0 ? 1 : 0;
      const picksB = countB > 0 ? 1 : 0;
      if (picksB !== picksA) return picksB - picksA;
      if (countB !== countA) return countB - countA;
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
  }, [concerns, language]);

  /** Same grid layout: start at 5, Show more adds the next 5 in place (page scrolls — no inner box). */
  const visibleCategories = sortedCategories.slice(0, categoryVisibleCount);
  const canShowMoreCategories = categoryVisibleCount < sortedCategories.length;
  const canShowLessCategories = categoryVisibleCount > 5;
  const showCategoryGridToggle = canShowMoreCategories || canShowLessCategories;

  const submit = async (mode: SubmitMode) => {
    if (!user) return;
    if (!String(profile?.age || "").trim() || !String(profile?.sex || "").trim()) {
      setError(language === "sw"
        ? "Kamilisha umri na jinsia kwenye Wasifu yako kwanza."
        : "Add your age and sex in Profile first so we can prepare your guidance.");
      return;
    }
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
      let autoShared = false;
      let wait: ReportWaitState = {
        intakeId: intake.id,
        status: "waiting",
        title: title || summary || (language === "sw" ? "Ripoti yako" : "Your report"),
      };
      try {
        const processed = await processHelpInquiry({
          intake,
          authUid: user.uid,
        });
        autoShared = processed.diamondShared;
        wait = {
          intakeId: intake.id,
          screeningId: processed.screening.id,
          status: autoShared ? "ready" : "waiting",
          title: patientFacingReportTitle(processed.screening) || wait.title,
        };
        if (autoShared) pulseDevice([40, 70, 40, 70, 80]);
      } catch (processErr) {
        console.warn("Help intake saved, but auto-match failed:", processErr);
      }
      setReportWait(wait);
      setMine(await listIntakesForUser(user.uid));
      if (mode === "note") setFreeText("");
      if (mode === "categories") {
        setConcerns([]);
        setCategoriesOpen(false);
      }
      setNote(
        autoShared
          ? (language === "sw"
            ? "Imetumwa. Mwongozo uko tayari — angalia ripoti yako."
            : "Sent. Guidance is ready — open your report.")
          : (language === "sw"
            ? "Imetumwa. Tunatayarisha ripoti yako…"
            : "Sent. Preparing your report…"),
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

  const patientNav = (
    <SiteNavActions
      variant="patient"
      menuItems={[
        { href: "/", label: language === "sw" ? "Duka" : "Store", icon: "store" },
        { href: "/profile", label: language === "sw" ? "Wasifu" : "My profile", icon: "profile" },
        { href: "/results", label: language === "sw" ? "Matokeo" : "My results", icon: "results" },
      ]}
    />
  );

  if (loading) {
    return <div className="admin-shell"><main className="container admin-main"><p className="muted">Loading…</p></main></div>;
  }

  if (!user) {
    return (
      <div className="admin-shell">
        <header className="admin-header profile-header">
          <div className="admin-header-bar">
            <div>
              <Link href="/" className="brand"><BrandMark /><span>GreenHealth<em>Products</em></span></Link>
              <p className="admin-kicker">Get help</p>
            </div>
            {patientNav}
          </div>
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
        <div className="admin-header-bar">
          <div>
            <Link href="/" className="brand"><BrandMark /><span>GreenHealth<em>Products</em></span></Link>
            <p className="admin-kicker">Get help</p>
          </div>
          {patientNav}
        </div>
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
                  <div className={`help-category-grid-wrap ${canShowMoreCategories ? "has-fade" : ""}`}>
                    <div className="help-category-grid" role="list">
                      {visibleCategories.map((category) => {
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
                    {canShowMoreCategories && <div className="help-category-grid-fade" aria-hidden />}
                  </div>

                  {showCategoryGridToggle && (
                    <div className="help-categories-show-more-row">
                      {canShowMoreCategories && (
                        <button
                          type="button"
                          className="help-categories-show-more text-link"
                          onClick={() => setCategoryVisibleCount((n) => Math.min(n + 5, sortedCategories.length))}
                        >
                          {language === "sw" ? "Onyesha zaidi" : "Show more"}
                        </button>
                      )}
                      {canShowLessCategories && (
                        <button
                          type="button"
                          className="help-categories-show-more text-link"
                          onClick={() => setCategoryVisibleCount(5)}
                        >
                          {language === "sw" ? "Onyesha kidogo" : "Show less"}
                        </button>
                      )}
                    </div>
                  )}

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

        </section>

        <section className="help-history" ref={historyRef}>
          <p className="eyebrow">{language === "sw" ? "Uliotuma" : "Your submissions"}</p>
          <div className="help-history-search">
            <Search size={16} />
            <input
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              placeholder={language === "sw" ? "Tafuta ulichotuma…" : "Search what you sent…"}
            />
          </div>
          {pagedMine.map((item) => {
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
          {filteredMine.length > 0 && (
            <ListPager
              page={historyPage}
              totalPages={historyTotalPages}
              onPageChange={setHistoryPage}
              prevLabel={language === "sw" ? "Iliyotangulia" : "Previous"}
              nextLabel={language === "sw" ? "Ifuatayo" : "Next"}
            />
          )}
        </section>
      </main>

      {reportWait && (
        <div className="modal-backdrop help-report-wait" role="dialog" aria-modal="true" aria-live="polite">
          <div className="help-report-wait-card" onClick={(e) => e.stopPropagation()}>
            {reportWait.status === "waiting" ? (
              <>
                <ButtonBusyMark size={28} />
                <div>
                  <h3>{language === "sw" ? "Inasubiri ripoti…" : "Waiting for your report…"}</h3>
                  <p>
                    {language === "sw"
                      ? "Tumepokea maelezo yako. Tutakushirikisha ripoti hapa na kwenye Matokeo yangu iko tayari."
                      : "We’ve received your note. Your report will appear here and under My results when it’s ready."}
                  </p>
                  <p className="muted" style={{ marginTop: 8 }}>{reportWait.title}</p>
                </div>
              </>
            ) : (
              <>
                <ClipboardList size={28} />
                <div>
                  <h3>{language === "sw" ? "Ripoti iko tayari" : "Your report is ready"}</h3>
                  <p>{reportWait.title}</p>
                  <div className="nav-search-confirm-actions" style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => {
                        const href = reportWait.screeningId
                          ? `/results/${reportWait.screeningId}`
                          : "/results";
                        setReportWait(null);
                        setLocation(href);
                      }}
                    >
                      {language === "sw" ? "Fungua ripoti" : "Open report"}
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => setReportWait(null)}>
                      {language === "sw" ? "Funga" : "Close"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
