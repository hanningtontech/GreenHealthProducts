import type { Product } from "./catalog";

const SEARCH_BIAS_KEY = "ghp_last_store_search";

export function readLastStoreSearch(): string {
  try {
    return String(sessionStorage.getItem(SEARCH_BIAS_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeLastStoreSearch(query: string): void {
  try {
    const q = String(query || "").trim().slice(0, 200);
    if (q) sessionStorage.setItem(SEARCH_BIAS_KEY, q);
    else sessionStorage.removeItem(SEARCH_BIAS_KEY);
  } catch {
    // ignore
  }
}

export function productSearchHaystack(product: Product): string {
  return `${product.code} ${product.name} ${product.category} ${product.categorySwahili} ${product.ingredients}`.toLowerCase();
}

export function filterVisibleProducts(products: Product[], query: string): Product[] {
  const q = query.trim().toLowerCase();
  return products.filter((p) => {
    if (!p.visible) return false;
    if (!q) return true;
    return productSearchHaystack(p).includes(q);
  });
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Pick up to `count` featured products: bias toward last search matches, then random fill. */
export function pickFeaturedProducts(
  products: Product[],
  options?: { count?: number; biasQuery?: string },
): Product[] {
  const count = Math.max(1, options?.count ?? 4);
  const visible = products.filter((p) => p.visible);
  if (visible.length <= count) return shuffleInPlace([...visible]);

  const bias = String(options?.biasQuery ?? readLastStoreSearch()).trim().toLowerCase();
  const matched = bias
    ? shuffleInPlace(visible.filter((p) => productSearchHaystack(p).includes(bias)))
    : [];
  const rest = shuffleInPlace(
    visible.filter((p) => !matched.some((m) => m.id === p.id)),
  );
  return [...matched, ...rest].slice(0, count);
}
