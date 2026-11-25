import { describe, expect, it } from "vitest";
import { formatBankProductOptionLine, resolveBankProducts, stripLeadingProductCode } from "@/lib/bankProducts";
import { detectUrgentCare } from "@/lib/bankUrgent";
import {
  approveBankCase,
  buildBankHygieneReport,
  findSimilarCases,
  saveBankCorrection,
  scoreKnowledgeMatch,
} from "@/lib/knowledgeBank";
import { assembleIntakeReply, assembleStructuredReply } from "@/lib/replyFromBank";
import { SEED_KNOWLEDGE_CASES } from "@/lib/seedKnowledge";
import type { KnowledgeCase } from "@/lib/screeningTypes";

const diabetes = SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-diabetes-sugar")!;
const bloodPressure = SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-blood-pressure-home")!;
const migraine = SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-migraine-light-sensitivity")!;

describe("bank matching isolation", () => {
  it("after approving a diabetes reply, a home BP question still returns only the blood-pressure reply", async () => {
    const bank: KnowledgeCase[] = [
      { ...diabetes, qualityFlag: "yellow" },
      { ...bloodPressure, qualityFlag: "yellow" },
    ];
    // Simulate old polluted diabetes keywords that used to steal BP questions.
    const polluted: KnowledgeCase = {
      ...diabetes,
      keywords: [...(diabetes.keywords || []), "blood", "high", "home", "keeps", "running"],
      qualityFlag: "yellow",
    };

    await approveBankCase({
      matchedCaseIds: [polluted.id],
      existingCases: [polluted, bloodPressure],
      selectedCaseId: polluted.id,
    });

    // Even if a polluted copy existed in memory, scoring must ignore generic tokens.
    const pollutedApproved = { ...polluted, qualityFlag: "green" as const };
    const matches = findSimilarCases(
      [pollutedApproved, { ...bloodPressure, qualityFlag: "green" as const }],
      "My blood pressure keeps running high at home",
      3,
    );

    expect(matches[0]?.id).toBe("seed-blood-pressure-home");
    expect(matches.some((m) => m.id === "seed-diabetes-sugar")).toBe(false);
    expect(scoreKnowledgeMatch(pollutedApproved, "My blood pressure keeps running high at home"))
      .toBeLessThan(scoreKnowledgeMatch({ ...bloodPressure, qualityFlag: "green" }, "My blood pressure keeps running high at home"));
  });

  it("English and Kiswahili paraphrases still retrieve the intended entries", () => {
    const bank = SEED_KNOWLEDGE_CASES;
    const en = findSimilarCases(bank, "migraine-like pain with light sensitivity", 3);
    const sw = findSimilarCases(bank, "Nina kichwa kinaniuma na mwanga unanisumbua", 3);
    expect(en[0]?.id).toBe("seed-migraine-light-sensitivity");
    expect(sw[0]?.id).toBe("seed-migraine-light-sensitivity");

    const bpEn = findSimilarCases(bank, "My blood pressure keeps running high at home", 2);
    const bpSw = findSimilarCases(bank, "Shinikizo la damu langu linakuwa juu nyumbani", 2);
    expect(bpEn[0]?.id).toBe("seed-blood-pressure-home");
    expect(bpSw[0]?.id).toBe("seed-blood-pressure-home");
  });
});

describe("correction + approval field preservation", () => {
  it("approving a corrected answer preserves fields and does not duplicate heading or closing", async () => {
    const base: KnowledgeCase = {
      ...migraine,
      qualityFlag: "red",
      replyOpening: "Thank you for your headache note.",
      replyConcerns: "Track timing and light triggers.",
      replyRecommendationsIntro: "Product options:",
      replyClosing: "Not a diagnosis.",
      keywords: ["migraine", "light sensitivity"],
      triggersEn: ["migraine", "light sensitivity"],
    };

    const corrected = await saveBankCorrection({
      matchedCaseIds: [base.id],
      existingCases: [base],
      selectedCaseId: base.id,
      fields: {
        replyOpening: "Corrected opening for migraine care.",
        replyConcerns: "Corrected concerns about light sensitivity and rest.",
        replyRecommendationsIntro: "Discuss these options:",
        replyClosing: "Seek urgent care for red-flag headache signs.",
        summarySw: "Muhtasari uliosahihishwa.",
        recommendations: base.recommendations,
      },
    });

    expect(corrected.qualityFlag).toBe("yellow");
    expect(corrected.keywords).toEqual(["migraine", "light sensitivity"]);
    expect(corrected.triggersEn).toEqual(["migraine", "light sensitivity"]);
    expect(corrected.replyOpening).toBe("Corrected opening for migraine care.");
    expect(corrected.replyClosing).toBe("Seek urgent care for red-flag headache signs.");

    const approved = await approveBankCase({
      matchedCaseIds: [corrected.id],
      existingCases: [corrected],
      selectedCaseId: corrected.id,
    });

    expect(approved.qualityFlag).toBe("green");
    expect(approved.replyOpening).toBe("Corrected opening for migraine care.");
    expect(approved.replyConcerns).toBe("Corrected concerns about light sensitivity and rest.");
    expect(approved.replyClosing).toBe("Seek urgent care for red-flag headache signs.");
    expect(approved.keywords).toEqual(["migraine", "light sensitivity"]);

    const assembled = assembleStructuredReply([approved]);
    expect(assembled.reply.startsWith(assembled.opening)).toBe(true);
    // Opening should appear once at the start, not duplicated inside concerns.
    expect(assembled.concerns.includes(assembled.opening)).toBe(false);
    expect(assembled.concerns.endsWith(assembled.closing)).toBe(false);
    const openingCount = assembled.reply.split(assembled.opening).length - 1;
    expect(openingCount).toBe(1);
    const closingCount = assembled.reply.split(assembled.closing).length - 1;
    expect(closingCount).toBe(1);
  });

  it("multi-match green approve requires explicit selection", async () => {
    await expect(
      approveBankCase({
        matchedCaseIds: [diabetes.id, bloodPressure.id],
        existingCases: [diabetes, bloodPressure],
      }),
    ).rejects.toMatchObject({ name: "BankApprovalSelectionError" });
  });
});

describe("product catalog display", () => {
  it("W38 and W68 show actual catalog names without repeating the code", () => {
    const { display, unresolved } = resolveBankProducts([
      { code: "W38", productId: "w38", name: "W38 Super Co-Q10 Capsule", concern: "migraine", role: "check CoQ10 amount on the package" },
      { code: "W68", productId: "w68", name: "W68", concern: "folate", role: "check package label" },
    ]);
    expect(unresolved.length).toBe(0);
    const w38 = display.find((d) => d.code === "W38")!;
    const w68 = display.find((d) => d.code === "W68")!;
    expect(w38.displayLabel).toBe("W38 Super Co-Q10 Capsule");
    expect(w38.displayLabel.match(/W38/g)?.length).toBe(1);
    expect(w68.displayLabel).toBe("W68 Vitamin B9 Capsule");
    expect(w68.displayLabel.match(/W68/g)?.length).toBe(1);
    expect(stripLeadingProductCode("W38 Super Co-Q10 Capsule", "W38")).toBe("Super Co-Q10 Capsule");
    expect(formatBankProductOptionLine(w38)).toContain("W38 Super Co-Q10 Capsule");
    expect(w38.packNote.toLowerCase()).toContain("not the amount of active ingredient");
  });

  it("unresolved codes are flagged and omitted from patient product lines", () => {
    const { display, unresolved } = resolveBankProducts([
      { code: "W999", productId: "w999", name: "Mystery", concern: "x", role: "y" },
    ]);
    expect(display.length).toBe(0);
    expect(unresolved[0]?.unresolved).toBe(true);
    const assembled = assembleIntakeReply({
      text: "migraine light sensitivity",
      cases: [migraine],
      recommendations: [{ code: "W999", productId: "w999", name: "Mystery", concern: "x", role: "y" }],
    });
    expect(assembled.productLines.length).toBe(0);
    expect(assembled.unresolvedProducts.length).toBe(1);
  });
});

describe("urgent care priority", () => {
  it("shows immediate action first and no product cards even when a routine case also matches", () => {
    const text = "Sudden severe headache with slurred speech started an hour ago";
    expect(detectUrgentCare(text)?.id).toBe("urgent-stroke-headache-speech");

    const assembled = assembleIntakeReply({
      text,
      cases: [migraine, diabetes],
      recommendations: migraine.recommendations,
    });

    expect(assembled.urgent).toBe(true);
    expect(assembled.recommendations.length).toBe(0);
    expect(assembled.productLines.length).toBe(0);
    expect(assembled.reply.toLowerCase()).toContain("immediate action");
    expect(assembled.reply.toLowerCase()).not.toContain("super co-q10");
  });

  it("covers the other urgent combinations", () => {
    expect(detectUrgentCare("Very high blood pressure with chest pain tonight")?.id).toBe("urgent-bp-chest-pain");
    expect(detectUrgentCare("I am pregnant with severe headache and vision changes")?.id).toBe("urgent-pregnancy-headache-vision");
    expect(detectUrgentCare("I cannot swallow saliva at all")?.id).toBe("urgent-cannot-swallow-saliva");
    expect(detectUrgentCare("Chest pain with shortness of breath and sweating")?.id).toBe("urgent-chest-pain-warning");
    expect(detectUrgentCare("Sudden hearing loss in my left ear")?.id).toBe("urgent-sudden-hearing-loss");
    expect(detectUrgentCare("Heavy periods with breathlessness this week")?.id).toBe("urgent-heavy-periods-breathlessness");
  });
});

describe("hygiene review list", () => {
  it("lists suspected approval-added keywords and duplicated reply text without mutating entries", () => {
    const dirty: KnowledgeCase = {
      ...diabetes,
      keywords: [...(diabetes.keywords || []), "blood", "home", "keeps"],
      replyOpening: "Hello opening.",
      replyConcerns: "Hello opening. Body text. Hello closing.",
      replyClosing: "Hello closing.",
    };
    const findings = buildBankHygieneReport([dirty]);
    expect(findings.some((f) => f.kind === "suspected-approval-keyword" && f.value === "blood")).toBe(true);
    expect(findings.some((f) => f.kind === "duplicated-reply-text")).toBe(true);
    expect(dirty.keywords).toContain("blood");
  });
});
