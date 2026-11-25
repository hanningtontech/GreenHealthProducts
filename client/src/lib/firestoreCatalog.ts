import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./firebase";
import {
  defaultCategories,
  defaultProducts,
  hydrateProductImagesLocally,
  type Product,
} from "./catalog";

/** Firestore stores catalogue text + image path metadata — never image blobs/data URLs. */
export type FirestoreProduct = Omit<Product, "image" | "researchRecord"> & {
  imagePath?: string | null;
  updatedAt?: unknown;
};

function isDataUrl(value?: string | null): boolean {
  return Boolean(value && value.startsWith("data:"));
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const next = { ...value };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

function toFirestoreProduct(product: Product): FirestoreProduct {
  const { researchRecord: _research, image, ...rest } = product;
  const imagePath = image && !isDataUrl(image) ? image : null;
  const images = (product.images ?? []).map((img) =>
    stripUndefined({
      ...img,
      // Drop any embedded payloads; keep paths/URLs only.
      external_url: img.external_url && !isDataUrl(img.external_url) ? img.external_url : null,
      source_image_url: img.source_image_url && !isDataUrl(img.source_image_url) ? img.source_image_url : undefined,
    }),
  );
  return stripUndefined({
    ...rest,
    images,
    imagePath,
    updatedAt: serverTimestamp(),
  }) as FirestoreProduct;
}

function fromFirestoreProduct(data: FirestoreProduct): Product {
  const imagePath = data.imagePath ?? undefined;
  const base: Product = {
    ...data,
    image: imagePath || undefined,
    images: data.images ?? [],
    marketingClaims: data.marketingClaims ?? [],
    sources: data.sources ?? [],
  } as Product;
  return hydrateProductImagesLocally(base);
}

export async function fetchProductsFromFirestore(): Promise<Product[] | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDocs(collection(getDb(), "products"));
  if (snap.empty) return null;
  return snap.docs.map((item) => fromFirestoreProduct(item.data() as FirestoreProduct));
}

export async function fetchCategoriesFromFirestore(): Promise<string[] | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(doc(getDb(), "settings", "catalog"));
  if (!snap.exists()) return null;
  const categories = snap.data()?.categories;
  return Array.isArray(categories) ? (categories as string[]) : null;
}

export async function saveProductsToFirestore(products: Product[]): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);
  for (const product of products) {
    batch.set(doc(db, "products", product.id), toFirestoreProduct(product), { merge: true });
  }
  await batch.commit();
}

export async function saveCategoriesToFirestore(categories: string[]): Promise<void> {
  await setDoc(
    doc(getDb(), "settings", "catalog"),
    { categories, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Seed Firestore once from the researched local catalogue (text only). */
export async function seedCatalogIfEmpty(): Promise<{ seeded: boolean }> {
  if (!isFirebaseConfigured()) return { seeded: false };
  const existing = await getDocs(collection(getDb(), "products"));
  if (!existing.empty) return { seeded: false };
  await saveProductsToFirestore(defaultProducts);
  await saveCategoriesToFirestore(defaultCategories);
  return { seeded: true };
}
