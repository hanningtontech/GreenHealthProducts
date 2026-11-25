/**
 * Admin-only: bank answers first; Gemini only on no match, then teach needs_review case.
 * Patients never call this path.
 */
import { detectUrgentCare, shouldSuppressProducts } from "./bankUrgent";
import { formatBankProductOptionLine, resolveBankProducts } from "./bankProducts";
import { loadProducts } from "./catalog";
import { fitnessByCode } from "./catalogProductFitness";
import {
  callGenerateWellnessReply,
  formatStructuredConclusion,
  type GenerateWellnessReplyResponse,
} from "./generateWellnessReplyClient";
import {
  findSimilarCases,
  isRetrievalEligible,
  knowledgeCaseFromGeminiTeach,
  listKnowledgeCases,
  saveKnowledgeCase,
  toReferenceFacts,
} from "./knowledgeBank";
import {
  draftFromContentBank,
  draftIntakeFromContentBank,
  withBankMatchMeta,
} from "./replyFromBank";
import type {
  Intake,
  KnowledgeCase,
  Screening,
  ScreeningRecommendation,
} from "./screeningTypes";

export type AdminGeminiFallbackResult = {
  source: "bank" | "gemini" | "fallback" | "urgent";
  geminiUsed: boolean;
  conclusion: string;
  conclusionSw: string;
  recommendations: ScreeningRecommendation[];
  matchedCaseIds: string[];
  weekActions: string[];
  taughtCase?: KnowledgeCase;
  message: string;
  reply?: GenerateWellnessReplyResponse | null;
};

function issueTextFromScreening(screening: Screening): string {
  const flags: string[] = [];
  for (const group of screening.groups || []) {
    for (const item of group.items || []) {
      if (item.flag === "yellow" || item.flag === "red") {
        flags.push(`${item.name} ${item.flag}`);
      }
    }
  }
  return [
    flags.join("\n"),
    screening.simpleConclusion || "",
    screening.rawTextExcerpt || "",
  ].filter(Boolean).join("\n");
}

function issueTextFromIntake(intake: Intake): string {
  return [...(intake.concerns || []), intake.freeText || ""].filter(Boolean).join("\n");
}

function detectLanguage(text: string): "en" | "sw" {
  return /[à-ÿ]|nina|tumbo|kichwa|kuhara|shinikizo|sukari|maumivu|usingizi/i.test(text) ? "sw" : "en";
}

/** Verified (or non-unsuitable) catalog rows Gemini may pick from — max 8. */
export function buildGeminiCatalogCandidates(issueText: string): Array<{
  code: string;
  name: string;
  documentedUse: string;
}> {
  const products = loadProducts().filter((p) => p.visible !== false);
  const fitness = fitnessByCode(products);
  const scored = products.map((p) => {
    const fit = fitness.get(p.code.toUpperCase());
    if (fit?.reviewStatus === "unsuitable") return null;
    let score = fit?.reviewStatus === "verified" ? 10 : 1;
    const hay = issueText.toLowerCase();
    for (const re of fit?.suitableWhen || []) {
      if (re.test(hay)) score += 5;
    }
    for (const re of fit?.excludeWhen || []) {
      if (re.test(hay)) score -= 20;
    }
    if (score <= 0) return null;
    return {
      score,
      code: p.code,
      name: p.name,
      documentedUse: fit?.reasonEn || p.category || p.description?.slice(0, 120) || "",
    };
  }).filter(Boolean) as Array<{ score: number; code: string; name: string; documentedUse: string }>;

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ code, name, documentedUse }) => ({ code, name, documentedUse }));
}

function recommendationsFromGemini(
  reply: GenerateWellnessReplyResponse,
): ScreeningRecommendation[] {
  const code = (reply.productCode || "").trim().toUpperCase();
  if (!code) return [];
  const product = loadProducts().find((p) => p.code.toUpperCase() === code);
  return [{
    code,
    productId: product?.id || code.toLowerCase(),
    name: product?.name || code,
    concern: reply.productReason || product?.category || "Wellness support",
    role: reply.productReason || product?.packSize || "See label",
    qty: 1,
    unitPrice: product?.retailPrice || 0,
    productReviewStatus: "needs_review",
  }];
}

async function teachFromGemini(opts: {
  reply: GenerateWellnessReplyResponse;
  issueText: string;
  recommendations: ScreeningRecommendation[];
  sourceScreeningId?: string;
  sourceIntakeId?: string;
  summarySw?: string;
  stableId?: string;
}): Promise<KnowledgeCase | undefined> {
  if (opts.reply.source !== "gemini") return undefined;
  const entry = knowledgeCaseFromGeminiTeach({
    id: opts.stableId,
    conditionTitle: opts.reply.conditionTitle,
    keywordsEn: opts.reply.keywordsEn,
    keywordsSw: opts.reply.keywordsSw,
    diseases: opts.reply.diseases,
    summary: opts.reply.summary,
    summarySw: opts.summarySw,
    nextSteps: opts.reply.nextSteps,
    precautions: opts.reply.precautions,
    recommendations: opts.recommendations,
    sourceScreeningId: opts.sourceScreeningId,
    sourceIntakeId: opts.sourceIntakeId,
    issueSnippet: opts.issueText.slice(0, 160),
  });
  await saveKnowledgeCase(entry);
  return entry;
}

async function callGeminiForIssue(opts: {
  issueText: string;
  language: "en" | "sw";
  concerns?: string[];
}): Promise<GenerateWellnessReplyResponse | null> {
  const urgent = detectUrgentCare(opts.issueText);
  if (urgent) {
    return {
      ok: true,
      language: opts.language,
      summary: opts.language === "sw" ? urgent.actionSw : urgent.actionEn,
      nextSteps: opts.language === "sw"
        ? "Tafuta huduma ya dharura sasa."
        : "Seek emergency care now.",
      precautions: opts.language === "sw"
        ? "Hii si utambuzi."
        : "This is not a diagnosis.",
      urgency: "urgent",
      followUpQuestion: null,
      productCode: null,
      productReason: null,
      needsAdminReview: true,
      source: "fallback",
      conditionTitle: urgent.title,
      keywordsEn: [],
      keywordsSw: [],
      diseases: [],
    };
  }

  const bank = await listKnowledgeCases();
  const approved = bank.filter(isRetrievalEligible);
  const softRefs = findSimilarCases(approved, opts.issueText, 4, { minScore: 1 });
  const suppressProducts = shouldSuppressProducts(opts.issueText);

  return callGenerateWellnessReply({
    language: opts.language,
    issueText: opts.issueText,
    concerns: opts.concerns,
    references: toReferenceFacts(softRefs),
    catalogCandidates: suppressProducts ? [] : buildGeminiCatalogCandidates(opts.issueText),
    urgency: null,
    suppressProducts,
  });
}

/**
 * Screening draft: use bank if matched; otherwise one Gemini call + teach.
 * Bank hits always win — Gemini never overrides an approved match.
 */
export async function resolveScreeningDraftWithGeminiFallback(
  screening: Screening,
  _options?: { forceGemini?: boolean },
): Promise<AdminGeminiFallbackResult> {
  const bankDraft = await draftFromContentBank(screening);
  if (bankDraft.matchedCaseIds.length) {
    return {
      source: "bank",
      geminiUsed: false,
      conclusion: bankDraft.conclusion,
      conclusionSw: bankDraft.conclusionSw,
      recommendations: bankDraft.recommendations,
      matchedCaseIds: bankDraft.matchedCaseIds,
      weekActions: bankDraft.weekActions,
      message: `Matched ${bankDraft.matchedCaseIds.length} bank case(s).`,
    };
  }

  // Urgent bank path already returned empty matchedCaseIds with urgent conclusion.
  const issueText = issueTextFromScreening(screening);
  const urgent = detectUrgentCare(issueText);
  if (urgent) {
    return {
      source: "urgent",
      geminiUsed: false,
      conclusion: bankDraft.conclusion || urgent.actionEn,
      conclusionSw: bankDraft.conclusionSw || urgent.actionSw,
      recommendations: [],
      matchedCaseIds: [],
      weekActions: bankDraft.weekActions,
      message: "Urgent care guidance — Gemini skipped.",
    };
  }

  const language = detectLanguage(issueText);
  const reply = await callGeminiForIssue({
    issueText,
    language,
    concerns: (screening.groups || []).flatMap((g) => (g.items || []).map((i) => i.name)).filter(Boolean),
  });

  if (!reply) {
    return {
      source: "fallback",
      geminiUsed: false,
      conclusion: bankDraft.conclusion,
      conclusionSw: bankDraft.conclusionSw,
      recommendations: bankDraft.recommendations,
      matchedCaseIds: [],
      weekActions: bankDraft.weekActions,
      message: "No bank match — Gemini unavailable (check GEMINI_API_KEY on Cloud Functions).",
      reply: null,
    };
  }

  const recommendations = recommendationsFromGemini(reply).map((r) => ({ ...r, qty: r.qty || 1 }));
  const { display } = resolveBankProducts(recommendations);
  const productLine = display[0] ? formatBankProductOptionLine(display[0]) : "";
  const conclusion = formatStructuredConclusion(reply, productLine || undefined);
  const conclusionSw = language === "sw"
    ? conclusion
    : bankDraft.conclusionSw || "";

  const taughtCase = await teachFromGemini({
    reply,
    issueText,
    recommendations,
    sourceScreeningId: screening.id,
    sourceIntakeId: screening.sourceIntakeId,
    summarySw: conclusionSw,
    stableId: `gemini-from-${screening.id}`,
  });

  const source = reply.source === "gemini" ? "gemini" : "fallback";
  return {
    source,
    geminiUsed: reply.source === "gemini",
    conclusion,
    conclusionSw,
    recommendations,
    matchedCaseIds: taughtCase ? [taughtCase.id] : [],
    weekActions: bankDraft.weekActions,
    taughtCase,
    message: reply.source === "gemini"
      ? `No bank match — Gemini draft applied${taughtCase ? `; saved “${taughtCase.title}” as needs review` : ""}.`
      : "No bank match — safe fallback (Gemini key missing or call failed).",
    reply,
  };
}

/** Content Bank test: Gemini + teach when the bank has no match. */
export async function resolveIntakeTestWithGeminiFallback(
  intake: Intake,
  _options?: { forceGemini?: boolean },
): Promise<AdminGeminiFallbackResult & { replyText: string; replySw: string; productLines: string[] }> {
  const bankDraft = await draftIntakeFromContentBank(intake);
  if (bankDraft.matchedCaseIds.length) {
    return {
      source: "bank",
      geminiUsed: false,
      conclusion: bankDraft.reply,
      conclusionSw: bankDraft.replySw,
      recommendations: bankDraft.recommendations,
      matchedCaseIds: bankDraft.matchedCaseIds,
      weekActions: [],
      message: bankDraft.urgent
        ? "Urgent combination matched — Gemini skipped."
        : `Matched ${bankDraft.matchedCaseIds.length} bank case(s).`,
      replyText: bankDraft.reply,
      replySw: bankDraft.replySw,
      productLines: bankDraft.productLines || [],
    };
  }

  if (bankDraft.urgent) {
    return {
      source: "urgent",
      geminiUsed: false,
      conclusion: bankDraft.reply,
      conclusionSw: bankDraft.replySw,
      recommendations: [],
      matchedCaseIds: [],
      weekActions: [],
      message: "Urgent care guidance — Gemini skipped.",
      replyText: bankDraft.reply,
      replySw: bankDraft.replySw,
      productLines: [],
    };
  }

  const issueText = issueTextFromIntake(intake);
  const language = intake.language || detectLanguage(issueText);
  const reply = await callGeminiForIssue({
    issueText,
    language,
    concerns: intake.concerns,
  });

  if (!reply) {
    return {
      source: "fallback",
      geminiUsed: false,
      conclusion: bankDraft.reply,
      conclusionSw: bankDraft.replySw,
      recommendations: bankDraft.recommendations,
      matchedCaseIds: [],
      weekActions: [],
      message: "No bank match — Gemini unavailable (check GEMINI_API_KEY on Cloud Functions).",
      replyText: bankDraft.reply,
      replySw: bankDraft.replySw,
      productLines: bankDraft.productLines || [],
    };
  }

  const recommendations = recommendationsFromGemini(reply);
  const { display } = resolveBankProducts(recommendations);
  const productLines = display.map((row) => formatBankProductOptionLine(row));
  const replyText = formatStructuredConclusion(reply, productLines[0]);
  const replySw = language === "sw" ? replyText : bankDraft.replySw;

  const taughtCase = await teachFromGemini({
    reply,
    issueText,
    recommendations,
    sourceIntakeId: intake.id.startsWith("test-") ? undefined : intake.id,
    summarySw: replySw,
  });

  return {
    source: reply.source === "gemini" ? "gemini" : "fallback",
    geminiUsed: reply.source === "gemini",
    conclusion: replyText,
    conclusionSw: replySw,
    recommendations,
    matchedCaseIds: taughtCase ? [taughtCase.id] : [],
    weekActions: [],
    taughtCase,
    message: reply.source === "gemini"
      ? `No bank match — Gemini draft applied${taughtCase ? `; saved “${taughtCase.title}” as needs review` : ""}. Green-approve before retrieval.`
      : "No bank match — safe fallback (Gemini key missing or call failed).",
    reply,
    replyText,
    replySw,
    productLines,
  };
}

/** Apply Gemini/bank result onto a screening draft (admin wizard). */
export function applyAdminDraftToScreening(
  screening: Screening,
  result: AdminGeminiFallbackResult,
): Screening {
  const recommendations = (result.recommendations.length
    ? result.recommendations
    : screening.recommendations || []).map((r) => ({ ...r, qty: r.qty || 1 }));
  return {
    ...screening,
    ...withBankMatchMeta(result.matchedCaseIds),
    bankDraftConclusion: result.conclusion,
    bankDraftConclusionSw: result.conclusionSw,
    bankDraftRecommendations: recommendations,
    simpleConclusion: result.conclusion || screening.simpleConclusion,
    simpleConclusionSw: result.conclusionSw || screening.simpleConclusionSw,
    weekActions: (screening.weekActions || []).some((a) => a.trim())
      ? screening.weekActions
      : result.weekActions,
    recommendations,
  };
}
