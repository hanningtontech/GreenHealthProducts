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
  { code: "W16", slug: "calcium-tablet-for-adults", name: "Calcium Tablet (For Adults)" },
  { code: "W17", slug: "zinc-tablet-for-adults", name: "Zinc Tablet (For Adults)" },
  { code: "W18", slug: "lecithin-softgel", name: "Lecithin Softgel" },
  { code: "W19", slug: "deep-sea-fish-oil-softgel-omega-3", name: "Deep Sea Fish Oil Softgel (Omega-3)" },
  { code: "W20", slug: "meal-cellulose-tablets", name: "Meal Cellulose tablets" },
  { code: "W21", slug: "garlic-oil-capsules", name: "Garlic Oil capsules" },
  { code: "W22", slug: "eye-care-softgel", name: "Eye Care Softgel" },
  { code: "W23", slug: "chitosan-capsule", name: "Chitosan Capsule" },
  { code: "W24", slug: "aloe-vera-plus-capsule", name: "Aloe Vera Plus Capsule" },
  { code: "W25", slug: "compound-marrow-powder", name: "Compound Marrow Powder" },
  { code: "W26", slug: "ginkgo-biloba-capsule", name: "Ginkgo Biloba Capsule" },
  { code: "W27", slug: "pine-pollen-tea", name: "Pine Pollen Tea" },
  { code: "W28", slug: "intestine-cleansing-tea", name: "Intestine Cleansing Tea" },
  { code: "W29", slug: "balsam-pear-tea", name: "Balsam Pear Tea" },
  { code: "W30", slug: "b-carotene-and-lycopene-capsule", name: "B-Carotene & Lycopene Capsule" },
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
    return !(num >= 16 && num <= 30);
  });
  catalog.website_image_assets = [...existing, ...batchAssets];
  catalog.website_image_names = catalog.website_image_assets.map((item) => item.file_name);
  catalog.image_asset_notes = [
    "File names use the stable product-code convention: _thumbnail for cards (with white headroom), _1 primary, _2 alternate/spill.",
    "The website currently uses website_path. When images move to another server, populate external_url while keeping file_name unchanged.",
    "W01–W30 website images are generated square WebP assets for storefront use; they are not verified photos of the owner's current physical package.",
    "Products without selected assets remain image-free and continue using the site placeholder.",
    "Image sources are recorded for attribution and review; generated assets are marked generated_for_website.",
  ];
  catalog.website_sync_status = {
    status: "w01_w30_images_synced",
    reason: "Generated and linked square WebP thumbnails and gallery shots for W01–W30.",
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
