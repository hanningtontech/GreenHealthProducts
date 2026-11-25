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
  { code: "W01", slug: "cordyceps-plus-capsule", name: "Cordyceps Plus Capsule" },
  { code: "W02", slug: "spirulina-plus-capsule", name: "Spirulina Plus Capsule" },
  { code: "W03", slug: "propolis-plus-capsule", name: "Propolis Plus Capsule" },
  { code: "W04", slug: "ganoderma-plus-capsule", name: "Ganoderma Plus Capsule" },
  { code: "W05", slug: "cardio-power-capsule", name: "Cardio Power Capsule" },
  { code: "W06", slug: "soy-power-capsule", name: "Soy Power Capsule" },
  { code: "W07", slug: "a-power-capsule", name: "A-Power Capsule" },
  { code: "W08", slug: "vigpower-capsule", name: "VigPower Capsule" },
  { code: "W09", slug: "ginseng-rhs-capsule", name: "Ginseng RHs Capsule" },
  { code: "W10", slug: "pro-slim-tea", name: "Pro-slim Tea" },
  { code: "W11", slug: "kuding-plus-tea", name: "Kuding Plus Tea" },
  { code: "W12", slug: "ganoderma-coffee", name: "Ganoderma Coffee" },
  { code: "W13", slug: "lipid-care-tea", name: "Lipid Care Tea" },
  { code: "W14", slug: "protein-powder", name: "Protein Powder" },
  { code: "W15", slug: "multi-vitamin-tablet-for-adults", name: "Multi-vitamin Tablet (For Adults)" },
];

const ROLES = [
  { suffix: "thumbnail", role: "thumbnail", note: "Square compressed thumbnail for shop cards." },
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

async function convertAll() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let converted = 0;
  for (const product of PRODUCTS) {
    for (const roleSpec of ROLES) {
      const base = `${product.code}-${product.slug}_${roleSpec.suffix}`;
      const src = path.join(ASSETS, `${base}.jpg`);
      const dest = path.join(OUT_DIR, `${base}.webp`);
      if (!fs.existsSync(src)) throw new Error(`Missing source: ${src}`);
      await sharp(src)
        .resize(512, 512, { fit: "cover", position: "centre" })
        .webp({ quality: 68, effort: 4 })
        .toFile(dest);
      converted += 1;
      const size = fs.statSync(dest).size;
      console.log(`ok ${path.basename(dest)} (${Math.round(size / 1024)} KB)`);
    }
  }
  // Remove previous retailer-only W01 files if somehow left without new names — new set replaces them.
  console.log(`Converted ${converted} WebP files.`);
}

function updateCatalogJson(filePath) {
  const catalog = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const allAssets = [];

  for (const product of PRODUCTS) {
    const images = ROLES.map((roleSpec) => imageEntry(product, roleSpec));
    const record = catalog.products.find((item) => item.code === product.code);
    if (!record) throw new Error(`Missing product ${product.code} in ${filePath}`);
    record.details.website_images = images;
    allAssets.push(...images);
  }

  catalog.website_image_assets = allAssets;
  catalog.website_image_names = allAssets.map((item) => item.file_name);
  catalog.image_asset_notes = [
    "File names use the stable product-code convention: _thumbnail for cards, _1 primary, _2 alternate/spill.",
    "The website currently uses website_path. When images move to another server, populate external_url while keeping file_name unchanged.",
    "W01–W15 website images are generated square WebP assets for storefront use; they are not verified photos of the owner's current physical package.",
    "Products without selected assets remain image-free and continue using the site placeholder.",
    "Image sources are recorded for attribution and review; generated assets are marked generated_for_website.",
  ];
  catalog.website_sync_status = {
    status: "w01_w15_images_synced",
    reason: "Generated and linked square WebP thumbnails and gallery shots for W01–W15.",
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
