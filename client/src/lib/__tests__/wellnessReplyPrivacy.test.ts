import { describe, expect, it } from "vitest";
import { detectUrgentCare, shouldSuppressProducts } from "@/lib/bankUrgent";
import {
  buildBankHygieneReport,
  findSimilarCases,
  isRetrievalEligible,
  knowledgeCaseFromScreening,
  redactPiiForModel,
  toReferenceFacts,
} from "@/lib/knowledgeBank";
import { assembleIntakeReply, pickSingleRecommendation } from "@/lib/replyFromBank";
import { SEED_KNOWLEDGE_CASES } from "@/lib/seedKnowledge";
import type { KnowledgeCase, Screening } from "@/lib/screeningTypes";

const migraine = SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-migraine-light-sensitivity")!;
const digestive = SEED_KNOWLEDGE_CASES.find((c) => c.id === "seed-digestive")!;
const wristish = SEED_KNOWLEDGE_CASES.find((c) =>
  (c.triggersEn || []).some((t) => /joint|wrist|movement/i.test(t))
  || /joint/i.test(c.title),
) || {
  ...migraine,
  id: "seed-joint-test",
  title: "Joint and movement support",
  conditionTitle: "Joint and movement support",
  triggersEn: ["wrist", "joint", "movement"],
  triggersSw: ["kiungo"],
  keywords: ["wrist pain"],
  diseases: ["joint discomfort"],
  summary: "Joint wellness support.",
  replyConcerns: "Rest the joint and discuss movement-friendly wellness options.",
  recommendations: [
    { code: "W37", productId: "w37", name: "Joint Health Plus Capsule", concern: "Joint", role: "Joint wellness" },
  ],
  reviewStatus: "approved" as const,
  active: true,
  qualityFlag: "green" as const,
};

function approved(c: KnowledgeCase): KnowledgeCase {
  return { ...c, reviewStatus: "approved", active: true, qualityFlag: "green", conditionTitle: c.conditionTitle || c.title };
}

describe("retrieval privacy gates", () => {
  it("excludes quarantined and needs_review entries from patient retrieval", () => {
    const bank = [
      approved(migraine),
      { ...approved(digestive), reviewStatus: "quarantined" as const, active: false },
      { ...approved(wristish), reviewStatus: "needs_review" as const },
    ];
    const matches = findSimilarCases(bank, "migraine-like pain with light sensitivity", 5);
    expect(matches.every((m) => m.id === "seed-migraine-light-sensitivity")).toBe(true);
    expect(isRetrievalEligible({ ...digestive, reviewStatus: "quarantined", active: false })).toBe(false);
  });

  it("keeps urinary guidance from spilling wrist advice", () => {
    const bank = [approved(migraine), approved(wristish), approved(digestive)];
    const matches = findSimilarCases(bank, "Burning when I urinate and lower tummy ache", 5);
    expect(matches.some((m) => /wrist|joint/i.test(m.title))).toBe(false);
  });

  it("redacts emails and phones before model context", () => {
    const raw = "Call me Jane Doe at jane@example.com or +254 759 550 133 about screening-abc123xyz";
    const cleaned = redactPiiForModel(raw);
    expect(cleaned).not.toMatch(/jane@example\.com/i);
    expect(cleaned).not.toMatch(/759\s*550\s*133/);
    expect(cleaned.toLowerCase()).not.toContain("screening-abc123xyz");
  });

  it("knowledgeCaseFromScreening never embeds patient names and stays inactive", () => {
    const screening = {
      id: "scr-test-1",
      status: "shared",
      subject: { name: "Alice Example", email: "alice@example.com" },
      groups: [
        {
          title: "General",
          items: [{ name: "Joint discomfort", flag: "yellow", value: "", followUp: "" }],
        },
      ],
      simpleConclusion: "Thank you Alice Example. Rest the joint. Email alice@example.com",
      recommendations: [],
    } as Screening;
    const entry = knowledgeCaseFromScreening(screening);
    expect(entry.title.toLowerCase()).not.toContain("alice");
    expect(entry.reviewStatus).toBe("needs_review");
    expect(entry.active).toBe(false);
    expect(entry.summary.toLowerCase()).not.toContain("alice@example.com");
  });

  it("toReferenceFacts omits patient-looking titles when conditionTitle set", () => {
    const facts = toReferenceFacts([
      approved({
        ...migraine,
        conditionTitle: "Migraine-like headache",
        title: "Screening · Secret Patient",
      }),
    ]);
    expect(facts[0].conditionTitle).toBe("Migraine-like headache");
    expect(facts[0].conditionTitle).not.toMatch(/Secret Patient/i);
  });
});

describe("urgency and single product policy", () => {
  it("suppresses products for chest pain and sudden hearing loss", () => {
    expect(shouldSuppressProducts("Chest pain with shortness of breath and sweating")).toBe(true);
    expect(detectUrgentCare("Sudden hearing loss in one ear this morning")?.id).toBe("urgent-sudden-hearing-loss");
    expect(shouldSuppressProducts("Heavy periods with breathlessness and dizziness")).toBe(true);
  });

  it("pickSingleRecommendation returns at most one resolved product", () => {
    const picked = pickSingleRecommendation("migraine-like pain with light sensitivity", [
      ...migraine.recommendations,
      ...digestive.recommendations,
    ]);
    expect(picked.patientRecs.length).toBeLessThanOrEqual(1);
    expect(picked.productLines.length).toBeLessThanOrEqual(1);
  });

  it("urgent assemble clears products even with bank recommendations", () => {
    const assembled = assembleIntakeReply({
      text: "Chest pain with shortness of breath started suddenly",
      cases: [approved(migraine)],
      recommendations: migraine.recommendations,
    });
    expect(assembled.urgent).toBe(true);
    expect(assembled.recommendations).toEqual([]);
  });
});

describe("hygiene pii kinds", () => {
  it("flags email/phone and patient-titled screening entries", () => {
    const dirty: KnowledgeCase = {
      ...approved(migraine),
      title: "Screening · Bob Smith",
      summary: "Call bob@example.com",
    };
    const findings = buildBankHygieneReport([dirty]);
    expect(findings.some((f) => f.kind === "pii-suspected")).toBe(true);
    expect(findings.some((f) => f.kind === "patient-note-copy")).toBe(true);
  });
});
