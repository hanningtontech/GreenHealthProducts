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
  /Product option:\s*/gi,
  /Product plan for this case:\s*/gi,
  /Optional products to discuss with your clinician:\s*/gi,
  /Routine wellness products are secondary to blood-pressure medical review:\s*/gi,
  /Bone\/nutrition options:\s*/gi,
  /Digestive comfort came up in the matched content\.?/gi,
  /Low energy was matched in the content bank\.?/gi,
  /Stress or sleep concerns matched approved bank content\.?/gi,
  /Circulation-related flags matched the content bank\.?/gi,
  /Vitamin D \/ bone support matched the bank\.?/gi,
  /matched (the )?content bank/gi,
  /matched the bank/gi,
  /matched approved bank content/gi,
  /came up in the matched content/gi,
  /An admin should add keywords\/diseases[\s\S]*?next time\.?/gi,
  /Ongeza maudhui kwenye content bank[\s\S]*?muundo wako\.?/gi,
  /Hakuna mechi katika content bank bado\.[\s\S]*?kujifunza\.?/gi,
  /Kulingana na content bank iliyoidhinishwa[^.]*\./gi,
  // Generic legal / wellness disclaimer closings
  /Closing:\s*This is wellness information only\.?\s*A clinician can assess your symptoms and advise on care\.?/gi,
  /This is wellness information only\.?\s*A clinician can assess your symptoms and advise on care\.?/gi,
  /This is wellness information only[^.]*\./gi,
  /Wellness information only[^.]*\./gi,
  /This is wellness support[^.]*\./gi,
  /Products are wellness-support options only[^.]*\./gi,
  /Not a diagnosis\.?\s*Follow the label and ask a clinician if symptoms are serious\.?/gi,
  /Not a (medical )?diagnosis of[^.]*\./gi,
  /Not a diagnosis or treatment plan\.?\s*Follow package labels and prescribed care\.?/gi,
  /Follow (current )?package labels[^.]*clinician[^.]*\./gi,
  /Follow package labels and seek a clinician[^.]*\./gi,
  /Hii ni taarifa ya ustawi[^.]*\./gi,
  /This screening and advice are for wellness information only[^.]*\./gi,
];

/** True when replyOpening is internal bank/meta scaffolding (not patient-facing). */
export function isMetaReplyOpening(text: string | undefined | null): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  return (
    /matched (the )?(content bank|bank)\b/i.test(t)
    || /matched approved bank content/i.test(t)
    || /came up in the matched content/i.test(t)
    || /matched the bank/i.test(t)
    || /content bank iliyoidhinishwa/i.test(t)
  );
}

/** Remove embedded product-option sections (heading + bullet lines) from narrative text. */
export function stripProductOptionBlocks(text: string): string {
  const lines = String(text || "").split("\n");
  const out: string[] = [];
  let inProductBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /^(product option|product options|product plan for this case|optional products to discuss|bone\/nutrition options|routine wellness products are secondary)/i.test(trimmed)
    ) {
      inProductBlock = true;
      continue;
    }
    if (inProductBlock) {
      if (!trimmed) {
        inProductBlock = false;
        continue;
      }
      if (/^[•\-*]\s/.test(trimmed) || /^[A-Z]\d{2}\b/.test(trimmed)) continue;
      inProductBlock = false;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Short patient-facing summary (~320 chars) from a longer sanitized conclusion. */
export function summarizePatientConclusion(text: string, maxChars = 320): string {
  const clean = sanitizePatientConclusion(stripProductOptionBlocks(text));
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  const firstPara = clean.split(/\n\n+/)[0]?.trim() || clean;
  if (firstPara.length <= maxChars) return firstPara;
  const slice = clean.slice(0, maxChars);
  const punct = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"), slice.lastIndexOf("; "));
  if (punct > Math.floor(maxChars * 0.45)) return slice.slice(0, punct + 1).trim();
  const wordCut = slice.lastIndexOf(" ");
  return `${(wordCut > 0 ? slice.slice(0, wordCut) : slice).trim()}…`;
}

/** True when a bank replyClosing is generic disclaimer boilerplate (omit from patient replies). */
export function isDisclaimerClosing(text: string | undefined | null): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  // Keep urgent / concrete action closings.
  if (/do not wait|emergency|call emergency|seek emergency/i.test(t)) return false;
  return (
    /wellness information only/i.test(t)
    || /wellness support, not treatment/i.test(t)
    || /wellness-support options only/i.test(t)
    || /clinician can assess your symptoms/i.test(t)
    || /^not a (medical )?diagnosis\b/i.test(t)
    || /not a diagnosis or treatment/i.test(t)
    || /not a hypertension diagnosis/i.test(t)
    || /follow (current )?package labels/i.test(t)
    || /hii ni taarifa ya ustawi/i.test(t)
  );
}

/** Strip internal bank/admin instructions and disclaimer closings from patient-facing text. */
export function sanitizePatientConclusion(text: string): string {
  let next = stripProductOptionBlocks(String(text || ""));
  for (const pattern of PATIENT_CONCLUSION_BLOCKLIST) {
    next = next.replace(pattern, "");
  }
  // Drop meta openings and disclaimer paragraphs.
  next = next
    .split(/\n\n+/)
    .filter((para) => !isDisclaimerClosing(para) && !isMetaReplyOpening(para))
    .join("\n\n");
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
