import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  BookOpen,
  Check,
  ClipboardList,
  CloudUpload,
  Inbox,
  LayoutGrid,
  Leaf,
  LogOut,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  defaultCategories,
  loadCategories,
  loadProducts,
  margin,
  money,
  productCardImage,
  researchBadge,
  saveCategories,
  saveProducts,
  withSyncedCoverImage,
  type Product,
} from "@/lib/catalog";
import {
  fetchCategoriesFromFirestore,
  fetchProductsFromFirestore,
  saveCategoriesToFirestore,
  saveProductsToFirestore,
  seedCatalogIfEmpty,
} from "@/lib/firestoreCatalog";
import { loadAdminCatalogUi, saveAdminCatalogUi } from "@/lib/adminUiState";
import { subscribeUnreadConversationCount } from "@/lib/intakes";
import AdminScreeningsPanel from "@/pages/AdminScreeningsPanel";
import AdminHelpInbox from "@/pages/AdminHelpInbox";
import AdminContentBank from "@/pages/AdminContentBank";
import AdminProductImages from "@/components/AdminProductImages";
import BrandMark from "@/components/BrandMark";
import ButtonBusyMark from "@/components/ButtonBusyMark";

export type AdminSection = "browse" | "edit" | "screenings" | "help" | "bank";

type PageSize = 10 | 20 | 50;
const PAGE_SIZES: PageSize[] = [10, 20, 50];

const SECTIONS: { id: AdminSection; label: string; short: string; icon: typeof LayoutGrid }[] = [
  { id: "browse", label: "Browse products", short: "Browse", icon: LayoutGrid },
  { id: "edit", label: "Edit product", short: "Edit", icon: Pencil },
  { id: "screenings", label: "Screenings", short: "Screen", icon: ClipboardList },
  { id: "help", label: "Conversations", short: "Chats", icon: Inbox },
  { id: "bank", label: "Content bank", short: "Bank", icon: BookOpen },
];

const blankProduct: Product = {
  id: "",
  code: "CUSTOM",
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
};

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "form-field field-wide" : "form-field"}><span>{label}</span>{children}</label>;
}

function parseSection(search: string): AdminSection {
  const value = new URLSearchParams(search).get("section");
  if (value === "browse" || value === "edit" || value === "screenings" || value === "help" || value === "bank") return value;
  return "browse";
}

function AdminLogin() {
  const { signInAsAdmin } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInAsAdmin(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <Link href="/" className="brand">
            <BrandMark />
            <span>GreenHealth<em>Products</em></span>
          </Link>
          <p className="admin-kicker">Owner workspace · Firebase Auth</p>
        </div>
        <Link href="/" className="button button-secondary">View storefront</Link>
      </header>
      <main className="container admin-main">
        <section className="auth-panel">
          <p className="eyebrow">Admin access</p>
          <h1>Sign in to manage the shelf</h1>
          <p>Only accounts listed under <code>admins/</code> in Firestore can open this workspace. Catalogue text syncs to Firestore; product images upload to your media storage.</p>
          <form className="auth-form" onSubmit={submit}>
            <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
            {error && <p className="auth-error">{error}</p>}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default function Admin() {
  const { user, isAdmin, loading, signOut } = useAuthContext();
  const [, setLocation] = useLocation();
  const savedUi = useMemo(() => loadAdminCatalogUi(), []);
  const [section, setSection] = useState<AdminSection>(() =>
    typeof window !== "undefined" ? parseSection(window.location.search) : "browse",
  );
  const [visitedSections, setVisitedSections] = useState<Set<AdminSection>>(
    () => new Set([typeof window !== "undefined" ? parseSection(window.location.search) : "browse"]),
  );
  const [products, setProducts] = useState<Product[]>(() => loadProducts());
  const [categories, setCategories] = useState(() => loadCategories());
  const [editing, setEditing] = useState<Product | null>(null);
  const [pendingEditingId] = useState(() => savedUi.editingId || null);
  const [newCategory, setNewCategory] = useState("");
  const [syncNote, setSyncNote] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFlash, setSaveFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [browseQuery, setBrowseQuery] = useState(() => savedUi.browseQuery || "");
  const [browseCategory, setBrowseCategory] = useState(() => savedUi.browseCategory || "All");
  const [browseVisibility, setBrowseVisibility] = useState<"all" | "visible" | "hidden">(
    () => savedUi.browseVisibility || "all",
  );
  const [pageSize, setPageSize] = useState<PageSize>(() => savedUi.pageSize || 10);
  const [page, setPage] = useState(() => savedUi.page || 1);
  const [editQuery, setEditQuery] = useState(() => savedUi.editQuery || "");
  const [categoriesOpen, setCategoriesOpen] = useState(() => Boolean(savedUi.categoriesOpen));

  const goSection = (next: AdminSection, product?: Product | null) => {
    if (product) {
      setSaveFlash(null);
      setEditing(product);
    }
    // Keep editor draft when hopping sections; Close clears it explicitly.
    setSection(next);
    setVisitedSections((prev) => {
      if (prev.has(next)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(next);
      return nextSet;
    });
    const params = new URLSearchParams();
    params.set("section", next);
    setLocation(`/admin?${params.toString()}`);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [section]);

  useEffect(() => {
    saveAdminCatalogUi({
      browseQuery,
      browseCategory,
      browseVisibility,
      pageSize,
      page,
      editQuery,
      editingId: editing?.id || pendingEditingId,
      categoriesOpen,
    });
  }, [browseQuery, browseCategory, browseVisibility, pageSize, page, editQuery, editing, pendingEditingId, categoriesOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchProductsFromFirestore();
        const remoteCategories = await fetchCategoriesFromFirestore();
        if (cancelled) return;
        const nextProducts = remote?.length ? remote : loadProducts();
        if (remote?.length) {
          setProducts(remote);
          saveProducts(remote);
        }
        if (remoteCategories?.length) {
          setCategories(remoteCategories);
          saveCategories(remoteCategories);
        }
        if (pendingEditingId && !editing) {
          const found = nextProducts.find((p) => p.id === pendingEditingId) || null;
          if (found) setEditing(found);
        }
      } catch {
        // Keep local catalogue if Firestore is empty or unreachable.
        if (!cancelled && pendingEditingId && !editing) {
          const found = loadProducts().find((p) => p.id === pendingEditingId) || null;
          if (found) setEditing(found);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeUnreadConversationCount(setPendingCount);
  }, [isAdmin]);

  const visibleCount = products.filter((p) => p.visible).length;
  const listedValue = useMemo(() => products.reduce((sum, p) => sum + p.retailPrice * p.stock, 0), [products]);

  const filteredBrowse = useMemo(() => {
    const q = browseQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (browseCategory !== "All" && p.category !== browseCategory) return false;
      if (browseVisibility === "visible" && !p.visible) return false;
      if (browseVisibility === "hidden" && p.visible) return false;
      if (!q) return true;
      return `${p.code} ${p.name} ${p.category}`.toLowerCase().includes(q);
    });
  }, [products, browseQuery, browseCategory, browseVisibility]);

  const totalPages = Math.max(1, Math.ceil(filteredBrowse.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredBrowse.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [browseQuery, browseCategory, browseVisibility, pageSize]);

  const editMatches = useMemo(() => {
    const q = editQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products.filter((p) => `${p.code} ${p.name}`.toLowerCase().includes(q)).slice(0, 20);
  }, [products, editQuery]);

  const startNew = () => {
    setSaveFlash(null);
    setEditing({ ...blankProduct, id: `product-${Date.now()}`, category: categories[0] ?? defaultCategories[0] });
    goSection("edit");
  };

  const update = (key: keyof Product, value: Product[keyof Product]) =>
    setEditing((current) => (current ? { ...current, [key]: value } : current));

  const persist = async (nextProducts: Product[], nextCategories = categories) => {
    setProducts(nextProducts);
    setCategories(nextCategories);
    saveProducts(nextProducts);
    saveCategories(nextCategories);
    if (isAdmin) {
      await saveProductsToFirestore(nextProducts);
      await saveCategoriesToFirestore(nextCategories);
    }
  };

  const save = async () => {
    if (!editing?.name.trim() || saving) return;
    const record = withSyncedCoverImage(editing);
    setEditing(record);
    setSaving(true);
    setSaveFlash(null);
    try {
      const next = products.some((p) => p.id === record.id)
        ? products.map((p) => (p.id === record.id ? record : p))
        : [record, ...products];
      await persist(next);
      setSyncNote("Product saved.");
      setSaveFlash({ tone: "ok", text: "Product saved." });
      toast.success("Product saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save product.";
      setSyncNote(message);
      setSaveFlash({ tone: "err", text: message });
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const next = products.filter((p) => p.id !== id);
    await persist(next);
    if (editing?.id === id) setEditing(null);
  };

  const addCategory = async () => {
    const value = newCategory.trim();
    if (!value || categories.includes(value)) return;
    const next = [...categories, value];
    await persist(products, next);
    setNewCategory("");
  };

  const deleteCategory = async (category: string) => {
    if (products.some((p) => p.category === category)) return;
    const next = categories.filter((c) => c !== category);
    await persist(products, next);
  };

  const syncToFirestore = async () => {
    setSyncing(true);
    setSyncNote("");
    try {
      const seeded = await seedCatalogIfEmpty();
      if (!seeded.seeded) {
        await saveProductsToFirestore(products);
        await saveCategoriesToFirestore(categories);
      }
      const note = seeded.seeded
        ? "Seeded researched catalogue to Firestore."
        : "Pushed current catalogue to Firestore (image HTTPS URLs kept; data-URLs skipped).";
      setSyncNote(note);
      toast.success(note);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setSyncNote(message);
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="admin-shell"><main className="container admin-main"><p className="muted">Checking admin session…</p></main></div>;
  }
  if (!user || !isAdmin) return <AdminLogin />;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <Link href="/" className="brand"><BrandMark /><span>GreenHealth<em>Products</em></span></Link>
          <p className="admin-kicker">Owner workspace · signed in as {user.email}</p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="icon-button admin-bell"
            aria-label={`Conversations${pendingCount ? `, ${pendingCount} unread` : ""}`}
            onClick={() => goSection("help")}
          >
            <Bell size={18} />
            {pendingCount > 0 && <span className="admin-bell-badge">{pendingCount > 99 ? "99+" : pendingCount}</span>}
          </button>
          <button className="button button-secondary" onClick={() => void syncToFirestore()} disabled={syncing}>
            <CloudUpload size={16} /> {syncing ? "Syncing…" : "Sync"}
          </button>
          <button className="button button-secondary" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button>
          <Link href="/" className="button button-secondary">Store</Link>
        </div>
      </header>

      <nav className="admin-section-nav" aria-label="Admin sections">
        {SECTIONS.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`admin-section-btn ${active ? "active" : ""}`}
              onClick={() => goSection(item.id, item.id === "edit" ? editing : null)}
            >
              <span className="admin-section-icon-wrap">
                <Icon size={18} />
                {item.id === "help" && pendingCount > 0 && (
                  <span className="admin-nav-dot">{pendingCount > 99 ? "99+" : pendingCount}</span>
                )}
              </span>
              <span className="admin-section-label">{item.label}</span>
              <span className="admin-section-short">{item.short}</span>
            </button>
          );
        })}
      </nav>

      <main className="container admin-main admin-main-sectioned">
        {syncNote && section !== "help" && section !== "bank" && <p className="sync-note">{syncNote}</p>}

        {visitedSections.has("browse") && (
          <div className="admin-section" hidden={section !== "browse"}>
            <div className="admin-intro">
              <div>
                <p className="eyebrow">Catalogue</p>
                <h1>Browse products</h1>
                <p>Search and page through the shelf — open Edit to change one product at a time.</p>
              </div>
              <button type="button" className="button button-primary" onClick={startNew}><Plus size={18} /> Add product</button>
            </div>
            <div className="admin-stats">
              <div><span>Visible</span><strong>{visibleCount}</strong></div>
              <div><span>Total</span><strong>{products.length}</strong></div>
              <div><span>Stock value</span><strong>{money(listedValue)}</strong></div>
              <div><span>Categories</span><strong>{categories.length}</strong></div>
            </div>

            <div className="admin-toolbar">
              <label className="admin-search">
                <Search size={16} />
                <input
                  value={browseQuery}
                  onChange={(e) => setBrowseQuery(e.target.value)}
                  placeholder="Search code or name…"
                  aria-label="Search products"
                />
              </label>
              <select value={browseCategory} onChange={(e) => setBrowseCategory(e.target.value)} aria-label="Filter category">
                <option value="All">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={browseVisibility} onChange={(e) => setBrowseVisibility(e.target.value as typeof browseVisibility)} aria-label="Visibility">
                <option value="all">All visibility</option>
                <option value="visible">Visible only</option>
                <option value="hidden">Hidden only</option>
              </select>
              <button type="button" className="button button-secondary admin-cat-toggle" onClick={() => setCategoriesOpen((v) => !v)}>
                Categories
              </button>
            </div>

            <div className={`admin-layout ${categoriesOpen ? "categories-open" : ""}`}>
              <section className="admin-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Page {safePage}</p>
                    <h2>Products</h2>
                  </div>
                  <span className="muted">
                    Showing {(safePage - 1) * pageSize + (pageItems.length ? 1 : 0)}–{(safePage - 1) * pageSize + pageItems.length} of {filteredBrowse.length}
                  </span>
                </div>
                <div className="admin-product-list">
                  {pageItems.map((product) => (
                    <div className={`admin-product-row admin-browse-row ${!product.visible ? "is-hidden" : ""}`} key={product.id}>
                      <div className="admin-thumb">{productCardImage(product) ? <img src={productCardImage(product)} alt="" /> : <Leaf size={20} />}</div>
                      <div className="admin-product-name">
                        <b>{product.code} · {product.name}</b>
                        <small>{product.category} · {product.packSize || "Pack size not set"}</small>
                      </div>
                      <div className="admin-price">
                        <b>{money(product.retailPrice)}</b>
                        <small>BV {product.bv || "—"} · {product.stock} in stock</small>
                      </div>
                      <span className={`status ${product.verified ? "status-good" : ""}`}>
                        {product.verified ? "Verified" : researchBadge(product).replace("Review before publication", "Review")}
                      </span>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          setEditing(product);
                          goSection("edit", product);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                  {!pageItems.length && <p className="muted">No products match these filters.</p>}
                </div>
                <div className="admin-pagination">
                  <div className="admin-page-size">
                    <span className="muted">Per page</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
                      aria-label="Products per page"
                    >
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="button button-secondary" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </button>
                  <span className="muted">Page {safePage} / {totalPages}</span>
                  <button type="button" className="button button-secondary" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                  </button>
                </div>
              </section>

              <aside className={`admin-side ${categoriesOpen ? "is-open" : ""}`}>
                <div className="admin-panel">
                  <div className="panel-heading"><div><p className="eyebrow">Shop structure</p><h2>Categories</h2></div></div>
                  <div className="category-admin-list">
                    {categories.map((category) => (
                      <div key={category}>
                        <span>{category}</span>
                        <button type="button" className="icon-button" disabled={products.some((p) => p.category === category)} onClick={() => void deleteCategory(category)}><X size={15} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="category-add">
                    <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" />
                    <button type="button" className="icon-button" onClick={() => void addCategory()}><Plus size={17} /></button>
                  </div>
                </div>
                <div className="admin-tip">
                  <Check size={18} />
                  <div>
                    <b>Safe publishing habit</b>
                    <p>Keep a product in “Review” until its label, price, stock, and permitted description are confirmed.</p>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}

        {visitedSections.has("edit") && (
          <div className="admin-section" hidden={section !== "edit"}>
            <div className="admin-intro">
              <div>
                <p className="eyebrow">Catalogue</p>
                <h1>Edit product</h1>
                <p>Find one product to edit, or add a new record. The full catalogue stays in Browse.</p>
              </div>
              <button type="button" className="button button-primary" onClick={startNew}><Plus size={18} /> Add product</button>
            </div>

            <div className="admin-toolbar">
              <label className="admin-search">
                <Search size={16} />
                <input
                  value={editQuery}
                  onChange={(e) => setEditQuery(e.target.value)}
                  placeholder="Find product by code or name…"
                  aria-label="Find product to edit"
                />
              </label>
            </div>

            {!editing && (
              <section className="admin-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Select</p>
                    <h2>Choose a product</h2>
                  </div>
                </div>
                <div className="admin-product-list">
                  {editMatches.map((product) => (
                    <div className="admin-product-row admin-list-row-2" key={product.id}>
                      <div className="admin-product-name">
                        <b>{product.code} · {product.name}</b>
                        <small>{product.category} · {money(product.retailPrice)}</small>
                      </div>
                      <button type="button" className="button button-secondary" onClick={() => { setSaveFlash(null); setEditing(product); }}>Open editor</button>
                    </div>
                  ))}
                  {!editMatches.length && <p className="muted">No matches. Try another search or add a product.</p>}
                </div>
              </section>
            )}

            {editing && (
              <section className="admin-panel product-editor-inline">
                <div className="drawer-head">
                  <div>
                    <p className="eyebrow">{products.some((p) => p.id === editing.id) ? "Edit record" : "New record"}</p>
                    <h2>{editing.name || "Add product"}</h2>
                  </div>
                  <button type="button" className="icon-button" onClick={() => setEditing(null)} aria-label="Close editor"><X size={19} /></button>
                </div>
                <div className="editor-form">
                  <Field label="Catalogue code"><input value={editing.code} onChange={(e) => update("code", e.target.value)} placeholder="e.g. W72 or CUSTOM" /></Field>
                  <Field label="Product name"><input value={editing.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Garlic Capsules" /></Field>
                  <Field label="Category"><select value={editing.category} onChange={(e) => update("category", e.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>
                  <Field label="Category in Kiswahili"><input value={editing.categorySwahili} onChange={(e) => update("categorySwahili", e.target.value)} placeholder="Optional category translation" /></Field>
                  <Field label="Pack size"><input value={editing.packSize} onChange={(e) => update("packSize", e.target.value)} placeholder="e.g. 60 capsules" /></Field>
                  <Field label="Business value (BV)"><input type="number" min="0" value={editing.bv || ""} onChange={(e) => update("bv", Number(e.target.value))} placeholder="From distributor list" /></Field>
                  <Field label="Stock available"><input type="number" min="0" value={editing.stock} onChange={(e) => update("stock", Number(e.target.value))} /></Field>
                  <Field label="Retail price · KSh"><input type="number" min="0" value={editing.retailPrice || ""} onChange={(e) => update("retailPrice", Number(e.target.value))} placeholder="To be confirmed" /></Field>
                  <Field label="Distributor cost · KSh"><input type="number" min="0" value={editing.distributorPrice || ""} onChange={(e) => update("distributorPrice", Number(e.target.value))} placeholder="To be confirmed" /></Field>
                  <Field label="Ingredients" wide><textarea value={editing.ingredients} onChange={(e) => update("ingredients", e.target.value)} rows={2} placeholder="Copy from the official label; do not infer missing ingredients" /></Field>
                  <Field label="Simple English description" wide><textarea value={editing.description} onChange={(e) => update("description", e.target.value)} rows={3} /></Field>
                  <Field label="Kiswahili rahisi" wide><textarea value={editing.swahili} onChange={(e) => update("swahili", e.target.value)} rows={3} /></Field>
                  <Field label="Usage guidance" wide><textarea value={editing.usage} onChange={(e) => update("usage", e.target.value)} rows={2} /></Field>
                  <Field label="Warnings" wide><textarea value={editing.warnings} onChange={(e) => update("warnings", e.target.value)} rows={2} /></Field>
                  <Field label="Marketing or claims notes · keep separate from evidence" wide><textarea value={editing.marketingClaims.join("\n")} onChange={(e) => update("marketingClaims", e.target.value.split("\n").filter(Boolean))} rows={3} /></Field>
                  <div className="research-status-box field-wide"><span>Imported research status</span><b>{editing.evidenceStatus}</b><small>{editing.matchStatus}</small></div>
                  <AdminProductImages
                    product={editing}
                    onChange={setEditing}
                    onStatus={setSyncNote}
                  />
                  <label className="check-row"><input type="checkbox" checked={editing.verified} onChange={(e) => update("verified", e.target.checked)} /><span>Details verified for public publication</span></label>
                  <label className="check-row"><input type="checkbox" checked={editing.visible} onChange={(e) => update("visible", e.target.checked)} /><span>Show this product in the storefront</span></label>
                  {editing.retailPrice > 0 && editing.distributorPrice > 0 && (
                    <div className="margin-note">Estimated gross margin: <b>{money(margin(editing))}</b> per item before delivery and platform costs.</div>
                  )}
                </div>
                <div className="editor-actions" style={{ flexWrap: "wrap" }}>
                  {products.some((p) => p.id === editing.id) && (
                    <button type="button" className="button button-secondary" disabled={saving} onClick={() => void remove(editing.id)}>
                      <Trash2 size={16} /> Delete
                    </button>
                  )}
                  <button type="button" className="button button-secondary" disabled={saving} onClick={() => setEditing(null)}>Close</button>
                  <button type="button" className="button button-primary" disabled={saving || !editing.name.trim()} onClick={() => void save()}>
                    {saving ? <ButtonBusyMark size={17} /> : <Save size={17} />}
                    {saving ? "Saving…" : "Save product"}
                  </button>
                </div>
                {saveFlash && (
                  <p className={saveFlash.tone === "ok" ? "sync-note editor-save-toast" : "auth-error editor-save-toast"} role="status">
                    {saveFlash.text}
                  </p>
                )}
              </section>
            )}
          </div>
        )}

        {visitedSections.has("screenings") && (
          <div hidden={section !== "screenings"}>
            <AdminScreeningsPanel />
          </div>
        )}
        {visitedSections.has("help") && (
          <div hidden={section !== "help"}>
            <AdminHelpInbox />
          </div>
        )}
        {visitedSections.has("bank") && (
          <div hidden={section !== "bank"}>
            <AdminContentBank />
          </div>
        )}
      </main>
    </div>
  );
}
