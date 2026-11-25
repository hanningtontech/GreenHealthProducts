/** Persist admin UI drafts in sessionStorage so leaving a section/page restores filters & selection. */

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage may be unavailable (private mode / quota)
  }
}

export type AdminCatalogUi = {
  browseQuery: string;
  browseCategory: string;
  browseVisibility: "all" | "visible" | "hidden";
  pageSize: 10 | 20 | 50;
  page: number;
  editQuery: string;
  editingId: string | null;
  categoriesOpen: boolean;
};

const CATALOG_KEY = "ghp-admin-catalog-ui";

export function loadAdminCatalogUi(): Partial<AdminCatalogUi> {
  return readJson<Partial<AdminCatalogUi>>(CATALOG_KEY) || {};
}

export function saveAdminCatalogUi(state: AdminCatalogUi) {
  writeJson(CATALOG_KEY, state);
}

export type AdminHelpUi = {
  filter: "all" | "unread" | "open";
  query: string;
  selectedKey: string | null;
  mobileThreadOpen: boolean;
};

const HELP_KEY = "ghp-admin-help-ui";

export function loadAdminHelpUi(): Partial<AdminHelpUi> {
  return readJson<Partial<AdminHelpUi>>(HELP_KEY) || {};
}

export function saveAdminHelpUi(state: AdminHelpUi) {
  writeJson(HELP_KEY, state);
}

export type AdminScreeningsUi = {
  tab: "drafts" | "shared" | "pending";
  nameQuery: string;
  dateFrom: string;
  dateTo: string;
  pageSize: 10 | 20 | 50;
  page: number;
};

const SCREENINGS_KEY = "ghp-admin-screenings-ui";

export function loadAdminScreeningsUi(): Partial<AdminScreeningsUi> {
  return readJson<Partial<AdminScreeningsUi>>(SCREENINGS_KEY) || {};
}

export function saveAdminScreeningsUi(state: AdminScreeningsUi) {
  writeJson(SCREENINGS_KEY, state);
}

export type AdminBankUi = {
  panel: "entries" | "test";
  query: string;
  browseOpen: boolean;
};

const BANK_KEY = "ghp-admin-bank-ui";

export function loadAdminBankUi(): Partial<AdminBankUi> {
  return readJson<Partial<AdminBankUi>>(BANK_KEY) || {};
}

export function saveAdminBankUi(state: AdminBankUi) {
  writeJson(BANK_KEY, state);
}
