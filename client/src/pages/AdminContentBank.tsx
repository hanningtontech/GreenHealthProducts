import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CloudUpload, Download, FlaskConical, List, Loader2, Plus, RefreshCw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatBankProductOptionLine, resolveBankProducts } from "@/lib/bankProducts";
import {
  approveBankCase,
  BankApprovalSelectionError,
  buildBankHygieneReport,
  flushKnowledgeBankToFirestore,
  getKnowledgeBankPendingCount,
  listKnowledgeCases,
  migrateBankPrivacyFlags,
  saveBankCorrection,
  saveKnowledgeCase,
  saveKnowledgeCases,
} from "@/lib/knowledgeBank";
import { resolveIntakeTestWithGeminiFallback } from "@/lib/geminiBankFallback";
import { draftIntakeFromContentBank } from "@/lib/replyFromBank";
import { ensureSeedKnowledgeBank } from "@/lib/seedKnowledge";
import { translateEnglishToSwahili } from "@/lib/translateToSw";
import { loadAdminBankUi, saveAdminBankUi } from "@/lib/adminUiState";
import type { KnowledgeCase, ScreeningRecommendation } from "@/lib/screeningTypes";

function productOptionLabels(recs: ScreeningRecommendation[]): string[] {
  const { display, unresolved } = resolveBankProducts(recs);
  return [
    ...display.map(formatBankProductOptionLine),
    ...unresolved.map((row) => `${row.displayLabel} — needs admin review`),
  ];
}

type QualityFlag = "green" | "yellow" | "red";

const emptyBankCase = (): KnowledgeCase => ({
  id: `bank-${Date.now()}`,
  title: "",
  conditionTitle: "",
  triggersEn: [],
  triggersSw: [],
  keywords: [],
  diseases: [],
  summary: "",
  summarySw: "",
  replyOpening: "",
  replyConcerns: "",
  replyRecommendationsIntro: "",
  replyClosing: "",
  recommendations: [],
  reviewStatus: "needs_review",
  active: false,
  qualityFlag: "yellow",
});

const SAMPLE_QUESTIONS = [
  "I get migraine-like headaches with light sensitivity and sometimes feel dizzy.",
  "I have a bad stomach, and diarrhea",
  "Low mood for more than two weeks, poor sleep, and hard to focus.",
  "Ninaumwa tumbo na kuhara.",
  "Nina kichwa kinaniuma na mwanga unanisumbua.",
  "Low energy and I barely eat enough protein.",
];

type Panel = "entries" | "test";

export default function AdminContentBank() {
  const savedUi = useMemo(() => loadAdminBankUi(), []);
  const [bank, setBank] = useState<KnowledgeCase[]>([]);
  const [bankEdit, setBankEdit] = useState<KnowledgeCase | null>(null);
  const [browseOpen, setBrowseOpen] = useState(() => Boolean(savedUi.browseOpen));
  const [panel, setPanel] = useState<Panel>(() => savedUi.panel || "entries");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState(() => savedUi.query || "");
  const [testQuestion, setTestQuestion] = useState(SAMPLE_QUESTIONS[0]);
  const [testReply, setTestReply] = useState("");
  const [testReplySw, setTestReplySw] = useState("");
  const [testMatched, setTestMatched] = useState<string[]>([]);
  const [testProducts, setTestProducts] = useState<string[]>([]);
  const [testRecs, setTestRecs] = useState<ScreeningRecommendation[]>([]);
  const [testFlag, setTestFlag] = useState<QualityFlag | null>(null);
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [editOpening, setEditOpening] = useState("");
  const [editConcerns, setEditConcerns] = useState("");
  const [editProductIntro, setEditProductIntro] = useState("");
  const [editClosing, setEditClosing] = useState("");
  const [editReplySw, setEditReplySw] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(() => getKnowledgeBankPendingCount());
  const [shareDialog, setShareDialog] = useState<{ title: string; detail: string } | null>(null);
  const [hygieneCount, setHygieneCount] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  const flashBankError = (message: string) => {
    setNote(message);
    toast.error(message);
  };

  const refreshPending = () => setPendingSync(getKnowledgeBankPendingCount());

  const reload = async () => {
    try {
      const cases = await listKnowledgeCases();
      setBank(cases);
      setHygieneCount(buildBankHygieneReport(cases).length);
      refreshPending();
    } catch (err) {
      flashBankError(err instanceof Error ? err.message : "Could not load content bank");
    }
  };

  const downloadHygieneReport = () => {
    const findings = buildBankHygieneReport(bank);
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `greenhealth-bank-hygiene-review-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNote(`Hygiene review exported · ${findings.length} finding(s). Curated edits were not auto-cleaned.`);
  };

  const runPrivacyMigration = async () => {
    setBusy("Quarantining suspect bank entries…");
    try {
      const result = await migrateBankPrivacyFlags(bank);
      await reload();
      const msg = `Privacy migration · updated ${result.updated}, quarantined ${result.quarantined}, needs review ${result.needsReview}. Patient intakes/screenings were not deleted.`;
      setNote(msg);
      toast.success(msg);
    } catch (err) {
      flashBankError(err instanceof Error ? err.message : "Privacy migration failed");
    } finally {
      setBusy("");
    }
  };

  const syncBankNow = async () => {
    setBusy("Syncing bank to Firestore…");
    try {
      const result = await flushKnowledgeBankToFirestore();
      refreshPending();
      if (result.failed) {
        flashBankError(`Synced ${result.synced}, failed ${result.failed}. Will retry automatically.`);
      } else if (result.synced) {
        const msg = `Synced ${result.synced} bank entr${result.synced === 1 ? "y" : "ies"} to Firestore.`;
        setNote(msg);
        toast.success(msg);
      } else {
        setNote("Bank already synced — nothing pending.");
      }
      await reload();
    } catch (err) {
      flashBankError(err instanceof Error ? err.message : "Bank sync failed");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    void reload();
    const tick = window.setInterval(() => refreshPending(), 4_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    saveAdminBankUi({ panel, query, browseOpen });
  }, [panel, query, browseOpen]);

  const seedBank = async () => {
    setBusy("Seeding…");
    try {
      const result = await ensureSeedKnowledgeBank();
      setNote(
        `Knowledge bank seed complete. Added ${result.added}, updated ${result.updated} trained cases. Syncing to Firestore shortly.`,
      );
      await reload();
      refreshPending();
    } catch (err) {
      flashBankError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setBusy("");
    }
  };

  const downloadBank = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      count: bank.length,
      cases: bank,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `greenhealth-content-bank-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNote(`Downloaded ${bank.length} bank entries.`);
  };

  const importBankFile = async (file?: File | null) => {
    if (!file) return;
    setBusy("Importing bank…");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { cases?: KnowledgeCase[] } | KnowledgeCase[];
      const cases = Array.isArray(parsed) ? parsed : (parsed.cases || []);
      if (!cases.length) throw new Error("No cases found in that JSON file.");
      const normalized = cases.map((item, index) => ({
        ...emptyBankCase(),
        ...item,
        id: item.id || `imported-${Date.now()}-${index}`,
        title: item.title || `Imported case ${index + 1}`,
        triggersEn: item.triggersEn || [],
        triggersSw: item.triggersSw || [],
        keywords: item.keywords || [],
        diseases: item.diseases || [],
        recommendations: item.recommendations || [],
      }));
      const saved = await saveKnowledgeCases(normalized);
      setNote(`Imported / updated ${saved} bank entries locally — Firestore sync queued.`);
      await reload();
      refreshPending();
    } catch (err) {
      flashBankError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy("");
      if (importRef.current) importRef.current.value = "";
    }
  };

  const applyTestResult = async (
    result: Awaited<ReturnType<typeof resolveIntakeTestWithGeminiFallback>>,
    language: "en" | "sw",
  ) => {
    setTestReply(result.replyText);
    setTestReplySw(result.replySw);
    setTestMatched(result.matchedCaseIds);
    setSelectedCaseId(result.matchedCaseIds.length === 1 ? result.matchedCaseIds[0] : null);
    setTestRecs(result.recommendations);
    setTestProducts(result.productLines?.length ? result.productLines : productOptionLabels(result.recommendations));
    const primary = result.taughtCase
      || bank.find((c) => c.id === result.matchedCaseIds[0]);
    setEditOpening(primary?.replyOpening || "");
    setEditConcerns(primary?.replyConcerns || result.replyText);
    setEditProductIntro(primary?.replyRecommendationsIntro || "");
    setEditClosing(primary?.replyClosing || "");
    setEditReplySw(result.replySw);
    setNote(
      `${result.message}${language === "sw" && result.source === "bank" ? " · Swahili question" : ""}`,
    );
    if (result.taughtCase) {
      await reload();
      toast.success(`Gemini taught “${result.taughtCase.title}” (needs review).`);
    }
  };

  const runBankTest = async (question = testQuestion) => {
    const q = question.trim();
    if (!q) {
      flashBankError("Enter a test question first.");
      return;
    }
    setBusy("Testing bank…");
    setTestQuestion(q);
    setTestFlag(null);
    setEditingAnswer(false);
    setSelectedCaseId(null);
    try {
      const language = /[à-ÿ]|nina|tumbo|kichwa|kuhara|shinikizo|sukari/i.test(q) ? "sw" : "en";
      const result = await draftIntakeFromContentBank({
        id: `test-${Date.now()}`,
        authUid: "admin-bank-test",
        language,
        concerns: [q],
        freeText: q,
        status: "pending",
      });
      setTestReply(result.reply);
      setTestReplySw(result.replySw);
      setTestMatched(result.matchedCaseIds);
      setSelectedCaseId(result.matchedCaseIds.length === 1 ? result.matchedCaseIds[0] : null);
      setTestRecs(result.recommendations);
      setTestProducts(result.productLines?.length ? result.productLines : productOptionLabels(result.recommendations));
      const primary = bank.find((c) => c.id === result.matchedCaseIds[0]);
      setEditOpening(primary?.replyOpening || "");
      setEditConcerns(primary?.replyConcerns || "");
      setEditProductIntro(primary?.replyRecommendationsIntro || "");
      setEditClosing(primary?.replyClosing || "");
      setEditReplySw(result.replySw);
      setNote(
        result.urgent
          ? "Urgent combination matched — immediate action shown; product cards suppressed."
          : result.matchedCaseIds.length
            ? `Matched ${result.matchedCaseIds.length} bank case(s)${language === "sw" ? " · Swahili question" : ""}${result.matchedCaseIds.length > 1 ? " — select an entry before Green approve." : ""}.`
            : `No bank match yet for that question${language === "sw" ? " (Swahili)" : ""}. Use Ask Gemini + teach if you want a fallback draft.`,
      );
      setPanel("test");
    } catch (err) {
      flashBankError(err instanceof Error ? err.message : "Bank test failed");
    } finally {
      setBusy("");
    }
  };

  const runGeminiTeach = async () => {
    const q = testQuestion.trim();
    if (!q) {
      flashBankError("Enter a test question first.");
      return;
    }
    setBusy("Asking Gemini + teaching bank…");
    setTestFlag(null);
    setEditingAnswer(false);
    try {
      const language = /[à-ÿ]|nina|tumbo|kichwa|kuhara|shinikizo|sukari/i.test(q) ? "sw" : "en";
      const result = await resolveIntakeTestWithGeminiFallback(
        {
          id: `test-${Date.now()}`,
          authUid: "admin-bank-test",
          language,
          concerns: [q],
          freeText: q,
          status: "pending",
        },
        { forceGemini: !testMatched.length },
      );
      if (result.source === "bank" && result.matchedCaseIds.length) {
        setNote("Bank already has a match — Gemini was not called. Green-approve or edit that entry instead.");
        await applyTestResult(result, language);
      } else {
        await applyTestResult(result, language);
      }
      setPanel("test");
    } catch (err) {
      flashBankError(err instanceof Error ? err.message : "Gemini teach failed");
    } finally {
      setBusy("");
    }
  };

  const runApprove = async () => {
    if (testMatched.length > 1 && !selectedCaseId) {
      flashBankError("Select which matched bank entry to approve before clicking Green.");
      return;
    }
    setShareDialog({
      title: "Approving bank entry…",
      detail: "Updating approval status only — keywords, reply fields, and products stay unchanged.",
    });
    setBusy("Approving bank entry…");
    try {
      const learned = await approveBankCase({
        matchedCaseIds: testMatched,
        existingCases: bank,
        selectedCaseId,
        reviewNote: "Approved in bank testing (metadata only).",
      });
      setShareDialog({
        title: "Syncing approval to Firestore…",
        detail: `Saving approval for “${learned.title}”.`,
      });
      const sync = await flushKnowledgeBankToFirestore();
      setTestFlag("green");
      setEditingAnswer(false);
      await reload();
      const ok = `Approved “${learned.title}” (status only). Keywords and reply fields preserved.`;
      setNote(`${ok}${sync.synced ? ` Synced ${sync.synced}.` : ""}`);
      toast.success(ok);
    } catch (err) {
      if (err instanceof BankApprovalSelectionError) {
        flashBankError(err.message);
      } else {
        flashBankError(err instanceof Error ? err.message : "Could not approve bank entry");
      }
    } finally {
      setBusy("");
      setShareDialog(null);
    }
  };

  const runSaveCorrection = async () => {
    if (testMatched.length > 1 && !selectedCaseId) {
      flashBankError("Select which matched bank entry to correct before saving.");
      return;
    }
    if (!editOpening.trim() && !editConcerns.trim()) {
      flashBankError("Edit at least the opening or concerns before saving a correction.");
      return;
    }
    setShareDialog({
      title: "Saving correction to bank…",
      detail: "Saving only the structured fields you changed. Entry stays ready for Green approval.",
    });
    setBusy("Saving correction to bank…");
    try {
      let sw = editReplySw.trim();
      if (!sw && editConcerns.trim()) {
        setShareDialog({
          title: "Translating correction…",
          detail: "Creating Kiswahili summary for the corrected concerns.",
        });
        sw = await translateEnglishToSwahili([editOpening, editConcerns, editClosing].filter(Boolean).join("\n\n"));
      }
      const learned = await saveBankCorrection({
        matchedCaseIds: testMatched,
        existingCases: bank,
        selectedCaseId,
        fields: {
          replyOpening: editOpening,
          replyConcerns: editConcerns,
          replyRecommendationsIntro: editProductIntro,
          replyClosing: editClosing,
          summarySw: sw,
          recommendations: testRecs,
        },
        reviewNote: "Correction saved — ready for Green approval.",
      });
      setShareDialog({
        title: "Syncing correction…",
        detail: `Saving “${learned.title}” for review.`,
      });
      await flushKnowledgeBankToFirestore();
      setTestFlag("yellow");
      setEditingAnswer(false);
      setTestMatched([learned.id, ...testMatched.filter((id) => id !== learned.id)]);
      setSelectedCaseId(learned.id);
      setTestReply([editOpening, editConcerns, editProductIntro, editClosing].filter(Boolean).join("\n\n"));
      setTestReplySw(sw);
      setTestProducts(productOptionLabels(testRecs));
      await reload();
      const ok = `Correction saved for “${learned.title}” — ready for Green approval. Keywords unchanged.`;
      setNote(ok);
      toast.success(ok);
    } catch (err) {
      if (err instanceof BankApprovalSelectionError) {
        flashBankError(err.message);
      } else {
        flashBankError(err instanceof Error ? err.message : "Could not save correction");
      }
    } finally {
      setBusy("");
      setShareDialog(null);
    }
  };

  const onQualityClick = (flag: QualityFlag) => {
    if (flag === "red") {
      setTestFlag("red");
      setEditingAnswer(true);
      const primary = bank.find((c) => c.id === (selectedCaseId || testMatched[0]));
      setEditOpening(primary?.replyOpening || "");
      setEditConcerns(primary?.replyConcerns || "");
      setEditProductIntro(primary?.replyRecommendationsIntro || "");
      setEditClosing(primary?.replyClosing || "");
      setEditReplySw(primary?.summarySw || testReplySw);
      setNote("Red · edit structured fields, then save. Green later approves without rewriting keywords.");
      return;
    }
    if (flag === "green") {
      void runApprove();
      return;
    }
    // Yellow · unconfirmed — metadata only (same as approve, yellow flag).
    void (async () => {
      if (testMatched.length > 1 && !selectedCaseId) {
        flashBankError("Select which matched bank entry to mark yellow.");
        return;
      }
      setShareDialog({
        title: "Marking yellow…",
        detail: "Updating review status only — content fields stay as curated.",
      });
      try {
        const learned = await approveBankCase({
          matchedCaseIds: testMatched,
          existingCases: bank,
          selectedCaseId,
          qualityFlag: "yellow",
        });
        await flushKnowledgeBankToFirestore();
        setTestFlag("yellow");
        await reload();
        toast.success(`Marked “${learned.title}” yellow (unconfirmed).`);
      } catch (err) {
        flashBankError(err instanceof Error ? err.message : "Could not mark yellow");
      } finally {
        setShareDialog(null);
      }
    })();
  };

  const filtered = useMemo(() => bank.filter((item) => {
    if (!query.trim()) return true;
    const hay = `${item.title} ${(item.diseases || []).join(" ")} ${(item.keywords || []).join(" ")} ${(item.triggersEn || []).join(" ")}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  }), [bank, query]);

  const matchedTitles = testMatched
    .map((id) => bank.find((item) => item.id === id)?.title || id)
    .filter(Boolean);

  return (
    <div className="admin-section">
      {shareDialog && (
        <div className="modal-backdrop bank-share-backdrop" role="alertdialog" aria-live="assertive" aria-busy="true">
          <div className="bank-share-dialog">
            <Loader2 size={28} className="spin" aria-hidden />
            <div>
              <p className="eyebrow">Content bank</p>
              <h3>{shareDialog.title}</h3>
              <p>{shareDialog.detail}</p>
            </div>
          </div>
        </div>
      )}
      <div className="admin-intro">
        <div>
          <p className="eyebrow">Library</p>
          <h1>Content bank</h1>
          <p>
            Train answers for screenings and help notes. Edits save locally first, then sync to Firestore
            after a short quiet period (or use Sync now). Routes are served from Firebase Hosting.
          </p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="button button-secondary" onClick={() => void seedBank()}>
            <BookOpen size={16} /> Seed bank
          </button>
          <button type="button" className="button button-secondary" onClick={() => setBrowseOpen(true)}>
            <List size={16} /> Browse all
          </button>
          <button type="button" className="button button-secondary" onClick={downloadBank} disabled={!bank.length}>
            <Download size={16} /> Download bank
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={downloadHygieneReport}
            disabled={!bank.length}
            title="Review suspected approval-added keywords and duplicated reply text before cleaning"
          >
            <Download size={16} /> Hygiene review{hygieneCount ? ` (${hygieneCount})` : ""}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void runPrivacyMigration()}
            disabled={!bank.length || Boolean(busy)}
            title="Mark legacy PII / patient-titled entries as quarantined or needs_review (repeatable)"
          >
            Privacy migrate
          </button>
          <label className={`button button-secondary upload-button ${busy ? "is-disabled" : ""}`}>
            <Upload size={16} /> Import JSON
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              disabled={Boolean(busy)}
              onChange={(e) => void importBankFile(e.target.files?.[0])}
            />
          </label>
          <button type="button" className="button button-secondary" onClick={() => void reload()}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={Boolean(busy) || pendingSync <= 0}
            onClick={() => void syncBankNow()}
          >
            <CloudUpload size={16} /> Sync now{pendingSync > 0 ? ` (${pendingSync})` : ""}
          </button>
          <button type="button" className="button button-primary" onClick={() => setBankEdit(emptyBankCase())}>
            <Plus size={16} /> Add entry
          </button>
        </div>
      </div>

      {pendingSync > 0 && (
        <p className="sync-note">
          {pendingSync} bank change{pendingSync === 1 ? "" : "s"} waiting to sync to Firestore (auto in ~12s, or Sync now).
        </p>
      )}
      {note && <p className="sync-note">{note}</p>}
      {busy && <p className="muted">{busy}</p>}

      <div className="auth-tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={panel === "entries" ? "active" : ""} onClick={() => setPanel("entries")}>
          Bank entries ({bank.length})
        </button>
        <button type="button" className={panel === "test" ? "active" : ""} onClick={() => setPanel("test")}>
          Bank testing
        </button>
      </div>

      {panel === "entries" && (
        <>
          <div className="admin-toolbar">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, disease, keyword…"
              aria-label="Search content bank"
            />
            <span className="muted">{filtered.length} of {bank.length}</span>
          </div>

          <section className="admin-panel">
            <div className="admin-product-list">
              {filtered.map((item) => (
                <div key={item.id} className="admin-product-row admin-list-row-2">
                  <div className="admin-product-name">
                    <b>{item.title}</b>
                    <small>
                      {item.reviewStatus ? `${item.reviewStatus} · ` : ""}
                      {item.active === false ? "inactive · " : ""}
                      {item.qualityFlag ? `${item.qualityFlag.toUpperCase()} · ` : ""}
                      Diseases: {(item.diseases || []).join(", ") || "—"} · Keywords: {[...(item.keywords || []), ...(item.triggersEn || []), ...(item.triggersSw || [])].slice(0, 6).join(", ")}
                    </small>
                  </div>
                  <button type="button" className="button button-secondary" onClick={() => setBankEdit(item)}>Edit</button>
                </div>
              ))}
              {!filtered.length && <p className="muted">Bank empty — seed starter entries, import JSON, or add your own.</p>}
            </div>
          </section>
        </>
      )}

      {panel === "test" && (
        <section className="admin-panel bank-test-panel">
          <div className="drawer-head" style={{ marginBottom: 12 }}>
            <div>
              <p className="eyebrow">Playground</p>
              <h2>Bank testing</h2>
            </div>
            <button type="button" className="button button-secondary" onClick={() => void runBankTest()}>
              <FlaskConical size={16} /> Run test
            </button>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Ask in English or Kiswahili. Rate the answer green (approve), yellow (ok / unconfirmed), or red (edit &amp; teach the bank).
          </p>
          <div className="help-chip-row" style={{ marginBottom: 12 }}>
            {SAMPLE_QUESTIONS.map((sample) => (
              <button
                key={sample}
                type="button"
                className="help-chip"
                onClick={() => void runBankTest(sample)}
              >
                <span>{sample.slice(0, 42)}{sample.length > 42 ? "…" : ""}</span>
              </button>
            ))}
          </div>
          <label className="form-field field-wide">
            <span>Test question / context (English or Kiswahili)</span>
            <textarea
              rows={4}
              value={testQuestion}
              onChange={(e) => setTestQuestion(e.target.value)}
              placeholder="e.g. Ninaumwa tumbo… or headaches with light sensitivity…"
            />
          </label>
          <div className="editor-actions" style={{ marginTop: 10 }}>
            <button type="button" className="button button-primary" disabled={Boolean(busy)} onClick={() => void runBankTest()}>
              <FlaskConical size={16} /> See bank answer
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={Boolean(busy) || (Boolean(testReply) && testMatched.length > 0)}
              title="Only when the bank has no match — one Gemini call, then save needs_review"
              onClick={() => void runGeminiTeach()}
            >
              <Sparkles size={16} /> Ask Gemini + teach
            </button>
          </div>
          {testReply && (
            <div className="bank-test-result">
              <p className="eyebrow">Matched cases</p>
              {!testMatched.length ? (
                <p>None — use <b>Ask Gemini + teach</b> for a fallback draft, or Red · edit to write one yourself</p>
              ) : testMatched.length === 1 ? (
                <p>{matchedTitles[0]}</p>
              ) : (
                <div className="bank-test-match-pick">
                  <p className="muted">Select which entry Green approve / Red correct should change:</p>
                  {testMatched.map((id) => {
                    const title = bank.find((c) => c.id === id)?.title || id;
                    return (
                      <label key={id} className="check-row">
                        <input
                          type="radio"
                          name="bank-match-pick"
                          checked={selectedCaseId === id}
                          onChange={() => {
                            setSelectedCaseId(id);
                            const item = bank.find((c) => c.id === id);
                            if (item) {
                              setEditOpening(item.replyOpening || "");
                              setEditConcerns(item.replyConcerns || "");
                              setEditProductIntro(item.replyRecommendationsIntro || "");
                              setEditClosing(item.replyClosing || "");
                              setEditReplySw(item.summarySw || "");
                            }
                          }}
                        />
                        <span>{title}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {!editingAnswer ? (
                <>
                  <p className="eyebrow">Assembled answer</p>
                  <pre className="bank-test-pre">{testReply}</pre>
                  {testReplySw && (
                    <>
                      <p className="eyebrow">Kiswahili summary</p>
                      <pre className="bank-test-pre">{testReplySw}</pre>
                    </>
                  )}
                </>
              ) : (
                <div className="bank-test-edit">
                  <p className="eyebrow">Correct structured fields</p>
                  <label className="form-field field-wide">
                    <span>Opening</span>
                    <textarea rows={3} value={editOpening} onChange={(e) => setEditOpening(e.target.value)} />
                  </label>
                  <label className="form-field field-wide">
                    <span>Concerns / body</span>
                    <textarea rows={5} value={editConcerns} onChange={(e) => setEditConcerns(e.target.value)} />
                  </label>
                  <label className="form-field field-wide">
                    <span>Product introduction</span>
                    <input value={editProductIntro} onChange={(e) => setEditProductIntro(e.target.value)} />
                  </label>
                  <label className="form-field field-wide">
                    <span>Closing</span>
                    <textarea rows={3} value={editClosing} onChange={(e) => setEditClosing(e.target.value)} />
                  </label>
                  <label className="form-field field-wide">
                    <span>Kiswahili summary</span>
                    <textarea rows={4} value={editReplySw} onChange={(e) => setEditReplySw(e.target.value)} />
                  </label>
                  <div className="editor-actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={Boolean(busy) || !editConcerns.trim()}
                      onClick={() => {
                        void (async () => {
                          setBusy("Translating EN → SW…");
                          try {
                            const sw = await translateEnglishToSwahili(
                              [editOpening, editConcerns, editClosing].filter(Boolean).join("\n\n"),
                            );
                            setEditReplySw(sw);
                            setNote(sw ? "Kiswahili updated from structured English fields." : "Translation returned empty — edit SW manually.");
                          } catch (err) {
                            flashBankError(err instanceof Error ? err.message : "Translate failed");
                          } finally {
                            setBusy("");
                          }
                        })();
                      }}
                    >
                      Translate EN → SW
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={Boolean(busy)}
                      onClick={() => void runSaveCorrection()}
                    >
                      Save correction (ready for review)
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={Boolean(busy)}
                      onClick={() => setEditingAnswer(false)}
                    >
                      Cancel edit
                    </button>
                  </div>
                </div>
              )}

              {testProducts.length > 0 && (
                <>
                  <p className="eyebrow">Product options</p>
                  <ul className="bank-test-products">
                    {testProducts.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </>
              )}

              <div className="bank-quality-bar">
                <p className="eyebrow">Rate this answer</p>
                <div className="bank-quality-actions">
                  <button
                    type="button"
                    className={`bank-flag-btn green ${testFlag === "green" ? "is-active" : ""}`}
                    disabled={Boolean(busy)}
                    title="Approve — system should reply like this"
                    onClick={() => onQualityClick("green")}
                  >
                    Green · approve
                  </button>
                  <button
                    type="button"
                    className={`bank-flag-btn yellow ${testFlag === "yellow" ? "is-active" : ""}`}
                    disabled={Boolean(busy)}
                    title="Usable but not confirmed"
                    onClick={() => onQualityClick("yellow")}
                  >
                    Yellow · unconfirmed
                  </button>
                  <button
                    type="button"
                    className={`bank-flag-btn red ${testFlag === "red" ? "is-active" : ""}`}
                    disabled={Boolean(busy)}
                    title="Incorrect — edit and teach the bank"
                    onClick={() => onQualityClick("red")}
                  >
                    Red · edit &amp; correct
                  </button>
                  {!editingAnswer && (
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setEditingAnswer(true);
                        setEditReplyEn(testReply);
                        setEditReplySw(testReplySw);
                      }}
                    >
                      Correct answer
                    </button>
                  )}
                </div>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Green saves and approves this reply for similar questions. Yellow keeps it usable but unconfirmed.
                  Red opens the editor — after you save, the bank learns the new answer.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {browseOpen && (
        <div className="modal-backdrop" onClick={() => setBrowseOpen(false)}>
          <section className="product-editor bank-browse-modal" style={{ width: "min(900px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="eyebrow">Full library</p>
                <h2>All bank content ({bank.length})</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setBrowseOpen(false)}>×</button>
            </div>
            <div className="bank-browse-list">
              {bank.map((item) => (
                <article key={item.id} className="bank-browse-card">
                  <b>{item.title}</b>
                  <small>ID: {item.id}</small>
                  <p><strong>Diseases:</strong> {(item.diseases || []).join(", ") || "—"}</p>
                  <p><strong>Keywords:</strong> {[...(item.triggersEn || []), ...(item.keywords || [])].join(", ") || "—"}</p>
                  <p><strong>Opening:</strong> {item.replyOpening || "—"}</p>
                  <p><strong>Concerns:</strong> {item.replyConcerns || item.summary || "—"}</p>
                  <p><strong>Closing:</strong> {item.replyClosing || "—"}</p>
                  <p><strong>Products:</strong> {productOptionLabels(item.recommendations || []).map((line) => line.split(" — ")[0].split(" · ")[0]).join("; ") || "—"}</p>
                  <button type="button" className="button button-secondary" onClick={() => { setBankEdit(item); setBrowseOpen(false); }}>
                    Edit this entry
                  </button>
                </article>
              ))}
              {!bank.length && <p className="muted">No entries yet.</p>}
            </div>
            <div className="editor-actions">
              <button type="button" className="button button-secondary" onClick={downloadBank} disabled={!bank.length}>
                <Download size={16} /> Download JSON
              </button>
              <button type="button" className="button button-primary" onClick={() => setBrowseOpen(false)}>Close</button>
            </div>
          </section>
        </div>
      )}

      {bankEdit && (
        <div className="modal-backdrop" onClick={() => setBankEdit(null)}>
          <section className="product-editor" style={{ width: "min(720px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="eyebrow">Content bank</p>
                <h2>{bankEdit.title || "New entry"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setBankEdit(null)}>×</button>
            </div>
            <div className="editor-form">
              <label className="form-field field-wide"><span>Title</span><input value={bankEdit.title} onChange={(e) => setBankEdit({ ...bankEdit, title: e.target.value })} /></label>
              <label className="form-field field-wide"><span>Diseases / conditions (comma-separated)</span><input value={(bankEdit.diseases || []).join(", ")} onChange={(e) => setBankEdit({ ...bankEdit, diseases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
              <label className="form-field field-wide"><span>Keywords EN (comma-separated)</span><input value={[...(bankEdit.triggersEn || []), ...(bankEdit.keywords || [])].join(", ")} onChange={(e) => {
                const parts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                setBankEdit({ ...bankEdit, triggersEn: parts, keywords: parts });
              }} /></label>
              <label className="form-field field-wide"><span>Keywords SW (comma-separated)</span><input value={(bankEdit.triggersSw || []).join(", ")} onChange={(e) => setBankEdit({ ...bankEdit, triggersSw: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
              <label className="form-field field-wide"><span>Reply opening</span><textarea rows={2} value={bankEdit.replyOpening || ""} onChange={(e) => setBankEdit({ ...bankEdit, replyOpening: e.target.value })} /></label>
              <label className="form-field field-wide"><span>Reply concerns / body</span><textarea rows={3} value={bankEdit.replyConcerns || bankEdit.summary} onChange={(e) => setBankEdit({ ...bankEdit, replyConcerns: e.target.value, summary: e.target.value })} /></label>
              <label className="form-field field-wide"><span>Recommendations intro</span><input value={bankEdit.replyRecommendationsIntro || ""} onChange={(e) => setBankEdit({ ...bankEdit, replyRecommendationsIntro: e.target.value })} /></label>
              <label className="form-field field-wide"><span>Reply closing</span><textarea rows={2} value={bankEdit.replyClosing || ""} onChange={(e) => setBankEdit({ ...bankEdit, replyClosing: e.target.value })} /></label>
              <label className="form-field field-wide"><span>Empty product reason (if no SKUs)</span><input value={bankEdit.emptyProductReason || ""} onChange={(e) => setBankEdit({ ...bankEdit, emptyProductReason: e.target.value })} placeholder="Why this entry leaves the product slot empty" /></label>
              <label className="form-field field-wide"><span>Products (CODE | rank | concern | reasonEn per line)</span><textarea rows={4} value={(bankEdit.recommendations || []).map((r) => `${r.code} | ${r.rank ?? 1} | ${r.concern} | ${r.reasonEn || r.role}`).join("\n")} onChange={(e) => {
                const recommendations = e.target.value.split("\n").filter(Boolean).map((line, index) => {
                  const parts = line.split("|").map((p) => p.trim());
                  const code = parts[0] || "W00";
                  const hasRank = /^\d+$/.test(parts[1] || "");
                  const concern = hasRank ? (parts[2] || "") : (parts[1] || "");
                  const role = hasRank ? (parts[3] || "") : (parts[2] || "");
                  return {
                    code,
                    productId: code.toLowerCase(),
                    name: code,
                    rank: hasRank ? Number(parts[1]) : index + 1,
                    concern,
                    role,
                    reasonEn: role,
                    productReviewStatus: "needs_review" as const,
                  };
                });
                setBankEdit({ ...bankEdit, recommendations });
              }} /></label>
            </div>
            <div className="editor-actions">
              <button type="button" className="button button-secondary" onClick={() => setBankEdit(null)}>Cancel</button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  void (async () => {
                    if (!bankEdit.title.trim()) return;
                    setBusy("Saving bank entry…");
                    try {
                      await saveKnowledgeCase(bankEdit);
                      setBankEdit(null);
                      setNote("Content bank entry saved.");
                      toast.success("Content bank entry saved.");
                      await reload();
                    } catch (err) {
                      flashBankError(err instanceof Error ? err.message : "Save failed");
                    } finally {
                      setBusy("");
                    }
                  })();
                }}
              >
                Save to bank
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
