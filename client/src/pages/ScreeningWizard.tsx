import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Search,
  Share2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import ButtonBusyMark from "@/components/ButtonBusyMark";
import GhpAssistLabel from "@/components/GhpAssistLabel";
import { findPatientByEmail, getPatient, upsertPatient } from "@/lib/patients";
import {
  newScreeningId,
  readReportText,
  saveScreening,
  setScreeningStatus,
  uploadScreeningFile,
  uploadScreeningReportPdf,
} from "@/lib/screenings";
import { parseScreeningText } from "@/lib/parseScreeningReport";
import {
  checkBankDraftUpdate,
  draftIntakeFromContentBank,
} from "@/lib/replyFromBank";
import {
  applyAdminDraftToScreening,
  resolveScreeningDraftWithGeminiFallback,
} from "@/lib/geminiBankFallback";
import { getIntake } from "@/lib/intakes";
import { withHelpFormGreenItems } from "@/lib/intakeToScreening";
import { ensureSeedKnowledgeBank } from "@/lib/seedKnowledge";
import {
  buildPatientReport,
  withRecommendationQty,
  withRecommendationUnitPrice,
  type ReportVariant,
} from "@/lib/buildPatientReport";
import { buildPatientReportPdfBlob, downloadPatientReportPdf } from "@/lib/printPatientReport";
import { sanitizePatientConclusion, WEEK_ACTIONS_HEADING } from "@/lib/reportCopy";
import { loadProducts, money, type Product } from "@/lib/catalog";
import { isHttpUrl } from "@/lib/mediaStorage";
import { initialsFromName } from "@/lib/patientAvatar";
import type { Screening, ScreeningGroup, ScreeningRecommendation } from "@/lib/screeningTypes";

function missingRequiredSubject(subject: Screening["subject"]): string[] {
  const missing: string[] = [];
  if (!String(subject.name || "").trim()) missing.push("Name");
  if (!String(subject.email || "").trim()) missing.push("Email");
  if (!String(subject.age ?? "").trim()) missing.push("Age");
  if (!String(subject.sex || "").trim()) missing.push("Sex");
  return missing;
}

type Step = "upload" | "parse" | "match" | "review" | "share" | "error";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "parse", label: "Parse" },
  { id: "match", label: "Screen / match" },
  { id: "review", label: "Edit draft" },
  { id: "share", label: "Share" },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildShareText(screening: Screening): string {
  const report = buildPatientReport(screening);
  const flags = report.priorityFindings
    .map((i) => `• ${i.name}${i.value !== "—" ? ` (${i.value})` : ""} — ${i.flag}`)
    .join("\n");
  const products = report.lines
    .map((r) => `• ${r.name} ×${r.qty} — ${r.lineTotalLabel}\n  ${r.concern}`)
    .join("\n");
  return [
    `GreenHealthProducts — ${report.title}`,
    screening.subject.testDate ? `Date: ${screening.subject.testDate}` : "",
    "",
    "What this means:",
    screening.simpleConclusion || "(none)",
    "",
    screening.simpleConclusionSw ? `Kiswahili:\n${screening.simpleConclusionSw}\n` : "",
    report.weekActions.length ? `This week:\n${report.weekActions.map((a) => `• ${a}`).join("\n")}\n` : "",
    flags ? `Priority findings:\n${flags}\n` : "",
    products ? `Wellness product plan:\n${products}\nTotal payable: ${report.totalPayableLabel}\n` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

type Props = {
  open: boolean;
  file?: File | null;
  initial?: Screening | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function ScreeningWizard({ open, file, initial, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>(initial ? "review" : "upload");
  const [statusLine, setStatusLine] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Screening | null>(initial ?? null);
  const [matchedCount, setMatchedCount] = useState(0);
  const [catalogue] = useState<Product[]>(() => loadProducts());
  const [productQuery, setProductQuery] = useState("");
  const [flagsOpen, setFlagsOpen] = useState(true);
  const [quoteOpen, setQuoteOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<"share" | "share-bank" | "bank" | "draft" | "rematch" | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [bankUpdateNotice, setBankUpdateNotice] = useState("");
  const [geminiUsed, setGeminiUsed] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [reviewMenuOpen, setReviewMenuOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const reviewMenuRef = useRef<HTMLDivElement | null>(null);
  const wizardTopRef = useRef<HTMLElement | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const flashError = (message: string, opts?: { goReview?: boolean }) => {
    setActionError(message);
    setError(message);
    setActionNote("");
    setShareMenuOpen(false);
    setReviewMenuOpen(false);
    toast.error(message, { duration: 2800 });
    if (opts?.goReview) {
      setStep("review");
      requestAnimationFrame(() => {
        wizardTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const flashOk = (message: string) => {
    setActionError("");
    setActionNote(message);
    setStatusLine(message);
    toast.success(message);
  };

  useEffect(() => {
    if (!shareMenuOpen && !reviewMenuOpen) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (shareMenuOpen && shareMenuRef.current && !shareMenuRef.current.contains(target)) {
        setShareMenuOpen(false);
      }
      if (reviewMenuOpen && reviewMenuRef.current && !reviewMenuRef.current.contains(target)) {
        setReviewMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShareMenuOpen(false);
        setReviewMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [shareMenuOpen, reviewMenuOpen]);

  useEffect(() => {
    setShareMenuOpen(false);
    setReviewMenuOpen(false);
  }, [step]);

  const phoneDigits = useMemo(() => (editing?.subject.phone || "").replace(/\D/g, ""), [editing?.subject.phone]);
  const email = editing?.subject.email || "";

  const pricedPreview = useMemo(() => (editing ? buildPatientReport(editing, catalogue) : null), [editing, catalogue]);

  const selectedCodes = useMemo(
    () => new Set((editing?.recommendations || []).map((r) => r.code.toUpperCase())),
    [editing?.recommendations],
  );

  const suggestedCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const rec of editing?.recommendations || []) codes.add(rec.code.toUpperCase());
    for (const rec of editing?.bankDraftRecommendations || []) codes.add(rec.code.toUpperCase());
    return codes;
  }, [editing?.recommendations, editing?.bankDraftRecommendations]);

  const pickerProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const list = catalogue.filter((p) => p.visible !== false);
    const filtered = q
      ? list.filter((p) => `${p.code} ${p.name} ${p.category}`.toLowerCase().includes(q))
      : list;
    const ranked = [...filtered].sort((a, b) => {
      const aSuggested = suggestedCodes.has(a.code.toUpperCase()) || selectedCodes.has(a.code.toUpperCase()) ? 0 : 1;
      const bSuggested = suggestedCodes.has(b.code.toUpperCase()) || selectedCodes.has(b.code.toUpperCase()) ? 0 : 1;
      if (aSuggested !== bSuggested) return aSuggested - bSuggested;
      return a.name.localeCompare(b.name);
    });
    return ranked.slice(0, q ? 80 : 60);
  }, [catalogue, productQuery, suggestedCodes, selectedCodes]);

  const toggleProduct = (product: Product, checked: boolean) => {
    if (!editing) return;
    const code = product.code.toUpperCase();
    if (checked) {
      if (selectedCodes.has(code)) return;
      const next: ScreeningRecommendation = {
        code: product.code,
        productId: product.id,
        name: product.name,
        concern: product.category || "Wellness support",
        role: product.packSize || "See label",
        qty: 1,
        unitPrice: product.retailPrice || 0,
      };
      setEditing({ ...editing, recommendations: [...(editing.recommendations || []), next] });
    } else {
      setEditing({
        ...editing,
        recommendations: (editing.recommendations || []).filter((r) => r.code.toUpperCase() !== code),
      });
    }
  };

  const startPipeline = async (uploadFile: File) => {
    setError("");
    setEditing(null);
    setMatchedCount(0);
    try {
      setStep("upload");
      setStatusLine(`Reading ${uploadFile.name}…`);
      await sleep(300);
      const id = newScreeningId();
      setStatusLine("Uploading source file to Backblaze B2…");
      const uploaded = await uploadScreeningFile(id, uploadFile);
      setStatusLine(
        isHttpUrl(uploaded.publicUrl)
          ? "Source file stored on Backblaze B2."
          : "Source kept locally — B2 upload unavailable; continuing with parse.",
      );

      setStep("parse");
      setStatusLine("Parsing report text…");
      const raw = await readReportText(uploadFile);
      if (!raw.trim()) throw new Error("File was empty or could not be read.");
      const parsed = parseScreeningText(raw);
      setStatusLine(`Parsed ${parsed.groups.reduce((n, g) => n + g.items.length, 0)} flag items for ${parsed.subject.name}.`);

      const mail = (parsed.subject.email || "").toLowerCase().trim();
      let patient = mail ? await findPatientByEmail(mail) : null;
      patient = await upsertPatient({
        id: patient?.id,
        authUid: patient?.authUid,
        email: mail || `pending-${id}@greenhealthproducts.local`,
        displayName: parsed.subject.name || patient?.displayName || "Patient",
        sex: parsed.subject.sex || patient?.sex,
        age: parsed.subject.age || patient?.age,
        phone: parsed.subject.phone || patient?.phone,
      });

      const productCodes = [...(parsed.recommendationsHint || "").matchAll(/\b(W\d{2})\b/gi)].map((m) => m[1].toUpperCase());
      const uniqueCodes = [...new Set(productCodes)];
      let draft: Screening = {
        id,
        patientId: patient.id,
        status: "draft",
        sourceFilePath: uploaded.publicUrl,
        sourceFileKey: uploaded.key,
        subject: {
          ...parsed.subject,
          email: patient.email,
          phone: parsed.subject.phone || patient.phone || "",
        },
        groups: parsed.groups,
        simpleConclusion: parsed.simpleConclusionHint || "",
        simpleConclusionSw: "",
        weekActions: [],
        recommendations: uniqueCodes.map((code) => {
          const product = catalogue.find((p) => p.code.toUpperCase() === code);
          return {
            code,
            productId: product?.id || code.toLowerCase(),
            name: product?.name || code,
            concern: product?.category || "From uploaded report",
            role: product?.packSize || "See report / content bank",
            qty: 1,
            unitPrice: product?.retailPrice || 0,
          };
        }),
        rawTextExcerpt: parsed.rawTextExcerpt,
      };

      setStep("match");
      setStatusLine("Finding the best guidance…");
      try {
        await ensureSeedKnowledgeBank();
        const resolved = await resolveScreeningDraftWithGeminiFallback(draft);
        setMatchedCount(resolved.matchedCaseIds.length);
        setGeminiUsed(resolved.geminiUsed);
        draft = applyAdminDraftToScreening(draft, resolved);
        setBankUpdateNotice("");
        setStatusLine(resolved.message);
      } catch {
        setStatusLine("Guidance lookup skipped — you can still edit manually.");
        setGeminiUsed(false);
      }

      try {
        await saveScreening(draft);
      } catch (saveErr) {
        setStatusLine(saveErr instanceof Error ? `Saved locally in wizard only: ${saveErr.message}` : "Could not save to server yet.");
      }

      setEditing(draft);
      setStep("review");
      setStatusLine("Draft ready — review and edit, then continue to share.");
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload/parse failed";
      setStep("error");
      setStatusLine("");
      flashError(message);
    }
  };

  const startedFor = useRef<string>("");
  useEffect(() => {
    if (!open) {
      startedFor.current = "";
      setBankUpdateNotice("");
      return;
    }
    if (initial) {
      const enriched = withHelpFormGreenItems(initial);
      setEditing({
        ...enriched,
        weekActions: enriched.weekActions || [],
        recommendations: (enriched.recommendations || []).map((r) => ({ ...r, qty: r.qty || 1 })),
      });
      setStep(enriched.status === "shared" ? "share" : "review");
      setStatusLine(enriched.status === "shared" ? "Opened shared report — adjust qty and download PDF." : "Opened existing draft.");
      setBankUpdateNotice("");
      setGeminiUsed(false);
      let cancelled = false;
      void (async () => {
        try {
          const { hydrateScreeningFromUserProfile } = await import("@/lib/hydrateSubjectFromProfile");
          const hydrated = await hydrateScreeningFromUserProfile(enriched);
          if (!cancelled) {
            setEditing({
              ...hydrated,
              weekActions: hydrated.weekActions || [],
              recommendations: (hydrated.recommendations || []).map((r) => ({ ...r, qty: r.qty || 1 })),
            });
            await saveScreening(hydrated);
          }
          await ensureSeedKnowledgeBank();
          const update = await checkBankDraftUpdate(hydrated);
          if (!cancelled && update?.hasUpdate) {
            setBankUpdateNotice(update.message);
            setStatusLine(update.message);
          }
        } catch {
          /* ignore freshness probe failures */
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (file) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (startedFor.current === key) return;
      startedFor.current = key;
      void startPipeline(file);
    }
  }, [open, file, initial]);

  if (!open) return null;

  const updateGroupItem = (groupIndex: number, itemIndex: number, patch: Partial<ScreeningGroup["items"][number]>) => {
    if (!editing) return;
    const groups = editing.groups.map((g, gi) => {
      if (gi !== groupIndex) return g;
      return { ...g, items: g.items.map((item, ii) => (ii === itemIndex ? { ...item, ...patch } : item)) };
    });
    setEditing({ ...editing, groups });
  };

  const setWeekAction = (index: number, value: string) => {
    if (!editing) return;
    const next = [...(editing.weekActions || ["", "", ""])];
    while (next.length < 3) next.push("");
    next[index] = value;
    setEditing({ ...editing, weekActions: next.slice(0, 3) });
  };

  const saveDraft = async () => {
    if (!editing || actionBusy) return;
    setActionBusy("draft");
    setActionError("");
    setActionNote("Saving draft…");
    setStatusLine("Saving draft…");
    try {
      await saveScreening({
        ...editing,
        weekActions: (editing.weekActions || []).map((a) => a.trim()).filter(Boolean).slice(0, 3),
        adminNotes: (editing.adminNotes || "").trim(),
        status: editing.status === "shared" ? "shared" : "draft",
      });
      flashOk("Draft saved.");
      onSaved();
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Could not save draft");
    } finally {
      setActionBusy(null);
    }
  };

  /** Re-run guidance matching; GHP assist only when the bank has no match. */
  const findBestAnswerAgain = async () => {
    if (!editing || actionBusy) return;
    setActionBusy("rematch");
    setActionError("");
    setActionNote("Finding best answer from content bank…");
    setStatusLine("Finding best answer from content bank…");
    try {
      let base = editing;
      if (editing.sourceIntakeId) {
        const intake = await getIntake(editing.sourceIntakeId);
        if (intake) {
          const intakeDraft = await draftIntakeFromContentBank(intake);
          base = {
            ...editing,
            simpleConclusion: intakeDraft.reply || editing.simpleConclusion,
            simpleConclusionSw: intakeDraft.replySw || editing.simpleConclusionSw,
            recommendations: intakeDraft.recommendations.length
              ? intakeDraft.recommendations.map((r) => ({ ...r, qty: r.qty || 1 }))
              : editing.recommendations,
          };
        }
      }
      const priorBankCheck = await checkBankDraftUpdate(base);
      const resolved = await resolveScreeningDraftWithGeminiFallback(base);
      setMatchedCount(resolved.matchedCaseIds.length);
      setGeminiUsed(resolved.geminiUsed);
      setEditing(applyAdminDraftToScreening(base, resolved));
      setBankUpdateNotice("");
      const note = priorBankCheck?.answerMayDiffer && resolved.source === "bank"
        ? `Bank update applied — ${resolved.message}`
        : resolved.message;
      flashOk(note);
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Bank match failed");
    } finally {
      setActionBusy(null);
    }
  };

  const persistToBank = async (screening: Screening) => {
    const { knowledgeCaseFromScreening, saveKnowledgeCase } = await import("@/lib/knowledgeBank");
    const entry = knowledgeCaseFromScreening(screening);
    await saveKnowledgeCase(entry);
    return entry;
  };

  const ensurePatientForShare = async (screening: Screening) => {
    const existing = screening.patientId ? await getPatient(screening.patientId) : null;
    const mail = (screening.subject.email || existing?.email || "").toLowerCase().trim();
    const byEmail = mail ? await findPatientByEmail(mail) : null;
    return upsertPatient({
      id: existing?.id || byEmail?.id || screening.patientId,
      authUid: existing?.authUid || byEmail?.authUid,
      email: mail || `pending-${screening.id}@greenhealthproducts.local`,
      displayName: screening.subject.name || existing?.displayName || byEmail?.displayName || "Patient",
      sex: screening.subject.sex || existing?.sex || byEmail?.sex,
      age: screening.subject.age || existing?.age || byEmail?.age,
      phone: screening.subject.phone || existing?.phone || byEmail?.phone,
      photoUrl: screening.subject.photoUrl || existing?.photoUrl || byEmail?.photoUrl,
    });
  };

  const shareAndSave = async (learn: boolean) => {
    if (!editing || actionBusy) return;
    const missing = missingRequiredSubject(editing.subject);
    if (missing.length) {
      flashError(`Please fill required fields: ${missing.join(", ")}.`, { goReview: true });
      return;
    }
    setActionBusy(learn ? "share-bank" : "share");
    setActionError("");
    setError("");
    const loadingNote = learn ? "Sharing and saving to content bank…" : "Saving shared result…";
    setStatusLine(loadingNote);
    setActionNote(loadingNote);
    try {
      const patient = await ensurePatientForShare(editing);
      const { resolvePatientReportTitle } = await import("@/lib/patientReportTitle");
      const patientReportTitle = editing.patientReportTitle?.trim()
        || await resolvePatientReportTitle({
          screening: editing,
          matchedCaseIds: editing.bankMatchedCaseIds,
          conclusion: editing.simpleConclusion,
        });
      const cleaned: Screening = {
        ...editing,
        patientId: patient.id,
        subject: {
          ...editing.subject,
          email: patient.email || editing.subject.email,
          phone: editing.subject.phone || patient.phone || "",
        },
        simpleConclusion: sanitizePatientConclusion(editing.simpleConclusion || ""),
        simpleConclusionSw: sanitizePatientConclusion(editing.simpleConclusionSw || ""),
        weekActions: (editing.weekActions || []).map((a) => a.trim()).filter(Boolean).slice(0, 3),
        adminNotes: (editing.adminNotes || "").trim(),
        recommendations: (editing.recommendations || []).map((r) => ({ ...r, qty: r.qty || 1 })),
        patientReportTitle,
        status: "shared",
        learnApproved: learn || editing.learnApproved,
      };
      await saveScreening(cleaned);
      await setScreeningStatus(editing.id, "shared");
      let okNote = "Shared. Download PDF, WhatsApp, or email — the patient can open it under My results.";
      if (learn) {
        const entry = await persistToBank(cleaned);
        okNote = `Shared with the patient. Reusable bank draft “${entry.title}” saved as needs review (inactive until approved) — not auto-published to retrieval.`;
      }
      if (cleaned.sourceIntakeId) {
        const { markIntakeAnsweredFromScreening } = await import("@/lib/intakeToScreening");
        await markIntakeAnsweredFromScreening(cleaned);
      }
      setEditing(cleaned);
      setStep("share");
      flashOk(okNote);
      onSaved();
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Share failed");
    } finally {
      setActionBusy(null);
    }
  };

  const saveToBankOnly = async () => {
    if (!editing || actionBusy) return;
    setActionBusy("bank");
    setActionError("");
    setError("");
    setStatusLine("Saving current draft into content bank…");
    setActionNote("Saving current draft into content bank…");
    try {
      const cleaned: Screening = {
        ...editing,
        weekActions: (editing.weekActions || []).map((a) => a.trim()).filter(Boolean).slice(0, 3),
        recommendations: (editing.recommendations || []).map((r) => ({ ...r, qty: r.qty || 1 })),
        learnApproved: true,
      };
      await saveScreening({
        ...cleaned,
        status: cleaned.status === "shared" ? "shared" : cleaned.status,
      });
      const entry = await persistToBank(cleaned);
      setEditing(cleaned);
      flashOk(`Content bank updated: “${entry.title}”. Future similar questions can reuse this answer.`);
      onSaved();
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Could not save to bank");
    } finally {
      setActionBusy(null);
    }
  };

  const downloadTxt = () => {
    if (!editing) return;
    const blob = new Blob([buildShareText(editing)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(editing.subject.name || "screening").replace(/\s+/g, "-")}-result.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = (variant: ReportVariant = "simple") => {
    if (!editing || actionBusy) return;
    const missing = missingRequiredSubject(editing.subject);
    if (missing.length) {
      flashError(`Please fill required fields: ${missing.join(", ")}.`, { goReview: true });
      return;
    }
    const cleaned: Screening = {
      ...editing,
      weekActions: (editing.weekActions || []).map((a) => a.trim()).filter(Boolean).slice(0, 3),
      adminNotes: (editing.adminNotes || "").trim(),
      recommendations: (editing.recommendations || []).map((r) => ({ ...r, qty: r.qty || 1 })),
      simpleConclusion: sanitizePatientConclusion(editing.simpleConclusion || ""),
      simpleConclusionSw: sanitizePatientConclusion(editing.simpleConclusionSw || ""),
    };
    setEditing(cleaned);
    setActionError("");
    setShareMenuOpen(false);
    setStatusLine(variant === "full" ? "Preparing full details PDF…" : "Preparing report PDF…");
    setActionNote(variant === "full" ? "Preparing full details PDF…" : "Preparing report PDF…");
    void (async () => {
      await downloadPatientReportPdf(cleaned, variant);
      if (variant === "simple") {
        setStatusLine("Report downloaded. Uploading copy to Backblaze B2…");
        setActionNote("Report downloaded. Uploading copy to Backblaze B2…");
        let reportPdfUrl = cleaned.reportPdfUrl;
        let reportPdfKey = cleaned.reportPdfKey;
        try {
          const { blob, fileName } = await buildPatientReportPdfBlob(cleaned, "simple");
          const uploaded = await uploadScreeningReportPdf(cleaned.id, blob, fileName);
          reportPdfUrl = uploaded.publicUrl;
          reportPdfKey = uploaded.key;
          setStatusLine("PDF stored on B2. Saving record…");
        } catch (uploadErr) {
          console.warn("B2 report PDF upload failed:", uploadErr);
          setStatusLine("PDF downloaded (B2 upload skipped). Saving record…");
        }
        const next = {
          ...cleaned,
          reportPdfUrl,
          reportPdfKey,
          status: cleaned.status === "shared" ? "shared" as const : cleaned.status,
        };
        setEditing(next);
        await saveScreening(next);
        const ok = isHttpUrl(reportPdfUrl)
          ? "Report downloaded, stored on B2, and record saved."
          : "Report downloaded and record saved.";
        flashOk(ok);
      } else {
        flashOk("Full details report downloaded.");
        await saveScreening(cleaned);
      }
      onSaved();
    })().catch((err) => {
      flashError(err instanceof Error ? err.message : "Could not download PDF report");
    });
  };

  const whatsappHref = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(buildShareText(editing!))}`
    : "";
  const mailtoHref = email
    ? `mailto:${email}?subject=${encodeURIComponent(`Your GreenHealthProducts screening — ${editing?.subject.name || ""}`)}&body=${encodeURIComponent(buildShareText(editing!))}`
    : "";

  const weekSlots = [0, 1, 2].map((i) => (editing?.weekActions || [])[i] || "");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={wizardTopRef}
        className="product-editor screening-wizard"
        style={{ width: "min(920px, 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <p className="eyebrow">Screening wizard</p>
            <h2>{editing?.subject.name || file?.name || "New report"}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={19} /></button>
        </div>

        <ol className="wizard-steps">
          {STEPS.map((s, index) => (
            <li key={s.id} className={index < stepIndex ? "done" : index === stepIndex ? "active" : ""}>
              <span>{index < stepIndex ? <Check size={14} /> : index + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>

        {statusLine && <p className="sync-note">{statusLine}</p>}
        {geminiUsed && (
          <p className="wizard-gemini-badge" role="status">
            GHP draft prepared — review and green-approve before relying on it.
          </p>
        )}
        {bankUpdateNotice && (
          <div className="wizard-bank-update" role="status">
            <p>{bankUpdateNotice}</p>
            <button
              type="button"
              className="button button-secondary"
              disabled={Boolean(actionBusy) || step === "upload" || step === "parse" || step === "match"}
              onClick={() => void findBestAnswerAgain()}
            >
              {actionBusy === "rematch" ? <><ButtonBusyMark /> Matching…</> : <><Search size={16} /> Match updated answer</>}
            </button>
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}

        {(step === "upload" || step === "parse" || step === "match") && !error && (
          <div className="wizard-progress">
            <ButtonBusyMark size={28} />
            <p>Please wait — {step === "upload" ? "uploading / reading file" : step === "parse" ? "parsing report" : "finding guidance"}…</p>
          </div>
        )}

        {step === "error" && (
          <div className="editor-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>Close</button>
            {file && <button type="button" className="button button-primary" onClick={() => void startPipeline(file)}>Try again</button>}
          </div>
        )}

        {(step === "review" || step === "share") && editing && (
          <>
            <div className="editor-form">
              <label className="form-field"><span>Name *</span><input required value={editing.subject.name || ""} onChange={(e) => setEditing({ ...editing, subject: { ...editing.subject, name: e.target.value } })} /></label>
              <label className="form-field"><span>Email *</span><input required type="email" value={editing.subject.email || ""} onChange={(e) => setEditing({ ...editing, subject: { ...editing.subject, email: e.target.value } })} /></label>
              <label className="form-field"><span>Phone (WhatsApp)</span><input value={editing.subject.phone || ""} placeholder="0759…" onChange={(e) => setEditing({ ...editing, subject: { ...editing.subject, phone: e.target.value } })} /></label>
              <label className="form-field"><span>Age *</span><input required value={String(editing.subject.age ?? "")} onChange={(e) => setEditing({ ...editing, subject: { ...editing.subject, age: e.target.value } })} /></label>
              <label className="form-field">
                <span>Sex *</span>
                <select
                  required
                  value={editing.subject.sex || ""}
                  onChange={(e) => setEditing({ ...editing, subject: { ...editing.subject, sex: e.target.value } })}
                >
                  <option value="">Select…</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="form-field"><span>Test date</span><input value={editing.subject.testDate || ""} onChange={(e) => setEditing({ ...editing, subject: { ...editing.subject, testDate: e.target.value } })} /></label>
              <label className="form-field field-wide"><span>Conclusion — summary of what they are going through (English)</span><textarea rows={5} value={editing.simpleConclusion || ""} onChange={(e) => setEditing({ ...editing, simpleConclusion: e.target.value })} /></label>
              <label className="form-field field-wide"><span>Conclusion — Kiswahili summary</span><textarea rows={3} value={editing.simpleConclusionSw || ""} onChange={(e) => setEditing({ ...editing, simpleConclusionSw: e.target.value })} /></label>
              <label className="form-field field-wide">
                <span>{WEEK_ACTIONS_HEADING} — practical steps to help with this issue</span>
                {weekSlots.map((value, i) => (
                  <input
                    key={i}
                    style={{ marginTop: i ? 8 : 0 }}
                    value={value}
                    placeholder={`Step ${i + 1} this week`}
                    onChange={(e) => setWeekAction(i, e.target.value)}
                  />
                ))}
              </label>
              <label className="form-field field-wide">
                <span>Extra admin notes (full details report only)</span>
                <textarea
                  rows={3}
                  value={editing.adminNotes || ""}
                  onChange={(e) => setEditing({ ...editing, adminNotes: e.target.value })}
                  placeholder="More detail on what they are going through, follow-up, how to reach them…"
                />
              </label>
            </div>

            <div className="wizard-collapse" style={{ marginTop: 16 }}>
              <button type="button" className="wizard-collapse-toggle" onClick={() => setFlagsOpen((v) => !v)}>
                <span>Flags · edit as needed {matchedCount ? `(${matchedCount} bank matches)` : ""}</span>
                <ChevronDown size={18} className={flagsOpen ? "is-open" : ""} />
              </button>
              {flagsOpen && (
                <div className="wizard-collapse-body">
                  {editing.groups.map((group, gi) => (
                    <div key={group.id} style={{ marginBottom: 12 }}>
                      <h3 style={{ fontSize: 17 }}>{group.title}</h3>
                      {group.items.map((item, ii) => (
                        <div key={`${group.id}-${ii}`} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr 90px", gap: 8, marginBottom: 6 }}>
                          <input value={item.name} onChange={(e) => updateGroupItem(gi, ii, { name: e.target.value })} />
                          <input value={item.value || ""} placeholder="Value" onChange={(e) => updateGroupItem(gi, ii, { value: e.target.value })} />
                          <select value={item.flag} onChange={(e) => updateGroupItem(gi, ii, { flag: e.target.value as typeof item.flag })}>
                            <option value="green">green</option>
                            <option value="yellow">yellow</option>
                            <option value="red">red</option>
                            <option value="unknown">unknown</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  ))}
                  {!editing.groups.length && <p className="muted">No flag groups yet.</p>}
                </div>
              )}
            </div>

            <div className="wizard-collapse recommendations-field">
              <button type="button" className="wizard-collapse-toggle" onClick={() => setPickerOpen((v) => !v)}>
                <span>Recommended products · ({(editing.recommendations || []).length} selected)</span>
                <ChevronDown size={18} className={pickerOpen ? "is-open" : ""} />
              </button>
              {pickerOpen && (
                <div className="wizard-collapse-body">
                  <p className="muted" style={{ marginTop: 0 }}>
                    Suggested matches stay on top. Open Choose more to add or remove products.
                  </p>
                  <div className="product-pick-list product-pick-list-compact">
                    {(editing.recommendations || []).map((rec) => (
                      <div key={rec.code} className="product-pick-row is-checked">
                        <span className="product-pick-main">
                          <b>{rec.name || rec.code}</b>
                          <small>{rec.code} · {rec.concern || "Suggested"}</small>
                        </span>
                      </div>
                    ))}
                    {!(editing.recommendations || []).length && (
                      <p className="muted">No products selected yet.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ marginTop: 10 }}
                    onClick={() => setProductModalOpen(true)}
                  >
                    <Search size={16} /> Choose more products
                  </button>
                  {(editing.recommendations || []).length > 0 && (
                    <div className="selected-rec-notes">
                      <p className="eyebrow">Why for patient (optional)</p>
                      {(editing.recommendations || []).map((rec, index) => (
                        <label key={`${rec.code}-${index}`} className="form-field field-wide" style={{ marginBottom: 8 }}>
                          <span>{rec.name || rec.code}</span>
                          <input
                            value={rec.concern || ""}
                            placeholder="Why this product for them…"
                            onChange={(e) => {
                              const recommendations = (editing.recommendations || []).map((r, i) =>
                                i === index ? { ...r, concern: e.target.value } : r,
                              );
                              setEditing({ ...editing, recommendations });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {(step === "share" || step === "review") && (
              <div className="wizard-collapse report-quote-box">
                <button type="button" className="wizard-collapse-toggle" onClick={() => setQuoteOpen((v) => !v)}>
                  <span>Wellness product plan · prices (editable)</span>
                  <ChevronDown size={18} className={quoteOpen ? "is-open" : ""} />
                </button>
                {quoteOpen && (
                  <div className="wizard-collapse-body">
                    {pricedPreview && (editing.recommendations || []).length > 0 ? (
                      <>
                        <div className="report-quote-lines">
                          {pricedPreview.lines.map((line, index) => (
                            <div key={`${line.code}-${index}`} className="report-quote-row report-quote-row-price">
                              <div>
                                <b>{line.name}</b>
                                <small>{line.packSize} · admin {line.code}</small>
                              </div>
                              <label className="report-qty">
                                Price (KSh)
                                <input
                                  type="number"
                                  min={0}
                                  value={editing.recommendations?.[index]?.unitPrice ?? line.unitPrice}
                                  onChange={(e) => setEditing(withRecommendationUnitPrice(editing, index, Number(e.target.value)))}
                                />
                              </label>
                              <label className="report-qty">
                                Qty
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={editing.recommendations?.[index]?.qty || 1}
                                  onChange={(e) => setEditing(withRecommendationQty(editing, index, Number(e.target.value)))}
                                />
                              </label>
                              <strong>{line.lineTotalLabel}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="report-quote-total">
                          <span>Total payable</span>
                          <b>{pricedPreview.totalPayableLabel}</b>
                        </div>
                      </>
                    ) : (
                      <p className="muted">Tick products above to build the priced plan.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="patient-avatar-preview" aria-hidden>
              {isHttpUrl(editing.subject.photoUrl) ? (
                <img className="patient-avatar-circle" src={editing.subject.photoUrl} alt="" />
              ) : (
                <span className="patient-avatar-circle">{initialsFromName(editing.subject.name || "Patient")}</span>
              )}
              <small>
                {isHttpUrl(editing.subject.photoUrl) ? "Profile photo used on the PDF." : "Report mark uses initials until a profile photo is set."}
                {isHttpUrl(editing.sourceFilePath) ? " Source file is on Backblaze B2." : ""}
                {isHttpUrl(editing.reportPdfUrl) ? " Patient PDF is on Backblaze B2." : ""}
              </small>
            </div>
            {isHttpUrl(editing.reportPdfUrl) && (
              <p className="sync-note">
                Stored PDF:{" "}
                <a href={editing.reportPdfUrl} target="_blank" rel="noreferrer">Open patient report</a>
              </p>
            )}
            {isHttpUrl(editing.sourceFilePath) && (
              <p className="sync-note">
                Source file:{" "}
                <a href={editing.sourceFilePath} target="_blank" rel="noreferrer">Open original upload</a>
              </p>
            )}

            {(step === "review" || step === "share") && (
              <p className="muted" style={{ marginTop: 10 }}>
                Edit freely or leave the draft as matched. Use <b>Share + save to bank</b> (or <b>Save to bank</b>) so similar future questions reuse this answer.
              </p>
            )}

            {step === "review" && (
              <>
                <div className="wizard-action-bar">
                  <button type="button" className="button button-primary wizard-action-main" disabled={Boolean(actionBusy)} onClick={() => void shareAndSave(false)}>
                    {actionBusy === "share" ? <><ButtonBusyMark /> Sharing…</> : <>Proceed to share <ChevronRight size={16} /></>}
                  </button>
                  <div className={`wizard-more ${reviewMenuOpen ? "is-open" : ""}`} ref={reviewMenuRef}>
                    <button
                      type="button"
                      className="button button-secondary wizard-more-trigger"
                      disabled={Boolean(actionBusy)}
                      aria-expanded={reviewMenuOpen}
                      onClick={() => setReviewMenuOpen((v) => !v)}
                    >
                      More <ChevronDown size={16} />
                    </button>
                    {reviewMenuOpen && (
                      <div className="wizard-more-menu" role="menu">
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setReviewMenuOpen(false); void saveDraft(); }}>
                          {actionBusy === "draft" ? "Saving…" : "Save draft"}
                        </button>
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setReviewMenuOpen(false); void findBestAnswerAgain(); }}>
                          Find best answer again
                        </button>
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setReviewMenuOpen(false); void saveToBankOnly(); }}>
                          Save to bank
                        </button>
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setReviewMenuOpen(false); void shareAndSave(true); }}>
                          Share + save to bank
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="wizard-action-desktop">
                    <button type="button" className="button button-secondary" disabled={Boolean(actionBusy)} onClick={() => void saveDraft()}>
                      {actionBusy === "draft" ? <><ButtonBusyMark /> Saving…</> : "Save draft"}
                    </button>
                    <button type="button" className="button button-secondary" disabled={Boolean(actionBusy)} onClick={() => void findBestAnswerAgain()}>
                      {actionBusy === "rematch" ? <><ButtonBusyMark /> Matching…</> : <><Search size={16} /> Find best answer again</>}
                    </button>
                    {matchedCount === 0 && !geminiUsed && (
                      <button
                        type="button"
                        className="button button-secondary ghp-assist-button"
                        disabled={Boolean(actionBusy)}
                        title="Prepare a GHP draft when no saved match exists"
                        onClick={() => void findBestAnswerAgain()}
                      >
                        <GhpAssistLabel busy={actionBusy === "rematch"} />
                      </button>
                    )}
                    <button type="button" className="button button-secondary" disabled={Boolean(actionBusy)} onClick={() => void saveToBankOnly()}>
                      {actionBusy === "bank" ? <><ButtonBusyMark /> Saving…</> : "Save to bank"}
                    </button>
                    <button type="button" className="button button-primary" disabled={Boolean(actionBusy)} onClick={() => void shareAndSave(true)}>
                      {actionBusy === "share-bank" ? <><ButtonBusyMark /> Sharing…</> : "Share + save to bank"}
                    </button>
                  </div>
                </div>
                {(actionNote || actionError) && (
                  <div className="wizard-action-feedback">
                    {actionError && <p className="auth-error">{actionError}</p>}
                    {!actionError && actionNote && <p className="sync-note">{actionNote}</p>}
                  </div>
                )}
              </>
            )}

            {step === "share" && (
              <>
                <div className="wizard-action-bar wizard-share-bar">
                  <button type="button" className="button button-primary wizard-action-main" disabled={Boolean(actionBusy)} onClick={() => downloadPdf("simple")}>
                    <FileText size={16} /> Download report
                  </button>
                  <div className={`wizard-more ${shareMenuOpen ? "is-open" : ""}`} ref={shareMenuRef}>
                    <button
                      type="button"
                      className="button button-secondary wizard-more-trigger"
                      disabled={Boolean(actionBusy)}
                      aria-expanded={shareMenuOpen}
                      onClick={() => setShareMenuOpen((v) => !v)}
                    >
                      More actions <ChevronDown size={16} />
                    </button>
                    {shareMenuOpen && (
                      <div className="wizard-more-menu" role="menu">
                        <p className="wizard-more-label">Downloads</p>
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setShareMenuOpen(false); downloadPdf("simple"); }}>
                          Download report
                        </button>
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setShareMenuOpen(false); downloadPdf("full"); }}>
                          Download full details report
                        </button>
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setShareMenuOpen(false); downloadTxt(); }}>
                          Download TXT
                        </button>
                        <p className="wizard-more-label">Send</p>
                        {whatsappHref ? (
                          <a role="menuitem" href={whatsappHref} target="_blank" rel="noreferrer" onClick={() => setShareMenuOpen(false)}>
                            WhatsApp
                          </a>
                        ) : (
                          <button type="button" role="menuitem" disabled>WhatsApp (add phone)</button>
                        )}
                        {mailtoHref ? (
                          <a role="menuitem" href={mailtoHref} onClick={() => setShareMenuOpen(false)}>Email</a>
                        ) : (
                          <button type="button" role="menuitem" disabled>Email (add email)</button>
                        )}
                        <p className="wizard-more-label">Bank</p>
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setShareMenuOpen(false); void saveToBankOnly(); }}>
                          Save to bank
                        </button>
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setShareMenuOpen(false); void shareAndSave(true); }}>
                          {editing.learnApproved ? "Share + update bank" : "Share + save to bank"}
                        </button>
                        <p className="wizard-more-label">Navigate</p>
                        <button type="button" role="menuitem" disabled={Boolean(actionBusy)} onClick={() => { setShareMenuOpen(false); setStep("review"); }}>
                          Back to edit
                        </button>
                      </div>
                    )}
                  </div>
                  <button type="button" className="button button-primary wizard-action-main" disabled={Boolean(actionBusy)} onClick={onClose}>
                    <Share2 size={16} /> Done / next report
                  </button>

                  <div className="wizard-action-desktop wizard-share-desktop">
                    <div className="wizard-share-group">
                      <span className="wizard-more-label">Downloads</span>
                      <div className="wizard-share-row">
                        <button type="button" className="button button-primary" disabled={Boolean(actionBusy)} onClick={() => downloadPdf("simple")}>
                          <FileText size={16} /> Download report
                        </button>
                        <button type="button" className="button button-secondary" disabled={Boolean(actionBusy)} onClick={() => downloadPdf("full")}>
                          <FileText size={16} /> Full details report
                        </button>
                        <button type="button" className="button button-secondary" disabled={Boolean(actionBusy)} onClick={downloadTxt}>
                          <Download size={16} /> TXT
                        </button>
                      </div>
                    </div>
                    <div className="wizard-share-group">
                      <span className="wizard-more-label">Send</span>
                      <div className="wizard-share-row">
                        {whatsappHref ? (
                          <a className="button button-primary" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp</a>
                        ) : (
                          <button type="button" className="button button-secondary" disabled title="Add phone number first">WhatsApp</button>
                        )}
                        {mailtoHref ? (
                          <a className="button button-secondary" href={mailtoHref}><Mail size={16} /> Email</a>
                        ) : (
                          <button type="button" className="button button-secondary" disabled title="Add email first">Email</button>
                        )}
                      </div>
                    </div>
                    <div className="wizard-share-group">
                      <span className="wizard-more-label">Bank & finish</span>
                      <div className="wizard-share-row">
                        <button type="button" className="button button-secondary" disabled={Boolean(actionBusy)} onClick={() => void saveToBankOnly()}>
                          {actionBusy === "bank" ? <><ButtonBusyMark /> Saving…</> : "Save to bank"}
                        </button>
                        <button type="button" className="button button-primary" disabled={Boolean(actionBusy)} onClick={() => void shareAndSave(true)}>
                          {actionBusy === "share-bank"
                            ? <><ButtonBusyMark /> Sharing…</>
                            : (editing.learnApproved ? "Share + update bank" : "Share + save to bank")}
                        </button>
                        <button type="button" className="button button-secondary" disabled={Boolean(actionBusy)} onClick={() => setStep("review")}>Back to edit</button>
                        <button type="button" className="button button-primary" disabled={Boolean(actionBusy)} onClick={onClose}><Share2 size={16} /> Done / next report</button>
                      </div>
                    </div>
                  </div>
                </div>
                {(actionNote || actionError) && (
                  <div className="wizard-action-feedback">
                    {actionError && <p className="auth-error">{actionError}</p>}
                    {!actionError && actionNote && <p className="sync-note">{actionNote}</p>}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      {productModalOpen && editing && (
        <div className="help-sheet-backdrop product-pick-modal-backdrop" onClick={() => setProductModalOpen(false)}>
          <div
            className="help-sheet product-pick-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose products"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="help-sheet-bar">
              <div>
                <p className="eyebrow">Catalogue</p>
                <h2>Choose more products</h2>
              </div>
              <button type="button" className="icon-button help-sheet-close" aria-label="Close" onClick={() => setProductModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <p className="help-sheet-prompt">Suggested matches stay on top. Tick to add or remove.</p>
            <label className="admin-search product-pick-modal-search">
              <Search size={16} />
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Search catalogue by name, code, or category…"
                aria-label="Search products to recommend"
              />
            </label>
            <div className="help-sheet-list product-pick-modal-list">
              {pickerProducts.map((product) => {
                const code = product.code.toUpperCase();
                const checked = selectedCodes.has(code);
                const suggested = suggestedCodes.has(code);
                return (
                  <label key={product.id} className={`product-pick-row ${checked ? "is-checked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleProduct(product, e.target.checked)}
                    />
                    <span className="product-pick-main">
                      <b>{product.name}{suggested ? " · suggested" : ""}</b>
                      <small>{product.code} · {product.category} · {money(product.retailPrice)}</small>
                    </span>
                  </label>
                );
              })}
              {!pickerProducts.length && <p className="muted" style={{ padding: 14 }}>No products match this search.</p>}
            </div>
            <div className="help-sheet-actions">
              <button type="button" className="button button-primary" onClick={() => setProductModalOpen(false)}>
                Done ({(editing.recommendations || []).length} selected)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
