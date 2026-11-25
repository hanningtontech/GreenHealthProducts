import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const GREENWORLD = path.resolve(import.meta.dirname, "..");
const JSON_PATHS = [
  path.join(ROOT, "product_catalog_researched_W01-W71 (2).json"),
  path.resolve(
    "C:/Users/Hannie/.cursor/projects/c-Users-Hannie-OneDrive-Documents-Trailer-blazer-Projects-GreenHealthProducts/attachments/2857a61e-c137-4cf8-afa4-04d1bf326873/product_catalog_researched_W01-W71__2_.json"
  ),
];
const TS_PATH = path.join(GREENWORLD, "client/src/lib/researchedCatalog.ts");

const CAPSULE_DIR =
  "Take as directed on the package label. Swallow with water unless the label says otherwise. Do not exceed the recommended daily amount.";
const TEA_DIR =
  "Prepare one sachet with hot water as directed on the package. Adults typically use 1–2 sachets a day unless the label says otherwise.";
const POWDER_DIR =
  "Mix one serving with water or as directed on the package. Follow the label for how many servings to take each day.";
const TOPICAL_DIR =
  "Apply to clean, dry skin as directed on the package. Do not use on broken skin unless the label allows it.";
const GEN_SAFE =
  "Follow the package label. If you are pregnant, breastfeeding, taking medicine, or managing a health condition, speak with a qualified health professional before use. Keep out of reach of children.";
const SUPP_CAT =
  "A dietary supplement for everyday wellness routines. Read the current package for ingredients, pack size, and directions before use.";
const TEA_CAT =
  "A tea or beverage product for daily routines. Check the package for preparation steps and how many sachets to use.";
const FERT_CAT =
  "An agricultural plant-nutrition product. Follow the bottle label for dilution, crops, and application.";
const ORAL_CAT =
  "An oral-care product for daily hygiene. Use as directed on the package.";
const HYG_CAT =
  "A personal-care product for everyday use. Follow the package for how and where to apply.";
const TOP_CAT =
  "A topical product for external use only. Follow the package for placement, timing, and precautions.";

/** @type {Record<string, { description: string; swahili: string; ingredients?: string[]; directions: string; warnings: string; categoryDescription: string }>} */
const REWRITES = {
  W01: {
    description: "Cordyceps Plus Capsules are formulated to support everyday immunity, energy, and general wellness. They are often chosen for vitality and for supporting normal liver, lung, and kidney wellness as part of a balanced routine.",
    swahili: "Kapsuli za Cordyceps Plus zimeundwa kusaidia kinga ya mwili, nguvu, na afya ya kila siku. Mara nyingi huchaguliwa kwa nguvu na kusaidia ustawi wa kawaida wa ini, mapafu, na figo.",
    ingredients: ["Cordyceps sinensis mycelium", "Radix ginseng"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W02: {
    description: "Spirulina Plus Capsules provide a concentrated spirulina supplement for everyday nutrition. The blend is prepared for high purity and is free from added preservatives, making it a simple option for daily wellness support.",
    swahili: "Kapsuli za Spirulina Plus hutoa virutubisho vya spirulina kwa lishe ya kila siku. Zimetayarishwa kwa usafi wa hali ya juu na hazina vihifadhi vilivyoongezwa.",
    ingredients: ["Spirulina"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W03: {
    description: "Propolis Plus Capsules support general well-being and nutritional balance. Propolis is valued for its natural protective qualities and is used as part of an everyday wellness routine.",
    swahili: "Kapsuli za Propolis Plus husaidia ustawi wa jumla na usawa wa lishe. Propolis inathaminiwa kwa sifa zake za asili za kinga na hutumika katika utaratibu wa afya ya kila siku.",
    ingredients: ["Propolis", "Radix ginseng extract", "Vegetable oil"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W04: {
    description: "Ganoderma Plus Capsules combine ganoderma spore with cordyceps and ginseng to support immune defense and everyday respiratory comfort as part of a balanced wellness routine.",
    swahili: "Kapsuli za Ganoderma Plus zinachanganya ganoderma, cordyceps, na ginseng kusaidia kinga ya mwili na faraja ya kawaida ya kupumua.",
    ingredients: ["Spora Ganoderma", "Cordyceps sinensis mycelium", "Radix ginseng"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W05: {
    description: "Cardio Power Capsules are intended to support healthy blood circulation and everyday heart wellness as part of an active lifestyle.",
    swahili: "Kapsuli za Cardio Power zimeundwa kusaidia mzunguko mzuri wa damu na ustawi wa moyo katika maisha ya kila siku.",
    ingredients: ["Cardio support botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W06: {
    description: "Soy Power Capsules provide soy isoflavones with supporting botanicals for women’s wellness. They are often chosen to support energy, mood, skin vitality, bone wellness, and comfort through changing hormonal seasons.",
    swahili: "Kapsuli za Soy Power hutoa soy isoflavones na mimea msaidizi kwa afya ya wanawake. Mara nyingi huchaguliwa kusaidia nguvu, hisia, ngozi, mifupa, na faraja katika mabadiliko ya homoni.",
    ingredients: ["Semen glycine", "Radix paeoniae alba extractum (white peony root extract)", "Ganoderma", "Soy isoflavones"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W07: {
    description: "A-Power Capsules are formulated for immune support and general wellness, offering a simple daily capsule option for people who want steady nutritional support.",
    swahili: "Kapsuli za A-Power zimeundwa kusaidia kinga ya mwili na ustawi wa jumla, kama chaguo rahisi la kila siku.",
    ingredients: ["Immune-support botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W08: {
    description: "VigPower Capsules are designed for men’s vitality and reproductive wellness. They support immunity and nourishment of male reproductive health as part of a balanced routine.",
    swahili: "Kapsuli za VigPower zimeundwa kwa nguvu za wanaume na ustawi wa uzazi. Husaidia kinga na lishe ya afya ya uzazi wa kiume.",
    ingredients: ["Men’s vitality botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W09: {
    description: "Ginseng RHs Capsules deliver concentrated ginsenosides to support immunity, stamina, and everyday endurance against fatigue.",
    swahili: "Kapsuli za Ginseng RHs hutoa ginsenosides zilizojilimbikizia kusaidia kinga, uvumilivu, na kupunguza uchovu wa kila siku.",
    ingredients: ["Ginseng (Radix ginseng)", "Bioactive ginsenosides (more than 25 mg per capsule as stated on product materials)"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W10: {
    description: "Pro-slim Tea is a herbal tea blend prepared to support metabolism, healthy fat balance, and weight-management routines. It is also used as a gentle daily cleansing drink.",
    swahili: "Pro-slim Tea ni mchanganyiko wa chai ya mitishamba inayosaidia kimetaboliki, usawa wa mafuta, na utaratibu wa kudhibiti uzito.",
    ingredients: ["Folium nelumbinis", "Semen Cassiae", "Semen Raphani", "Fructus Cannabis", "Flos Aurantii", "Pollen Pini Extractum"],
    directions: "Steep one sachet in hot water. Adults may use 1–2 sachets daily as directed on the package.",
    warnings: "Do not use during pregnancy or breastfeeding unless a health professional advises it. Follow the package label if you have an underlying condition. " + GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W11: {
    description: "Kuding Plus Tea is a herbal infusion prepared to support detoxification, immunity, and everyday comfort. It is often enjoyed as a daily wellness tea.",
    swahili: "Kuding Plus Tea ni chai ya mitishamba inayosaidia kuondoa sumu, kinga, na faraja ya kila siku.",
    ingredients: ["Folium Ilicis Kudingchae", "Radix Panacis Quinquefolii", "Ganoderma", "Folium Camellia"],
    directions: TEA_DIR,
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W12: {
    description: "Ganoderma Coffee blends coffee with ganoderma for energy, mental alertness, immune support, and everyday antioxidant wellness.",
    swahili: "Ganoderma Coffee inachanganya kahawa na ganoderma kwa nguvu, umakini, kinga, na ustawi wa kila siku.",
    ingredients: ["Coffee", "Ganoderma"],
    directions: "Dissolve one sachet in hot water and stir well. Enjoy as directed on the package.",
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W13: {
    description: "Lipid Care Tea is prepared to support healthy fat metabolism, weight-management routines, energy, and stamina as part of a balanced lifestyle.",
    swahili: "Lipid Care Tea imeundwa kusaidia kimetaboliki ya mafuta, utaratibu wa uzito, nguvu, na uvumilivu.",
    ingredients: ["Herbal lipid-care tea blend — confirm full list on the package label"],
    directions: TEA_DIR,
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W14: {
    description: "Protein Powder provides a daily protein boost with a full amino-acid profile, including essential amino acids. It is low in calories and fat, free from cholesterol, and mixes easily for everyday nutrition.",
    swahili: "Protein Powder hutoa protini ya kila siku yenye amino asidi muhimu. Ina kalori na mafuta kidogo, haina cholesterol, na inachanganyika kwa urahisi.",
    ingredients: ["Protein blend with essential and non-essential amino acids — confirm full list on the package label"],
    directions: POWDER_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W15: {
    description: "Multi-vitamin Tablets for adults help maintain normal metabolism and fill everyday vitamin gaps for people with busy lifestyles.",
    swahili: "Tembe za Multi-vitamin kwa watu wazima husaidia kimetaboliki ya kawaida na kujaza mahitaji ya vitamini ya kila siku.",
    ingredients: ["Multi-vitamin blend for adults — confirm full list on the package label"],
    directions: "Take one tablet as directed on the package, usually with food and water.",
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W16: {
    description: "Calcium Tablets for adults provide easily absorbable milk-source calcium to support everyday bone and mineral nutrition.",
    swahili: "Tembe za Calcium kwa watu wazima hutoa kalsiamu inayofyonzwa kwa urahisi kusaidia lishe ya mifupa.",
    ingredients: ["Nano milk calcium"],
    directions: "Take as directed on the package, usually with water and food.",
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W17: {
    description: "Zinc Tablets for adults help top up daily zinc intake for immune and nutritional support.",
    swahili: "Tembe za Zinc kwa watu wazima husaidia kujaza mahitaji ya zinki ya kila siku kwa kinga na lishe.",
    ingredients: ["Zinc"],
    directions: "Take as directed on the package with water.",
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W18: {
    description: "Lecithin Softgels support brain and memory wellness, nervous-system comfort, liver nutrition, and healthy skin as part of a daily routine.",
    swahili: "Softgel za Lecithin husaidia ubongo na kumbukumbu, mfumo wa neva, lishe ya ini, na afya ya ngozi.",
    ingredients: ["Lecithin"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W19: {
    description: "Deep Sea Fish Oil Softgels provide omega-3 EPA and DHA for everyday nutritional and general-wellness support.",
    swahili: "Softgel za Deep Sea Fish Oil hutoa omega-3 EPA na DHA kwa lishe na ustawi wa kila siku.",
    ingredients: ["Deep-sea fish oil", "Omega-3 EPA", "Omega-3 DHA"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W20: {
    description: "Meal Cellulose Tablets supplement dietary fiber with a balanced mix of soluble and insoluble fiber to support comfortable digestion and everyday metabolic wellness.",
    swahili: "Tembe za Meal Cellulose huongeza nyuzinyuzi za lishe kusaidia mmeng’enyo mzuri na ustawi wa kimetaboliki.",
    ingredients: ["Dietary cellulose fiber blend — confirm soluble and insoluble fiber ratio on the package"],
    directions: "Take with plenty of water as directed on the package.",
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W21: {
    description: "Garlic Oil Capsules offer natural antioxidant support and are chosen for everyday circulatory and metabolic wellness routines.",
    swahili: "Kapsuli za Garlic Oil hutoa msaada wa asili wa antioxidant na huchaguliwa kwa ustawi wa mzunguko wa damu na kimetaboliki.",
    ingredients: ["Garlic oil"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W22: {
    description: "Eye Care Softgels provide eye nutrients to support comfortable vision and healthy microcirculation around the eyes.",
    swahili: "Softgel za Eye Care hutoa virutubisho vya macho kusaidia uoni mzuri na mzunguko wa damu karibu na macho.",
    ingredients: ["Eye-care nutrient blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W23: {
    description: "Chitosan Capsules are used in weight-management and metabolic wellness routines, and are also chosen for everyday immune and nutritional support.",
    swahili: "Kapsuli za Chitosan hutumika katika utaratibu wa kudhibiti uzito na ustawi wa kimetaboliki, na pia kusaidia kinga ya kila siku.",
    ingredients: ["Chitosan"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W24: {
    description: "Aloe Vera Plus Capsules support gentle detoxification, antioxidant wellness, comfortable digestion, and everyday immune balance.",
    swahili: "Kapsuli za Aloe Vera Plus husaidia kuondoa sumu kwa upole, antioxidant, mmeng’enyo mzuri, na usawa wa kinga.",
    ingredients: ["Aloe vera"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W25: {
    description: "Compound Marrow Powder is a nutritional supplement made from carefully prepared bovine brain, spinal cord, and marrow extracts. It is used to support memory, bone wellness, immunity, and everyday vitality.",
    swahili: "Compound Marrow Powder ni kiongeza lishe kutoka kwa dondoo za ubongo, uti wa mgongo, na uboho wa ng’ombe. Husaidia kumbukumbu, mifupa, kinga, na nguvu za kila siku.",
    ingredients: ["Bovine brain extract", "Spinal cord extract", "Marrow extract after fat removal"],
    directions: POWDER_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W26: {
    description: "Ginkgo Biloba Capsules support memory, mental alertness, and healthy blood circulation for everyday cognitive wellness.",
    swahili: "Kapsuli za Ginkgo Biloba husaidia kumbukumbu, umakini, na mzunguko mzuri wa damu.",
    ingredients: ["Ginkgo biloba"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W27: {
    description: "Pine Pollen Tea is prepared to support comfortable digestion, steady energy, emotional balance, and everyday body wellness.",
    swahili: "Pine Pollen Tea imeundwa kusaidia mmeng’enyo mzuri, nguvu thabiti, usawa wa hisia, na ustawi wa mwili.",
    ingredients: ["Pine pollen tea blend — confirm full list on the package label"],
    directions: TEA_DIR,
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W28: {
    description: "Intestine Cleansing Tea is intended to support comfortable bowel movement and gentle everyday detoxification routines.",
    swahili: "Intestine Cleansing Tea imeundwa kusaidia haja kubwa yenye faraja na utaratibu wa kuondoa sumu kwa upole.",
    ingredients: ["Intestinal cleansing herbal blend — confirm full list on the package label"],
    directions: TEA_DIR,
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W29: {
    description: "Balsam Pear Tea is a herbal drink prepared to support healthy blood-sugar balance and everyday metabolic wellness as part of a careful diet and lifestyle.",
    swahili: "Balsam Pear Tea ni kinywaji cha mitishamba kinachosaidia usawa wa sukari katika damu na ustawi wa kimetaboliki.",
    ingredients: ["Balsam pear (bitter melon) herbal tea blend — confirm full list on the package label"],
    directions: TEA_DIR,
    warnings: GEN_SAFE + " This tea is not a substitute for prescribed diabetes care.",
    categoryDescription: TEA_CAT,
  },
  W30: {
    description: "B-Carotene & Lycopene Capsules provide antioxidant carotenoids to support eye wellness and everyday cardiovascular nutrition.",
    swahili: "Kapsuli za B-Carotene & Lycopene hutoa carotenoids za antioxidant kusaidia afya ya macho na lishe ya moyo.",
    ingredients: ["Beta-carotene", "Lycopene"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W31: {
    description: "Livergen Capsules are formulated to support everyday liver wellness and gentle detoxification as part of a balanced lifestyle.",
    swahili: "Kapsuli za Livergen zimeundwa kusaidia ustawi wa ini na kuondoa sumu kwa upole.",
    ingredients: ["Liver-support botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W32: {
    description: "Royal Jelly Softgels provide concentrated royal jelly nutrition for energy, vitality, and everyday wellness support.",
    swahili: "Softgel za Royal Jelly hutoa lishe ya royal jelly kwa nguvu, uhai, na ustawi wa kila siku.",
    ingredients: ["Royal jelly"],
    directions: CAPSULE_DIR,
    warnings: "Avoid use if you have a known bee-product allergy. " + GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W33: {
    description: "L-Arginine Capsules supply L-arginine to support circulation, exercise recovery, and everyday vitality.",
    swahili: "Kapsuli za L-Arginine hutoa L-arginine kusaidia mzunguko wa damu, kupona baada ya mazoezi, na nguvu za kila siku.",
    ingredients: ["L-Arginine"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W34: {
    description: "Parashield Capsules are prepared for everyday protective wellness and immune-support routines.",
    swahili: "Kapsuli za Parashield zimeandaliwa kwa ustawi wa kinga na ulinzi wa kila siku.",
    ingredients: ["Protective botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W35: {
    description: "Magic Detoxin Pads are adhesive foot pads designed for overnight wellness routines that support gentle cleansing comfort.",
    swahili: "Magic Detoxin Pads ni pedi za miguu zinazotumika usiku kusaidia faraja ya utakaso wa upole.",
    ingredients: ["Detox foot-pad formula — confirm full list on the package label"],
    directions: "Apply one pad to clean, dry soles before sleep and remove in the morning as directed on the package.",
    warnings: "For external use only. Do not use on broken or irritated skin. " + GEN_SAFE,
    categoryDescription: TOP_CAT,
  },
  W36: {
    description: "Slimming Capsules support weight-management and metabolic wellness routines alongside healthy eating and activity.",
    swahili: "Kapsuli za Slimming husaidia utaratibu wa kudhibiti uzito na ustawi wa kimetaboliki pamoja na lishe bora na mazoezi.",
    ingredients: ["Weight-management botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W37: {
    description: "Joint Health Plus Capsules are formulated to support joint comfort, mobility, and everyday musculoskeletal wellness.",
    swahili: "Kapsuli za Joint Health Plus zimeundwa kusaidia faraja ya viungo, mwendo, na ustawi wa mifupa na misuli.",
    ingredients: ["Joint-support nutrient blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W38: {
    description: "Super Co-Q10 Capsules provide coenzyme Q10 to support cellular energy, heart wellness, and everyday vitality.",
    swahili: "Kapsuli za Super Co-Q10 hutoa coenzyme Q10 kusaidia nishati ya seli, ustawi wa moyo, na nguvu za kila siku.",
    ingredients: ["Coenzyme Q10"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W39: {
    description: "Vitamin C Tablets help maintain daily vitamin C intake for immune support, antioxidant wellness, and normal body function.",
    swahili: "Tembe za Vitamin C husaidia kujaza mahitaji ya vitamini C kwa kinga, antioxidant, na utendaji wa kawaida wa mwili.",
    ingredients: ["Vitamin C"],
    directions: "Take as directed on the package with water.",
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W40: {
    description: "Vitamin E Capsules provide vitamin E antioxidant support for skin, cellular wellness, and everyday nutritional balance.",
    swahili: "Kapsuli za Vitamin E hutoa antioxidant ya vitamini E kwa ngozi, ustawi wa seli, na usawa wa lishe.",
    ingredients: ["Vitamin E"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W41: {
    description: "Super Nutrition is a convenient sachet formula that supports everyday nourishment, energy, and balanced nutritional intake.",
    swahili: "Super Nutrition ni fomula rahisi ya pakiti inayosaidia lishe ya kila siku, nguvu, na usawa wa virutubisho.",
    ingredients: ["Complete nutrition sachet blend — confirm full list on the package label"],
    directions: POWDER_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W42: {
    description: "Glucoblock Capsules are prepared to support healthy blood-sugar balance and everyday metabolic wellness alongside a careful diet.",
    swahili: "Kapsuli za Glucoblock zimeandaliwa kusaidia usawa wa sukari katika damu na ustawi wa kimetaboliki.",
    ingredients: ["Blood-sugar support botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE + " This product is not a substitute for prescribed diabetes care.",
    categoryDescription: SUPP_CAT,
  },
  W43: {
    description: "ProstaSure Capsules are formulated for men’s prostate and urinary wellness as part of an adult men’s daily routine.",
    swahili: "Kapsuli za ProstaSure zimeundwa kwa ustawi wa prostate na mkojo kwa wanaume wazima.",
    ingredients: ["Prostate-support botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W44: {
    description: "Kidney Tonifying Capsules for men support everyday kidney wellness, vitality, and male nutritional balance.",
    swahili: "Kapsuli za Kidney Tonifying kwa wanaume husaidia ustawi wa figo, nguvu, na usawa wa lishe ya kiume.",
    ingredients: ["Men’s kidney-support botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W45: {
    description: "Kidney Tonifying Capsules for women support everyday kidney wellness, vitality, and female nutritional balance.",
    swahili: "Kapsuli za Kidney Tonifying kwa wanawake husaidia ustawi wa figo, nguvu, na usawa wa lishe ya kike.",
    ingredients: ["Women’s kidney-support botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W46: {
    description: "Blue Berry Juice High VC is a blueberry drink mix rich in vitamin C for antioxidant support, freshness, and everyday wellness.",
    swahili: "Blue Berry Juice High VC ni kinywaji cha blueberry chenye vitamini C kwa antioxidant, uburudishaji, na ustawi wa kila siku.",
    ingredients: ["Blueberry juice blend", "Vitamin C"],
    directions: "Dissolve one sachet in water as directed on the package.",
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W47: {
    description: "Nutriplant Organic Fertilizer is a plant-nutrition liquid formulated to support healthy crop growth and soil feeding routines.",
    swahili: "Nutriplant Organic Fertilizer ni mbolea ya mimea inayosaidia ukuaji mzuri wa mazao na lishe ya udongo.",
    ingredients: ["Organic plant-nutrition concentrate — confirm full composition on the bottle label"],
    directions: "Dilute and apply according to the bottle label for your crop type.",
    warnings: "For agricultural use. Keep away from children and food utensils. Follow the bottle safety instructions.",
    categoryDescription: FERT_CAT,
  },
  W48: {
    description: "Nutriplant Organic Fertilizer 100 ml is a compact bottle of plant nutrition for home gardens and smaller crop applications.",
    swahili: "Nutriplant Organic Fertilizer 100 ml ni chupa ndogo ya lishe ya mimea kwa bustani na matumizi madogo.",
    ingredients: ["Organic plant-nutrition concentrate — confirm full composition on the bottle label"],
    directions: "Dilute as directed on the 100 ml bottle label before application.",
    warnings: "For agricultural use. Keep away from children and food utensils. Follow the bottle safety instructions.",
    categoryDescription: FERT_CAT,
  },
  W49: {
    description: "Nutriplant Organic Fertilizer for trees and crops supports broader farm and orchard feeding programs with organic plant nutrition.",
    swahili: "Nutriplant Organic Fertilizer kwa miti na mazao husaidia lishe ya mimea katika shamba na bustani.",
    ingredients: ["Organic plant-nutrition concentrate for trees and crops — confirm full composition on the bottle label"],
    directions: "Follow the bottle label for dilution rates suited to trees and field crops.",
    warnings: "For agricultural use. Keep away from children and food utensils. Follow the bottle safety instructions.",
    categoryDescription: FERT_CAT,
  },
  W50: {
    description: "Tooth Paste is a daily oral-care paste prepared for fresh cleaning, comfortable brushing, and everyday mouth hygiene.",
    swahili: "Tooth Paste ni dawa ya meno ya kila siku kwa usafi, uburudishaji, na afya ya mdomo.",
    ingredients: ["Oral-care paste formula — confirm full list on the package label"],
    directions: "Brush teeth thoroughly twice daily or as directed on the package.",
    warnings: "For oral use only. Keep out of reach of young children.",
    categoryDescription: ORAL_CAT,
  },
  W51: {
    description: "Fresh Drink Clear is a light drink-mix for everyday refreshment and cleansing comfort.",
    swahili: "Fresh Drink Clear ni kinywaji chepesi cha uburudishaji na faraja ya utakaso wa kila siku.",
    ingredients: ["Clear drink-mix blend — confirm full list on the package label"],
    directions: "Dissolve one sachet in water as directed on the package.",
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W52: {
    description: "Olive Soap is a gentle cleansing bar for face and body. It is prepared for everyday washing, nourishment, and a refreshed skin feel.",
    swahili: "Olive Soap ni sabuni laini kwa uso na mwili. Imeundwa kwa kuoga kila siku, lishe, na hisia safi ya ngozi.",
    ingredients: ["Olive-based soap formula — confirm full list on the package label"],
    directions: "Lather with water and rinse. Suitable for daily face and body use as directed on the package.",
    warnings: "For external use only. Discontinue if skin irritation occurs.",
    categoryDescription: HYG_CAT,
  },
  W53: {
    description: "Breast Care Tea is a caffeine-free herbal wellness tea prepared for women’s comfort, circulation support, and everyday female wellbeing routines.",
    swahili: "Breast Care Tea ni chai ya mitishamba isiyo na kafeini kwa faraja ya wanawake, mzunguko wa damu, na ustawi wa kike.",
    ingredients: ["Women’s herbal tea blend — confirm full list on the package label"],
    directions: TEA_DIR,
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W54: {
    description: "Uterus Cleansing Pills are prepared for women’s gynaecological comfort routines, including support during menstrual discomfort and everyday intimate wellness.",
    swahili: "Uterus Cleansing Pills zimeandaliwa kwa faraja ya uzazi wa wanawake, ikiwa ni pamoja na usaidizi wakati wa maumivu ya hedhi.",
    ingredients: ["Women’s comfort formula — confirm full list on the package label"],
    directions: "Take as directed on the package. Do not exceed the labelled amount.",
    warnings: GEN_SAFE + " Seek medical care for severe pain, unusual bleeding, or ongoing symptoms.",
    categoryDescription: SUPP_CAT,
  },
  W55: {
    description: "Jinpure Tea is prepared to support immune comfort, respiratory ease, and seasonal wellness with a cleansing herbal profile.",
    swahili: "Jinpure Tea imeandaliwa kusaidia kinga, faraja ya kupumua, na ustawi wa msimu.",
    ingredients: ["Respiratory herbal tea blend — confirm full list on the package label"],
    directions: TEA_DIR,
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W56: {
    description: "NMN Longevity Capsules support cellular energy, healthy ageing routines, mental sharpness, stamina, and everyday vitality.",
    swahili: "Kapsuli za NMN Longevity husaidia nishati ya seli, utaratibu wa kuzeeka vizuri, umakini, uvumilivu, na nguvu za kila siku.",
    ingredients: ["NMN (nicotinamide mononucleotide)"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W57: {
    description: "Jinpure Capsules support immune balance, respiratory wellness, feverish comfort routines, detox, and recovery as part of everyday care.",
    swahili: "Kapsuli za Jinpure husaidia usawa wa kinga, ustawi wa kupumua, faraja wakati wa homa, detox, na kupona.",
    ingredients: ["Immune and respiratory support blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W58: {
    description: "SE Tablets for adults supply daily selenium to support antioxidant wellness, immunity, thyroid nutrition, and healthy hair and nails.",
    swahili: "Tembe za SE kwa watu wazima hutoa selenium ya kila siku kwa antioxidant, kinga, tezi, na afya ya nywele na kucha.",
    ingredients: ["Organic selenium"],
    directions: "Take as directed on the package with water.",
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W59: {
    description: "Vitamin D3 Capsules help maintain vitamin D levels to support calcium absorption, bone strength, and everyday immune wellness.",
    swahili: "Kapsuli za Vitamin D3 husaidia kudumisha viwango vya vitamini D kwa ufyonzwaji wa kalsiamu, nguvu ya mifupa, na kinga.",
    ingredients: ["Vitamin D3"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W60: {
    description: "Calcium Powder for Children helps supplement calcium along with supporting nutrients for growing bones and everyday childhood nutrition.",
    swahili: "Calcium Powder for Children husaidia kujaza kalsiamu na virutubisho vya msaada kwa mifupa na lishe ya watoto.",
    ingredients: ["Calcium", "Phosphorus", "Vitamin C", "Vitamin A", "Vitamin D", "Zinc"],
    directions: "Mix one sachet as directed on the package. Use only under adult supervision.",
    warnings: "For children as directed on the package. Keep out of reach when not in use. " + GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W61: {
    description: "Calcium Powder for Adults supports bones, teeth, joints, and connective tissue with calcium nutrition and collagen peptides for everyday mobility.",
    swahili: "Calcium Powder for Adults husaidia mifupa, meno, viungo, na tishu kwa kalsiamu na collagen peptides.",
    ingredients: ["Calcium", "Collagen peptides"],
    directions: POWDER_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W62: {
    description: "Calcium with Blood Sugar Support combines calcium nutrition with collagen peptides in easy-mix sachets for adults who want bone support alongside careful blood-sugar routines.",
    swahili: "Calcium with Blood Sugar Support inachanganya kalsiamu na collagen peptides kwa watu wazima wanaotaka msaada wa mifupa pamoja na utaratibu wa sukari.",
    ingredients: ["Calcium", "Collagen peptides"],
    directions: "Mix one sachet into a warm drink as directed on the package.",
    warnings: GEN_SAFE + " This product is not a substitute for prescribed diabetes care.",
    categoryDescription: SUPP_CAT,
  },
  W63: {
    description: "Bone Care Plasters are herbal adhesive plasters prepared for external comfort around joints and soft tissue. They are used to ease everyday aches and support local circulation comfort.",
    swahili: "Bone Care Plasters ni plasta za mitishamba kwa faraja ya viungo na tishu laini, na kusaidia faraja ya maumivu ya kila siku.",
    ingredients: ["Herbal plaster formula — confirm full list on the package label"],
    directions: "Clean and dry the area, apply one plaster as directed, and replace according to the package timing.",
    warnings: "For external use only. Do not apply to broken or infected skin. Discontinue if irritation occurs. " + GEN_SAFE,
    categoryDescription: TOP_CAT,
  },
  W64: {
    description: "Women Care Gel is an intimate-care gel prepared for external feminine comfort, freshness, and everyday intimate hygiene routines.",
    swahili: "Women Care Gel ni jeli ya faraja ya kike kwa usafi na uburudishaji wa kila siku.",
    ingredients: ["Intimate-care gel formula — confirm full list on the package label"],
    directions: "Apply as directed on the package using the provided applicator where applicable.",
    warnings: "For external intimate use as labelled. Stop use and seek care if irritation persists. " + GEN_SAFE,
    categoryDescription: TOP_CAT,
  },
  W65: {
    description: "Clear Lung Tea is prepared to support respiratory comfort, clear breathing, and everyday lung-wellness routines.",
    swahili: "Clear Lung Tea imeandaliwa kusaidia faraja ya kupumua, hewa safi, na ustawi wa mapafu.",
    ingredients: ["Respiratory herbal tea blend — confirm full list on the package label"],
    directions: TEA_DIR,
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W66: {
    description: "Trifolium Pratense Coffee (red clover coffee) is a beverage option for adult women’s wellness routines, including comfort through hormonal seasons.",
    swahili: "Trifolium Pratense Coffee (kahawa ya red clover) ni kinywaji kwa ustawi wa wanawake, ikiwa ni pamoja na faraja katika mabadiliko ya homoni.",
    ingredients: ["Trifolium pratense (red clover)", "Coffee beverage base — confirm full list on the package label"],
    directions: "Dissolve one sachet in hot water and enjoy as directed on the package.",
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W67: {
    description: "Ashwagandha Coffee blends coffee with ashwagandha to support steady energy, stress comfort, stamina, focus, and everyday male vitality routines.",
    swahili: "Ashwagandha Coffee inachanganya kahawa na ashwagandha kusaidia nguvu thabiti, faraja dhidi ya msongo, uvumilivu, umakini, na nguvu za kiume.",
    ingredients: ["Ashwagandha", "Coffee"],
    directions: "Dissolve one sachet in hot water and stir well. Enjoy as directed on the package.",
    warnings: GEN_SAFE,
    categoryDescription: TEA_CAT,
  },
  W68: {
    description: "Vitamin B9 Capsules provide folic acid with blueberry extract for nutritional support of cell division, blood formation, and everyday wellness. They are often considered around preconception nutrition under professional guidance.",
    swahili: "Kapsuli za Vitamin B9 hutoa folic acid na dondoo la blueberry kwa lishe ya seli, damu, na ustawi wa kila siku.",
    ingredients: ["Folic acid (vitamin B9)", "Blueberry extract"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE + " Discuss pregnancy or preconception use with a qualified health professional.",
    categoryDescription: SUPP_CAT,
  },
  W69: {
    description: "Blueberry Probiotics combine blueberry nutrition with active cultures to support gut comfort, digestion, immunity, and everyday digestive balance.",
    swahili: "Blueberry Probiotics zinachanganya lishe ya blueberry na bakteria hai kusaidia tumbo, mmeng’enyo, kinga, na usawa wa kumeng’enya.",
    ingredients: ["Blueberry blend", "Probiotic cultures (over 10 billion active cultures per sachet as stated on product materials)"],
    directions: "Mix one sachet as directed on the package, usually once daily.",
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W70: {
    description: "Ovary Nutrition Capsules are prepared for women’s hormonal comfort, menopause wellness, vitality, and everyday reproductive nutritional support.",
    swahili: "Kapsuli za Ovary Nutrition zimeandaliwa kwa faraja ya homoni za wanawake, ustawi wa menopause, nguvu, na lishe ya uzazi.",
    ingredients: ["Women’s ovary-support botanical blend — confirm full list on the package label"],
    directions: CAPSULE_DIR,
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
  W71: {
    description: "Gastric Health Tablets support comfortable digestion, healthy gastrointestinal movement, appetite wellness, and everyday nutrient absorption.",
    swahili: "Tembe za Gastric Health husaidia mmeng’enyo mzuri, mwendo wa tumbo na matumbo, hamu ya chakula, na ufyonzwaji wa virutubisho.",
    ingredients: ["Gastric comfort formula — confirm full list on the package label"],
    directions: "Take as directed on the package, usually with water around meals unless the label says otherwise.",
    warnings: GEN_SAFE,
    categoryDescription: SUPP_CAT,
  },
};

function applyRewrites(catalog) {
  let updated = 0;
  for (const product of catalog.products) {
    const rewrite = REWRITES[product.code];
    if (!rewrite) throw new Error(`Missing rewrite for ${product.code}`);
    product.simple_english.short_description = rewrite.description;
    product.simple_swahili.short_description = rewrite.swahili;
    if (rewrite.ingredients?.length) product.details.ingredients = rewrite.ingredients;
    product.details.directions_on_label = rewrite.directions;
    product.details.safety_warnings_on_label = [rewrite.warnings];
    product.details.intended_use_or_marketing_claims = [];
    // Keep category short description product-facing via categoryDescription in app;
    // also store a product-level note in research is unnecessary — UI uses categoryDescription from categoryFor.
    // We stamp category description into a custom field used by catalog if present.
    product.details.category_guidance_en = rewrite.categoryDescription;
    updated += 1;
  }
  return updated;
}

function writeResearchedCatalogTs(catalog) {
  const meta = {
    catalogTitle: catalog.catalog_title,
    schemaVersion: catalog.schema_version,
    currency: catalog.currency,
    currencyBasis: catalog.currency_basis,
    catalogNotes: catalog.catalog_notes,
    sourceRegister: catalog.source_register,
    researchBatches: catalog.research_batches,
    websiteImageAssets: catalog.website_image_assets,
    websiteImageNames: catalog.website_image_names,
    imageAssetNotes: catalog.image_asset_notes,
  };

  const body = `// Generated from product_catalog_researched_W01-W71.json. Keep the source JSON as the research master.

export const researchedMeta = ${JSON.stringify(meta, null, 2)} as const;

export const researchedCategories = ${JSON.stringify(catalog.categories, null, 2)} as const;

export const researchedProducts = ${JSON.stringify(catalog.products, null, 2)} as const;
`;
  fs.writeFileSync(TS_PATH, body, "utf8");
}

function main() {
  let catalog = null;
  for (const jsonPath of JSON_PATHS) {
    if (!fs.existsSync(jsonPath)) {
      console.warn(`Skip missing ${jsonPath}`);
      continue;
    }
    catalog = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const count = applyRewrites(catalog);
    fs.writeFileSync(jsonPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    console.log(`Updated ${count} products in ${jsonPath}`);
  }
  if (!catalog) throw new Error("No catalog updated");
  writeResearchedCatalogTs(catalog);
  console.log(`Synced ${TS_PATH}`);
}

main();
