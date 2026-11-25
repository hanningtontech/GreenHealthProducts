import { researchedCategories, researchedMeta, researchedProducts } from "./researchedCatalog";

export type ResearchSource = {
  url: string;
  title: string;
  source_type?: string;
  notes?: string;
};

export type ProductImageRole = "thumbnail" | "primary" | "gallery" | string;

export type ProductImage = {
  file_name: string;
  website_path: string;
  role: ProductImageRole;
  format: string;
  /** Lower = earlier in the product-detail gallery (0 is first / hero). */
  sortOrder?: number;
  /** Stable gallery slot id used for B2 object keys (e.g. g1). */
  slot?: string;
  external_url?: string | null;
  source_image_url?: string;
  source_page_url?: string;
  source_title?: string;
  source_type?: string;
  match_status?: string;
  notes?: string;
};

export type Product = {
  id: string;
  code: string;
  name: string;
  category: string;
  categorySwahili: string;
  categoryDescription: string;
  packSize: string;
  bv: number;
  ingredients: string;
  description: string;
  swahili: string;
  usage: string;
  warnings: string;
  marketingClaims: string[];
  evidenceStatus: string;
  matchStatus: string;
  sources: ResearchSource[];
  researchRecord?: (typeof researchedProducts)[number];
  retailPrice: number;
  distributorPrice: number;
  stock: number;
  image?: string;
  images: ProductImage[];
  verified: boolean;
  visible: boolean;
};

/** Prefer HTTPS / path on an image record (catalogue paths or uploaded URLs). */
export function productImageSrc(image?: ProductImage | null): string {
  if (!image) return "";
  const raw = [image.external_url, image.website_path]
    .map((value) => String(value ?? "").trim())
    .find((value) => value && value !== "null" && value !== "undefined");
  if (!raw) return "";
  // Keep absolute URLs and root-relative catalogue paths as-is.
  if (/^(https?:|data:|blob:|\/)/i.test(raw)) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

/** Shop-card image: dedicated thumbnail, else cover `image`, else first gallery shot. */
export function productCardImage(product: Product): string {
  const thumb = (product.images || []).find((image) => image.role === "thumbnail");
  const fromThumb = productImageSrc(thumb);
  if (fromThumb) return fromThumb;
  if (product.image) return product.image;
  const first = productDetailImages(product)[0];
  return productImageSrc(first);
}

/** Detail-page gallery (excludes thumbnail), ordered by sortOrder then file name. */
export function productDetailImages(product: Product): ProductImage[] {
  const gallery = (product.images || [])
    .filter((image) => image.role !== "thumbnail")
    .slice()
    .sort((a, b) => {
      const ao = a.sortOrder ?? 999;
      const bo = b.sortOrder ?? 999;
      if (ao !== bo) return ao - bo;
      return String(a.file_name).localeCompare(String(b.file_name));
    });
  if (gallery.length) return gallery;
  if (product.image) {
    return [{
      file_name: "cover",
      website_path: product.image,
      role: "primary",
      format: "jpg",
      sortOrder: 0,
      external_url: product.image,
    }];
  }
  return [];
}

/** Keep legacy `product.image` in sync with thumbnail (or first detail image). */
export function withSyncedCoverImage(product: Product): Product {
  const thumb = (product.images || []).find((image) => image.role === "thumbnail");
  const cover = productImageSrc(thumb) || productImageSrc(productDetailImages(product)[0]) || product.image;
  return { ...product, image: cover || undefined };
}

type ResearchDetails = (typeof researchedProducts)[number]["details"];
type ImportedProduct = (typeof researchedProducts)[number];

export const catalogMeta = researchedMeta;

export const categoryDefinitions = researchedCategories.map((category) => ({
  id: category.id,
  name: category.name_en,
  nameSwahili: category.name_sw,
  description: category.short_description_en,
  descriptionSwahili: category.short_description_sw,
}));

export const defaultCategories = categoryDefinitions.map((category) => category.name);

function asText(value: unknown, fallback: string): string {
  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return values.length ? values.join(" ") : fallback;
  }
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function categoryFor(categoryEn: string) {
  return categoryDefinitions.find((category) => category.name === categoryEn) ?? {
    id: categoryEn.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: categoryEn,
    nameSwahili: "",
    description: "Check the current package label for product use and safety information.",
    descriptionSwahili: "Angalia lebo ya sasa kwa maelezo ya matumizi na usalama.",
  };
}

function productFromResearch(item: ImportedProduct): Product {
  const details = item.details as ResearchDetails;
  const research = details.research as Record<string, unknown> | undefined;
  const websiteImages = ((details as ResearchDetails & { website_images?: readonly ProductImage[] }).website_images ?? []).map((image) => ({ ...image }));
  const category = categoryFor(item.category_en);
  const ingredients = asList(details.ingredients);
  const warnings = asList(details.safety_warnings_on_label);
  const marketingClaims = asList(details.intended_use_or_marketing_claims);
  const matchStatus = typeof research?.match_status === "string" ? research.match_status : "Not normalized";
  const categoryGuidance = typeof (details as ResearchDetails & { category_guidance_en?: string }).category_guidance_en === "string"
    ? (details as ResearchDetails & { category_guidance_en?: string }).category_guidance_en!
    : category.description;

  return {
    id: item.code.toLowerCase(),
    code: item.code,
    name: item.name_as_read,
    category: category.name,
    categorySwahili: item.category_sw,
    categoryDescription: categoryGuidance,
    packSize: item.specification_as_printed,
    bv: item.bv,
    ingredients: ingredients.length ? ingredients.join("; ") : "Check the current package label for the full ingredient list.",
    description: item.simple_english.short_description,
    swahili: item.simple_swahili.short_description,
    usage: asText(details.directions_on_label, "Follow the current package label for directions."),
    warnings: warnings.length ? warnings.join(" ") : "Follow the current package label for safety information.",
    marketingClaims,
    evidenceStatus: details.evidence_status,
    matchStatus,
    sources: Array.isArray(details.sources) ? details.sources.map((source) => ({
      url: source.url,
      title: source.title,
      source_type: source.source_type,
      notes: source.notes,
    })) : [],
    researchRecord: item,
    retailPrice: item.retail_price_ksh,
    distributorPrice: item.distributor_price_ksh,
    stock: 0,
    image: (() => {
      const pick = websiteImages.find((image) => image.role === "thumbnail")
        ?? websiteImages.find((image) => image.role === "primary")
        ?? websiteImages[0];
      return pick?.external_url || pick?.website_path;
    })(),
    images: websiteImages,
    verified: false,
    visible: true,
  };
}

export const defaultProducts: Product[] = researchedProducts.map(productFromResearch);

const PRODUCTS_KEY = "greenhealth-products-v7";
const CATEGORIES_KEY = "greenhealth-categories-v1";
const LEGACY_PRODUCTS_KEY = "greenworld-products-v6";

function hydrateSavedProduct(saved: Partial<Product>, fallback?: Product): Product {
  return {
    ...(fallback ?? {
      id: saved.id ?? `product-${Date.now()}`,
      code: saved.code ?? "CUSTOM",
      name: "",
      category: defaultCategories[0],
      categorySwahili: "",
      categoryDescription: "",
      packSize: "",
      bv: 0,
      ingredients: "",
      description: "",
      swahili: "",
      usage: "",
      warnings: "",
      marketingClaims: [],
      evidenceStatus: "Manual entry — not researched",
      matchStatus: "Not researched",
      sources: [],
      retailPrice: 0,
      distributorPrice: 0,
      stock: 0,
      images: [],
      verified: false,
      visible: true,
    }),
    ...saved,
    marketingClaims: saved.marketingClaims ?? fallback?.marketingClaims ?? [],
    sources: saved.sources ?? fallback?.sources ?? [],
    images: saved.images ?? fallback?.images ?? [],
    researchRecord: saved.researchRecord ?? fallback?.researchRecord,
    // Storefront always prefers the catalogue retail price when available.
    retailPrice: (fallback?.retailPrice && fallback.retailPrice > 0) ? fallback.retailPrice : (saved.retailPrice ?? 0),
    distributorPrice: (fallback?.distributorPrice && fallback.distributorPrice > 0) ? fallback.distributorPrice : (saved.distributorPrice ?? 0),
  } as Product;
}

const LOCAL_IMAGES_KEY = "greenhealth-product-images-v1";

type LocalImageMap = Record<string, string>;

function readLocalImages(): LocalImageMap {
  try {
    const raw = localStorage.getItem(LOCAL_IMAGES_KEY);
    return raw ? (JSON.parse(raw) as LocalImageMap) : {};
  } catch {
    return {};
  }
}

function writeLocalImages(map: LocalImageMap) {
  localStorage.setItem(LOCAL_IMAGES_KEY, JSON.stringify(map));
}

/** Keep media in the browser only — never send data URLs to Firebase. */
export function rememberLocalProductImage(productId: string, dataUrl: string) {
  const map = readLocalImages();
  map[productId] = dataUrl;
  writeLocalImages(map);
}

export function hydrateProductImagesLocally(product: Product): Product {
  const local = readLocalImages()[product.id];
  if (!local) return product;
  return { ...product, image: local };
}

export function loadProducts(): Product[] {
  try {
    const saved = localStorage.getItem(PRODUCTS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Product>[];
      if (Array.isArray(parsed)) {
        return parsed.map((product) =>
          hydrateProductImagesLocally(
            hydrateSavedProduct(product, defaultProducts.find((item) => item.id === product.id)),
          ),
        );
      }
    }

    // Carry over only owner-controlled fields from the prototype's five sample records.
    const legacy = localStorage.getItem(LEGACY_PRODUCTS_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<Product>[];
      const legacyById = new Map(parsed.map((product) => [product.id, product]));
      return defaultProducts.map((product) => {
        const old = legacyById.get(product.id);
        const merged = old
          ? { ...product, image: old.image, stock: old.stock ?? product.stock, visible: old.visible ?? product.visible }
          : product;
        if (old?.image?.startsWith("data:")) rememberLocalProductImage(product.id, old.image);
        return hydrateProductImagesLocally(merged);
      });
    }
    return defaultProducts.map(hydrateProductImagesLocally);
  } catch {
    return defaultProducts;
  }
}

export function saveProducts(products: Product[]) {
  // Persist catalogue locally as a cache; media stays in the dedicated images key.
  const images = readLocalImages();
  for (const product of products) {
    if (product.image?.startsWith("data:")) {
      images[product.id] = product.image;
    }
  }
  writeLocalImages(images);
  const withoutBlobs = products.map((product) => ({
    ...product,
    image: product.image?.startsWith("data:") ? undefined : product.image,
  }));
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(withoutBlobs));
}

export function loadCategories(): string[] {
  try {
    const saved = localStorage.getItem(CATEGORIES_KEY);
    return saved ? JSON.parse(saved) : defaultCategories;
  } catch {
    return defaultCategories;
  }
}

export function saveCategories(categories: string[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

/** Short display label for cards/pills — storage/filter values stay the full category name. */
export function shortCategoryLabel(category: string): string {
  const known: Record<string, string> = {
    "Dietary supplements": "Dietary",
    "Teas and beverages": "Teas",
    "Topical products and patches": "Topical",
  };
  if (known[category]) return known[category];
  return category
    .replace(/\bsupplements?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim() || category;
}

export function money(value: number) {
  return value > 0 ? `KSh ${value.toLocaleString("en-KE")}` : "Price to be confirmed";
}

/** Always show the catalogue retail price on the storefront. */
export function retailMoney(product: Product) {
  return money(product.retailPrice);
}

export function margin(product: Product) {
  return product.retailPrice > 0 && product.distributorPrice > 0 ? product.retailPrice - product.distributorPrice : 0;
}

export function researchBadge(product: Product) {
  if (product.verified) return "Verified for publication";
  if (product.matchStatus.toLowerCase().includes("ambiguous")) return "Identity needs confirmation";
  if (product.evidenceStatus.toLowerCase().includes("label_verified")) return "Research found · label review needed";
  return "Review before publication";
}

/** Buy-box description under the title — always the full text, never truncated. */
export function shortProductLead(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export type DirectionRow = { label: string; value: string };

function labelForRateContext(context: string): string {
  const text = context.replace(/\s+/g, " ").trim();
  if (/vegetable|flower|rice/i.test(text)) return "Vegetables / flowers / rice";
  if (/fruit\s*tree/i.test(text)) return "Fruit trees";
  if (/fruit|plant/i.test(text)) return "Fruit / plant applications";
  if (/lawn/i.test(text)) return "Lawn";
  if (/seed/i.test(text)) return "Seed coating";
  const forMatch = text.match(/\bfor\s+(.+)$/i);
  if (forMatch) {
    const label = forMatch[1]
      .replace(/\b(and|,)\b/gi, " / ")
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, " / ")
      .trim();
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return "Application rate";
}

/**
 * Turn free-text usage into label/value rows for the Directions tab
 * (e.g. Dilution → 1:1000 solution; crop rates → cc per 20 L).
 */
export function directionRows(usage: string): DirectionRow[] {
  const raw = String(usage || "").replace(/\s+/g, " ").trim();
  if (!raw) return [];

  const rows: DirectionRow[] = [];
  const ratio = raw.match(/(\d+\s*:\s*\d+)\s*(solution)?/i);
  if (/dilut/i.test(raw) && ratio) {
    rows.push({
      label: "Dilution",
      value: `${ratio[1].replace(/\s+/g, "")}${/solution/i.test(raw) ? " solution" : ""}`.trim(),
    });
  }

  const rateRe = /(\d+\s*[–-]\s*\d+|\d+)\s*(cc|ml)\s*per\s*(\d+\s*L)\s*(?:for\s+([^.,;]+))?/gi;
  let match: RegExpExecArray | null;
  while ((match = rateRe.exec(raw)) !== null) {
    const value = `${match[1].replace(/\s+/g, "")} ${match[2]} per ${match[3].replace(/\s+/g, " ")}`;
    rows.push({
      label: labelForRateContext(match[4] || match[0]),
      value,
    });
  }

  const noteMatch = raw.match(/(Table text[^.]+\.|blurred[^.]*\.|check the current package[^.]*\.)/i);
  if (noteMatch) {
    rows.push({ label: "Note", value: noteMatch[1].trim() });
  }

  if (!rows.length) return [{ label: "Directions", value: raw }];
  return rows;
}
