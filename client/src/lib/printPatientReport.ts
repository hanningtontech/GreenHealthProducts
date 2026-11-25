import { jsPDF } from "jspdf";
import { buildPatientReport, type PatientReportModel, type ReportVariant } from "@/lib/buildPatientReport";
import { buildAvatarDataUrl } from "@/lib/patientAvatar";
import type { Screening } from "@/lib/screeningTypes";
import { WELLNESS_DISCLAIMER } from "@/lib/screeningTypes";

const FOREST: [number, number, number] = [29, 77, 58];
const GOLD: [number, number, number] = [216, 166, 78];
const TERRACOTTA: [number, number, number] = [183, 102, 69];
const INK: [number, number, number] = [23, 53, 43];
const MUTED: [number, number, number] = [108, 122, 112];
const LINE: [number, number, number] = [223, 229, 221];

const MARGIN_X = 14;
const HEADER_H = 28;
const FOOTER_H = 18;
const CONTENT_TOP = 36;
/** Inner padding so text never sits on box borders. */
const PAD = 4;

function contentWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth() - MARGIN_X * 2;
}

function wrapLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(String(text || ""), Math.max(10, maxWidth)) as string[];
}

function pageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - FOOTER_H;
}

/** Lucide-style leaf mark in the PDF header (matches site BrandMark). */
function drawLeafLogo(doc: jsPDF, x: number, y: number, size = 12) {
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, size, size, 2, 2, "F");
  const cx = x + size / 2;
  const cy = y + size / 2 + 0.4;
  doc.setFillColor(...FOREST);
  doc.ellipse(cx + 0.3, cy, 3.2, 4.4, "F");
  doc.setDrawColor(...FOREST);
  doc.setLineWidth(0.45);
  doc.line(cx - 0.2, cy + 4.2, cx - 0.2, cy + 5.4);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.line(cx + 0.2, cy - 3.2, cx - 0.1, cy + 3.6);
  doc.setLineWidth(0.25);
  doc.line(cx + 0.15, cy - 1.2, cx + 2.2, cy - 0.2);
  doc.line(cx + 0.05, cy + 0.6, cx + 2.0, cy + 1.4);
  doc.line(cx + 0.0, cy + 2.2, cx + 1.6, cy + 2.8);
}

function newContentPage(doc: jsPDF, model: PatientReportModel): number {
  doc.addPage();
  drawHeader(doc, model);
  return CONTENT_TOP;
}

function ensureSpace(doc: jsPDF, model: PatientReportModel, y: number, need: number): number {
  if (y + need <= pageBottom(doc)) return y;
  return newContentPage(doc, model);
}

function drawHeader(doc: jsPDF, model: PatientReportModel) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...FOREST);
  doc.rect(0, 0, pageW, HEADER_H, "F");
  drawLeafLogo(doc, 10, 7, 12);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("GreenHealthProducts", 26, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(model.title, 26, 21);
}

function drawFooter(doc: jsPDF, model: PatientReportModel, page: number, total: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, pageH - FOOTER_H + 2, pageW - MARGIN_X, pageH - FOOTER_H + 2);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`${model.businessName} · ${model.contactPhone}`, MARGIN_X, pageH - 8);
  doc.text(`Page ${page} of ${total}`, pageW - MARGIN_X, pageH - 8, { align: "right" });
}

function sectionTitle(
  doc: jsPDF,
  model: PatientReportModel,
  title: string,
  y: number,
): number {
  y = ensureSpace(doc, model, y, 12);
  const maxW = contentWidth(doc);
  doc.setTextColor(...FOREST);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, MARGIN_X, y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.55);
  doc.line(MARGIN_X, y + 2.2, MARGIN_X + maxW, y + 2.2);
  return y + 9;
}

/** Draw a stroked box and return the y where content should start (inside padding). */
function beginBox(
  doc: jsPDF,
  x: number,
  top: number,
  w: number,
  h: number,
  opts?: { fill?: [number, number, number]; accent?: [number, number, number] },
): number {
  if (opts?.fill) {
    doc.setFillColor(...opts.fill);
    doc.rect(x, top, w, h, "F");
  }
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.35);
  doc.rect(x, top, w, h, "S");
  if (opts?.accent) {
    doc.setFillColor(...opts.accent);
    doc.rect(x, top, 2.2, h, "F");
  }
  return top + PAD + 2;
}

function drawWrappedInBox(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): number {
  const lines = wrapLines(doc, text, maxW);
  for (const line of lines) {
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}

function drawContactBlock(doc: jsPDF, model: PatientReportModel, y: number): number {
  const maxW = contentWidth(doc);
  const contactH = 30;
  y = ensureSpace(doc, model, y, contactH + 4);
  const cTop = y - 2;
  beginBox(doc, MARGIN_X, cTop, maxW, contactH, { fill: [255, 253, 248] });
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.7);
  doc.line(MARGIN_X, cTop, MARGIN_X + maxW, cTop);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...FOREST);
  doc.text(model.contactHeading, MARGIN_X + PAD, cTop + PAD + 3);

  const third = (maxW - PAD * 2) / 3;
  const contacts = [
    { label: "EMAIL", value: model.contactEmail },
    { label: "PHONE", value: model.contactPhone },
    { label: "WHATSAPP", value: model.whatsappDisplay },
  ];
  contacts.forEach((c, i) => {
    const x = MARGIN_X + PAD + i * third;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(c.label, x, cTop + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    const vals = wrapLines(doc, c.value, third - 3);
    let vy = cTop + 19;
    for (const v of vals.slice(0, 2)) {
      doc.text(v, x, vy);
      vy += 4;
    }
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...FOREST);
  doc.text(model.whatsappUrl, MARGIN_X + PAD + third * 2, cTop + contactH - 4);
  return cTop + contactH + 8;
}

/**
 * Build the branded multi-page PDF document (shared by download + B2 upload).
 * Patient-facing product lines never show W-codes.
 * variant "simple" = Report; "full" = Full details report.
 */
async function buildPatientReportPdfDoc(
  screening: Screening,
  variant: ReportVariant = "simple",
): Promise<{
  doc: jsPDF;
  safeName: string;
}> {
  const model = buildPatientReport(screening, undefined, variant);
  const avatarDataUrl = buildAvatarDataUrl(model.subject.name || "Patient");
  const isFull = model.variant === "full";

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = contentWidth(doc);
  let y = CONTENT_TOP;

  drawHeader(doc, model);

  // Avatar + identity row
  const avatarSize = 18;
  if (avatarDataUrl) {
    try {
      doc.addImage(avatarDataUrl, "PNG", MARGIN_X, y - 2, avatarSize, avatarSize);
    } catch {
      // ignore
    }
  }
  const idX = MARGIN_X + avatarSize + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(model.subject.name || "Patient", idX, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `${model.subject.age ?? "—"} · ${model.subject.sex || "—"} · Test ${model.testDate}${model.testTime ? ` · ${model.testTime}` : ""}`,
    idX,
    y + 11,
  );
  y += avatarSize + 6;

  // Meta card
  const metaPairs: Array<[string, string]> = [
    ["Report ID", model.reportId],
    ["Prepared by", model.preparedBy],
    ["Phone", model.subject.phone || "—"],
    ["Email", model.subject.email || "—"],
    ["Generated", model.generatedAt],
    ["", ""],
  ];
  const colW = (maxW - PAD * 2 - 4) / 2;
  doc.setFontSize(9);
  const cellHs = metaPairs.map((pair) => {
    if (!pair[0]) return 0;
    return Math.max(9, 5 + wrapLines(doc, pair[1], colW - 2).length * 4);
  });
  let metaH = PAD * 2;
  for (let r = 0; r < 3; r++) metaH += Math.max(cellHs[r * 2] || 0, cellHs[r * 2 + 1] || 0);
  y = ensureSpace(doc, model, y, metaH + 4);
  const metaTop = y - 2;
  beginBox(doc, MARGIN_X, metaTop, maxW, metaH);
  let rowY = metaTop + PAD + 3;
  for (let r = 0; r < 3; r++) {
    const h = Math.max(cellHs[r * 2] || 0, cellHs[r * 2 + 1] || 0);
    for (let c = 0; c < 2; c++) {
      const pair = metaPairs[r * 2 + c];
      if (!pair?.[0]) continue;
      const x = MARGIN_X + PAD + c * (colW + 4);
      doc.setTextColor(...MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text(pair[0].toUpperCase(), x, rowY);
      doc.setTextColor(...INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      drawWrappedInBox(doc, pair[1], x, rowY + 3.8, colW - 2, 3.8);
    }
    rowY += h;
  }
  y = metaTop + metaH + 8;

  y = sectionTitle(doc, model, "What this means", y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  for (const line of wrapLines(doc, model.simpleConclusion, maxW)) {
    y = ensureSpace(doc, model, y, 6);
    doc.text(line, MARGIN_X, y);
    y += 5;
  }
  y += 2;

  if (model.simpleConclusionSw) {
    const swLines = wrapLines(doc, model.simpleConclusionSw, maxW - PAD * 2);
    const boxH = PAD * 2 + 6 + swLines.length * 4.5;
    y = ensureSpace(doc, model, y, boxH + 4);
    const top = y - 2;
    beginBox(doc, MARGIN_X, top, maxW, boxH, { fill: [223, 233, 219] });
    let ty = top + PAD + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...FOREST);
    doc.text(model.swLabel, MARGIN_X + PAD, ty);
    ty += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    for (const line of swLines) {
      doc.text(line, MARGIN_X + PAD, ty);
      ty += 4.5;
    }
    y = top + boxH + 6;
  }

  y = ensureSpace(doc, model, y, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...FOREST);
  doc.text(model.weekActionsHeading, MARGIN_X, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (model.weekActions.length) {
    for (const action of model.weekActions) {
      for (const line of wrapLines(doc, `• ${action}`, maxW)) {
        y = ensureSpace(doc, model, y, 5);
        doc.setTextColor(...INK);
        doc.text(line, MARGIN_X, y);
        y += 4.5;
      }
    }
  } else {
    doc.setTextColor(...MUTED);
    doc.text("Follow the product plan below and the advice in your summary.", MARGIN_X, y);
    y += 6;
  }
  y += 4;

  if (isFull) {
    y = ensureSpace(doc, model, y, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...FOREST);
    doc.text("How to read the colours", MARGIN_X, y);
    y += 6;
    const keys: Array<{ rgb: [number, number, number]; text: string }> = [
      { rgb: [95, 143, 106], text: model.flagKey.green },
      { rgb: GOLD, text: model.flagKey.yellow },
      { rgb: TERRACOTTA, text: model.flagKey.red },
    ];
    for (const key of keys) {
      const lines = wrapLines(doc, key.text, maxW - 8);
      y = ensureSpace(doc, model, y, lines.length * 4 + 3);
      doc.setFillColor(...key.rgb);
      doc.rect(MARGIN_X, y - 2.5, 2.2, Math.max(4, lines.length * 4 - 1), "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      for (const line of lines) {
        doc.text(line, MARGIN_X + 5, y);
        y += 4;
      }
      y += 2;
    }

    // Findings — greens first, then yellow/red priority
    y = newContentPage(doc, model);
    y = sectionTitle(doc, model, model.findingsHeading, y);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `${model.greenCount} green · ${model.yellowCount} yellow · ${model.redCount} red`,
      MARGIN_X,
      y,
    );
    y += 7;

    const drawFindingCard = (f: (typeof model.priorityFindings)[number], compact: boolean) => {
      const innerW = maxW - PAD * 2 - 4;
      const nameLines = wrapLines(doc, f.name, innerW - 18);
      const metaLine = wrapLines(
        doc,
        `${f.groupTitle} · Result: ${f.value} · Usual range: ${f.normalRange}`,
        innerW,
      );
      const plain = compact
        ? []
        : wrapLines(doc, `In plain words: ${f.plainWords}`, innerW);
      const blockH = PAD * 2 + 2 + nameLines.length * 4.5 + metaLine.length * 4 + plain.length * 4 + 2;
      y = ensureSpace(doc, model, y, blockH + 4);
      const top = y - 2;
      const accent = f.flag === "red" ? TERRACOTTA : f.flag === "yellow" ? GOLD : FOREST;
      beginBox(doc, MARGIN_X, top, maxW, blockH, { accent });
      let ty = top + PAD + 3;
      const textX = MARGIN_X + PAD + 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(compact ? 9 : 10);
      doc.setTextColor(...INK);
      for (const nl of nameLines) {
        doc.text(nl, textX, ty);
        ty += compact ? 4 : 4.5;
      }
      doc.setFontSize(7.5);
      doc.setTextColor(...accent);
      doc.text(f.flag.toUpperCase(), pageW - MARGIN_X - PAD, top + PAD + 3, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      for (const ml of metaLine) {
        doc.text(ml, textX, ty);
        ty += 4;
      }
      doc.setTextColor(...INK);
      for (const pl of plain) {
        doc.text(pl, textX, ty);
        ty += 4;
      }
      y = top + blockH + 5;
    };

    if (model.greenFindings.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...FOREST);
      doc.text("Looking okay (green)", MARGIN_X, y);
      y += 6;
      for (const f of model.greenFindings) drawFindingCard(f, true);
      y += 2;
    } else {
      doc.setTextColor(...MUTED);
      doc.setFontSize(8);
      doc.text("No green items were listed for the areas reviewed.", MARGIN_X, y);
      y += 7;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...FOREST);
    doc.text("Needs attention (yellow / red)", MARGIN_X, y);
    y += 6;

    if (!model.priorityFindings.length) {
      doc.setTextColor(...MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("No yellow or red flags were listed on this screening.", MARGIN_X, y);
      y += 8;
    } else {
      for (const f of model.priorityFindings) drawFindingCard(f, false);
    }
  } else if (model.priorityFindings.length) {
    y = sectionTitle(doc, model, "Issues highlighted", y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    for (const f of model.priorityFindings.slice(0, 8)) {
      for (const line of wrapLines(doc, `• ${f.name} (${f.flag})`, maxW)) {
        y = ensureSpace(doc, model, y, 5);
        doc.text(line, MARGIN_X, y);
        y += 4.5;
      }
    }
    y += 4;
  }

  // Product plan — names only (no W-codes)
  if (isFull) y = newContentPage(doc, model);
  y = sectionTitle(doc, model, model.planHeading, y);

  if (!model.lines.length) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    doc.text("No products listed on this plan.", MARGIN_X, y);
    y += 8;
  } else {
    for (const line of model.lines) {
      const innerW = maxW - PAD * 2;
      const titleLines = wrapLines(doc, line.name, innerW - 36);
      const pack = wrapLines(doc, `${line.packSize} · ${line.unitPriceLabel} × ${line.qty}`, innerW);
      const why = wrapLines(
        doc,
        isFull
          ? `Why for you: ${line.concern || line.role || "Reviewed for your plan"}`
          : `Why for you: ${line.concern}${line.role ? ` — ${line.role}` : ""}`,
        innerW,
      );
      const outcome = isFull ? wrapLines(doc, `Recommended outcome: ${line.outcome}`, innerW) : [];
      const ingredients = isFull ? wrapLines(doc, `Package ingredients: ${line.ingredients}`, innerW) : [];
      const usage = isFull ? wrapLines(doc, `How to use: ${line.usage}`, innerW) : [];
      const warn = isFull ? wrapLines(doc, `Cautions: ${line.warnings}`, innerW) : [];
      const blockH =
        PAD * 2
        + 2
        + titleLines.length * 4.5
        + pack.length * 4
        + why.length * 4
        + outcome.length * 4
        + ingredients.length * 4
        + usage.length * 4
        + warn.length * 4
        + 2;
      y = ensureSpace(doc, model, y, blockH + 4);
      const top = y - 2;
      beginBox(doc, MARGIN_X, top, maxW, blockH);
      let ty = top + PAD + 3;
      const textX = MARGIN_X + PAD;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...FOREST);
      for (const tl of titleLines) {
        doc.text(tl, textX, ty);
        ty += 4.5;
      }
      doc.setTextColor(...INK);
      doc.text(line.lineTotalLabel, pageW - MARGIN_X - PAD, top + PAD + 3, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      for (const p of pack) {
        doc.text(p, textX, ty);
        ty += 4;
      }
      doc.setTextColor(...INK);
      for (const group of [why, outcome, ingredients, usage, warn]) {
        for (const l of group) {
          doc.text(l, textX, ty);
          ty += 4;
        }
      }
      y = top + blockH + 5;
    }
  }

  // Totals / payment — only when a product plan exists
  if (model.showPayment && model.lines.length) {
  const payLines = wrapLines(doc, model.paymentNote, maxW - PAD * 2);
  const validityLines = wrapLines(doc, model.priceValidity, maxW - PAD * 2);
  const totalBoxH = PAD * 2 + 16 + payLines.length * 3.5 + validityLines.length * 3.5;
  y = ensureSpace(doc, model, y, totalBoxH + 6);
  const totalTop = y - 2;
  doc.setFillColor(...FOREST);
  doc.rect(MARGIN_X, totalTop, maxW, totalBoxH, "F");
  let ty = totalTop + PAD + 3;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("TOTAL PAYABLE", MARGIN_X + PAD, ty);
  ty += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(model.totalPayableLabel, MARGIN_X + PAD, ty);
  ty += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  for (const l of [...payLines, ...validityLines]) {
    doc.text(l, MARGIN_X + PAD, ty);
    ty += 3.5;
  }
  y = totalTop + totalBoxH + 10;
  }

  if (isFull && model.adminNotes) {
    y = sectionTitle(doc, model, model.adminNotesHeading, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    for (const line of wrapLines(doc, model.adminNotes, maxW)) {
      y = ensureSpace(doc, model, y, 5);
      doc.text(line, MARGIN_X, y);
      y += 4.5;
    }
    y += 4;
  }

  y = drawContactBlock(doc, model, y);

  if (isFull) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    for (const line of wrapLines(doc, WELLNESS_DISCLAIMER, maxW)) {
      y = ensureSpace(doc, model, y, 4);
      doc.text(line, MARGIN_X, y);
      y += 3.8;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawHeader(doc, model);
    drawFooter(doc, model, i, totalPages);
  }

  const safeName = (model.subject.name || "screening").replace(/[^\w\-]+/g, "-").replace(/-+/g, "-");
  return { doc, safeName };
}

/** Build PDF bytes for B2 upload without triggering a browser download. */
export async function buildPatientReportPdfBlob(
  screening: Screening,
  variant: ReportVariant = "simple",
): Promise<{
  blob: Blob;
  fileName: string;
}> {
  const { doc, safeName } = await buildPatientReportPdfDoc(screening, variant);
  const suffix = variant === "full" ? "full-details-report" : "wellness-report";
  const fileName = `${safeName}-${suffix}.pdf`;
  const blob = doc.output("blob");
  return { blob, fileName };
}

/** Build a branded multi-page PDF and trigger a direct file download. */
export async function downloadPatientReportPdf(
  screening: Screening,
  variant: ReportVariant = "simple",
): Promise<void> {
  const { doc, safeName } = await buildPatientReportPdfDoc(screening, variant);
  const suffix = variant === "full" ? "full-details-report" : "wellness-report";
  doc.save(`${safeName}-${suffix}.pdf`);
}

export function openPatientReportPrint(screening: Screening): void {
  void downloadPatientReportPdf(screening, "simple");
}

export function renderPatientReportHtml(model: PatientReportModel): string {
  return `<pre>${model.title}\n${model.subject.name}\n${model.totalPayableLabel}</pre>`;
}
