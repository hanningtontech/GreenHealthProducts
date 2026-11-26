import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CloudUpload, Download, FlaskConical, List, Plus, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import ButtonBusyMark from "@/components/ButtonBusyMark";
import GhpAssistLabel from "@/components/GhpAssistLabel";
import ListPager from "@/components/ListPager";
import { PAGE_SIZE_DEFAULT, pageCount, slicePage } from "@/lib/listPaging";
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

type QualityFlag = "diamond" | "green" | "yellow" | "red";

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
type BankPageSize = 10 | 20;
const BANK_PAGE_SIZES: BankPageSize[] = [10, 20];

export default function AdminContentBank() {
  const savedUi = useMemo(() => loadAdminBankUi(), []);
  const [bank, setBank] = useState<KnowledgeCase[]>([]);
  const [bankEdit, setBankEdit] = useState<KnowledgeCase | null>(null);
  const [browseOpen, setBrowseOpen] = useState(() => Boolean(savedUi.browseOpen));
  const [panel, setPanel] = useState<Panel>(() => savedUi.panel || "entries");
  const [busy, setBusy] = useState("");
  const [busyKind, setBusyKind] = useState<"" | "test" | "ghp" | "approve" | "other">("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState(() => savedUi.query || "");
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesPageSize, setEntriesPageSize] = useState<BankPageSize>(PAGE_SIZE_DEFAULT);
  const [browsePage, setBrowsePage] = useState(1);
  const [browsePageSize, setBrowsePageSize] = useState<BankPageSize>(PAGE_SIZE_DEFAULT);
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
  const [seedFailed, setSeedFailed] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const testResultRef = useRef<HTMLDivElement>(null);

  const flashBankError = (message: string) => {
    setNote(message);
    toast.error(message);
  };

  const scrollMatchedAnswerIntoView = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        testResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      });
    });
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
    setToolsOpen(false);
    setBusyKind("other");
    setBusy("Working…");
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
      setBusyKind("");
    }
  };

  const syncBankNow = async () => {
    setBusyKind("other");
    setBusy("Working…");
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
      setBusyKind("");
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await ensureSeedKnowledgeBank();
        setSeedFailed(false);
      } catch (err) {
        console.warn("Automatic bank seed failed", err);
        setSeedFailed(true);
      }
      await reload();
    })();
    const tick = window.setInterval(() => refreshPending(), 4_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    saveAdminBankUi({ panel, query, browseOpen });
  }, [panel, query, browseOpen]);

  useEffect(() => {
    if (!toolsOpen) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (toolsRef.current && !toolsRef.current.contains(target)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [toolsOpen]);

  const seedBank = async (forceRefresh = false) => {
    setBusyKind("other");
    setBusy("Working…");
    setToolsOpen(false);
    try {
      const result = await ensureSeedKnowledgeBank({ forceRefresh });
      setSeedFailed(false);
      setNote(
        forceRefresh
          ? `Seed refresh complete. Added ${result.added}, updated ${result.updated}.`
          : `Starter cases ready. Added ${result.added}, updated ${result.updated}.`,
      );
      toast.success("Content bank starters are ready.");
      await reload();
      refreshPending();
    } catch (err) {
      setSeedFailed(true);
      flashBankError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setBusy("");
      setBusyKind("");
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
    setBusyKind("other");
    setBusy("Working…");
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
      setBusyKind("");
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
      toast.success(`Saved “${result.taughtCase.title}” for review.`);
    }
    setPanel("test");
    scrollMatchedAnswerIntoView();
  };

  const runBankTest = async (question = testQuestion) => {
    const q = question.trim();
    if (!q) {
      flashBankError("Enter a test question first.");
      return;
    }
    setBusyKind("test");
    setBusy("Looking up guidance…");
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
            ? `Matched ${result.matchedCaseIds.length} case(s)${language === "sw" ? " · Swahili question" : ""}${result.matchedCaseIds.length > 1 ? " — select an entry before Green approve." : ""}.`
            : `No saved match yet${language === "sw" ? " (Swahili)" : ""}. Use GHP for a draft, or Red · edit to write one yourself.`,
      );
      setPanel("test");
      scrollMatchedAnswerIntoView();
    } catch (err) {
      flashBankError(err instanceof Error ? err.message : "Could not look up guidance");
    } finally {
      setBusy("");
      setBusyKind("");
    }
  };

  const runGhpAssist = async () => {
    const q = testQuestion.trim();
    if (!q) {
      flashBankError("Enter a test question first.");
      return;
    }
    setBusyKind("ghp");
    setBusy("Preparing GHP guidance…");
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
        setNote("A saved match is already available — green-approve or edit that entry instead.");
        await applyTestResult(result, language);
      } else {
        await applyTestResult(result, language);
      }
      setPanel("test");
    } catch (err) {
      flashBankError(err instanceof Error ? err.message : "Could not prepare guidance");
    } finally {
      setBusy("");
      setBusyKind("");
    }
  };

  const runApprove = async (flag: "diamond" | "green" = "green") => {
    if (testMatched.length > 1 && !selectedCaseId) {
      flashBankError(`Select which matched bank entry to approve before clicking ${flag === "diamond" ? "Diamond" : "Green"}.`);
      return;
    }
    setShareDialog({
      title: flag === "diamond" ? "Promoting to diamond…" : "Approving bank entry…",
      detail: flag === "diamond"
        ? "Marking this reply for automatic patient guidance when it matches."
        : "Updating approval status only — keywords, reply fields, and products stay unchanged.",
    });
    setBusyKind("approve");
    setBusy("Working…");
    try {
      const learned = await approveBankCase({
        matchedCaseIds: testMatched,
        existingCases: bank,
        selectedCaseId,
        qualityFlag: flag,
        reviewNote: flag === "diamond"
          ? "Promoted to diamond — eligible for automatic patient replies."
          : "Approved in bank testing (metadata only).",
      });
      setShareDialog({
        title: "Syncing approval to Firestore…",
        detail: `Saving approval for “${learned.title}”.`,
      });
      const sync = await flushKnowledgeBankToFirestore();
      setTestFlag(flag);
      setEditingAnswer(false);
      await reload();
      const ok = flag === "diamond"
        ? `Diamond “${learned.title}” — automatic replies enabled when this matches.`
        : `Approved “${learned.title}” (status only). Keywords and reply fields preserved.`;
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
      setBusyKind("");
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
    setBusyKind("other");
    setBusy("Working…");
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
      setBusyKind("");
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
      setNote("Red · edit structured fields, then save. Green or Diamond later approves without rewriting keywords.");
      return;
    }
    if (flag === "diamond") {
      void runApprove("diamond");
      return;
    }
    if (flag === "green") {
      void runApprove("green");
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

  const entriesTotalPages = pageCount(filtered.length, entriesPageSize);
  const pagedFiltered = useMemo(
    () => slicePage(filtered, entriesPage, entriesPageSize),
    [filtered, entriesPage, entriesPageSize],
  );

  const browseTotalPages = pageCount(bank.length, browsePageSize);
  const pagedBrowse = useMemo(
    () => slicePage(bank, browsePage, browsePageSize),
    [bank, browsePage, browsePageSize],
  );

  useEffect(() => {
    setEntriesPage(1);
  }, [query, entriesPageSize]);

  useEffect(() => {
    if (!browseOpen) return;
    setBrowsePage(1);
  }, [browseOpen]);

  useEffect(() => {
    setBrowsePage(1);
  }, [browsePageSize, bank.length]);

  const statusCounts = useMemo(() => {
    let needsReview = 0;
    let quarantined = 0;
    let inactive = 0;
    let diamond = 0;
    let enrichPending = 0;
    for (const item of bank) {
      if (item.reviewStatus === "needs_review") needsReview += 1;
      if (item.reviewStatus === "quarantined") quarantined += 1;
      if (item.active === false) inactive += 1;
      if (item.qualityFlag === "diamond") diamond += 1;
      if (item.pendingEnrich) enrichPending += 1;
    }
    return { needsReview, quarantined, inactive, diamond, enrichPending };
  }, [bank]);

  const matchedTitles = testMatched
    .map((id) => bank.find((item) => item.id === id)?.title || id)
    .filter(Boolean);

  return (
    <div className="admin-section">
      {shareDialog && (
        <div className="modal-backdrop bank-share-backdrop" role="alertdialog" aria-live="assertive" aria-busy="true">
          <div className="bank-share-dialog">
            <ButtonBusyMark size={28} />
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
          <p>Train answers for screenings and help notes. Starters load automatically; edits sync in the background.</p>
          <div className="bank-status-badges" aria-label="Bank status">
            {pendingSync > 0 && (
              <button
                type="button"
                className="bank-status-badge is-sync"
                disabled={Boolean(busy)}
                title="Changes sync automatically — click to sync now"
                onClick={() => void syncBankNow()}
              >
                <CloudUpload size={13} /> Syncing {pendingSync}
              </button>
            )}
            {statusCounts.diamond > 0 && (
              <span className="bank-status-badge is-diamond">{statusCounts.diamond} diamond</span>
            )}
            {statusCounts.needsReview > 0 && (
              <span className="bank-status-badge is-review">{statusCounts.needsReview} review</span>
            )}
            {statusCounts.quarantined > 0 && (
              <span className="bank-status-badge is-quarantine">{statusCounts.quarantined} hidden</span>
            )}
            {statusCounts.inactive > 0 && (
              <span className="bank-status-badge is-inactive">{statusCounts.inactive} inactive</span>
            )}
            {statusCounts.enrichPending > 0 && (
              <span className="bank-status-badge is-enrich">{statusCounts.enrichPending} enrich</span>
            )}
            {hygieneCount > 0 && (
              <button
                type="button"
                className="bank-status-badge is-hygiene"
                onClick={downloadHygieneReport}
                title="Download hygiene review"
              >
                {hygieneCount} hygiene
              </button>
            )}
            {seedFailed && (
              <button
                type="button"
                className="bank-status-badge is-seed-fail"
                disabled={Boolean(busy)}
                title="Automatic starters failed — click to retry"
                onClick={() => void seedBank(false)}
              >
                <BookOpen size={13} /> Seed failed · retry
              </button>
            )}
          </div>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="button button-secondary" onClick={() => setBrowseOpen(true)}>
            <List size={16} /> Browse all
          </button>
          <button type="button" className="button button-secondary" onClick={() => void reload()}>
            <RefreshCw size={16} /> Refresh
          </button>
          <div className="bank-tools" ref={toolsRef}>
            <button
              type="button"
              className="button button-secondary"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((v) => !v)}
            >
              Tools
            </button>
            {toolsOpen && (
              <div className="bank-tools-menu" role="menu">
                <button type="button" role="menuitem" disabled={!bank.length} onClick={() => { setToolsOpen(false); downloadBank(); }}>
                  <Download size={15} /> Download bank
                </button>
                <button type="button" role="menuitem" disabled={!bank.length} onClick={() => { setToolsOpen(false); downloadHygieneReport(); }}>
                  <Download size={15} /> Hygiene review
                </button>
                <label className={`bank-tools-upload ${busy ? "is-disabled" : ""}`}>
                  <Upload size={15} /> Import JSON
                  <input
                    ref={importRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    disabled={Boolean(busy)}
                    onChange={(e) => {
                      setToolsOpen(false);
                      void importBankFile(e.target.files?.[0]);
                    }}
                  />
                </label>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!bank.length || Boolean(busy)}
                  onClick={() => void runPrivacyMigration()}
                >
                  Privacy migrate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={Boolean(busy)}
                  title="Manual fallback — only if automatic starters failed"
                  onClick={() => void seedBank(true)}
                >
                  <BookOpen size={15} /> Force re-seed
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={Boolean(busy) || pendingSync <= 0}
                  onClick={() => { setToolsOpen(false); void syncBankNow(); }}
                >
                  <CloudUpload size={15} /> Sync now{pendingSync > 0 ? ` (${pendingSync})` : ""}
                </button>
              </div>
            )}
          </div>
          <button type="button" className="button button-primary" onClick={() => setBankEdit(emptyBankCase())}>
            <Plus size={16} /> Add entry
          </button>
        </div>
      </div>

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
              {pagedFiltered.map((item) => (
                <div key={item.id} className="admin-product-row admin-list-row-2">
                  <div className="admin-product-name">
                    <b>{item.title}</b>
                    <small>
                      {item.reviewStatus ? `${item.reviewStatus} · ` : ""}
                      {item.active === false ? "inactive · " : ""}
                      {item.qualityFlag ? `${item.qualityFlag.toUpperCase()} · ` : ""}
                      {item.pendingEnrich ? "enrich pending · " : ""}
                      {item.autoHitCount ? `${item.autoHitCount} hits · ` : ""}
                      Diseases: {(item.diseases || []).join(", ") || "—"} · Keywords: {[...(item.keywords || []), ...(item.triggersEn || []), ...(item.triggersSw || [])].slice(0, 6).join(", ")}
                    </small>
                  </div>
                  <button type="button" className="button button-secondary" onClick={() => setBankEdit(item)}>Edit</button>
                </div>
              ))}
              {!filtered.length && (
                <p className="muted">
                  Bank empty — starters load automatically.
                  {seedFailed ? " Automatic seed failed — use Tools → Force re-seed." : " Or add your own entry."}
                </p>
              )}
            </div>
            {filtered.length > 0 && (
              <ListPager
                page={entriesPage}
                totalPages={entriesTotalPages}
                onPageChange={setEntriesPage}
                pageSize={entriesPageSize}
                pageSizeOptions={BANK_PAGE_SIZES}
                onPageSizeChange={(n) => setEntriesPageSize(n as BankPageSize)}
                pageSizeAriaLabel="Bank entries per page"
              />
            )}
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
            Ask in English or Kiswahili. Rate diamond (auto-reply), green (approve), yellow (ok / unconfirmed), or red (edit &amp; teach the bank).
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
              {busyKind === "test" ? <><ButtonBusyMark /> Looking up…</> : <><FlaskConical size={16} /> See bank answer</>}
            </button>
            <button
              type="button"
              className="button button-secondary ghp-assist-button"
              disabled={Boolean(busy) || (Boolean(testReply) && testMatched.length > 0)}
              title="Prepare a GHP draft when no saved match exists"
              onClick={() => void runGhpAssist()}
            >
              <GhpAssistLabel busy={busyKind === "ghp"} />
            </button>
          </div>
          {testReply && (
            <div className="bank-test-result" ref={testResultRef} tabIndex={-1}>
              <p className="eyebrow">Matched cases</p>
              {!testMatched.length ? (
                <p>None — use <b>GHP</b> for a draft, or Red · edit to write one yourself</p>
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
                          setBusyKind("other");
                          setBusy("Working…");
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
                            setBusyKind("");
                          }
                        })();
                      }}
                    >
                      {busyKind === "other" && busy ? <><ButtonBusyMark /> Working…</> : "Translate EN → SW"}
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
                    className={`bank-flag-btn diamond ${testFlag === "diamond" ? "is-active" : ""}`}
                    disabled={Boolean(busy)}
                    title="Top tier — patients can receive this reply automatically"
                    onClick={() => onQualityClick("diamond")}
                  >
                    Diamond · auto-reply
                  </button>
                  <button
                    type="button"
                    className={`bank-flag-btn green ${testFlag === "green" ? "is-active" : ""}`}
                    disabled={Boolean(busy)}
                    title="Approve — admin-assisted drafts for similar questions"
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
                        setEditOpening(testReply.split(/\n\n+/)[0] || "");
                        setEditConcerns(testReply);
                        setEditReplySw(testReplySw);
                      }}
                    >
                      Correct answer
                    </button>
                  )}
                </div>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  Diamond enables automatic patient replies. Green is for admin-assisted drafts. Yellow keeps it usable but unconfirmed.
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
              {pagedBrowse.map((item) => (
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
            {bank.length > 0 && (
              <ListPager
                page={browsePage}
                totalPages={browseTotalPages}
                onPageChange={setBrowsePage}
                pageSize={browsePageSize}
                pageSizeOptions={BANK_PAGE_SIZES}
                onPageSizeChange={(n) => setBrowsePageSize(n as BankPageSize)}
                pageSizeAriaLabel="Browse library entries per page"
              />
            )}
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
                    setBusyKind("other");
                    setBusy("Working…");
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
                      setBusyKind("");
                    }
                  })();
                }}
              >
                {busy ? <><ButtonBusyMark /> Saving…</> : "Save to bank"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
