/** Categorized symptoms for Get help. Labels are wellness language — not diagnoses. */

export type HelpSymptom = {
  id: string;
  en: string;
  sw: string;
};

export type HelpCategory = {
  id: string;
  /** Lucide-style key used by the UI map */
  icon: "brain" | "stomach" | "bone" | "heart" | "leg" | "skin" | "zap" | "shield" | "flower" | "user" | "droplets" | "eye" | "back" | "ribbon" | "list";
  labelEn: string;
  labelSw: string;
  promptEn: string;
  promptSw: string;
  symptoms: HelpSymptom[];
};

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "head",
    icon: "brain",
    labelEn: "Head & mind",
    labelSw: "Kichwa na akili",
    promptEn: "Are you dealing with any of these head or mind issues?",
    promptSw: "Je, unapitia mojawapo ya haya ya kichwa au akili?",
    symptoms: [
      { id: "headache", en: "Headache", sw: "Maumivu ya kichwa" },
      { id: "migraine", en: "Migraine-like pain / light sensitivity", sw: "Maumivu kama migraine / mwanga unachukiza" },
      { id: "dizziness", en: "Dizziness or light-headedness", sw: "Kizunguzungu" },
      { id: "brain-fog", en: "Brain fog / hard to focus", sw: "Akili inaonekana mzito / kuzingatia ni ngumu" },
      { id: "memory", en: "Forgetfulness / memory worries", sw: "Kusahau / wasiwasi wa kumbukumbu" },
      { id: "stress", en: "Stress or anxiety feelings", sw: "Msongo au wasiwasi" },
      { id: "low-mood", en: "Low mood or feeling down", sw: "Hali ya chini / kukata tamaa" },
      { id: "poor-sleep", en: "Poor sleep or waking often", sw: "Usingizi mbaya / kuamka mara kwa mara" },
      { id: "tension-neck", en: "Tension in scalp, jaw, or neck", sw: "Mvutano wa kichwa, taya, au shingo" },
    ],
  },
  {
    id: "stomach",
    icon: "stomach",
    labelEn: "Stomach & digestion",
    labelSw: "Tumbo na mmeng'enyo",
    promptEn: "Are you dealing with any of these stomach or digestion issues?",
    promptSw: "Je, unapitia mojawapo ya haya ya tumbo au mmeng'enyo?",
    symptoms: [
      { id: "bloating", en: "Bloating or gas", sw: "Kuvimba tumbo / gesi" },
      { id: "stomach-pain", en: "Stomach pain or cramps", sw: "Maumivu au mikazo ya tumbo" },
      { id: "acid", en: "Acid / heartburn / reflux", sw: "Asidi / kuungua kifua / reflux" },
      { id: "nausea", en: "Nausea or queasiness", sw: "Kichefuchefu" },
      { id: "constipation", en: "Constipation", sw: "Kufunga choo" },
      { id: "diarrhea", en: "Loose stool or diarrhea", sw: "Kuhara / choo kilicholegea" },
      { id: "appetite-low", en: "Low appetite", sw: "Hamuvu kidogo" },
      { id: "appetite-high", en: "Always hungry / sugar cravings", sw: "Njaa mara kwa mara / tamaa ya sukari" },
      { id: "after-meals", en: "Discomfort after meals", sw: "Usikuha baada ya kula" },
      { id: "ulcer-feel", en: "Burning or ulcer-like stomach feeling", sw: "Kuungua tumbo kama kidonda" },
    ],
  },
  {
    id: "joints",
    icon: "bone",
    labelEn: "Joints, bones & arthritis",
    labelSw: "Viungo, mifupa na arthritis",
    promptEn: "Are you dealing with joint, bone, or arthritis-related discomfort?",
    promptSw: "Je, unapitia maumivu ya viungo, mifupa, au yanayohusiana na arthritis?",
    symptoms: [
      { id: "joint-pain", en: "Joint pain (knees, hips, hands, etc.)", sw: "Maumivu ya viungo (magoti, nyonga, mikono…)" },
      { id: "morning-stiff", en: "Morning stiffness", sw: "Ugumu asubuhi" },
      { id: "swelling-joints", en: "Swollen or warm joints", sw: "Viungo kuvimba au kuwa moto" },
      { id: "arthritis-feel", en: "Arthritis-like aches", sw: "Maumivu kama arthritis" },
      { id: "gout-feel", en: "Sudden toe / foot joint flare", sw: "Maumivu ya ghafla kwenye kidole / kiungo cha mguu" },
      { id: "muscle-aches", en: "Muscle aches or body pains", sw: "Maumivu ya misuli / mwili" },
      { id: "weak-grip", en: "Weak grip or hard to open jars", sw: "Kushika vigumu / kufungua chupa" },
      { id: "bone-worry", en: "Bone strength / osteoporosis worry", sw: "Wasiwasi wa nguvu ya mifupa" },
    ],
  },
  {
    id: "back",
    icon: "back",
    labelEn: "Back, neck & posture",
    labelSw: "Mgongo, shingo na mkao",
    promptEn: "Are you dealing with back or neck issues?",
    promptSw: "Je, unapitia matatizo ya mgongo au shingo?",
    symptoms: [
      { id: "lower-back", en: "Lower back pain", sw: "Maumivu ya mgongo wa chini" },
      { id: "upper-back", en: "Upper back or shoulder pain", sw: "Maumivu ya mgongo wa juu / mabega" },
      { id: "neck-pain", en: "Neck pain or stiffness", sw: "Maumivu au ugumu wa shingo" },
      { id: "sciatica-feel", en: "Pain shooting down the leg", sw: "Maumivu yanayoshuka mguuni" },
      { id: "desk-strain", en: "Pain after sitting or desk work", sw: "Maumivu baada ya kukaa / kazi ya dawati" },
    ],
  },
  {
    id: "legs",
    icon: "leg",
    labelEn: "Legs, feet & movement",
    labelSw: "Miguu na kutembea",
    promptEn: "Are you dealing with legs, feet, or movement issues?",
    promptSw: "Je, unapitia matatizo ya miguu au kutembea?",
    symptoms: [
      { id: "leg-pain", en: "Leg pain or heaviness", sw: "Maumivu au uzito wa miguu" },
      { id: "cramps", en: "Night cramps", sw: "Mikazo usiku" },
      { id: "swelling-legs", en: "Swollen feet or ankles", sw: "Miguu / vifundo kuvimba" },
      { id: "numb-tingle", en: "Numbness or tingling", sw: "Kufa ganzi / kuchoma" },
      { id: "walking-hard", en: "Hard to walk long distances", sw: "Ngumu kutembea umbali mrefu" },
      { id: "balance", en: "Balance worries / unsteady", sw: "Wasiwasi wa mizani / kuyumba" },
      { id: "varicose-feel", en: "Varicose / vein discomfort", sw: "Maumivu ya mishipa ya miguu" },
    ],
  },
  {
    id: "heart",
    icon: "heart",
    labelEn: "Heart & circulation",
    labelSw: "Moyo na mzunguko wa damu",
    promptEn: "Are you dealing with heart or circulation concerns?",
    promptSw: "Je, unapitia wasiwasi wa moyo au mzunguko wa damu?",
    symptoms: [
      { id: "palpitations", en: "Palpitations / fast heartbeat feeling", sw: "Mapigo ya moyo / kuhisi moyo unapiga haraka" },
      { id: "bp-worry", en: "Blood pressure concerns", sw: "Wasiwasi wa shinikizo la damu" },
      { id: "chest-tight", en: "Chest tightness (not emergency)", sw: "Kifua kukaza (si dharura)" },
      { id: "cold-hands", en: "Cold hands or feet", sw: "Mikono au miguu baridi" },
      { id: "poor-circulation", en: "Poor circulation feeling", sw: "Kuhisi mzunguko wa damu hafifu" },
      { id: "cholesterol-worry", en: "Cholesterol / lipid concerns", sw: "Wasiwasi wa cholesterol" },
    ],
  },
  {
    id: "energy",
    icon: "zap",
    labelEn: "Energy, blood sugar & fatigue",
    labelSw: "Nguvu, sukari ya damu na uchovu",
    promptEn: "Are you dealing with energy or blood-sugar related feelings?",
    promptSw: "Je, unapitia masuala ya nguvu au yanayohusiana na sukari ya damu?",
    symptoms: [
      { id: "tired", en: "Low energy / tiredness", sw: "Nguvu kidogo / uchovu" },
      { id: "afternoon-crash", en: "Afternoon energy crash", sw: "Nguvu zinapungua mchana" },
      { id: "sugar-swings", en: "Sugar swings / shaky when hungry", sw: "Mabadiliko ya sukari / kutetemeka njaa" },
      { id: "diabetes-support", en: "Living with diabetes — need support info", sw: "Ninaishi na kisukari — nahitaji maelezo" },
      { id: "thirst", en: "Unusual thirst", sw: "Kiu isiyo ya kawaida" },
      { id: "weight-up", en: "Unwanted weight gain", sw: "Kupata uzito bila kutarajia" },
      { id: "weight-down", en: "Unwanted weight loss", sw: "Kupoteza uzito bila kutarajia" },
      { id: "anemia-feel", en: "Possible low iron / pale / breathless on stairs", sw: "Huenda chuma kidogo / rangi hafifu / kupumua ngumu ngazini" },
    ],
  },
  {
    id: "immune",
    icon: "shield",
    labelEn: "Immune, infections & recovery",
    labelSw: "Kinga, maambukizi na kupona",
    promptEn: "Are you dealing with immune or infection-related issues?",
    promptSw: "Je, unapitia masuala ya kinga au maambukizi?",
    symptoms: [
      { id: "frequent-colds", en: "Frequent colds or flu-like episodes", sw: "Homa / mafua mara kwa mara" },
      { id: "sore-throat", en: "Sore throat", sw: "Koo kuuma" },
      { id: "cough", en: "Lingering cough", sw: "Kikohozi kinachoendelea" },
      { id: "sinus", en: "Sinus / blocked nose", sw: "Sinusi / pua kuziba" },
      { id: "feverish", en: "Feverish feeling", sw: "Kuhisi homa" },
      { id: "slow-heal", en: "Slow recovery after illness", sw: "Kupona polepole baada ya ugonjwa" },
      { id: "allergy", en: "Allergy-like sneezing or itch", sw: "Mzio — kupiga chafya au kuwasha" },
    ],
  },
  {
    id: "skin",
    icon: "skin",
    labelEn: "Skin, hair & nails",
    labelSw: "Ngozi, nywele na kucha",
    promptEn: "Are you dealing with skin, hair, or nail concerns?",
    promptSw: "Je, unapitia masuala ya ngozi, nywele, au kucha?",
    symptoms: [
      { id: "dry-skin", en: "Dry or flaky skin", sw: "Ngozi kavu / kuchambuka" },
      { id: "rash", en: "Rash or itch", sw: "Upele / kuwasha" },
      { id: "acne", en: "Acne or breakouts", sw: "Chunusi" },
      { id: "eczema-feel", en: "Eczema-like patches", sw: "Mabaka kama eczema" },
      { id: "hair-loss", en: "Hair thinning or loss", sw: "Nywele kupungua / kuanguka" },
      { id: "brittle-nails", en: "Brittle nails", sw: "Kucha kuvunjika" },
      { id: "wound-slow", en: "Slow wound healing", sw: "Vidonda kupona polepole" },
    ],
  },
  {
    id: "eyes",
    icon: "eye",
    labelEn: "Eyes, ears & mouth",
    labelSw: "Macho, masikio na mdomo",
    promptEn: "Are you dealing with eye, ear, or mouth issues?",
    promptSw: "Je, unapitia matatizo ya macho, masikio, au mdomo?",
    symptoms: [
      { id: "dry-eyes", en: "Dry or tired eyes", sw: "Macho kavu / kuchoka" },
      { id: "blurry", en: "Blurry vision concerns", sw: "Wasiwasi wa kuona ukungu" },
      { id: "ear-ring", en: "Ringing in ears", sw: "Kulia masikioni" },
      { id: "mouth-dry", en: "Dry mouth", sw: "Kinywa kukauka" },
      { id: "gum-teeth", en: "Gum or teeth discomfort", sw: "Maumivu ya fizi au meno" },
      { id: "bad-breath", en: "Bad breath concern", sw: "Wasiwasi wa harufu ya mdomo" },
    ],
  },
  {
    id: "urinary",
    icon: "droplets",
    labelEn: "Urinary & kidney feelings",
    labelSw: "Mkojo na figo",
    promptEn: "Are you dealing with urinary or kidney-related feelings?",
    promptSw: "Je, unapitia masuala ya mkojo au figo?",
    symptoms: [
      { id: "frequent-urine", en: "Urinating often", sw: "Kukojoa mara kwa mara" },
      { id: "burning-urine", en: "Burning when urinating", sw: "Kuungua ukikojoa" },
      { id: "night-urine", en: "Waking at night to urinate", sw: "Kuamka usiku kukojoa" },
      { id: "flank-pain", en: "Side / flank discomfort", sw: "Maumivu pembeni / ubavu" },
      { id: "kidney-worry", en: "Kidney health concern", sw: "Wasiwasi wa afya ya figo" },
    ],
  },
  {
    id: "women",
    icon: "flower",
    labelEn: "Women’s health",
    labelSw: "Afya ya wanawake",
    promptEn: "Are you dealing with any of these women’s health concerns?",
    promptSw: "Je, unapitia mojawapo ya haya ya afya ya wanawake?",
    symptoms: [
      { id: "period-pain", en: "Period pain / cramps", sw: "Maumivu ya hedhi" },
      { id: "irregular-cycle", en: "Irregular cycle", sw: "Hedhi isiyo ya kawaida" },
      { id: "pms", en: "PMS mood or bloating", sw: "PMS — hisia au kuvimba" },
      { id: "menopause", en: "Hot flashes / menopause changes", sw: "Joto ghafla / mabadiliko ya menoposi" },
      { id: "fertility-worry", en: "Fertility support questions", sw: "Maswali ya uzazi" },
      { id: "pregnancy-ask", en: "Pregnant / breastfeeding — need careful advice", sw: "Mjamzito / kunyonyesha — nahitaji ushauri wa uangalifu" },
    ],
  },
  {
    id: "men",
    icon: "user",
    labelEn: "Men’s health",
    labelSw: "Afya ya wanaume",
    promptEn: "Are you dealing with any of these men’s health concerns?",
    promptSw: "Je, unapitia mojawapo ya haya ya afya ya wanaume?",
    symptoms: [
      { id: "prostate-worry", en: "Prostate / urine flow concerns", sw: "Wasiwasi wa tezi dume / mtiririko wa mkojo" },
      { id: "libido", en: "Low desire / energy for intimacy", sw: "Hamuvu ya ngono / nguvu kidogo" },
      { id: "erectile-worry", en: "Erection concerns", sw: "Wasiwasi wa uume kusimama" },
      { id: "male-fatigue", en: "Persistent fatigue in men", sw: "Uchovu wa kudumu kwa wanaume" },
    ],
  },
  {
    id: "cancer-support",
    icon: "ribbon",
    labelEn: "Serious illness support",
    labelSw: "Msaada wa ugonjwa mkubwa",
    promptEn: "Are you looking for wellness support around a serious illness (not a diagnosis)?",
    promptSw: "Je, unatafuta msaada wa wellness kuhusu ugonjwa mkubwa (si utambuzi)?",
    symptoms: [
      { id: "cancer-fatigue", en: "Fatigue during / after cancer care", sw: "Uchovu wakati / baada ya matibabu ya saratani" },
      { id: "cancer-appetite", en: "Appetite or taste changes with serious illness", sw: "Mabadiliko ya hamuvu / ladha" },
      { id: "cancer-nausea", en: "Nausea with treatment or illness", sw: "Kichefuchefu na matibabu au ugonjwa" },
      { id: "immune-weak", en: "Feeling run-down while recovering", sw: "Kuhisi dhaifu wakati wa kupona" },
      { id: "family-history", en: "Family history — want prevention lifestyle info", sw: "Historia ya familia — nahitaji maelezo ya kinga" },
      { id: "caregiver", en: "Supporting someone who is ill", sw: "Ninamsaidia mtu mgonjwa" },
      { id: "need-clinician", en: "I already see a clinician — need product questions only", sw: "Ninaona daktari — nahitaji maswali ya bidhaa tu" },
    ],
  },
  {
    id: "general",
    icon: "list",
    labelEn: "General wellness",
    labelSw: "Wellness kwa ujumla",
    promptEn: "Are you looking for any of these general wellness topics?",
    promptSw: "Je, unatafuta mojawapo ya haya ya wellness kwa ujumla?",
    symptoms: [
      { id: "nutrition", en: "Nutrition / vitamins", sw: "Lishe / vitamini" },
      { id: "immune-support", en: "Immune support", sw: "Kuimarisha kinga" },
      { id: "circulation-wellness", en: "Circulation wellness", sw: "Wellness ya mzunguko wa damu" },
      { id: "digestive-general", en: "Digestive discomfort", sw: "Usikuha wa mmeng'enyo" },
      { id: "sleep-stress", en: "Poor sleep or stress", sw: "Usingizi mbaya au msongo" },
      { id: "joint-general", en: "Joint or movement discomfort", sw: "Maumivu ya viungo / kutembea" },
      { id: "skin-general", en: "Skin or hair concerns", sw: "Masuala ya ngozi au nywele" },
      { id: "energy-general", en: "Low energy / tiredness", sw: "Uchovu / nguvu kidogo" },
      { id: "other", en: "Something else — I’ll describe it", sw: "Kingine — nitaeleza" },
    ],
  },
];

export function concernLabel(category: HelpCategory, symptom: HelpSymptom, language: "en" | "sw"): string {
  const cat = language === "sw" ? category.labelSw : category.labelEn;
  const item = language === "sw" ? symptom.sw : symptom.en;
  return `${cat} · ${item}`;
}

export function findSymptomByConcern(label: string): { category: HelpCategory; symptom: HelpSymptom } | null {
  for (const category of HELP_CATEGORIES) {
    for (const symptom of category.symptoms) {
      if (concernLabel(category, symptom, "en") === label || concernLabel(category, symptom, "sw") === label) {
        return { category, symptom };
      }
      if (symptom.en === label || symptom.sw === label) return { category, symptom };
    }
  }
  return null;
}
