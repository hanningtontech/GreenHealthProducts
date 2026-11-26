import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { FileText } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import BrandMark from "@/components/BrandMark";
import SiteNavActions from "@/components/SiteNavActions";
import { findPatientByAuthUid } from "@/lib/patients";
import { getScreening, subscribeSharedScreeningsForPatient } from "@/lib/screenings";
import { buildPatientReport } from "@/lib/buildPatientReport";
import { downloadPatientReportPdf } from "@/lib/printPatientReport";
import { isHttpUrl } from "@/lib/mediaStorage";
import { isScreeningSeen, markScreeningSeen, screeningStamp } from "@/lib/patientNotifications";
import { patientFacingReportTitle } from "@/lib/patientReportTitle";
import { BUSINESS_CONTACT } from "@/lib/reportCopy";
import type { Screening } from "@/lib/screeningTypes";

function ReportWebView({ screening }: { screening: Screening }) {
  const report = useMemo(() => buildPatientReport(screening), [screening]);
  const headline = report.headline || patientFacingReportTitle(screening);
  return (
    <article className="patient-report-web">
      <header className="patient-report-head">
        <div className="patient-report-identity">
          <div>
            <p className="eyebrow">{report.title}</p>
            <h2>{headline}</h2>
            <small>
              {screening.subject.testDate || "—"}
              {screening.subject.age != null && screening.subject.age !== "" ? ` · age ${screening.subject.age}` : ""}
              {screening.subject.sex ? ` · ${screening.subject.sex}` : ""}
            </small>
          </div>
        </div>
        <div className="admin-header-actions">
          {isHttpUrl(screening.reportPdfUrl) && (
            <a className="button button-secondary" href={screening.reportPdfUrl} target="_blank" rel="noreferrer">
              <FileText size={16} /> Open stored PDF
            </a>
          )}
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              void downloadPatientReportPdf(screening, "simple").catch((err) => {
                window.alert(err instanceof Error ? err.message : "Could not download PDF");
              });
            }}
          >
            <FileText size={16} /> Download report
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              void downloadPatientReportPdf(screening, "full").catch((err) => {
                window.alert(err instanceof Error ? err.message : "Could not download PDF");
              });
            }}
          >
            <FileText size={16} /> Full details
          </button>
        </div>
      </header>

      <section>
        <h3>What this means</h3>
        <p className="patient-report-body">{report.simpleConclusion}</p>
        {report.fullConclusion ? (
          <details className="patient-report-body" style={{ marginTop: 12 }}>
            <summary>Full details</summary>
            <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{report.fullConclusion}</p>
          </details>
        ) : null}
        {report.simpleConclusionSw && (
          <div className="patient-report-sw">
            <b>{report.swLabel}</b>
            <p>{report.simpleConclusionSw}</p>
          </div>
        )}
        {report.fullConclusionSw ? (
          <p className="muted" style={{ marginTop: 8, fontSize: 13, whiteSpace: "pre-wrap" }}>{report.fullConclusionSw}</p>
        ) : null}
      </section>

      {report.weekActions.length > 0 && (
        <section>
          <h3>{report.weekActionsHeading}</h3>
          <ul>
            {report.weekActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </section>
      )}

      {report.priorityFindings.length > 0 && (
        <section>
          <h3>{report.findingsHeading}</h3>
          <div className="patient-findings">
            {report.priorityFindings.map((f, i) => (
              <div key={`${f.name}-${i}`} className={`patient-finding flag-${f.flag}`}>
                <div className="patient-finding-top">
                  <b>{f.name}</b>
                  <span>{f.flag}</span>
                </div>
                <small>{f.groupTitle}{f.value !== "—" ? ` · ${f.value}` : ""}</small>
                <p>{f.plainWords}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3>{report.planHeading}</h3>
        {report.lines.length ? (
          <div className="patient-plan-list">
            {report.lines.map((line, i) => (
              <div key={`${line.code}-${i}`} className="patient-plan-card">
                <div className="patient-plan-top">
                  <Link href={`/product/${line.code.toLowerCase()}`}><b>{line.name}</b></Link>
                  <strong>{line.lineTotalLabel}</strong>
                </div>
                <small>{line.packSize} · {line.unitPriceLabel} × {line.qty}</small>
                {(line.concern || line.role) && <p>{line.concern}{line.role ? ` — ${line.role}` : ""}</p>}
                <p style={{ marginTop: 12 }}><span className="eyebrow">How to use</span> {line.usage}</p>
                <p><span className="eyebrow">Cautions</span>{line.warnings}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No products on this plan — wellness guidance only.</p>
        )}
        {report.showPayment ? (
          <>
            <div className="patient-report-total">
              <span>Total payable</span>
              <b>{report.totalPayableLabel}</b>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>{report.paymentNote}</p>
          </>
        ) : null}
      </section>

      <section className="patient-report-contact">
        <h3>Contact us</h3>
        <div className="patient-contact-grid">
          <div><span>Email</span><b>{BUSINESS_CONTACT.email}</b></div>
          <div><span>Phone</span><b>{BUSINESS_CONTACT.phone}</b></div>
          <div>
            <span>WhatsApp</span>
            <b><a href={BUSINESS_CONTACT.whatsappUrl} target="_blank" rel="noreferrer">{BUSINESS_CONTACT.whatsappDisplay}</a></b>
          </div>
        </div>
      </section>

    </article>
  );
}

export default function PatientResults() {
  const { user, loading } = useAuthContext();
  const [, params] = useRoute("/results/:id");
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [single, setSingle] = useState<Screening | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const patient = await findPatientByAuthUid(user.uid);
        if (!patient) {
          if (!cancelled) setScreenings([]);
          return;
        }
        if (params?.id) {
          const item = await getScreening(params.id);
          const ok = item && item.status === "shared" && item.patientId === patient.id ? item : null;
          if (!cancelled) {
            setSingle(ok);
            if (ok) markScreeningSeen(ok.id);
          }
        } else {
          unsub = subscribeSharedScreeningsForPatient(patient.id, (list) => {
            if (cancelled) return;
            setScreenings(list);
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load results");
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user, params?.id]);

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
              <p className="admin-kicker">My results</p>
            </div>
            <SiteNavActions variant="patient" />
          </div>
        </header>
        <main className="container admin-main">
          <section className="auth-panel">
            <h1>My results</h1>
            <p>Sign in to view shared reports.</p>
            <Link href="/profile" className="button button-primary">Sign in</Link>
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
            <p className="admin-kicker">My results</p>
          </div>
          <SiteNavActions
            variant="patient"
            menuItems={[
              { href: "/", label: "Store", icon: "store" },
              { href: "/help", label: "Get help", icon: "help" },
              { href: "/profile", label: "My profile", icon: "profile" },
            ]}
          />
        </div>
      </header>
      <main className="container admin-main">
        {error && <p className="auth-error">{error}</p>}
        {params?.id ? (
          single ? <ReportWebView screening={single} /> : <p className="muted">Report not found or not shared yet.</p>
        ) : (
          <>
            <div className="page-intro">
              <p className="eyebrow">Shared with you</p>
              <h1>My results</h1>
              <p>Open a report to view it on the site or download the PDF.</p>
            </div>
            {screenings.length ? (
              <div className="patient-results-list">
                {screenings.map((item) => {
                  const unseen = !isScreeningSeen(item.id, screeningStamp(item));
                  const headline = patientFacingReportTitle(item);
                  return (
                    <Link
                      key={item.id}
                      href={`/results/${item.id}`}
                      className={`patient-result-card ${unseen ? "is-unread" : ""}`}
                    >
                      <span className="patient-avatar-circle" aria-hidden>{headline.slice(0, 1).toUpperCase() || "R"}</span>
                      <div>
                        <b>{headline}</b>
                        <small>{item.subject.testDate || "Shared"}{item.sourceIntakeId ? " · from your help note" : ""}</small>
                      </div>
                      {unseen ? <span className="nav-badge" style={{ position: "static" }}>new</span> : <span className="status status-good">shared</span>}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No shared reports yet. After you send a help note or we review a screening, it will show here.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
