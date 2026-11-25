import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { listPatients } from "@/lib/patients";
import {
  markIntakesAdminSeen,
  saveIntake,
  subscribeAllIntakes,
} from "@/lib/intakes";
import { ensureScreeningDraftFromIntake, withHelpFormGreenItems } from "@/lib/intakeToScreening";
import {
  draftFromContentBank,
  draftIntakeFromContentBank,
  withBankMatchMeta,
} from "@/lib/replyFromBank";
import { getScreening, saveScreening, subscribeAllScreenings } from "@/lib/screenings";
import { formatIntakeDate } from "@/lib/intakeSummary";
import { initialsFromName } from "@/lib/patientAvatar";
import {
  buildConversationThreads,
  formatRelativeActivity,
  type ConversationThread,
} from "@/lib/conversationThreads";
import { loadAdminHelpUi, saveAdminHelpUi } from "@/lib/adminUiState";
import type { Intake, Patient, Screening } from "@/lib/screeningTypes";
import ScreeningWizard from "@/pages/ScreeningWizard";

type ListFilter = "all" | "unread" | "open";

function ExpandableText({
  text,
  limit = 90,
  className = "help-body",
}: {
  text: string;
  limit?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const value = (text || "").trim();
  if (!value) return null;
  const needsToggle = value.length > limit;
  const shown = !needsToggle || expanded ? value : `${value.slice(0, limit).trimEnd()}…`;
  return (
    <div className={`admin-chat-expand ${expanded ? "is-open" : ""}`}>
      <p className={className}>{shown}</p>
      {needsToggle && (
        <button
          type="button"
          className="admin-chat-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function conversationHeading(thread: ConversationThread): string {
  const latest = [...thread.items].reverse().find((item) => {
    if (item.kind === "intake" && item.intake) {
      return Boolean(item.intake.title || item.intake.summary || (item.intake.concerns || []).length);
    }
    if (item.kind === "screening" && item.screening) {
      return Boolean(item.preview || item.screening.simpleConclusion);
    }
    return false;
  });
  if (latest?.kind === "intake" && latest.intake) {
    return latest.intake.title
      || (latest.intake.concerns || []).slice(0, 2).join(" · ")
      || latest.intake.summary
      || "Help conversation";
  }
  if (latest?.kind === "screening" && latest.screening) {
    return latest.preview || latest.screening.subject?.name || "Screening";
  }
  return thread.lastPreview || "Conversation";
}

export default function AdminHelpInbox() {
  const savedUi = useMemo(() => loadAdminHelpUi(), []);
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<ListFilter>(() => savedUi.filter || "all");
  const [query, setQuery] = useState(() => savedUi.query || "");
  const [selectedKey, setSelectedKey] = useState<string | null>(() => savedUi.selectedKey || null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(() => Boolean(savedUi.mobileThreadOpen));
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardScreening, setWizardScreening] = useState<Screening | null>(null);
  const threadBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubIntakes = subscribeAllIntakes(setIntakes);
    const unsubScreenings = subscribeAllScreenings(setScreenings);
    void listPatients().then(setPatients);
    return () => {
      unsubIntakes();
      unsubScreenings();
    };
  }, []);

  useEffect(() => {
    saveAdminHelpUi({ filter, query, selectedKey, mobileThreadOpen });
  }, [filter, query, selectedKey, mobileThreadOpen]);

  const threads = useMemo(
    () => buildConversationThreads(intakes, screenings, patients),
    [intakes, screenings, patients],
  );

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((thread) => {
      if (filter === "unread" && thread.unreadCount <= 0) return false;
      if (filter === "open" && !(thread.hasPending || thread.hasInReview)) return false;
      if (!q) return true;
      const hay = `${thread.displayName} ${thread.email || ""} ${thread.phone || ""} ${thread.lastPreview}`.toLowerCase();
      return hay.includes(q);
    });
  }, [threads, filter, query]);

  const selected = useMemo(
    () => threads.find((t) => t.key === selectedKey) || null,
    [threads, selectedKey],
  );

  useEffect(() => {
    const el = threadBodyRef.current;
    if (!el || !selectedKey) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [selectedKey, selected?.items.length, selected?.lastActivityAt]);

  const openThread = async (thread: ConversationThread) => {
    setSelectedKey(thread.key);
    setMobileThreadOpen(true);
    setNote("");
    const pendingUnread = thread.items
      .filter((item) => item.kind === "intake" && item.intake)
      .map((item) => item.intake!)
      .filter((intake) => intakeNeedsAdminSeen(intake));
    if (pendingUnread.length) {
      try {
        await markIntakesAdminSeen(pendingUnread);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not mark conversation read";
        setNote(message);
        toast.error(message);
      }
    }
  };

  const openIntakeInWizard = async (intake: Intake) => {
    setBusy("Opening report wizard…");
    setNote("");
    try {
      let screening = await ensureScreeningDraftFromIntake(intake);

      // Initial bank draft only when empty — retry lives in the wizard.
      if (!(screening.recommendations || []).length && !(screening.simpleConclusion || "").trim()) {
        const intakeDraft = await draftIntakeFromContentBank(intake);
        const bankDraft = await draftFromContentBank({
          ...screening,
          simpleConclusion: screening.simpleConclusion || intakeDraft.reply,
          simpleConclusionSw: screening.simpleConclusionSw || intakeDraft.replySw,
          recommendations: intakeDraft.recommendations,
        });
        const recommendations = (bankDraft.recommendations.length
          ? bankDraft.recommendations
          : intakeDraft.recommendations).map((r) => ({ ...r, qty: r.qty || 1 }));
        const matchedIds = bankDraft.matchedCaseIds.length
          ? bankDraft.matchedCaseIds
          : intakeDraft.matchedCaseIds;
        screening = {
          ...screening,
          ...withBankMatchMeta(matchedIds),
          simpleConclusion: bankDraft.conclusion || intakeDraft.reply || screening.simpleConclusion,
          simpleConclusionSw: bankDraft.conclusionSw || intakeDraft.replySw || screening.simpleConclusionSw,
          bankDraftConclusion: bankDraft.conclusion,
          bankDraftConclusionSw: bankDraft.conclusionSw,
          recommendations,
          bankDraftRecommendations: recommendations,
        };
        await saveScreening(screening);
      }

      await saveIntake({
        ...intake,
        patientId: screening.patientId || intake.patientId,
        screeningId: screening.id,
        status: intake.status === "pending" ? "in_review" : intake.status,
        adminSeenAt: intake.adminSeenAt || Date.now(),
      });

      const enriched = withHelpFormGreenItems(screening);
      if (enriched !== screening) await saveScreening(enriched);
      setWizardScreening(enriched);
      setWizardOpen(true);
      setNote("Review like an uploaded report, then share.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not open wizard";
      setNote(message);
      toast.error(message);
    } finally {
      setBusy("");
    }
  };

  const openScreeningInWizard = async (screeningId: string) => {
    setBusy("Opening screening…");
    setNote("");
    try {
      const item = await getScreening(screeningId);
      if (!item) throw new Error("Screening not found");
      const enriched = withHelpFormGreenItems(item);
      if (enriched !== item) await saveScreening(enriched);
      setWizardScreening(enriched);
      setWizardOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not open screening";
      setNote(message);
      toast.error(message);
    } finally {
      setBusy("");
    }
  };

  const unreadConversations = threads.filter((t) => t.unreadCount > 0).length;
  const openConversations = threads.filter((t) => t.hasPending || t.hasInReview).length;

  return (
    <div className="admin-section">
      <div className="admin-intro">
        <div>
          <p className="eyebrow">Patients</p>
          <h1>Conversations</h1>
          <p>
            One chat per person — search by name, open the thread, then review each issue in the wizard.
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void listPatients().then(setPatients)}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {note && <p className="sync-note">{note}</p>}
      {busy && <p className="muted">{busy}</p>}

      <div className={`admin-chat-layout ${mobileThreadOpen && selected ? "thread-open" : ""}`}>
        <aside className="admin-chat-list-pane">
          <div className="admin-toolbar admin-chat-toolbar">
            <label className="admin-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, phone…"
                aria-label="Search conversations"
              />
            </label>
          </div>

          <div className="auth-tabs" style={{ marginBottom: 12 }}>
            <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
              All ({threads.length})
            </button>
            <button type="button" className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>
              Unread ({unreadConversations})
            </button>
            <button type="button" className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>
              Open ({openConversations})
            </button>
          </div>

          <div className="admin-chat-list" role="list">
            {visibleThreads.map((thread) => {
              const active = thread.key === selectedKey;
              const heading = conversationHeading(thread);
              return (
                <button
                  key={thread.key}
                  type="button"
                  role="listitem"
                  className={`admin-chat-row ${active ? "is-active" : ""} ${thread.unreadCount ? "is-unread" : ""}`}
                  onClick={() => void openThread(thread)}
                >
                  <span className="admin-chat-avatar">{initialsFromName(thread.displayName)}</span>
                  <span className="admin-chat-row-main">
                    <span className="admin-chat-row-top">
                      <b>{thread.displayName}</b>
                      <small>{formatRelativeActivity(thread.lastActivityAt)}</small>
                    </span>
                    <span className="admin-chat-row-heading">{heading}</span>
                    <span className="admin-chat-row-preview">{thread.lastPreview || "No messages yet"}</span>
                    <span className="admin-chat-row-meta">
                      {thread.hasPending && <span className="admin-chat-chip pending">pending</span>}
                      {thread.hasInReview && <span className="admin-chat-chip review">in review</span>}
                      {thread.hasShared && <span className="admin-chat-chip shared">shared</span>}
                      {thread.hasAnswered && !thread.hasPending && !thread.hasInReview && (
                        <span className="admin-chat-chip answered">answered</span>
                      )}
                    </span>
                  </span>
                  {thread.unreadCount > 0 && (
                    <span className="admin-chat-unread">{thread.unreadCount > 99 ? "99+" : thread.unreadCount}</span>
                  )}
                </button>
              );
            })}
            {!visibleThreads.length && (
              <p className="muted" style={{ padding: "12px 4px" }}>
                {filter === "unread"
                  ? "No unread conversations."
                  : filter === "open"
                    ? "No open conversations."
                    : "No conversations yet."}
              </p>
            )}
          </div>
        </aside>

        <section className="admin-chat-thread-pane" aria-live="polite">
          {!selected ? (
            <div className="admin-chat-empty">
              <p className="eyebrow">Thread</p>
              <h2>Select a patient</h2>
              <p className="muted">Their help notes and screenings appear here like a chat.</p>
            </div>
          ) : (
            <>
              <div className="admin-chat-thread-head">
                <button
                  type="button"
                  className="icon-button admin-chat-back"
                  aria-label="Back to conversations"
                  onClick={() => setMobileThreadOpen(false)}
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="admin-chat-avatar">{initialsFromName(selected.displayName)}</span>
                <div>
                  <b>{selected.displayName}</b>
                  <small>
                    {conversationHeading(selected)}
                    {selected.email ? ` · ${selected.email}` : ""}
                    {selected.phone ? ` · ${selected.phone}` : ""}
                  </small>
                </div>
              </div>

              <div className="admin-chat-thread-body" ref={threadBodyRef}>
                {selected.items.map((item) => {
                  if (item.kind === "intake" && item.intake) {
                    const intake = item.intake;
                    const heading = intake.title
                      || (intake.concerns || []).slice(0, 2).join(" · ")
                      || "Help note";
                    return (
                      <article key={`intake-${intake.id}`} className={`admin-chat-bubble from-patient ${intake.status === "pending" ? "is-pending" : ""}`}>
                        <div className="admin-chat-bubble-meta">
                          <span className="eyebrow">Help note</span>
                          <span className={`status ${intake.status === "answered" ? "status-good" : ""}`}>{intake.status.replace(/_/g, " ")}</span>
                          <small>{formatIntakeDate(intake.createdAt)}</small>
                        </div>
                        <h3 className="admin-chat-bubble-title">{heading}</h3>
                        <p className="admin-chat-bubble-sub">
                          {intake.language === "sw" ? "Kiswahili" : "English"}
                          {(intake.concerns || []).length ? ` · ${(intake.concerns || []).length} issue(s)` : ""}
                        </p>
                        <ExpandableText
                          text={[
                            intake.summary || "",
                            intake.freeText || "",
                          ].filter(Boolean).join("\n\n")}
                          limit={90}
                        />
                        <div className="editor-actions admin-chat-bubble-actions">
                          <button type="button" className="button button-primary" onClick={() => void openIntakeInWizard(intake)}>
                            Open in wizard
                          </button>
                          {intake.screeningId && (
                            <button type="button" className="button button-secondary" onClick={() => void openScreeningInWizard(intake.screeningId!)}>
                              Open linked screening
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  }
                  if (item.kind === "screening" && item.screening) {
                    const screening = item.screening;
                    const heading = sanitizePreview(screening.simpleConclusion || item.preview || "Screening").slice(0, 72)
                      || "Screening";
                    const detail = [
                      item.preview,
                      sanitizePreview(screening.simpleConclusion || ""),
                    ].filter(Boolean).join("\n\n");
                    return (
                      <article key={`screening-${screening.id}`} className={`admin-chat-bubble from-system ${screening.status === "shared" ? "is-shared" : ""}`}>
                        <div className="admin-chat-bubble-meta">
                          <span className="eyebrow">Screening</span>
                          <span className={`status ${screening.status === "shared" ? "status-good" : ""}`}>{screening.status}</span>
                          <small>{screening.subject?.testDate || formatRelativeActivity(item.activityAt)}</small>
                        </div>
                        <h3 className="admin-chat-bubble-title">{heading}{heading.length >= 72 ? "…" : ""}</h3>
                        <ExpandableText text={detail || screening.status} limit={90} />
                        <div className="editor-actions admin-chat-bubble-actions">
                          <button type="button" className="button button-primary" onClick={() => void openScreeningInWizard(screening.id)}>
                            Open in wizard
                          </button>
                        </div>
                      </article>
                    );
                  }
                  return null;
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <ScreeningWizard
        open={wizardOpen}
        initial={wizardScreening}
        onClose={() => {
          setWizardOpen(false);
          setWizardScreening(null);
        }}
        onSaved={() => {
          /* live subscriptions refresh threads */
        }}
      />
    </div>
  );
}

function intakeNeedsAdminSeen(intake: Intake): boolean {
  return intake.status === "pending" && !intake.adminSeenAt;
}

function sanitizePreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
