/** Locked patient-facing copy for the formal wellness report / PDF. */

export const REPORT_TITLE = "Wellness Report";
export const REPORT_TITLE_FULL = "Full Details Wellness Report";

export const REPORT_PLAN_HEADING = "Recommended wellness products & support plan";
export const REPORT_ADMIN_NOTES_HEADING = "Extra notes from your review";
export const REPORT_CONTACT_HEADING = "How to contact us";

export const FLAG_KEY = {
  green: "Green — within usual range / okay for now",
  yellow: "Yellow — worth improving with lifestyle and products; follow up",
  red: "Red — priority concern; discuss with a qualified clinician alongside this plan",
} as const;

export const WEEK_ACTIONS_HEADING = "What you should do this week";
export const WEEK_ACTIONS_HINT = "Up to 3 plain steps (editable before sharing)";

export const FINDINGS_HEADING = "Your screening findings";
export const FINDINGS_PLAIN_LABEL = "In plain words";

export const PAYMENT_NOTE =
  "Pay on delivery / M-Pesa — confirm with GreenHealthProducts before payment. Prices as listed; confirm stock before you pay.";

export const PRICE_VALIDITY_PREFIX = "Prices as of";

/** Patient-facing contact details for reports. */
export const BUSINESS_CONTACT = {
  name: "GreenHealthProducts",
  preparedBy: "GreenHealthProducts",
  email: "care@greenhealthproducts.co.ke",
  phone: "0759 550 133",
  whatsappDisplay: "0759 550 133",
  /** Digits only for wa.me */
  whatsappDigits: "254759550133",
  get whatsappUrl() {
    return `https://wa.me/${this.whatsappDigits}`;
  },
};

export const SW_SUMMARY_LABEL = "Muhtasari (Kiswahili)";

/** Admin / bank scaffolding that must never appear on patient reports. */
const PATIENT_CONCLUSION_BLOCKLIST = [
  /Add or approve content-bank entries[\s\S]*?trained structure\.?/gi,
  /No strong flags were matched in the content bank yet\.?/gi,
  /No approved content-bank match yet[\s\S]*?next time\.?/gi,
  /Products are wellness-support options only\.?\s*Follow package labels and seek a clinician for serious symptoms\.?/gi,
  /Products are wellness-support options only[^.]*\./gi,
  /Product options to discuss for this case:?/gi,
  /An admin should add keywords\/diseases[\s\S]*?next time\.?/gi,
  /Ongeza maudhui kwenye content bank[\s\S]*?muundo wako\.?/gi,
  /Hakuna mechi katika content bank bado\.[\s\S]*?kujifunza\.?/gi,
  /Kulingana na content bank iliyoidhinishwa[^.]*\./gi,
];

/** Strip internal bank/admin instructions from patient-facing conclusion text. */
export function sanitizePatientConclusion(text: string): string {
  let next = String(text || "");
  for (const pattern of PATIENT_CONCLUSION_BLOCKLIST) {
    next = next.replace(pattern, "");
  }
  return next
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export const PLAIN_FLAG_BLURB: Record<string, string> = {
  green: "This area looks within a usual range for this screening.",
  yellow: "This area may need attention through lifestyle, diet, and approved wellness products.",
  red: "This area is a priority on your screening — discuss it with a qualified health professional.",
  unknown: "This reading needs review; ask us if anything is unclear.",
};
