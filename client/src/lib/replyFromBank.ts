import {
  formatBankProductOptionLine,
  pickBestProductForQuestion,
  resolveBankProducts,
} from "./bankProducts";
import { detectUrgentCare, shouldSuppressProducts } from "./bankUrgent";
import {
  findSimilarCases,
  listKnowledgeCases,
  mergeRecommendations,
} from "./knowledgeBank";
import { ensureSwahiliSummary } from "./translateToSw";
import type {
  BankProductDisplay,
  KnowledgeCase,
  Screening,
  ScreeningRecommendation,
  Intake,
} from "./screeningTypes";

function flaggedText(screening: Screening): string {
  const bits: string[] = [];
  for (const group of screening.groups || []) {
    for (const item of group.items || []) {
      if (item.flag === "yellow" || item.flag === "red") {
        bits.push(`${item.name} ${item.flag}`);
      }
    }
  }
  return bits.join("\n");
}

/**
 * Resolve recommendations for patient-facing output.
 * Unresolved codes are omitted from the reply and returned separately for admin review.
 */
export function resolveRecommendationsForReply(recs: ScreeningRecommendation[]): {
  patientRecs: ScreeningRecommendation[];
  display: BankProductDisplay[];
  unresolved: BankProductDisplay[];
  productLines: string[];
} {
  const { display, unresolved } = resolveBankProducts(recs);
  const patientRecs = display.map((row) => ({
    code: row.code,
    productId: row.code.toLowerCase(),
    name: row.name,
    concern: row.concern,
    role: row.role,
  }));
  return {
    patientRecs,
    display,
    unresolved,
    productLines: display.map(formatBankProductOptionLine),
  };
}

/**
 * Resolve at most one best-fit product for the current question from bank options.
 * Does not invent products from broad categories when the list is empty/excluded.
 */
export function pickSingleRecommendation(
  question: string,
  recs: ScreeningRecommendation[],
): {
  patientRecs: ScreeningRecommendation[];
  display: BankProductDisplay[];
  unresolved: BankProductDisplay[];
  productLines: string[];
  adminAlternatives: ScreeningRecommendation[];
  emptyReason: string | null;
} {
  const { chosen, adminAlternatives, emptyReason } = pickBestProductForQuestion(question, recs);
  if (!chosen) {
    return {
      patientRecs: [],
      display: [],
      unresolved: resolveBankProducts(recs).unresolved,
      productLines: [],
      adminAlternatives: [],
      emptyReason,
    };
  }
  const resolved = resolveRecommendationsForReply([chosen]);
  const lineWhy = (chosen.reasonEn || chosen.role || "").trim();
  const productLines = resolved.display.map((row) => {
    const base = formatBankProductOptionLine(row);
    if (lineWhy && !base.includes(lineWhy.slice(0, 24))) {
      return `${row.displayLabel} — ${lineWhy}`;
    }
    return base;
  });
  return {
    patientRecs: resolved.patientRecs,
    display: resolved.display,
    unresolved: resolved.unresolved,
    productLines,
    adminAlternatives,
    emptyReason: null,
  };
}

/** Assemble a structured reply without duplicating opening/closing into concerns. */
export function assembleStructuredReply(cases: KnowledgeCase[], personName = "you"): {
  reply: string;
  opening: string;
  concerns: string;
  productIntro: string;
  closing: string;
} {
  if (!cases.length) {
    const opening = "Thank you for sharing.";
    const concerns = "Your note has been received — our team will review it and share a wellness plan when ready.";
    return {
      opening,
      concerns,
      productIntro: "",
      closing: "",
      reply: [opening, concerns].join("\n\n"),
    };
  }

  const primary = cases[0];
  const opening = (primary.replyOpening || "Thank you for sharing.").trim()
    .replace(/\bthe person\b/gi, personName === "you" ? "you" : personName);
  const concernParts = cases.map((c) => {
    const body = (c.replyConcerns || c.summary || "").trim();
    if (!body) return "";
    if (body.toLowerCase().startsWith((c.conditionTitle || c.title).toLowerCase())) return body;
    return cases.length > 1 ? `${c.conditionTitle || c.title}: ${body}` : body;
  }).filter(Boolean);
  const concerns = concernParts.join("\n\n");
  const productIntro = (primary.replyRecommendationsIntro || "").trim();
  const closing = (primary.replyClosing || "").trim();

  const reply = [opening, concerns, productIntro, closing].filter(Boolean).join("\n\n");
  return { reply, opening, concerns, productIntro, closing };
}

export function assembleIntakeReply(input: {
  text: string;
  cases: KnowledgeCase[];
  recommendations: ScreeningRecommendation[];
}): {
  reply: string;
  recommendations: ScreeningRecommendation[];
  matchedCaseIds: string[];
  productLines: string[];
  unresolvedProducts: BankProductDisplay[];
  urgent: boolean;
} {
  const urgent = detectUrgentCare(input.text);
  if (urgent) {
    return {
      reply: urgent.actionEn,
      recommendations: [],
      matchedCaseIds: [],
      productLines: [],
      unresolvedProducts: [],
      urgent: true,
    };
  }

  const urgentCase = input.cases.find((c) => c.urgent);
  const cases = urgentCase ? [urgentCase] : input.cases;
  const structured = assembleStructuredReply(cases, "you");
  const suppress = Boolean(urgentCase) || shouldSuppressProducts(input.text);
  const bankOptions = suppress ? [] : (input.recommendations || []);
  const resolved = pickSingleRecommendation(input.text, bankOptions);

  const replyParts = [
    structured.opening,
    structured.concerns,
    resolved.productLines.length
      ? [structured.productIntro || "Product option:", ...resolved.productLines.map((l) => `• ${l}`)].join("\n")
      : "",
    structured.closing,
  ].filter(Boolean);

  return {
    reply: replyParts.join("\n\n"),
    recommendations: resolved.patientRecs,
    matchedCaseIds: cases.map((c) => c.id),
    productLines: resolved.productLines,
    unresolvedProducts: resolved.unresolved,
    urgent: false,
  };
}

/** Practical this-week steps tied to flagged issues / matched bank topics. */
export function suggestWeekActions(screening: Screening, matched?: KnowledgeCase[]): string[] {
  const text = [
    flaggedText(screening),
    ...(matched || []).flatMap((c) => [c.title, ...(c.diseases || []), ...(c.keywords || [])]),
  ].join("\n").toLowerCase();
  const actions: string[] = [];
  const push = (line: string) => {
    if (actions.length >= 3) return;
    if (actions.some((a) => a.toLowerCase() === line.toLowerCase())) return;
    actions.push(line);
  };

  if (/migraine|headache|light sensitivity|photophobia/.test(text)) {
    push("Rest in a dim, quiet space when a headache starts; note triggers (light, screens, missed meals).");
  }
  if (/dizz|vertigo|light-?headed|spin/.test(text)) {
    push("Stand up slowly, drink water regularly, and pause activity if dizziness returns.");
  }
  if (/digest|intestin|bowel|stomach|bloating|diarrh|reflux|heartburn/.test(text)) {
    push("Eat smaller, regular meals; reduce very oily or spicy foods this week and note what settles your stomach.");
  }
  if (/urin|burning/.test(text)) {
    push("Drink water regularly and arrange clinical review for burning urination — do not self-treat with unproven products.");
  }
  if (/energy|fatigue|tired|protein/.test(text)) {
    push("Aim for steady meals with some protein each day and a consistent sleep window.");
  }
  if (/stress|sleep|low mood|feeling down|depress/.test(text)) {
    push("Keep a short daily walk or quiet wind-down before bed; seek clinical care if low mood lasts or worsens.");
  }
  if (/immune|vitamin|nutrition|mineral/.test(text)) {
    push("Follow the product plan labels carefully and keep a simple food + water routine this week.");
  }
  if (!actions.length) {
    push("Follow any agreed product labels carefully this week.");
    push("Write down any symptom that gets worse and contact us or a clinician if it does.");
    push("Drink enough water and keep meals regular while you start the plan.");
  }
  while (actions.length < 3) {
    push("Contact GreenHealthProducts on 0759 550 133 if you need help with the plan.");
  }
  return actions.slice(0, 3);
}

/**
 * Draft from your trained content bank only (no LLM).
 * Uses approved+active matches, urgency-first rules, and at most one catalog product.
 */
export async function draftFromContentBank(screening: Screening): Promise<{
  conclusion: string;
  conclusionSw: string;
  recommendations: ScreeningRecommendation[];
  matchedCaseIds: string[];
  weekActions: string[];
  unresolvedProducts?: BankProductDisplay[];
}> {
  const searchText = [
    flaggedText(screening),
    screening.simpleConclusion || "",
    screening.rawTextExcerpt || "",
  ].join("\n");

  const urgent = detectUrgentCare(searchText);
  if (urgent) {
    return {
      conclusion: urgent.actionEn,
      conclusionSw: urgent.actionSw,
      recommendations: [],
      matchedCaseIds: [],
      weekActions: [
        "Seek emergency care now.",
        "Do not start new supplements until assessed.",
        "Bring a medicine list to emergency care.",
      ],
      unresolvedProducts: [],
    };
  }

  const bank = await listKnowledgeCases();
  const similar = findSimilarCases(bank, searchText, 5);
  const urgentCase = similar.find((c) => c.urgent);
  const used = urgentCase ? [urgentCase] : similar;
  const suppress = shouldSuppressProducts(searchText) || Boolean(urgentCase);
  const fromBank = suppress ? [] : mergeRecommendations(used.map((c) => c.recommendations || []));
  const resolved = pickSingleRecommendation(searchText, fromBank);

  const personLabel = "you";
  const structured = assembleStructuredReply(used, personLabel);
  const withProducts = resolved.productLines.length
    ? [
      structured.reply,
      ["Product option:", ...resolved.productLines.map((l) => `• ${l}`)].join("\n"),
    ].filter(Boolean).join("\n\n")
    : structured.reply;

  const noMatchEn =
    "Thank you for sharing. Your note has been received — our team will review it and share a wellness plan when ready.";
  const noMatchSw =
    "Asante kwa kushiriki. Maelezo yako yamepokelewa — tutayapitia na kukushirikisha mpango wa afya utakapokuwa tayari.";

  const conclusion = used.length ? withProducts : noMatchEn;
  const swBodies = used
    .map((c) => c.summarySw || c.replyConcerns || c.summary)
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => `- ${line}`);
  const swSeed = used.length
    ? [`Asante.`, swBodies.join("\n") || used.map((c) => c.summarySw).find(Boolean) || ""]
      .filter(Boolean)
      .join("\n\n")
    : noMatchSw;
  const conclusionSw = await ensureSwahiliSummary(conclusion, swSeed);
  const weekActions = urgentCase
    ? ["Follow the urgent guidance above.", "Seek emergency care if symptoms worsen.", "Contact 0759 550 133 only after you are safe."]
    : suggestWeekActions(screening, used);

  return {
    conclusion,
    conclusionSw,
    recommendations: resolved.patientRecs,
    matchedCaseIds: used.map((c) => c.id),
    weekActions,
    unresolvedProducts: resolved.unresolved,
  };
}

export async function draftIntakeFromContentBank(intake: Intake): Promise<{
  reply: string;
  replySw: string;
  recommendations: ScreeningRecommendation[];
  matchedCaseIds: string[];
  productLines?: string[];
  unresolvedProducts?: BankProductDisplay[];
  urgent?: boolean;
}> {
  const text = [...(intake.concerns || []), intake.freeText || ""].join("\n");
  const bank = await listKnowledgeCases();
  const similar = findSimilarCases(bank, text, 5);
  const assembled = assembleIntakeReply({
    text,
    cases: similar,
    recommendations: mergeRecommendations(similar.map((c) => c.recommendations || [])),
  });

  if (assembled.urgent) {
    const urgent = detectUrgentCare(text);
    return {
      reply: assembled.reply,
      replySw: urgent?.actionSw || "Hatua ya haraka: tafuta huduma ya dharura sasa.",
      recommendations: [],
      matchedCaseIds: [],
      productLines: [],
      unresolvedProducts: [],
      urgent: true,
    };
  }

  if (!similar.length) {
    return {
      reply:
        "Thank you for sharing what you are going through. Your note has been received — our team will review it and share a wellness plan when ready.",
      replySw:
        "Asante kwa kushiriki unachopitia. Maelezo yako yamepokelewa — tutayapitia na kukushirikisha mpango wa afya utakapokuwa tayari.",
      recommendations: [],
      matchedCaseIds: [],
      productLines: [],
      unresolvedProducts: [],
      urgent: false,
    };
  }

  const existingSw = similar.map((c) => c.summarySw).find((s) => s?.trim());
  const replySw = await ensureSwahiliSummary(assembled.reply, existingSw);

  return {
    reply: assembled.reply,
    replySw: replySw
      || "Asante kwa kushiriki unachopitia. Tutashiriki muhtasari wa Kiswahili utakapokuwa tayari.",
    recommendations: assembled.recommendations,
    matchedCaseIds: assembled.matchedCaseIds,
    productLines: assembled.productLines,
    unresolvedProducts: assembled.unresolvedProducts,
    urgent: false,
  };
}

function stampMs(value: unknown): number {
  if (value && typeof value === "object") {
    if ("toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
      const t = (value as { toDate: () => Date }).toDate().getTime();
      if (Number.isFinite(t)) return t;
    }
    if ("seconds" in value) {
      const t = Number((value as { seconds: number }).seconds) * 1000;
      if (Number.isFinite(t)) return t;
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = new Date(value).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function sortedIds(ids: string[] | undefined): string[] {
  return [...(ids || [])].filter(Boolean).sort();
}

function sortedCodes(recs: ScreeningRecommendation[] | undefined): string[] {
  return [...(recs || [])]
    .map((r) => String(r.code || "").toUpperCase())
    .filter(Boolean)
    .sort();
}

export function bankMatchFingerprint(input: {
  matchedCaseIds?: string[];
  conclusion?: string;
  recommendations?: ScreeningRecommendation[];
}): string {
  return JSON.stringify({
    ids: sortedIds(input.matchedCaseIds),
    conclusion: String(input.conclusion || "").trim().slice(0, 240),
    codes: sortedCodes(input.recommendations),
  });
}

/** Attach match provenance when applying a content-bank draft to a screening. */
export function withBankMatchMeta(
  matchedCaseIds: string[],
): Pick<Screening, "bankMatchedCaseIds" | "bankMatchedAt"> {
  return {
    bankMatchedCaseIds: [...matchedCaseIds],
    bankMatchedAt: Date.now(),
  };
}

export type BankDraftUpdateCheck = {
  hasUpdate: boolean;
  answerMayDiffer: boolean;
  message: string;
};

/**
 * Compare a saved draft against a fresh content-bank match.
 * Used when reopening an older wizard so admins see bank updates.
 */
export async function checkBankDraftUpdate(
  screening: Screening,
  fresh?: Awaited<ReturnType<typeof draftFromContentBank>>,
): Promise<BankDraftUpdateCheck | null> {
  const hasPriorDraft = Boolean(
    (screening.bankMatchedCaseIds || []).length
      || (screening.bankDraftConclusion || "").trim()
      || (screening.simpleConclusion || "").trim()
      || (screening.recommendations || []).length
      || (screening.bankDraftRecommendations || []).length,
  );
  if (!hasPriorDraft) return null;

  const next = fresh || await draftFromContentBank(screening);
  const priorIds = sortedIds(screening.bankMatchedCaseIds);
  const nextIds = sortedIds(next.matchedCaseIds);
  const idsChanged = JSON.stringify(priorIds) !== JSON.stringify(nextIds);

  const priorCodes = sortedCodes(
    screening.bankDraftRecommendations?.length
      ? screening.bankDraftRecommendations
      : screening.recommendations,
  );
  const nextCodes = sortedCodes(next.recommendations);
  const productsChanged = JSON.stringify(priorCodes) !== JSON.stringify(nextCodes);

  const priorConclusion = (
    screening.bankDraftConclusion || screening.simpleConclusion || ""
  ).trim().slice(0, 240);
  const nextConclusion = (next.conclusion || "").trim().slice(0, 240);
  const conclusionChanged = Boolean(priorConclusion) && priorConclusion !== nextConclusion;

  const matchedAt = stampMs(screening.bankMatchedAt);
  const bank = await listKnowledgeCases();
  const casesUpdated = (priorIds.length ? priorIds : nextIds).some((id) => {
    const entry = bank.find((c) => c.id === id);
    if (!entry) return Boolean(priorIds.length && !nextIds.includes(id));
    const updated = stampMs(entry.updatedAt);
    return matchedAt > 0 && updated > matchedAt;
  });

  const answerMayDiffer = idsChanged || productsChanged || conclusionChanged || casesUpdated;
  if (!answerMayDiffer) return null;

  return {
    hasUpdate: true,
    answerMayDiffer: true,
    message:
      "Content bank has a newer update for this concern. Rematching may give a different answer.",
  };
}

/** @deprecated Use draftFromContentBank — kept so older imports keep working during rename. */
export const draftScreeningConclusion = draftFromContentBank;
/** @deprecated Use draftIntakeFromContentBank */
export const draftIntakeReply = draftIntakeFromContentBank;
