import { loadProducts, money, type Product } from "@/lib/catalog";
import {
  BUSINESS_CONTACT,
  FLAG_KEY,
  PAYMENT_NOTE,
  PLAIN_FLAG_BLURB,
  PRICE_VALIDITY_PREFIX,
  REPORT_ADMIN_NOTES_HEADING,
  REPORT_CONTACT_HEADING,
  REPORT_PLAN_HEADING,
  REPORT_TITLE,
  REPORT_TITLE_FULL,
  sanitizePatientConclusion,
  summarizePatientConclusion,
  SW_SUMMARY_LABEL,
  WEEK_ACTIONS_HEADING,
} from "@/lib/reportCopy";
import { patientFacingReportTitle } from "@/lib/patientReportTitle";
import type { Screening, ScreeningFlag, ScreeningItem } from "@/lib/screeningTypes";

export type ReportVariant = "simple" | "full";

export type ReportLineItem = {
  code: string;
  name: string;
  concern: string;
  role: string;
  /** Short expected-support line for full details. */
  outcome: string;
  ingredients: string;
  usage: string;
  warnings: string;
  packSize: string;
  unitPrice: number;
  unitPriceLabel: string;
  qty: number;
  lineTotal: number;
  lineTotalLabel: string;
};

export type ReportFinding = {
  groupTitle: string;
  name: string;
  value: string;
  normalRange: string;
  flag: ScreeningFlag;
  plainWords: string;
};

export type PatientReportModel = {
  variant: ReportVariant;
  title: string;
  /** Patient-facing issue heading (not the person's name). */
  headline: string;
  reportId: string;
  preparedBy: string;
  subject: Screening["subject"];
  testDate: string;
  testTime: string;
  simpleConclusion: string;
  /** Longer narrative for full report / PDF (no embedded product bullets). */
  fullConclusion: string;
  simpleConclusionSw: string;
  fullConclusionSw: string;
  swLabel: string;
  flagKey: typeof FLAG_KEY;
  weekActionsHeading: string;
  weekActions: string[];
  findingsHeading: string;
  priorityFindings: ReportFinding[];
  greenFindings: ReportFinding[];
  greenCount: number;
  yellowCount: number;
  redCount: number;
  planHeading: string;
  lines: ReportLineItem[];
  adminNotes: string;
  adminNotesHeading: string;
  contactHeading: string;
  subtotal: number;
  subtotalLabel: string;
  totalPayable: number;
  totalPayableLabel: string;
  paymentNote: string;
  /** False when there is no product plan — hide payment / total blocks. */
  showPayment: boolean;
  priceValidity: string;
  businessName: string;
  contactEmail: string;
  contactPhone: string;
  whatsappDisplay: string;
  whatsappUrl: string;
  generatedAt: string;
};

function findProduct(products: Product[], code: string, productId?: string): Product | undefined {
  const c = code.trim().toUpperCase();
  const id = (productId || "").toLowerCase();
  return (
    products.find((p) => p.code.toUpperCase() === c)
    || products.find((p) => p.id.toLowerCase() === id)
    || products.find((p) => p.id.toLowerCase() === c.toLowerCase())
  );
}

const PLAIN_WORDS_MAX = 200;

function plainFor(item: ScreeningItem, compact = false): string {
  let text = item.followUp?.trim()
    ? item.followUp.trim()
    : (PLAIN_FLAG_BLURB[item.flag] || PLAIN_FLAG_BLURB.unknown);
  if (compact && text.length > PLAIN_WORDS_MAX) {
    const cut = text.slice(0, PLAIN_WORDS_MAX);
    const sp = cut.lastIndexOf(" ");
    text = `${(sp > 0 ? cut.slice(0, sp) : cut).trim()}…`;
  }
  return text;
}

export function buildPatientReport(
  screening: Screening,
  products?: Product[],
  variant: ReportVariant = "simple",
): PatientReportModel {
  const catalogue = products || loadProducts();
  const allItems = (screening.groups || []).flatMap((g) =>
    (g.items || []).map((item) => ({ groupTitle: g.title, item })),
  );
  const greenItems = allItems.filter((x) => x.item.flag === "green");
  const yellowCount = allItems.filter((x) => x.item.flag === "yellow").length;
  const redCount = allItems.filter((x) => x.item.flag === "red").length;
  const greenCount = greenItems.length;
  const priority = allItems
    .filter((x) => x.item.flag === "yellow" || x.item.flag === "red")
    .sort((a, b) => (a.item.flag === "red" && b.item.flag !== "red" ? -1 : a.item.flag !== "red" && b.item.flag === "red" ? 1 : 0));

  const compactPlain = variant === "simple";
  const toFinding = ({ groupTitle, item }: { groupTitle: string; item: ScreeningItem }): ReportFinding => ({
    groupTitle,
    name: item.name,
    value: item.value || "—",
    normalRange: item.normalRange || "—",
    flag: item.flag,
    plainWords: plainFor(item, compactPlain),
  });

  const priorityFindings: ReportFinding[] = priority.map(toFinding);
  const greenFindings: ReportFinding[] = greenItems.map(toFinding);

  const lines: ReportLineItem[] = (screening.recommendations || []).map((rec) => {
    const product = findProduct(catalogue, rec.code, rec.productId);
    const qty = Math.max(1, Number(rec.qty) || 1);
    const unitPrice = typeof rec.unitPrice === "number" && rec.unitPrice >= 0
      ? rec.unitPrice
      : (product?.retailPrice || 0);
    const lineTotal = unitPrice * qty;
    const concern = rec.concern || "";
    const role = rec.role || "";
    return {
      code: rec.code,
      name: product?.name || rec.name || rec.code,
      concern,
      role,
      outcome: role || concern || "Wellness support option — confirm fit with your review notes.",
      ingredients: (product?.ingredients || "").trim()
        || "Check the current package label for the full ingredient list.",
      usage: product?.usage || "Follow the current package label.",
      warnings: product?.warnings || "Read the label before use. Ask us if unsure.",
      packSize: product?.packSize || "—",
      unitPrice,
      unitPriceLabel: money(unitPrice),
      qty,
      lineTotal,
      lineTotalLabel: money(lineTotal),
    };
  });

  const totalPayable = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const today = new Date().toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" });

  const weekActions = (screening.weekActions || [])
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 3);

  const narrativeEn = sanitizePatientConclusion(screening.simpleConclusion || "");
  const narrativeSw = sanitizePatientConclusion(screening.simpleConclusionSw || "");
  const shortEn = summarizePatientConclusion(narrativeEn, 320)
    || "Your wellness screening has been reviewed. See the plan below.";
  const shortSw = summarizePatientConclusion(narrativeSw, 320);
  const fullEn = narrativeEn.length > shortEn.length + 24 ? narrativeEn : "";
  const fullSw = narrativeSw.length > (shortSw || "").length + 24 ? narrativeSw : "";

  return {
    variant,
    title: variant === "full" ? REPORT_TITLE_FULL : REPORT_TITLE,
    headline: patientFacingReportTitle(screening),
    reportId: screening.id,
    preparedBy: BUSINESS_CONTACT.preparedBy,
    subject: screening.subject,
    testDate: screening.subject.testDate || "—",
    testTime: screening.subject.testTime || "",
    simpleConclusion: shortEn,
    fullConclusion: fullEn,
    simpleConclusionSw: shortSw,
    fullConclusionSw: fullSw,
    swLabel: SW_SUMMARY_LABEL,
    flagKey: FLAG_KEY,
    weekActionsHeading: WEEK_ACTIONS_HEADING,
    weekActions,
    findingsHeading: "Your screening findings",
    priorityFindings,
    greenFindings,
    greenCount,
    yellowCount,
    redCount,
    planHeading: REPORT_PLAN_HEADING,
    lines,
    adminNotes: (screening.adminNotes || "").trim(),
    adminNotesHeading: REPORT_ADMIN_NOTES_HEADING,
    contactHeading: REPORT_CONTACT_HEADING,
    subtotal: totalPayable,
    subtotalLabel: money(totalPayable),
    totalPayable,
    totalPayableLabel: money(totalPayable),
    paymentNote: lines.length ? PAYMENT_NOTE : "",
    showPayment: lines.length > 0,
    priceValidity: lines.length
      ? `${PRICE_VALIDITY_PREFIX} ${today}; confirm stock before payment.`
      : "",
    businessName: BUSINESS_CONTACT.name,
    contactEmail: BUSINESS_CONTACT.email,
    contactPhone: BUSINESS_CONTACT.phone,
    whatsappDisplay: BUSINESS_CONTACT.whatsappDisplay,
    whatsappUrl: BUSINESS_CONTACT.whatsappUrl,
    generatedAt: today,
  };
}

export function withRecommendationQty(screening: Screening, index: number, qty: number): Screening {
  const recommendations = (screening.recommendations || []).map((rec, i) =>
    i === index ? { ...rec, qty: Math.max(1, Math.min(99, Math.floor(qty) || 1)) } : rec,
  );
  return { ...screening, recommendations };
}

export function withRecommendationUnitPrice(screening: Screening, index: number, unitPrice: number): Screening {
  const recommendations = (screening.recommendations || []).map((rec, i) =>
    i === index ? { ...rec, unitPrice: Math.max(0, Number(unitPrice) || 0) } : rec,
  );
  return { ...screening, recommendations };
}
