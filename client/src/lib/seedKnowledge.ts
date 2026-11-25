import { listKnowledgeCases, saveKnowledgeCase } from "./knowledgeBank";
import type { KnowledgeCase } from "./screeningTypes";

/** Trained starter content bank from the illustrative Person X conclusion (keywords + diseases + structure). */
export const SEED_KNOWLEDGE_CASES: KnowledgeCase[] = [
  {
    id: "seed-nutrition-general",
    title: "General nutritional support",
    triggersEn: ["nutrition", "vitamin", "mineral", "nutritional insufficiency", "dietary gaps"],
    triggersSw: ["lishe", "vitamini", "madini"],
    keywords: ["multivitamin", "nutrient", "deficiency flag"],
    diseases: ["nutritional insufficiency", "vitamin deficiency (screening flag)"],
    summary:
      "Possible nutritional insufficiency may benefit from a general multivitamin or Super Nutrition style support, with balanced meals and hydration.",
    replyOpening: "Your screening suggests nutrition support may help.",
    replyConcerns: "Focus on balanced meals, hydration, and a general nutrient product if the package fits your needs.",
    replyRecommendationsIntro: "Product option:",
    replyClosing: "Not a diagnosis. Follow the label and ask a clinician if symptoms are serious.",
    recommendations: [
      {
        code: "W41", productId: "w41", name: "Super Nutrition", rank: 1,
        concern: "General nutritional support",
        role: "Broad nutrient support when diet gaps are the concern — follow the label.",
        reasonEn: "Broad nutrient support when diet gaps are the concern — follow the label.",
        reasonSw: "Msaada wa virutubisho wakati lishe ina mapengo — fuata lebo.",
        suitableWhen: ["nutrition", "vitamin", "mineral", "lishe", "vitamini", "madini"],
        excludeWhen: ["chest pain", "heavy periods", "breathlessness"],
        productReviewStatus: "verified",
      },
      {
        code: "W15", productId: "w15", name: "Multi-vitamin Tablet (For Adults)", rank: 2,
        concern: "General nutritional support",
        role: "Adult multivitamin option for general nutritional support — follow the label.",
        reasonEn: "Adult multivitamin option for general nutritional support — follow the label.",
        reasonSw: "Multivitamini ya watu wazima kwa msaada wa lishe — fuata lebo.",
        suitableWhen: ["multivitamin", "vitamin", "lishe"],
        productReviewStatus: "verified",
      },
    ],
  },
  {
    id: "seed-digestive",
    title: "Digestive discomfort",
    triggersEn: ["digestive", "digestion", "intestine", "bowel", "stomach", "diarrhea", "diarrhoea", "loose stool", "bad stomach"],
    triggersSw: ["mmeng'enyo", "tumbo", "utumbo", "kuhara", "choo laini"],
    keywords: ["digestive wellness", "intestinal comfort", "yellow digestive", "diarrhea", "stomach pain"],
    diseases: ["digestive imbalance (screening flag)", "poor intestinal comfort", "diarrhea (symptom report)"],
    summary:
      "Mild digestive imbalance flags may pair with digestive-wellness drinks or teas, introduced carefully and not as disease treatment.",
    summarySw:
      "Asante kwa kushiriki. Umeripoti usumbufu wa tumbo au kuhara. Jadili milo, maji, na utaratibu wa siku. Vinywaji vya ustawi wa mmeng'enyo vinaweza kuzingatiwa — si tiba ya ugonjwa wa tumbo.",
    replyOpening: "Digestive comfort came up in the matched content.",
    replyConcerns: "Discuss routine, meals, and hydration. A digestive wellness drink or tea may be considered.",
    replyRecommendationsIntro: "Product option:",
    replyClosing: "This is wellness support, not treatment for digestive disease.",
    recommendations: [
      {
        code: "W51", productId: "w51", name: "Fresh Drink Clear", rank: 1,
        concern: "Digestive discomfort",
        role: "Digestive wellness drink for tummy/bowel comfort — not a reflux product.",
        reasonEn: "Digestive wellness drink for tummy/bowel comfort — not a reflux product.",
        reasonSw: "Kinywaji cha ustawi wa tumbo/utumbo — si bidhaa ya kiungulia.",
        suitableWhen: ["diarrhea", "diarrhoea", "loose stool", "bad stomach", "kuhara", "tumbo", "digest"],
        excludeWhen: ["heartburn", "reflux", "kiungulia", "migraine", "wrist"],
        productReviewStatus: "verified",
      },
      {
        code: "W28", productId: "w28", name: "Intestine Cleansing Tea", rank: 2,
        concern: "Digestive discomfort",
        role: "Digestive wellness tea — follow the label; not a reflux treatment.",
        reasonEn: "Digestive wellness tea — follow the label; not a reflux treatment.",
        reasonSw: "Chai ya ustawi wa mmeng'enyo — fuata lebo; si tiba ya kiungulia.",
        suitableWhen: ["intestin", "bowel", "utumbo"],
        excludeWhen: ["heartburn", "reflux", "kiungulia", "diarrhea"],
        productReviewStatus: "verified",
      },
    ],
  },
  {
    id: "seed-energy",
    title: "Low energy and protein gaps",
    triggersEn: ["energy", "fatigue", "tiredness", "low energy", "protein"],
    triggersSw: ["uchovu", "nguvu", "proteini"],
    keywords: ["tired", "fatigue flag", "reduced energy"],
    diseases: ["fatigue (screening flag)", "low energy"],
    summary: "Tiredness with dietary gaps may suggest protein and nutrition support alongside rest and meals.",
    replyOpening: "Low energy was matched in the content bank.",
    replyConcerns: "Rest, meals, and protein support can be discussed when diet protein looks low.",
    replyRecommendationsIntro: "Product option:",
    replyClosing: "Not a medical diagnosis of fatigue causes.",
    recommendations: [
      {
        code: "W14", productId: "w14", name: "Protein Powder", rank: 1,
        concern: "Low energy and dietary gaps",
        role: "Additional dietary protein when meals are light — not for bleeding or breathlessness.",
        reasonEn: "Additional dietary protein when meals are light — not for bleeding or breathlessness.",
        reasonSw: "Protini ya ziada lishe nyepesi — si kwa kutokwa damu au kupumua kwa shida.",
        suitableWhen: ["protein", "low energy", "fatigue", "tired", "uchovu", "proteini"],
        excludeWhen: ["heavy period", "breathless", "breathlessness", "diarrhea", "kuhara", "chest pain"],
        productReviewStatus: "verified",
      },
    ],
  },
  {
    id: "seed-stress-sleep",
    title: "Stress and tiredness",
    triggersEn: ["stress", "sleep", "poor sleep", "fatigue"],
    triggersSw: ["msongo", "usingizi"],
    keywords: ["inadequate sleep", "stress flag"],
    diseases: ["stress (screening flag)", "poor sleep"],
    summary: "Stress or inadequate sleep flags suggest lifestyle review first; no default coffee or fish-oil product.",
    replyOpening: "Stress or sleep concerns matched approved bank content.",
    replyConcerns: "Review sleep habits and daily load first. Track caffeine timing, wind-down routine, and whether worry peaks at night. Seek professional help for severe anxiety, lasting insomnia, or depression symptoms.",
    replyRecommendationsIntro: "",
    replyClosing: "Seek professional help for severe anxiety, insomnia, or depression symptoms.",
    emptyProductReason: "Stress-related sleep trouble is guidance-first; coffee and fish oil are not default recommendations.",
    recommendations: [],
  },
  {
    id: "seed-circulation",
    title: "Circulation wellness",
    triggersEn: ["circulation", "cholesterol", "omega", "blood fat"],
    triggersSw: ["mzunguko", "damu"],
    keywords: ["vascular", "lipid flag"],
    diseases: ["circulation wellness flag", "cholesterol software flag"],
    summary: "Circulation-related software flags may pair with omega-3 nutrition discussion and clinical confirmation if needed.",
    replyOpening: "Circulation-related flags matched the content bank.",
    replyConcerns: "Discuss activity, hydration, and diet. Confirm clinically if needed — this is not a lipid diagnosis.",
    replyRecommendationsIntro: "Product option:",
    replyClosing: "Lab tests are different from analyzer software bands.",
    recommendations: [
      {
        code: "W19", productId: "w19", name: "Deep Sea Fish Oil Softgel", rank: 1,
        concern: "General circulation wellness",
        role: "Omega-3 nutritional softgel when circulation/nutrition fit is clear — check EPA/DHA on the pack.",
        reasonEn: "Omega-3 nutritional softgel when circulation/nutrition fit is clear — check EPA/DHA on the pack.",
        reasonSw: "Softjeli ya omega-3 lishe inapolingana — angalia EPA/DHA kwenye pakiti.",
        suitableWhen: ["circulation", "omega", "cholesterol", "fish oil", "mzunguko"],
        excludeWhen: ["poor sleep", "insomnia", "usingizi", "stress sleep", "diarrhea", "migraine"],
        productReviewStatus: "needs_review",
      },
    ],
  },
  {
    id: "seed-vitamin-d-bone",
    title: "Vitamin D or bone support",
    triggersEn: ["vitamin d", "bone", "calcium"],
    triggersSw: ["vitamin d", "mifupa", "kalsiamu"],
    keywords: ["bone-support flag", "D3"],
    diseases: ["vitamin D flag", "bone support flag"],
    summary: "Vitamin D or bone-support flags suggest label-confirmed vitamin D or calcium options after diet review.",
    replyOpening: "Vitamin D / bone support matched the bank.",
    replyConcerns: "Consider diet review and a label-confirmed vitamin D or calcium option if appropriate.",
    replyRecommendationsIntro: "Bone/nutrition options:",
    replyClosing: "Not a diagnosis of bone disease. Confirm with a clinician when needed.",
    recommendations: [
      { code: "W59", productId: "w59", name: "Vitamin D3 Capsule", concern: "Vitamin D or bone-support flag", role: "Vitamin D support" },
      { code: "W16", productId: "w16", name: "Calcium Tablet for Adults", concern: "Vitamin D or bone-support flag", role: "Calcium support" },
    ],
  },
  {
    id: "seed-abdominal-marrow-concern",
    title: "Abdominal discomfort with tiredness and blood-cell concern",
    triggersEn: [
      "abdominal pain",
      "stomach discomfort",
      "nausea",
      "loss of appetite",
      "weak",
      "tired",
      "exhausted",
      "bone marrow",
      "blood cells",
      "anemia",
      "platelets",
    ],
    triggersSw: ["maumivu ya tumbo", "kichefuchefu", "hamuvu", "uchovu", "uboho", "damu"],
    keywords: [
      "persistent abdominal pain",
      "low appetite",
      "unusual weakness",
      "blood-cell production",
      "red blood cells",
      "white blood cells",
    ],
    diseases: [
      "abdominal discomfort (help note)",
      "low energy",
      "blood-cell production concern (reported)",
    ],
    summary:
      "Persistent abdominal discomfort with tiredness and a reported blood-cell production concern — gather prior results, track symptoms, and hold new supplements until the plan is reviewed.",
    summarySw:
      "Maumivu ya tumbo yanayoendelea pamoja na uchovu na wasiwasi wa uzalishaji wa seli za damu — shika matokeo ya awali, fuatilia dalili, na usianzishe virutubisho vipya hadi mpango ukaguliwe.",
    replyOpening:
      "Thank you for explaining what you have been going through. We have noted persistent abdominal discomfort, nausea or low appetite, and unusual tiredness, together with your concern about blood-cell production.",
    replyConcerns:
      "Your note links stomach symptoms with marked weakness. Those can travel together or need separate attention. Useful next steps for your record: keep prior test results and a list of medicines or supplements ready; note where the pain sits, when it comes, appetite, stool colour, fever, bruising or bleeding, and how energy changes through the day. Gentle rest, small meals if you can manage them, and steady fluids if tolerated can support comfort while your plan is reviewed. Pause starting new iron, B12, folate, herbal, detox, or “blood-building” products on your own until the picture is clearer — some can clash with other care or confuse later results. Prefer simple pain options only if already part of your usual routine; avoid stacking several new supplements at once.",
    replyRecommendationsIntro: "Product plan for this case:",
    replyClosing:
      "Wellness information only — not a diagnosis or treatment. Follow current package labels if any product is later added to your plan.",
    recommendations: [],
  },
  {
    id: "seed-migraine-light-sensitivity",
    title: "Migraine-like pain / light sensitivity",
    triggersEn: [
      "migraine",
      "migraine-like",
      "light sensitivity",
      "headache with light",
      "photophobia",
      "headache",
      "head & mind",
    ],
    triggersSw: [
      "migraine",
      "maumivu ya kichwa",
      "mwanga unachukiza",
      "mwanga unanisumbua",
      "kichwa kinaniuma",
      "kichwa na akili",
    ],
    keywords: [
      "Migraine-like pain / light sensitivity",
      "Head & mind · Migraine-like pain / light sensitivity",
      "nausea with headache",
      "vision changes with headache",
      "dim room",
    ],
    diseases: [
      "headache with light sensitivity",
      "migraine-like pain / light sensitivity",
      "headache (screening flag)",
    ],
    summary:
      "Migraine-like headaches with light sensitivity — track timing, accompanying symptoms, rest in a quiet dim room, and seek emergency care for red-flag headache signs.",
    summarySw:
      "Maumivu ya kichwa yanayofanana na migraine na mwanga unachukiza — fuatilia muda, dalili zinazoambatana, pumzika mahali tulivu giza, na tafuta huduma ya dharura ikiwa kuna ishara hatari.",
    replyOpening:
      "Thank you for completing the screening. We have noted migraine-like pain or headaches with light sensitivity among the flagged head-and-mind items.",
    replyConcerns:
      "Note when the pain starts, how long it lasts, and whether nausea, vision changes, or dizziness occur at the same time. Rest in a quiet, dim room if it helps. Seek emergency care for a sudden, extremely severe headache or a headache with new weakness, trouble speaking, vision loss, confusion, or fever with a stiff neck. Source: www.nhs.uk",
    replyRecommendationsIntro: "Product option:",
    replyClosing:
      "Products are wellness-support options only — not a diagnosis or treatment. Follow package labels and seek a clinician for serious or urgent symptoms.",
    recommendations: [
      {
        code: "W38",
        productId: "w38",
        name: "Super Co-Q10 Capsule",
        rank: 1,
        concern: "Migraine-like pain / light sensitivity",
        role: "Discuss for recurrent migraine-like headaches with light sensitivity; check CoQ10 amount on the package.",
        reasonEn: "Discuss for recurrent migraine-like headaches with light sensitivity; check CoQ10 amount on the package.",
        reasonSw: "Jadili kwa maumivu ya kichwa yanayofanana na migraine na mwanga; angalia kiasi cha CoQ10 kwenye pakiti.",
        suitableWhen: ["migraine", "light sensitivity", "photophobia", "mwanga", "kichwa"],
        excludeWhen: ["diarrhea", "kuhara", "wrist", "joint", "reflux", "heartburn", "urin"],
        productReviewStatus: "verified",
      },
    ],
  },
  {
    id: "seed-reflux-heartburn",
    title: "Heartburn / reflux-style discomfort",
    conditionTitle: "Heartburn / reflux-style discomfort",
    triggersEn: ["heartburn", "reflux", "acid after lying", "sour taste", "gastric"],
    triggersSw: ["kiungulia", "asidi", "tumbo la juu"],
    keywords: ["lying down heartburn", "spicy dinner burning"],
    diseases: ["heartburn (symptom report)", "reflux-style discomfort"],
    summary: "Heartburn after meals or lying down — meal timing, elevation, and clinician review if persistent; gastric tablet only when fit is clear.",
    summarySw: "Kiungulia baada ya milo au kulala — muda wa milo, kuinua kichwa, na mapitio ya daktari ikiwa inaendelea.",
    replyOpening: "Thank you for sharing your heartburn or upper-stomach burning note.",
    replyConcerns: "Track triggers (spicy or late meals, lying flat soon after eating). Elevate the head of the bed if nights are worse. Arrange clinical review if pain is severe, you vomit blood, or swallowing becomes hard.",
    replyRecommendationsIntro: "Product option:",
    replyClosing: "Wellness information only — not a diagnosis of ulcer or reflux disease.",
    recommendations: [
      {
        code: "W71", productId: "w71", name: "Gastric Health Tablet", rank: 1,
        concern: "Heartburn / reflux-style discomfort",
        role: "Gastric comfort tablet only when heartburn/reflux-style discomfort is the topic — follow the label.",
        reasonEn: "Gastric comfort tablet only when heartburn/reflux-style discomfort is the topic — follow the label.",
        reasonSw: "Kidonge cha faraja ya tumbo la juu kwa kiungulia tu — fuata lebo.",
        suitableWhen: ["heartburn", "reflux", "kiungulia", "acid", "gastric"],
        excludeWhen: ["diarrhea", "kuhara", "loose stool", "intestin", "migraine", "wrist"],
        productReviewStatus: "needs_review",
      },
    ],
  },
  {
    id: "seed-dizziness-lightheaded",
    title: "Dizziness or light-headedness",
    triggersEn: [
      "dizziness",
      "dizzy",
      "light-headed",
      "light-headedness",
      "lightheaded",
      "vertigo",
      "spinning",
      "head & mind",
    ],
    triggersSw: [
      "kizunguzungu",
      "kichwa kinazunguka",
      "kichwa na akili",
    ],
    keywords: [
      "Dizziness or light-headedness",
      "Head & mind · Dizziness or light-headedness",
      "room spins",
      "might faint",
      "stand up dizziness",
    ],
    diseases: [
      "dizziness",
      "dizziness or light-headedness",
      "vertigo (reported)",
    ],
    summary:
      "Dizziness or light-headedness — sit or lie down, rise slowly, avoid driving while dizzy, and note spinning vs near-fainting patterns for clinician review.",
    summarySw:
      "Kizunguzungu — kaa au lala chini, inuka polepole, usiendeshe gari ukiwa na kizunguzungu, na andika ikiwa chumba kinazunguka au unahisi kuzimia kwa mapitio ya daktari.",
    replyOpening:
      "Thank you for completing the screening. We have noted dizziness or light-headedness among the flagged head-and-mind items.",
    replyConcerns:
      "Sit or lie down when it happens, get up slowly, and avoid driving while dizzy. Write down whether the room spins or you feel as though you might faint, and whether it starts when you stand up. See a clinician if it persists or keeps returning. If you also have headaches, note whether they happen together and arrange a clinician review if they recur. Source: www.nhs.uk",
    replyRecommendationsIntro: "Product options to discuss for this case:",
    replyClosing:
      "Products are wellness-support options only — not a diagnosis or treatment. Follow package labels and seek a clinician for serious or urgent symptoms.",
    recommendations: [
      {
        code: "W26",
        productId: "w26",
        name: "Ginkgo Biloba Capsule",
        concern: "Dizziness or light-headedness",
        role:
          "Candidate to discuss if the dizziness feels like spinning. Research has studied a specific standardized ginkgo extract for vertigo. Ask a pharmacist whether this product uses that extract. Wait for assessment if you feel faint or the cause is unclear. Ask before use if you take a blood thinner — ginkgo can increase bleeding risk. Evidence: pubmed.ncbi.nlm.nih.gov",
      },
    ],
  },
  {
    id: "seed-low-mood",
    title: "Low mood or feeling down",
    triggersEn: [
      "low mood",
      "feeling down",
      "depressed",
      "depression",
      "sadness",
      "downhearted",
      "head & mind",
    ],
    triggersSw: [
      "hali ya chini",
      "kukata tamaa",
      "huzuni",
      "kichwa na akili",
    ],
    keywords: [
      "Low mood or feeling down",
      "Head & mind · Low mood or feeling down",
      "mood lasting two weeks",
      "daily life difficult",
    ],
    diseases: [
      "low mood",
      "low mood or feeling down",
      "mood concern (screening flag)",
    ],
    summary:
      "Low mood — track duration and impact on sleep, appetite, and daily life; arrange clinician care for lasting or disabling symptoms, and seek urgent help for safety concerns.",
    summarySw:
      "Hali ya chini — fuatilia muda na athari kwa usingizi, hamuvu, na maisha ya kila siku; panga huduma ya daktari ikiwa inaendelea, na tafuta msaada wa haraka ikiwa usalama unahatarishwa.",
    replyOpening:
      "Thank you for completing the screening. We have noted low mood or feeling down among the flagged head-and-mind items.",
    replyConcerns:
      "Track how long it lasts and whether it affects your sleep, appetite, or daily activities. Talk to a clinician if it lasts two weeks or is already making daily life difficult. Seek urgent help if you have thoughts of harming yourself, and seek emergency help now if you feel unable to stay safe. Source: www.nhs.uk",
    replyRecommendationsIntro: "Product options to discuss for this case:",
    replyClosing:
      "Products are wellness-support options only — not a diagnosis or treatment. Follow package labels and seek a clinician for serious or urgent symptoms. Arrange care for persistent low mood.",
    emptyProductReason: "Persistent low mood needs clinician-led care first; omega-3 is not a default mood product.",
    recommendations: [],
  },
  {
    id: "seed-diabetes-sugar",
    title: "Blood sugar / diabetes wellness discussion",
    triggersEn: [
      "diabetes",
      "blood sugar",
      "high sugar",
      "sugar levels",
      "glucose",
      "diabetic",
    ],
    triggersSw: [
      "kisukari",
      "sukari damuni",
      "sukari",
    ],
    keywords: [
      "blood sugar monitoring",
      "diabetes lifestyle",
      "glucose concern",
    ],
    diseases: [
      "diabetes (screening discussion)",
      "blood sugar concern",
    ],
    summary:
      "Blood sugar / diabetes discussion — support lifestyle review and clinician-led care; wellness products are not a substitute for prescribed diabetes treatment.",
    summarySw:
      "Majadiliano ya sukari damuni / kisukari — shika mapitio ya mtindo wa maisha na huduma ya daktari; bidhaa za wellness si badala ya tiba iliyoagizwa.",
    replyOpening:
      "Thank you for sharing your blood sugar / diabetes concerns.",
    replyConcerns:
      "Track readings if you already monitor at home, keep meals regular, and bring your log to a clinician. Wellness products are not a substitute for prescribed diabetes care.",
    replyRecommendationsIntro: "Optional products to discuss with your clinician:",
    replyClosing:
      "Not a diagnosis or treatment plan. Follow package labels and prescribed care.",
    recommendations: [
      {
        code: "W42",
        productId: "w42",
        name: "Glucoblock Capsule",
        concern: "Blood sugar / diabetes wellness discussion",
        role: "Discuss only with a clinician; check the package label. Not a substitute for prescribed diabetes care.",
      },
    ],
  },
  {
    id: "seed-blood-pressure-home",
    title: "Blood pressure monitoring at home",
    triggersEn: [
      "blood pressure",
      "high blood pressure",
      "bp high",
      "hypertension",
      "pressure at home",
      "running high at home",
    ],
    triggersSw: [
      "shinikizo la damu",
      "shinikizo",
      "bp",
    ],
    keywords: [
      "home blood pressure log",
      "elevated blood pressure reading",
    ],
    diseases: [
      "blood pressure concern",
      "hypertension (screening discussion)",
    ],
    summary:
      "Home blood pressure readings running high — log cuff readings, note symptoms, and arrange clinician review; seek emergency care for chest pain or sudden severe symptoms.",
    summarySw:
      "Vipimo vya shinikizo nyumbani vilivyo juu — andika vipimo, fuatilia dalili, na panga mapitio ya daktari; tafuta dharura ikiwa kuna maumivu ya kifua.",
    replyOpening:
      "Thank you for sharing your home blood pressure readings.",
    replyConcerns:
      "Keep a written log of cuff readings (date, time, value). Sit quietly before measuring. Arrange clinician review for readings that stay high. Seek emergency care now if you also have chest pain, sudden severe headache, weakness, or trouble speaking.",
    replyRecommendationsIntro: "Routine wellness products are secondary to blood-pressure medical review:",
    replyClosing:
      "Wellness information only — not a hypertension diagnosis or treatment.",
    recommendations: [
      {
        code: "W19",
        productId: "w19",
        name: "Deep Sea Fish Oil Softgel",
        concern: "Blood pressure monitoring at home",
        role: "Optional nutrition discussion only after clinician review; check package label.",
      },
    ],
  },
  {
    id: "seed-urgent-stroke-speech",
    title: "Urgent: severe headache with speech changes",
    urgent: true,
    triggersEn: [
      "sudden severe headache",
      "slurred speech",
      "trouble speaking with headache",
    ],
    triggersSw: [
      "kichwa kikali ghafla",
      "maneno yanayochanganyika",
    ],
    keywords: [
      "stroke warning signs",
      "emergency headache speech",
    ],
    diseases: [
      "possible stroke warning (urgent)",
    ],
    summary:
      "Urgent combination — sudden severe headache with speech changes requires emergency care now.",
    replyOpening:
      "Immediate action required.",
    replyConcerns:
      "Sudden severe headache with slurred speech or trouble speaking can signal a medical emergency. Call emergency services or go to the nearest emergency department now.",
    replyRecommendationsIntro: "",
    replyClosing:
      "Do not wait for wellness products or a routine plan.",
    recommendations: [],
  },
];

function withSeedRetrievalGates(seed: KnowledgeCase): KnowledgeCase {
  return {
    ...seed,
    conditionTitle: seed.conditionTitle || seed.title,
    reviewStatus: "approved",
    active: true,
    qualityFlag: seed.qualityFlag || "green",
  };
}

export async function ensureSeedKnowledgeBank(): Promise<{ added: number; updated: number }> {
  const existing = await listKnowledgeCases();
  const have = new Map(existing.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  for (const seed of SEED_KNOWLEDGE_CASES) {
    const next = withSeedRetrievalGates(seed);
    const prior = have.get(seed.id);
    if (!prior) {
      await saveKnowledgeCase(next);
      added += 1;
      continue;
    }
    // Refresh trained seed copy so admin Seed bank picks up improved answers.
    await saveKnowledgeCase({
      ...next,
      createdAt: prior.createdAt,
      approvedAt: prior.approvedAt,
      sourceScreeningId: prior.sourceScreeningId,
      sourceIntakeId: prior.sourceIntakeId,
    });
    updated += 1;
  }
  return { added, updated };
}
