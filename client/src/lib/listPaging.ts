export const PAGE_SIZE_DEFAULT = 10;

export function pageCount(total: number, pageSize: number): number {
  const size = Math.max(1, pageSize);
  return Math.max(1, Math.ceil(total / size));
}

export function clampPage(page: number, totalPages: number): number {
  const pages = Math.max(1, totalPages);
  return Math.min(Math.max(1, page), pages);
}

export function slicePage<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const size = Math.max(1, pageSize);
  const totalPages = pageCount(items.length, size);
  const safe = clampPage(page, totalPages);
  const start = (safe - 1) * size;
  return items.slice(start, start + size);
}