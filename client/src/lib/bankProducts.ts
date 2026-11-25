import { loadProducts, type Product } from "@/lib/catalog";
import { fitnessByCode } from "@/lib/catalogProductFitness";
import type { BankProductDisplay, ScreeningRecommendation } from "@/lib/screeningTypes";

function findCatalogProduct(code: string, productId?: string, products?: Product[]): Product | undefined {
  const list = products || loadProducts();
  const c = code.trim().toUpperCase();
  const id = (productId || "").toLowerCase();
  return (
    list.find((p) => p.code.toUpperCase() === c)
    || list.find((p) => p.id.toLowerCase() === id)
    || list.find((p) => p.id.toLowerCase() === c.toLowerCase())
  );
}

function phraseListHits(hay: string, phrases?: string[]): boolean {
  if (!phrases?.length) return false;
  return phrases.some((p) => {
    const t = p.trim().toLowerCase();
    return t.length >= 3 && hay.includes(t);
  });
}

/**
 * Pick the single best-fit catalog product for the current question from ranked bank options.
 * Never backfills from a broad category. Skips unsuitable / excluded / invisible / unresolved codes.
 */
export function pickBestProductForQuestion(
  question: string,
  options: ScreeningRecommendation[],
  products?: Product[],
): {
  chosen: ScreeningRecommendation | null;
  adminAlternatives: ScreeningRecommendation[];
  emptyReason: string | null;
} {
  const catalogue = products || loadProducts();
  const fitness = fitnessByCode(catalogue);
  const hay = String(question || "").toLowerCase();
  const ranked = [...(options || [])]
    .map((opt, index) => ({ opt, index }))
    .sort((a, b) => (a.opt.rank ?? a.index + 1) - (b.opt.rank ?? b.index + 1));

  const eligible: ScreeningRecommendation[] = [];
  for (const { opt } of ranked) {
    const code = String(opt.code || "").trim().toUpperCase();
    if (!code) continue;
    if (opt.productReviewStatus === "unsuitable") continue;
    const product = findCatalogProduct(code, opt.productId, catalogue);
    if (!product || product.visible === false) continue;
    const fit = fitness.get(code);
    if (fit?.reviewStatus === "unsuitable") continue;
    if (phraseListHits(hay, opt.excludeWhen)) continue;
    if (fit?.excludeWhen?.some((re) => re.test(hay))) continue;
    // If suitableWhen is set on the option, require a hit (keeps specificity).
    if (opt.suitableWhen?.length && !phraseListHits(hay, opt.suitableWhen)) continue;
    if (fit?.suitableWhen?.length && opt.suitableWhen == null) {
      // Catalog-level suitableWhen is advisory unless bank option is explicit;
      // still allow bank-ranked options through when no option-level suitableWhen.
    }
    const reasonEn = opt.reasonEn || opt.role || fit?.reasonEn || "";
    const reasonSw = opt.reasonSw || fit?.reasonSw || "";
    eligible.push({
      ...opt,
      code,
      productId: opt.productId || code.toLowerCase(),
      name: product.name,
      role: reasonEn || opt.role,
      concern: opt.concern,
      reasonEn,
      reasonSw,
      productReviewStatus: opt.productReviewStatus
        || (fit?.reviewStatus === "verified" ? "verified" : "needs_review"),
    });
  }

  if (!eligible.length) {
    return {
      chosen: null,
      adminAlternatives: [],
      emptyReason: options?.length
        ? "No eligible catalog product for this question after availability, safety, and fit checks."
        : "No product options configured on the matched bank entry.",
    };
  }

  // Prefer verified options when present.
  const verified = eligible.filter((e) => e.productReviewStatus === "verified");
  const pool = verified.length ? verified : eligible;
  return {
    chosen: pool[0],
    adminAlternatives: pool.slice(1),
    emptyReason: null,
  };
}

/** Strip a leading duplicate code from a stored name (“W38 Super…” → “Super…”). */
export function stripLeadingProductCode(name: string, code: string): string {
  const raw = String(name || "").trim();
  const c = String(code || "").trim();
  if (!raw) return "";
  if (!c) return raw;
  const re = new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–—:]?\\s*`, "i");
  return raw.replace(re, "").trim() || raw;
}

function packNoteFor(product: Product | undefined, packSize: string): string {
  const pack = (product?.packSize || packSize || "").trim();
  if (!pack) return "Check the package for pack size. Pack weight is not the amount of active ingredient per capsule.";
  return `Pack: ${pack}. This is the package size, not the amount of active ingredient per capsule — confirm the active amount on the label.`;
}

function precautionsFor(product: Product | undefined, role: string): string {
  const fromLabel = (product?.warnings || "").trim();
  const fromRole = String(role || "").trim();
  const checks: string[] = [];
  if (/blood thinner|bleeding|warfarin|pharmacist|pregnant|breastfeed|clinician|check|label|ask before/i.test(fromRole)) {
    checks.push(fromRole);
  }
  if (fromLabel) checks.push(fromLabel);
  if (!checks.length) {
    return "Follow the current package label. If pregnant, breastfeeding, on medicine, or managing a condition, ask a qualified professional before use.";
  }
  return [...new Set(checks)].join(" ");
}

function labelChecksFor(role: string): string {
  const r = String(role || "");
  const bits: string[] = [];
  if (/CoQ10|coenzyme/i.test(r)) bits.push("Check the CoQ10 amount per capsule on the package.");
  if (/ginkgo|extract/i.test(r)) bits.push("Confirm the extract standardization on the package.");
  if (/EPA|DHA|omega/i.test(r)) bits.push("Check EPA/DHA amounts per serving on the package.");
  if (/blood thinner|bleeding/i.test(r)) bits.push("Ask a pharmacist before use with blood thinners.");
  if (!bits.length && /check|label|package|ask/i.test(r)) bits.push("Complete the label checks noted for this option before use.");
  return bits.join(" ");
}

/**
 * Resolve bank recommendations against the GreenHealth catalog.
 * Unresolved codes are flagged and must be omitted from patient-facing replies.
 */
export function resolveBankProducts(
  recs: ScreeningRecommendation[],
  products?: Product[],
): { display: BankProductDisplay[]; unresolved: BankProductDisplay[] } {
  const catalogue = products || loadProducts();
  const display: BankProductDisplay[] = [];
  const unresolved: BankProductDisplay[] = [];

  for (const rec of recs || []) {
    const code = String(rec.code || "").trim().toUpperCase();
    if (!code) continue;
    const product = findCatalogProduct(code, rec.productId, catalogue);
    const rawName = stripLeadingProductCode(product?.name || rec.name || "", code);
    const name = rawName || product?.name || "";
    const role = rec.role || "";
    const concern = rec.concern || "";
    const packSize = product?.packSize || "";
    const row: BankProductDisplay = {
      code,
      name: name || code,
      displayLabel: name ? `${code} ${name}` : code,
      packSize,
      packNote: packNoteFor(product, packSize),
      concern,
      role,
      precautions: precautionsFor(product, role),
      labelChecks: labelChecksFor(role),
      unresolved: !product || !name,
    };
    if (row.unresolved) unresolved.push({ ...row, displayLabel: `${code} (unresolved — admin review)` });
    else display.push(row);
  }

  return { display, unresolved };
}

export function formatBankProductOptionLine(row: BankProductDisplay): string {
  const why = (row.role || row.concern || "").trim();
  const checks = [row.labelChecks, /blood thinner|pregnant|pharmacist|ask before/i.test(row.precautions) ? row.precautions.split(". ")[0] : ""]
    .map((s) => s.trim())
    .filter(Boolean);
  const suffix = checks.length ? ` · ${checks[0]}` : why ? ` — ${why}` : "";
  return `${row.displayLabel}${suffix}`;
}
