import { describe, expect, it } from "vitest";
import { pickBestProductForQuestion } from "@/lib/bankProducts";
import { buildCatalogFitnessIndex, summarizeCatalogResearch } from "@/lib/catalogProductFitness";
import { defaultProducts } from "@/lib/catalog";
import { assembleIntakeReply, pickSingleRecommendation } from "@/lib/replyFromBank";
import { buildPatientReport } from "@/lib/buildPatientReport";
import { SEED_KNOWLEDGE_CASES } from "@/lib/seedKnowledge";
import type { KnowledgeCase, Screening } from "@/lib/screeningTypes";

function approved(c: KnowledgeCase): KnowledgeCase {
  return {
    ...c,
    reviewStatus: "approved",
    active: true,
    qualityFlag: "green",
    conditionTitle: c.conditionTitle || c.title,
  };
}

const digestive = approved(SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-digestive")!);
const energy = approved(SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-energy")!);
const stress = approved(SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-stress-sleep")!);
const reflux = approved(SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-reflux-heartburn")!);
const migraine = approved(SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-migraine-light-sensitivity")!);

describe("catalog research index", () => {
  it("covers every live catalog SKU and marks fertilizers unsuitable", () => {
    const summary = summarizeCatalogResearch(defaultProducts);
    expect(summary.researched).toBe(defaultProducts.length);
    expect(summary.unsuitable).toBeGreaterThanOrEqual(3);
    const rows = buildCatalogFitnessIndex(defaultProducts);
    expect(rows.find((r) => r.code === "W47")?.reviewStatus).toBe("unsuitable");
    expect(rows.find((r) => r.code === "W51")?.reviewStatus).toBe("verified");
    expect(summary.verified).toBeGreaterThan(0);
  });
});

describe("best-fit product picking", () => {
  it("recommends digestive drink for diarrhea and excludes reflux tablet", () => {
    const q = "Fictional QA: I have a bad stomach and diarrhea";
    const picked = pickBestProductForQuestion(q, digestive.recommendations);
    expect(picked.chosen?.code).toBe("W51");
    expect(picked.chosen?.code).not.toBe("W71");
  });

  it("heartburn question can use gastric tablet and not diarrhea drink inheritance on reflux entry", () => {
    const q = "Heartburn after lying down and sour taste in the morning";
    const picked = pickBestProductForQuestion(q, reflux.recommendations);
    expect(picked.chosen?.code).toBe("W71");
  });

  it("heavy periods with breathlessness must not suggest Protein Powder", () => {
    const q = "Heavy periods with breathlessness and dizziness this week";
    const picked = pickBestProductForQuestion(q, energy.recommendations);
    expect(picked.chosen).toBeNull();
    const assembled = assembleIntakeReply({
      text: q,
      cases: [energy],
      recommendations: energy.recommendations,
    });
    // Urgency rule should clear products entirely.
    expect(assembled.urgent).toBe(true);
    expect(assembled.recommendations).toEqual([]);
  });

  it("stress-related sleep trouble does not default to coffee or fish oil", () => {
    const q = "Stress-related sleep trouble — I cannot fall asleep when worried";
    expect(stress.recommendations.length).toBe(0);
    const assembled = assembleIntakeReply({
      text: q,
      cases: [stress],
      recommendations: [
        ...stress.recommendations,
        { code: "W12", productId: "w12", name: "Ganoderma Coffee", concern: "stress", role: "coffee", rank: 1 },
        { code: "W19", productId: "w19", name: "Fish Oil", concern: "stress", role: "oil", rank: 2 },
      ],
    });
    expect(assembled.recommendations.map((r) => r.code)).not.toContain("W12");
    expect(assembled.recommendations.map((r) => r.code)).not.toContain("W19");
  });

  it("diarrhea does not inherit reflux products from a mixed option list", () => {
    const q = "Watery diarrhea for two days and bad stomach";
    const mixed = [
      ...(reflux.recommendations || []),
      ...(digestive.recommendations || []),
    ];
    const picked = pickBestProductForQuestion(q, mixed);
    expect(picked.chosen?.code).toBe("W51");
    expect(picked.chosen?.code).not.toBe("W71");
  });

  it("migraine paraphrase still gets CoQ10 when fit is clear", () => {
    const q = "Migraine-like pain with light sensitivity";
    const single = pickSingleRecommendation(q, migraine.recommendations);
    expect(single.patientRecs[0]?.code).toBe("W38");
    expect(single.productLines[0]?.toLowerCase()).toContain("coq10");
  });

  it("Kiswahili diarrhea phrasing still prefers digestive drink", () => {
    const q = "Ninaumwa tumbo na kuhara.";
    const picked = pickBestProductForQuestion(q, digestive.recommendations);
    expect(picked.chosen?.code).toBe("W51");
  });
});

describe("report payment visibility", () => {
  it("hides payment when there are no product lines", () => {
    const screening = {
      id: "scr-empty-plan",
      patientId: "p1",
      status: "shared",
      subject: { name: "You" },
      groups: [],
      simpleConclusion: "Guidance only.",
      recommendations: [],
    } as Screening;
    const report = buildPatientReport(screening, defaultProducts);
    expect(report.showPayment).toBe(false);
    expect(report.paymentNote).toBe("");
    expect(report.lines.length).toBe(0);
  });

  it("shows payment when a resolved product is on the plan", () => {
    const screening = {
      id: "scr-with-plan",
      patientId: "p1",
      status: "shared",
      subject: { name: "You" },
      groups: [],
      simpleConclusion: "Plan ready.",
      recommendations: [
        { code: "W38", productId: "w38", name: "Super Co-Q10 Capsule", concern: "migraine", role: "check label", qty: 1 },
      ],
    } as Screening;
    const report = buildPatientReport(screening, defaultProducts);
    expect(report.showPayment).toBe(true);
    expect(report.lines[0]?.code).toBe("W38");
    expect(report.paymentNote.length).toBeGreaterThan(10);
  });
});
