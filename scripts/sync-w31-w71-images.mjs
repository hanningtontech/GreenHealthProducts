import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../..");
const GREENWORLD = path.resolve(import.meta.dirname, "..");
const ASSETS = path.resolve(
  "C:/Users/Hannie/.cursor/projects/c-Users-Hannie-OneDrive-Documents-Trailer-blazer-Projects-GreenHealthProducts/assets"
);
const OUT_DIR = path.join(GREENWORLD, "client/public/images/products");
const JSON_PATHS = [
  path.join(ROOT, "product_catalog_researched_W01-W71 (2).json"),
  path.resolve(
    "C:/Users/Hannie/.cursor/projects/c-Users-Hannie-OneDrive-Documents-Trailer-blazer-Projects-GreenHealthProducts/attachments/2857a61e-c137-4cf8-afa4-04d1bf326873/product_catalog_researched_W01-W71__2_.json"
  ),
];
const TS_PATH = path.join(GREENWORLD, "client/src/lib/researchedCatalog.ts");

const PRODUCTS = [
  { code: "W31", slug: "livergen-capsule", name: "Livergen Capsule" },
  { code: "W32", slug: "royal-jelly-softgel", name: "Royal Jelly Softgel" },
  { code: "W33", slug: "l-arginine-capsule", name: "L-Arginine Capsule" },
  { code: "W34", slug: "parashield-capsule", name: "Parashield Capsule" },
  { code: "W35", slug: "magic-detoxin-pad", name: "Magic Detoxin Pad" },
  { code: "W36", slug: "slimming-capsule", name: "Slimming Capsule" },
  { code: "W37", slug: "joint-health-plus-capsule", name: "Joint Health Plus Capsule" },
  { code: "W38", slug: "super-co-q10-capsule", name: "Super Co-Q10 Capsule" },
  { code: "W39", slug: "vitamin-c-tablet", name: "Vitamin C Tablet" },
  { code: "W40", slug: "vitamin-e-capsule", name: "Vitamin E Capsule" },
  { code: "W41", slug: "super-nutrition", name: "Super Nutrition" },
  { code: "W42", slug: "glucoblock-capsule", name: "Glucoblock Capsule" },
  { code: "W43", slug: "prostasure-capsule", name: "ProstaSure Capsule" },
  { code: "W44", slug: "kidney-tonifying-capsule-men", name: "Kidney Tonifying Capsule (Men)" },
  { code: "W45", slug: "kidney-tonifying-capsule-women", name: "Kidney Tonifying Capsule (Women)" },
  { code: "W46", slug: "blue-berry-juice-high-vc", name: "Blue Berry Juice High VC" },
  { code: "W47", slug: "nutriplant-organic-fertilizer", name: "Nutriplant Organic Fertilizer" },
  { code: "W48", slug: "nutriplant-organic-fertilizer-100ml", name: "Nutriplant Organic Fertilizer 100ML" },
  { code: "W49", slug: "nutriplant-organic-fertilizer-tc", name: "Nutriplant Organic Fertilizer (T&C)" },
  { code: "W50", slug: "tooth-paste", name: "Tooth Paste" },
  { code: "W51", slug: "fresh-drink-clear", name: "Fresh Drink Clear" },
  { code: "W52", slug: "olive-soap", name: "Olive Soap" },
  { code: "W53", slug: "breast-care-tea", name: "Breast Care Tea" },
  { code: "W54", slug: "uterus-cleansing-pill", name: "Uterus Cleansing Pill" },
  { code: "W55", slug: "jinpure-tea", name: "Jinpure Tea" },
  { code: "W56", slug: "nmn-longevity-capsule", name: "NMN Longevity Capsule" },
  { code: "W57", slug: "jinpure-capsule", name: "Jinpure Capsule" },
  { code: "W58", slug: "se-tablet-for-adults", name: "SE Tablet (For Adults)" },
  { code: "W59", slug: "vitamin-d3-capsule", name: "Vitamin D3 Capsule" },
  { code: "W60", slug: "calcium-powder-for-children", name: "Calcium Powder for Children" },
  { code: "W61", slug: "calcium-powder-for-adult", name: "Calcium Powder for Adult" },
  { code: "W62", slug: "calcium-with-blood-sugar-support", name: "Calcium with Blood Sugar Support" },
  { code: "W63", slug: "bone-care-plaster", name: "Bone Care Plaster" },
  { code: "W64", slug: "women-care-gel", name: "Women Care Gel" },
  { code: "W65", slug: "clear-lung-tea", name: "Clear Lung Tea" },
  { code: "W66", slug: "trifolium-pratense-coffee", name: "Trifolium Pratense Coffee" },
  { code: "W67", slug: "ashwagandha-coffee", name: "Ashwagandha Coffee" },
  { code: "W68", slug: "vitamin-b9-capsule", name: "Vitamin B9 Capsule" },
  { code: "W69", slug: "blueberry-probiotics", name: "Blueberry Probiotics" },
  { code: "W70", slug: "ovary-nutrition-capsule", name: "Ovary Nutrition Capsule" },
  { code: "W71", slug: "gastric-health-tablet", name: "Gastric Health Tablet" },
];

const ROLES = [
  { suffix: "thumbnail", role: "thumbnail", note: "Square compressed thumbnail with white headroom for shop cards." },
  { suffix: "1", role: "primary", note: "Primary pack hero shot on seamless white." },
  { suffix: "2", role: "alternate", note: "Spill/lifestyle alternate shot on seamless white." },
];

function imageEntry(product, roleSpec) {
  const file_name = `${product.code}-${product.slug}_${roleSpec.suffix}.webp`;
  return {
    file_name,
    website_path: `/images/products/${file_name}`,
    role: roleSpec.role,
    format: "webp",
    source_image_url: null,
    source_page_url: null,
    source_title: `Generated website asset for ${product.name}`,
    source_type: "generated_for_website",
    match_status: "generated_for_website",
    notes: `${roleSpec.note} Original packaging-style artwork for website use; not a verified photo of the owner's current package.`,
    external_url: null,
  };
}

async function writeWebp(src, dest, { thumbnail }) {
  if (thumbnail) {
    const product = await sharp(src).resize(320, 320, { fit: "inside" }).toBuffer();
    const meta = await sharp(product).metadata();
    const left = Math.max(0, Math.round((512 - (meta.width ?? 320)) / 2));
    const top = Math.max(0, Math.round((512 - (meta.height ?? 320)) * 0.62));
    const buf = await sharp({
      create: { width: 512, height: 512, channels: 3, background: "#ffffff" },
    })
      .composite([{ input: product, top, left }])
      .webp({ quality: 68, effort: 4 })
      .toBuffer();
    fs.writeFileSync(dest, buf);
    return buf.length;
  }

  const buf = await sharp(src)
    .resize(512, 512, { fit: "cover", position: "centre" })
    .webp({ quality: 68, effort: 4 })
    .toBuffer();
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function convertAll() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let converted = 0;
  for (const product of PRODUCTS) {
    for (const roleSpec of ROLES) {
      const base = `${product.code}-${product.slug}_${roleSpec.suffix}`;
      const src = path.join(ASSETS, `${base}.jpg`);
      const dest = path.join(OUT_DIR, `${base}.webp`);
      if (!fs.existsSync(src)) throw new Error(`Missing source: ${src}`);
      const size = await writeWebp(src, dest, { thumbnail: roleSpec.role === "thumbnail" });
      converted += 1;
      console.log(`ok ${path.basename(dest)} (${Math.round(size / 1024)} KB)`);
    }
  }
  console.log(`Converted ${converted} WebP files.`);
}

function updateCatalogJson(filePath) {
  const catalog = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const batchAssets = [];

  for (const product of PRODUCTS) {
    const images = ROLES.map((roleSpec) => imageEntry(product, roleSpec));
    const record = catalog.products.find((item) => item.code === product.code);
    if (!record) throw new Error(`Missing product ${product.code} in ${filePath}`);
    record.details.website_images = images;
    batchAssets.push(...images);
  }

  const existing = (catalog.website_image_assets ?? []).filter((asset) => {
    const code = String(asset.file_name || "").slice(0, 3);
    const num = Number(code.replace("W", ""));
    return !(num >= 31 && num <= 71);
  });
  catalog.website_image_assets = [...existing, ...batchAssets];
  catalog.website_image_names = catalog.website_image_assets.map((item) => item.file_name);
  catalog.image_asset_notes = [
    "File names use the stable product-code convention: _thumbnail for cards (with white headroom), _1 primary, _2 alternate/spill.",
    "The website currently uses website_path. When images move to another server, populate external_url while keeping file_name unchanged.",
    "W01–W71 website images are generated square WebP assets for storefront use; they are not verified photos of the owner's current physical package.",
    "Generated assets are marked generated_for_website.",
  ];
  catalog.website_sync_status = {
    status: "w01_w71_images_synced",
    reason: "Generated and linked square WebP thumbnails and gallery shots for the full W01–W71 catalogue.",
  };

  fs.writeFileSync(filePath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Updated JSON ${filePath}`);
  return catalog;
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
  console.log(`Updated ${TS_PATH}`);
}

async function main() {
  await convertAll();
  let catalog = null;
  for (const jsonPath of JSON_PATHS) {
    if (!fs.existsSync(jsonPath)) {
      console.warn(`Skip missing JSON: ${jsonPath}`);
      continue;
    }
    catalog = updateCatalogJson(jsonPath);
  }
  if (!catalog) throw new Error("No catalog JSON updated");
  writeResearchedCatalogTs(catalog);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
