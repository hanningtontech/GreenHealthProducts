import { useEffect, useMemo, useState } from "react";
import { CloudUpload, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { getScreening, listAllScreenings, saveScreening } from "@/lib/screenings";
import { withHelpFormGreenItems } from "@/lib/intakeToScreening";
import { loadAdminScreeningsUi, saveAdminScreeningsUi } from "@/lib/adminUiState";
import type { Screening } from "@/lib/screeningTypes";
import ScreeningWizard from "@/pages/ScreeningWizard";

type LayoutTab = "drafts" | "shared" | "pending";
type PageSize = 10 | 20 | 50;

const PAGE_SIZES: PageSize[] = [10, 20, 50];

function matchesTab(item: Screening, tab: LayoutTab): boolean {
  if (tab === "drafts") return item.status === "draft";
  if (tab === "shared") return item.status === "shared";
  // Pending: still parsing, or archived / other non-draft non-shared
  return item.status === "parsing" || item.status === "archived" || (item.status !== "draft" && item.status !== "shared");
}

/** Normalize test/created date to YYYY-MM-DD for range filters. */
function screeningDateKey(item: Screening): string {
  const raw = String(item.subject?.testDate || "").trim();
  if (!raw) return "";
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${month}-${day}`;
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return "";
}

export default function AdminScreeningsPanel() {
  const savedUi = useMemo(() => loadAdminScreeningsUi(), []);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [wizardFile, setWizardFile] = useState<File | null>(null);
  const [wizardScreening, setWizardScreening] = useState<Screening | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<LayoutTab>(() => savedUi.tab || "drafts");
  const [nameQuery, setNameQuery] = useState(() => savedUi.nameQuery || "");
  const [dateFrom, setDateFrom] = useState(() => savedUi.dateFrom || "");
  const [dateTo, setDateTo] = useState(() => savedUi.dateTo || "");
  const [pageSize, setPageSize] = useState<PageSize>(() => savedUi.pageSize || 10);
  const [page, setPage] = useState(() => savedUi.page || 1);

  const reload = async () => {
    setBusy(true);
    try {
      setScreenings(await listAllScreenings());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load screenings");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    saveAdminScreeningsUi({ tab, nameQuery, dateFrom, dateTo, pageSize, page });
  }, [tab, nameQuery, dateFrom, dateTo, pageSize, page]);

  const counts = useMemo(() => ({
    drafts: screenings.filter((s) => matchesTab(s, "drafts")).length,
    shared: screenings.filter((s) => matchesTab(s, "shared")).length,
    pending: screenings.filter((s) => matchesTab(s, "pending")).length,
  }), [screenings]);

  const filtered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return screenings.filter((item) => {
      if (!matchesTab(item, tab)) return false;
      if (q) {
        const hay = `${item.subject?.name || ""} ${item.subject?.email || ""} ${item.subject?.phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const key = screeningDateKey(item);
      if (dateFrom || dateTo) {
        if (!key) return false;
        if (dateFrom && key < dateFrom) return false;
        if (dateTo && key > dateTo) return false;
      }
      return true;
    });
  }, [screenings, tab, nameQuery, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [tab, nameQuery, dateFrom, dateTo, pageSize]);

  const openWizardWithFile = (file?: File | null) => {
    if (!file) return;
    setWizardScreening(null);
    setWizardFile(file);
    setWizardOpen(true);
  };

  const openWizardWithScreening = async (id: string) => {
    const item = await getScreening(id);
    if (!item) return;
    const enriched = withHelpFormGreenItems(item);
    if (enriched !== item) {
      try {
        await saveScreening(enriched);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update screening colours");
      }
    }
    setWizardFile(null);
    setWizardScreening(enriched);
    setWizardOpen(true);
  };

  const tabTitle =
    tab === "drafts" ? "Drafts" : tab === "shared" ? "Shared results" : "Pending / other";

  const emptyCopy =
    tab === "drafts"
      ? "No drafts. Upload a report to create one."
      : tab === "shared"
        ? "No shared screenings yet."
        : "Nothing pending (parsing or archived).";

  return (
    <div className="admin-section">
      <div className="admin-intro">
        <div>
          <p className="eyebrow">Patients</p>
          <h1>Screenings</h1>
          <p>Upload a PDF or TXT, review the draft, then share.</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void reload()} disabled={busy}>
          <RefreshCw size={16} /> {busy ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="upload-row" style={{ marginBottom: 16 }}>
        <label className="button button-primary upload-button">
          <CloudUpload size={16} /> Upload PDF or TXT
          <input
            type="file"
            accept="application/pdf,text/plain,.txt,.md"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              openWizardWithFile(f);
            }}
          />
        </label>
      </div>

      <div className="auth-tabs screening-layout-tabs" style={{ marginBottom: 14 }}>
        <button type="button" className={tab === "drafts" ? "active" : ""} onClick={() => setTab("drafts")}>
          Drafts ({counts.drafts})
        </button>
        <button type="button" className={tab === "shared" ? "active" : ""} onClick={() => setTab("shared")}>
          Shared ({counts.shared})
        </button>
        <button type="button" className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
          Pending ({counts.pending})
        </button>
      </div>

      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={16} />
          <input
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Search by patient name, email, phone…"
            aria-label="Search screenings by name"
          />
        </label>
        <label className="admin-date-filter">
          <span>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Test date from" />
        </label>
        <label className="admin-date-filter">
          <span>To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Test date to" />
        </label>
        {(dateFrom || dateTo || nameQuery) && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setNameQuery("");
              setDateFrom("");
              setDateTo("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <section className={`admin-panel screening-layout screening-layout-${tab}`}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{tab === "drafts" ? "Review & edit" : tab === "shared" ? "Patient-visible" : "Needs attention"}</p>
            <h2>{tabTitle}</h2>
          </div>
          <span className="muted">
            Showing {(safePage - 1) * pageSize + (pageItems.length ? 1 : 0)}–{(safePage - 1) * pageSize + pageItems.length} of {filtered.length}
          </span>
        </div>

        <div className="admin-product-list">
          {pageItems.map((item) => (
            <div className={`admin-product-row admin-list-row-3 screening-row screening-row-${item.status}`} key={item.id}>
              <div className="admin-product-name">
                <b>{item.subject?.name || item.id}</b>
                <small>
                  {item.subject?.email || "no email"} · {item.subject?.phone || "no phone"} · {item.subject?.testDate || "No test date"} · {item.status}
                </small>
              </div>
              <span className={`status ${item.status === "shared" ? "status-good" : item.status === "draft" ? "" : "status-warn"}`}>
                {item.status}
              </span>
              <button type="button" className="button button-secondary" onClick={() => void openWizardWithScreening(item.id)}>
                {tab === "shared" ? "Open / share" : "Open"}
              </button>
            </div>
          ))}
          {!pageItems.length && <p className="muted">{emptyCopy}</p>}
        </div>

        <div className="admin-pagination">
          <div className="admin-page-size">
            <span className="muted">Per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
              aria-label="Screenings per page"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button type="button" className="button button-secondary" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <span className="muted">Page {safePage} / {totalPages}</span>
          <button type="button" className="button button-secondary" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </button>
        </div>
      </section>

      <ScreeningWizard
        open={wizardOpen}
        file={wizardFile}
        initial={wizardScreening}
        onClose={() => {
          setWizardOpen(false);
          setWizardFile(null);
          setWizardScreening(null);
        }}
        onSaved={() => void reload()}
      />
    </div>
  );
}
