/**
 * Catalog fitness index for Content Bank product recommendations.
 * Derived from the live researched catalog (W01–W71) plus label-supported wellness needs.
 * Ingredient claims are only applied when the finished product’s intended use supports them.
 *
 * reviewStatus:
 * - verified — suitable for automatic recommendation when bank options point here
 * - needs_review — may be offered in admin ranked lists but prefer verified first
 * - unsuitable — never auto-recommend (fertilizer, ambiguous human-use, etc.)
 */

export type CatalogReviewStatus = "verified" | "needs_review" | "unsuitable";

export type CatalogFitnessEntry = {
  code: string;
  /** Wellness need tags this SKU may support (label / intended-use based). */
  needs: string[];
  reviewStatus: CatalogReviewStatus;
  /** Question text that can make this SKU eligible (OR). Empty = only via explicit bank option. */
  suitableWhen?: RegExp[];
  /** If any match the question, never recommend this SKU for that question. */
  excludeWhen?: RegExp[];
  /** One-line label-supported role (EN). */
  reasonEn: string;
  /** One-line label-supported role (SW). */
  reasonSw: string;
  /** Why needs_review / unsuitable, or missing label notes. */
  notes?: string;
  reviewedAt: string;
  sourceHint: string;
};

const TODAY = "2026-11-24";

/** Fertilizers and non-human SKUs — never auto-recommend in wellness replies. */
const UNSUITABLE_CODES = new Set(["W47", "W48", "W49"]);

/**
 * Hand-curated fitness for high-traffic wellness SKUs used by the bank.
 * Other catalog codes default to needs_review with category-based needs only.
 */
const CURATED: Record<string, Omit<CatalogFitnessEntry, "code" | "reviewedAt">> = {
  W12: {
    needs: ["stress-beverage", "ganoderma-coffee"],
    reviewStatus: "needs_review",
    suitableWhen: [/ganoderma coffee|wellness coffee|evening coffee routine/i],
    excludeWhen: [
      /sleep trouble|poor sleep|insomnia|cannot sleep|hard to sleep|usingizi/i,
      /stress.*(sleep|usingizi)|(sleep|usingizi).*stress/i,
      /anxiety|panic|chest pain|breathless/i,
    ],
    reasonEn: "Optional wellness coffee beverage — not a sleep or anxiety treatment; check the label.",
    reasonSw: "Kahawa ya ustawi ya hiari — si tiba ya usingizi au wasiwasi; angalia lebo.",
    notes: "Do not default for stress-related sleep trouble.",
    sourceHint: "catalog label / intended beverage use",
  },
  W14: {
    needs: ["protein", "energy-nutrition", "dietary-protein-gap"],
    reviewStatus: "verified",
    suitableWhen: [/protein|low energy|fatigue|tired|dietary gap|uchovu|nguvu kidogo/i],
    excludeWhen: [
      /heavy period|flooding|soaking|hedhi nyingi|menstrual bleeding/i,
      /breathless|short(ness)? of breath|kupumua/i,
      /chest pain|kifua|urgent|emergency/i,
      /diarrhea|diarrhoea|kuhara|loose stool/i,
      /burning (when|on)?\s*(urin|pee)|cystitis/i,
    ],
    reasonEn: "Additional dietary protein when meals are light — follow the package; not for bleeding or breathlessness.",
    reasonSw: "Protini ya ziada lishe nyepesi — fuata lebo; si kwa kutokwa damu au kupumua kwa shida.",
    sourceHint: "catalog intended use: protein powder",
  },
  W15: {
    needs: ["multivitamin", "nutrition"],
    reviewStatus: "verified",
    suitableWhen: [/multivitamin|general vitamin|nutrition support|lishe|vitamini/i],
    excludeWhen: [/chest pain|sudden hearing|heavy period.*breath/i],
    reasonEn: "Adult multivitamin option for general nutritional support — follow the label.",
    reasonSw: "Multivitamini ya watu wazima kwa msaada wa lishe — fuata lebo.",
    sourceHint: "catalog intended use",
  },
  W19: {
    needs: ["omega-3", "circulation-wellness"],
    reviewStatus: "needs_review",
    suitableWhen: [/omega|fish oil|circulation|cholesterol wellness|EPA|DHA/i],
    excludeWhen: [
      /sleep trouble|poor sleep|insomnia|usingizi/i,
      /stress.*(sleep|usingizi)|(sleep|usingizi).*stress/i,
      /diarrhea|kuhara|migraine|light sensitivity/i,
    ],
    reasonEn: "Omega-3 nutritional softgel when circulation/nutrition fit is clear — check EPA/DHA on the pack.",
    reasonSw: "Softjeli ya omega-3 lishe inapolingana — angalia EPA/DHA kwenye pakiti.",
    notes: "Do not default for stress/sleep.",
    sourceHint: "catalog intended use: fish oil",
  },
  W26: {
    needs: ["dizziness", "ginkgo"],
    reviewStatus: "needs_review",
    suitableWhen: [/dizz|vertigo|light-?headed|spinning|kichwa kuzunguka/i],
    excludeWhen: [/blood thinner|bleeding|warfarin|pregnant|chest pain|stroke|slur/i],
    reasonEn: "Discuss only if spinning-type dizziness fits; confirm extract on pack and ask a pharmacist with blood thinners.",
    reasonSw: "Jadili tu ikiwa kizunguzungu cha kuzunguka kinafaa; thibitisha extract na muulize mfamasia ukitumia dawa za damu.",
    sourceHint: "catalog intended use: ginkgo",
  },
  W28: {
    needs: ["digestive-tea", "intestinal-comfort"],
    reviewStatus: "verified",
    suitableWhen: [/intestin|bowel|digest|cleansing tea|tumbo|utumbo/i],
    excludeWhen: [/heartburn|reflux|acid|kiungulia|chest pain|pregnant/i],
    reasonEn: "Digestive wellness tea option — not a treatment for reflux disease; follow the label.",
    reasonSw: "Chai ya ustawi wa mmeng'enyo — si tiba ya kiungulia; fuata lebo.",
    sourceHint: "catalog intended use: intestine cleansing tea",
  },
  W37: {
    needs: ["joint", "movement", "wrist", "knee"],
    reviewStatus: "verified",
    suitableWhen: [/joint|knee|wrist|movement|viungo|goti/i],
    excludeWhen: [/urin|burning pee|chest pain|diarrhea|migraine|light sensitivity/i],
    reasonEn: "General joint wellness capsule when movement discomfort is the main ask — follow the label.",
    reasonSw: "Kapsuli ya ustawi wa viungo inapolalamikiwa mwendo — fuata lebo.",
    sourceHint: "catalog intended use: joint health",
  },
  W38: {
    needs: ["migraine-like", "coq10", "headache-light"],
    reviewStatus: "verified",
    suitableWhen: [/migraine|light sensitivity|photophobia|kichwa.*mwanga|mwanga.*kichwa/i],
    excludeWhen: [/diarrhea|kuhara|urin|joint|wrist|reflux|heartburn|chest pain|slur|stroke/i],
    reasonEn: "Discuss for recurrent migraine-like headaches with light sensitivity; check CoQ10 amount on the package.",
    reasonSw: "Jadili kwa maumivu ya kichwa yanayofanana na migraine na mwanga; angalia kiasi cha CoQ10 kwenye pakiti.",
    sourceHint: "catalog intended use: CoQ10",
  },
  W39: {
    needs: ["vitamin-c", "immune-nutrition"],
    reviewStatus: "verified",
    suitableWhen: [/vitamin\s*c|immune|antioxidant|kinga/i],
    excludeWhen: [/chest pain|heavy period.*breath/i],
    reasonEn: "Vitamin C tablet for general antioxidant/nutrition support — follow the label.",
    reasonSw: "Vidonge vya vitamini C kwa msaada wa lishe — fuata lebo.",
    sourceHint: "catalog intended use",
  },
  W41: {
    needs: ["nutrition", "super-nutrition", "vitamin-mineral"],
    reviewStatus: "verified",
    suitableWhen: [/nutrition|vitamin|mineral|lishe|madini|dietary gap/i],
    excludeWhen: [/chest pain|sudden hearing|heavy period.*breath|protein powder only/i],
    reasonEn: "Broad nutrient support option when diet gaps are the concern — follow the label.",
    reasonSw: "Msaada wa virutubisho wakati lishe ina mapengo — fuata lebo.",
    sourceHint: "catalog intended use: super nutrition",
  },
  W51: {
    needs: ["digestive-drink", "diarrhea-comfort", "stomach"],
    reviewStatus: "verified",
    suitableWhen: [/digest|stomach|diarrh|loose stool|bad stomach|tumbo|kuhara|mmeng'enyo/i],
    excludeWhen: [/heartburn|reflux|acid after lying|kiungulia|migraine|wrist|joint|urin/i],
    reasonEn: "Digestive wellness drink for tummy/bowel comfort topics — not a reflux or joint product.",
    reasonSw: "Kinywaji cha ustawi wa tumbo/utumbo — si bidhaa ya kiungulia wala viungo.",
    sourceHint: "catalog intended use: Fresh Drink Clear",
  },
  W59: {
    needs: ["vitamin-d", "bone"],
    reviewStatus: "verified",
    suitableWhen: [/vitamin\s*d|bone|calcium support|mifupa/i],
    excludeWhen: [/diarrhea|migraine|chest pain/i],
    reasonEn: "Vitamin D3 capsule when bone/vitamin D support is the ask — follow the label.",
    reasonSw: "Kapsuli ya vitamini D3 kwa msaada wa mifupa/D3 — fuata lebo.",
    sourceHint: "catalog intended use",
  },
  W71: {
    needs: ["gastric", "reflux", "heartburn"],
    reviewStatus: "needs_review",
    suitableWhen: [/heartburn|reflux|acid|gastric|kiungulia|tumbo la juu/i],
    excludeWhen: [/diarrh|loose stool|kuhara|intestin cleansing|migraine|joint|wrist/i],
    reasonEn: "Gastric comfort tablet only when heartburn/reflux-style discomfort is the topic — follow the label.",
    reasonSw: "Kidonge cha faraja ya tumbo la juu kwa kiungulia tu — fuata lebo.",
    notes: "Must not inherit onto diarrhea bank matches.",
    sourceHint: "catalog intended use: gastric health",
  },
};

const CATEGORY_NEEDS: Record<string, string[]> = {
  "Dietary supplements": ["supplement"],
  "Teas and beverages": ["beverage"],
  "Topical products and patches": ["topical"],
  "Personal hygiene": ["hygiene"],
  "Oral care": ["oral-care"],
  Fertilizers: ["non-human"],
};

function defaultReason(code: string, name: string): { en: string; sw: string } {
  return {
    en: `${code} ${name} — wellness catalog option; confirm fit on the current package label.`,
    sw: `${code} ${name} — chaguo la katalogi ya ustawi; thibitisha kwenye lebo ya sasa.`,
  };
}

export type LiveProductLite = {
  code: string;
  name: string;
  category: string;
  visible: boolean;
  evidenceStatus?: string;
  matchStatus?: string;
  description?: string;
  warnings?: string;
  retailPrice?: number;
};

/** Build fitness rows for every live catalog SKU. */
export function buildCatalogFitnessIndex(products: LiveProductLite[]): CatalogFitnessEntry[] {
  return products.map((p) => {
    const code = p.code.toUpperCase();
    if (UNSUITABLE_CODES.has(code) || /fertilizer/i.test(p.category)) {
      return {
        code,
        needs: ["non-human"],
        reviewStatus: "unsuitable" as const,
        reasonEn: "Not for personal wellness recommendation.",
        reasonSw: "Si kwa pendekezo la ustawi wa mtu.",
        notes: "Fertilizer / non-human SKU",
        reviewedAt: TODAY,
        sourceHint: "catalog category",
      };
    }
    const curated = CURATED[code];
    if (curated) {
      return { code, reviewedAt: TODAY, ...curated };
    }
    const labelOk = /label_verified|label_confirmed/i.test(p.evidenceStatus || "")
      || /confirmed/i.test(p.matchStatus || "");
    const ambiguous = /ambiguous|not_found|conflicting/i.test(p.evidenceStatus || "")
      || /ambiguous|not_found/i.test(p.matchStatus || "");
    const reasons = defaultReason(code, p.name);
    return {
      code,
      needs: CATEGORY_NEEDS[p.category] || ["general"],
      reviewStatus: (ambiguous ? "needs_review" : labelOk ? "needs_review" : "needs_review") as CatalogReviewStatus,
      reasonEn: reasons.en,
      reasonSw: reasons.sw,
      notes: ambiguous
        ? "Identity/label evidence incomplete — admin review before auto-recommend."
        : "Present in live catalog; awaiting explicit bank option + label confirmation for auto-recommend.",
      reviewedAt: TODAY,
      sourceHint: "researchedCatalog evidence_status / match_status",
    };
  });
}

export function fitnessByCode(products: LiveProductLite[]): Map<string, CatalogFitnessEntry> {
  return new Map(buildCatalogFitnessIndex(products).map((row) => [row.code, row]));
}

export function summarizeCatalogResearch(products: LiveProductLite[]): {
  researched: number;
  verified: number;
  needsReview: number;
  unsuitable: number;
  awaitingLabelEvidence: string[];
} {
  const rows = buildCatalogFitnessIndex(products);
  return {
    researched: rows.length,
    verified: rows.filter((r) => r.reviewStatus === "verified").length,
    needsReview: rows.filter((r) => r.reviewStatus === "needs_review").length,
    unsuitable: rows.filter((r) => r.reviewStatus === "unsuitable").length,
    awaitingLabelEvidence: rows
      .filter((r) => r.reviewStatus === "needs_review")
      .map((r) => r.code),
  };
}
