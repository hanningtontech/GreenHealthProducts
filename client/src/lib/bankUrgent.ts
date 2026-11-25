/** Urgent symptom combinations that must outrank routine bank matches and suppress products. */

export type UrgentCareRule = {
  id: string;
  title: string;
  /** Test against the patient question / concerns text. */
  match: RegExp;
  actionEn: string;
  actionSw: string;
};

export const URGENT_CARE_RULES: UrgentCareRule[] = [
  {
    id: "urgent-stroke-headache-speech",
    title: "Sudden severe headache with speech changes",
    match:
      /(sudden|severe).{0,40}(headache|kichwa).{0,60}(slur|speech|speak|kuongea|maneno)|((slur|speech|speak).{0,40}(sudden|severe).{0,40}(headache|kichwa))/i,
    actionEn:
      "Immediate action: this combination can signal a medical emergency (for example stroke). Call emergency services or go to the nearest emergency department now. Do not wait for wellness products or a routine plan.",
    actionSw:
      "Hatua ya haraka: mchanganyiko huu unaweza kuwa dharura ya kiafya. Piga huduma za dharura au nenda hospitalini sasa. Usisubiri bidhaa za wellness.",
  },
  {
    id: "urgent-bp-chest-pain",
    title: "Very high blood pressure with chest pain",
    match:
      /((high|very high|elevated).{0,30}(blood pressure|bp|shinikizo).{0,50}(chest pain|chest tight|kifua)|((chest pain|chest tight|kifua).{0,50}(high|very high).{0,30}(blood pressure|bp|shinikizo)))/i,
    actionEn:
      "Immediate action: very high blood pressure with chest pain needs emergency care now. Call emergency services or go to hospital immediately. Do not start or adjust supplements on your own.",
    actionSw:
      "Hatua ya haraka: shinikizo la damu lililoinuka sana pamoja na maumivu ya kifua ni dharura. Piga huduma za dharura au nenda hospitalini mara moja.",
  },
  {
    id: "urgent-chest-pain-warning",
    title: "Chest pain with warning signs",
    match:
      /(chest pain|pain in (the )?chest|maumivu ya kifua|kifua kinaniuma).{0,80}(short(ness)? of breath|breathless|sweat|radiat|arm|jaw|faint|dizziness|kupumua|jasho)|((short(ness)? of breath|breathless|sweat|radiat).{0,60}(chest pain|kifua))/i,
    actionEn:
      "Immediate action: chest pain with warning signs needs emergency assessment now. Call emergency services or go to hospital. Do not use wellness products for this.",
    actionSw:
      "Hatua ya haraka: maumivu ya kifua yenye dalili za onyo yanahitaji tathmini ya dharura sasa. Piga huduma za dharura au nenda hospitalini. Usitumie bidhaa za wellness kwa hili.",
  },
  {
    id: "urgent-sudden-hearing-loss",
    title: "Sudden hearing loss",
    match:
      /(sudden|ghafla).{0,30}(hearing loss|deaf|cannot hear|kusikia|sikio)|((hearing loss|deafness).{0,30}(sudden|ghafla|one ear|sikio moja))/i,
    actionEn:
      "Immediate action: sudden hearing loss needs urgent clinical assessment the same day. Seek emergency or ENT care now. Do not wait for supplements.",
    actionSw:
      "Hatua ya haraka: kupoteza kusikia ghafla kunahitaji tathmini ya haraka siku hiyo hiyo. Tafuta huduma ya dharura au mtaalamu wa masikio sasa.",
  },
  {
    id: "urgent-heavy-periods-breathlessness",
    title: "Heavy periods with breathlessness",
    match:
      /((heavy|flooding|soaking).{0,40}(period|menses|menstrual|hedhi|damu nyingi).{0,80}(breathless|short(ness)? of breath|kupumua|fatigue|dizzy|kichwa kuzunguka)|((breathless|short(ness)? of breath|kupumua).{0,60}(heavy|flooding).{0,40}(period|hedhi|menses)))/i,
    actionEn:
      "Priority: heavy menstrual bleeding with breathlessness needs prompt clinical assessment (possible significant blood loss). Arrange care soon — today if worsening. Wellness products such as protein powder are not appropriate as the next step.",
    actionSw:
      "Kipaumbele: hedhi nyingi pamoja na kupumua kwa shida inahitaji tathmini ya haraka. Panga huduma leo ikiwa inazidi. Bidhaa kama unga wa protini si hatua sahihi sasa.",
  },
  {
    id: "urgent-pregnancy-headache-vision",
    title: "Severe headache with vision changes in pregnancy",
    match:
      /(pregnan|ujauzito|mjamzito).{0,80}((severe|kali).{0,30}(headache|kichwa).{0,40}(vision|macho|kuona)|(vision|macho|kuona).{0,40}(severe|kali).{0,30}(headache|kichwa))/i,
    actionEn:
      "Immediate action: severe headache with vision changes in pregnancy can be an emergency. Seek obstetric / emergency care now. Do not use over-the-counter products as a substitute.",
    actionSw:
      "Hatua ya haraka: maumivu makali ya kichwa na mabadiliko ya kuona katika ujauzito yanaweza kuwa dharura. Tafuta huduma ya dharura / uzazi sasa.",
  },
  {
    id: "urgent-cannot-swallow-saliva",
    title: "Inability to swallow saliva",
    match:
      /(cannot|can't|unable|hawezi).{0,30}(swallow|kumeza).{0,40}(saliva|mate)|(swallow|kumeza).{0,20}(saliva|mate).{0,30}(cannot|can't|unable|hawezi)|drooling.{0,20}(cannot|can't).{0,20}swallow/i,
    actionEn:
      "Immediate action: inability to swallow saliva can mean airway danger. Seek emergency care immediately. Do not give food, drink, or capsules until assessed.",
    actionSw:
      "Hatua ya haraka: kushindwa kumeza mate kunaweza kuhatarisha njia ya hewa. Tafuta huduma ya dharura mara moja. Usitoe chakula, kinywaji, wala kapsuli.",
  },
];

export function detectUrgentCare(text: string): UrgentCareRule | null {
  const hay = String(text || "");
  if (!hay.trim()) return null;
  for (const rule of URGENT_CARE_RULES) {
    if (rule.match.test(hay)) return rule;
  }
  return null;
}

/** True when wellness product suggestions must stay empty. */
export function shouldSuppressProducts(text: string): boolean {
  return Boolean(detectUrgentCare(text));
}
