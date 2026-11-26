import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  ClipboardList,
  HelpCircle,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  ShoppingBag,
  ShieldCheck,
  Store,
  UserRound,
  X,
} from "lucide-react";
import PatientNotifyBell from "@/components/PatientNotifyBell";
import ButtonBusyMark from "@/components/ButtonBusyMark";
import { useAuthContext } from "@/contexts/AuthContext";
import { resolveMediaUrl } from "@/lib/mediaStorage";
import { loadProducts, retailMoney, type Product } from "@/lib/catalog";
import { filterVisibleProducts, writeLastStoreSearch } from "@/lib/pickFeaturedProducts";
import {
  looksLikeFeeling,
  writeHelpPrefill,
  type StoreSearchAssistResult,
} from "@/lib/assistStoreSearchClient";
import { detectUrgentCare } from "@/lib/bankUrgent";
import { BUSINESS_CONTACT } from "@/lib/reportCopy";

export type SiteNavMenuItem = {
  href?: string;
  label: string;
  icon?: "store" | "help" | "results" | "profile" | "about" | "shop";
  onClick?: () => void;
};

type Props = {
  /** Store shell shows cart + default mobile menu. */
  variant?: "store" | "patient";
  cartCount?: number;
  onCart?: () => void;
  /** Extra / override menu entries for patient pages. */
  menuItems?: SiteNavMenuItem[];
  /** Products for live catalog search; defaults to loadProducts(). */
  products?: Product[];
  showSearch?: boolean;
};

const ICON = {
  store: Store,
  help: HelpCircle,
  results: ClipboardList,
  profile: UserRound,
  about: ShieldCheck,
  shop: ShoppingBag,
} as const;

const DEFAULT_STORE_MENU: SiteNavMenuItem[] = [
  { href: "/shop", label: "Shop products", icon: "shop" },
  { href: "/about", label: "Our approach", icon: "about" },
  { href: "/results", label: "My results", icon: "results" },
  { href: "/help", label: "Get help", icon: "help" },
  { href: "/profile", label: "My profile", icon: "profile" },
];

export default function SiteNavActions({
  variant = "store",
  cartCount = 0,
  onCart,
  menuItems,
  products: productsProp,
  showSearch = true,
}: Props) {
  const { profile, user, signOut } = useAuthContext();
  const [, setLocation] = useLocation();
  const profilePhoto = resolveMediaUrl(profile?.photoUrl);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 620px)").matches
      : false
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [assist, setAssist] = useState<StoreSearchAssistResult | null>(null);
  /** After “looking for a product”, allow catalog hits even if the query sounds like a feeling. */
  const [allowProductHits, setAllowProductHits] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [headerRoot, setHeaderRoot] = useState<HTMLElement | null>(null);

  const products = useMemo(
    () => (productsProp?.length ? productsProp : loadProducts()),
    [productsProp],
  );
  const catalogForQuery = useMemo(
    () => (query.trim() ? filterVisibleProducts(products, query).slice(0, 8) : []),
    [products, query],
  );
  const feelingQuery = looksLikeFeeling(query, catalogForQuery.length);
  const liveHits = useMemo(() => {
    if (!query.trim()) return [];
    if (feelingQuery && !allowProductHits && assist?.mode !== "products") return [];
    return catalogForQuery.slice(0, 6);
  }, [query, feelingQuery, allowProductHits, assist?.mode, catalogForQuery]);

  const items = menuItems ?? (variant === "store" ? DEFAULT_STORE_MENU : [
    { href: "/", label: "Store", icon: "store" as const },
    { href: "/help", label: "Get help", icon: "help" as const },
    { href: "/results", label: "My results", icon: "results" as const },
    { href: "/profile", label: "My profile", icon: "profile" as const },
  ]);

  const closeMenu = () => setMenuOpen(false);
  const closeSearch = () => {
    if (!isPhone) setSearchOpen(false);
    setAssist(null);
    setAllowProductHits(false);
    setBusy(false);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [menuOpen]);

  useEffect(() => {
    const header = actionsRef.current?.closest("header");
    setHeaderRoot(header instanceof HTMLElement ? header : null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 620px)");
    const apply = () => setIsPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!searchOpen || isPhone) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSearch();
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [searchOpen, isPhone]);

  /** Phone: search lives in its own row under the top bar (always). Desktop: icon toggles strip. */
  const showSearchStrip = showSearch && (isPhone || searchOpen);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || busy) return;
    writeLastStoreSearch(q);
    setBusy(true);
    setAssist(null);
    try {
      const hits = filterVisibleProducts(products, q).slice(0, 8);
      const urgent = detectUrgentCare(q);
      if (urgent) {
        setAllowProductHits(false);
        setAssist({
          mode: "urgent",
          products: [],
          summary: urgent.actionEn,
          nextSteps: "Seek emergency care now.",
          needsConfirm: true,
          matchedCaseIds: [],
          source: "fallback",
          query: q,
        });
        return;
      }

      // Symptom / how-you-feel → ask intent. Do not show guidance or product results yet.
      if (looksLikeFeeling(q, hits.length) && !allowProductHits) {
        setAssist({
          mode: "intent",
          products: hits,
          summary: "Are you looking for a product, or do you want to ask an expert about what you’re going through?",
          nextSteps: "Guidance comes after you send your note in Get help — not from search.",
          needsConfirm: true,
          matchedCaseIds: [],
          source: "fallback",
          query: q,
        });
        return;
      }

      if (hits.length) {
        setAssist({
          mode: "products",
          products: hits,
          summary: "Matching products.",
          nextSteps: "",
          needsConfirm: false,
          matchedCaseIds: [],
          source: "catalog",
          query: q,
        });
        return;
      }

      setAssist({
        mode: "intent",
        products: [],
        summary: "No product matched that search. Do you want to ask an expert about what you’re going through, or try another product name?",
        nextSteps: "",
        needsConfirm: true,
        matchedCaseIds: [],
        source: "fallback",
        query: q,
      });
    } finally {
      setBusy(false);
    }
  };

  const goAskExpert = (text: string) => {
    writeHelpPrefill(text);
    closeSearch();
    setLocation("/help");
  };

  const chooseProductBrowse = () => {
    setAllowProductHits(true);
    const hits = filterVisibleProducts(products, query).slice(0, 8);
    setAssist({
      mode: "products",
      products: hits,
      summary: hits.length ? "Matching products." : "No products matched — try another name.",
      nextSteps: "",
      needsConfirm: false,
      matchedCaseIds: [],
      source: "catalog",
      query: query.trim(),
    });
  };

  const searchStrip = showSearchStrip ? (
    <div className="nav-search-strip" role="region" aria-label="Search products or how you feel">
      <div className="container nav-search-strip-inner">
        <form
          className="nav-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAssist(null);
              setAllowProductHits(false);
            }}
            placeholder="Search a product, or how you feel…"
            aria-label="Search"
          />
          <button type="submit" className="button button-primary nav-search-go" disabled={busy || !query.trim()}>
            {busy ? <ButtonBusyMark /> : "Search"}
          </button>
          {!isPhone && (
            <button type="button" className="icon-button" aria-label="Close search" onClick={closeSearch}>
              <X size={18} />
            </button>
          )}
        </form>

        {!assist && liveHits.length > 0 && (
          <ul className="nav-search-hits">
            {liveHits.map((p) => (
              <li key={p.id}>
                <Link href={`/product/${p.id}`} onClick={closeSearch}>
                  <span>{p.name}</span>
                  <small>{retailMoney(p)}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {assist && (
          <div className={`nav-search-assist ${assist.mode}`}>
            <p className="nav-search-assist-summary">{assist.summary}</p>
            {assist.nextSteps ? <p className="nav-search-assist-next">{assist.nextSteps}</p> : null}

            {assist.mode === "intent" && (
              <div className="nav-search-confirm">
                <div className="nav-search-confirm-actions">
                  <button type="button" className="button button-primary" onClick={() => goAskExpert(assist.query)}>
                    Ask about what I’m going through <ArrowRight size={16} />
                  </button>
                  <button type="button" className="button button-secondary" onClick={chooseProductBrowse}>
                    I’m looking for a product
                  </button>
                  <button type="button" className="button button-secondary" onClick={() => setAssist(null)}>
                    Edit search
                  </button>
                </div>
              </div>
            )}

            {assist.mode === "urgent" && (
              <div className="nav-search-confirm">
                <div className="nav-search-confirm-actions">
                  <a
                    className="button button-primary"
                    href={`${BUSINESS_CONTACT.whatsappUrl}?text=${encodeURIComponent(`Urgent: ${assist.query}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle size={16} /> WhatsApp now
                  </a>
                  <button type="button" className="button button-secondary" onClick={() => goAskExpert(assist.query)}>
                    Still send a help note
                  </button>
                </div>
              </div>
            )}

            {assist.mode === "products" && assist.products.length > 0 && (
              <ul className="nav-search-hits">
                {assist.products.map((p) => (
                  <li key={p.id}>
                    <Link href={`/product/${p.id}`} onClick={closeSearch}>
                      <span>{p.name}</span>
                      <small>{retailMoney(p)}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {assist.mode === "products" && (
              <Link href="/shop" className="text-link" onClick={closeSearch}>
                Browse all products <ArrowRight size={14} />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
  <>
    <div className="nav-actions site-nav-actions" ref={actionsRef}>
      {showSearch && !isPhone && (
        <div className="nav-search-wrap">
          <button
            type="button"
            className="nav-icon-btn nav-order-search"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => {
              closeMenu();
              setSearchOpen((v) => !v);
            }}
          >
            <Search size={24} strokeWidth={1.85} />
          </button>
        </div>
      )}

      {variant === "store" && onCart && (
        <button
          type="button"
          className="nav-icon-btn cart-button nav-order-cart"
          onClick={() => {
            closeMenu();
            closeSearch();
            onCart();
          }}
          aria-label={cartCount ? `Cart, ${cartCount} items` : "Cart"}
        >
          <ShoppingBag size={24} strokeWidth={1.85} />
          {cartCount > 0 && <span className="nav-badge">{cartCount > 99 ? "99+" : cartCount}</span>}
        </button>
      )}

      <PatientNotifyBell />

      <div className={`nav-menu-wrap nav-order-menu ${variant === "patient" ? "nav-menu-wrap-patient" : ""}`} ref={menuRef}>
        <button
          type="button"
          className={`nav-icon-btn ${variant === "store" ? "mobile-menu" : ""}`}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => {
            closeSearch();
            setMenuOpen((v) => !v);
          }}
        >
          {menuOpen ? <X size={24} strokeWidth={1.85} /> : <Menu size={24} strokeWidth={1.85} />}
        </button>
        {menuOpen && (
          <nav className={`main-nav main-nav-mobile is-open ${variant === "patient" ? "patient-nav-menu" : ""}`} aria-label="Menu">
            {items.map((item) => {
              const Icon = item.icon ? ICON[item.icon] : Store;
              if (item.href) {
                return (
                  <Link key={`${item.href}-${item.label}`} href={item.href} onClick={closeMenu}>
                    <Icon size={18} /><span>{item.label}</span>
                  </Link>
                );
              }
              return (
                <button
                  key={item.label}
                  type="button"
                  className="patient-nav-menu-btn"
                  onClick={() => {
                    closeMenu();
                    item.onClick?.();
                  }}
                >
                  <Icon size={18} /><span>{item.label}</span>
                </button>
              );
            })}
            {variant === "patient" && user && (
              <button
                type="button"
                className="patient-nav-menu-btn"
                onClick={() => {
                  closeMenu();
                  void signOut();
                }}
              >
                <LogOut size={18} /><span>Sign out</span>
              </button>
            )}
          </nav>
        )}
      </div>

      <Link
        href="/profile"
        className="nav-icon-btn nav-profile-btn nav-order-profile"
        aria-label="My profile"
        onClick={() => {
          closeMenu();
          closeSearch();
        }}
      >
        {profilePhoto ? (
          <img src={profilePhoto} alt="" className="nav-profile-photo" />
        ) : (
          <UserRound size={24} strokeWidth={1.85} />
        )}
      </Link>
    </div>
    {showSearchStrip && searchStrip && headerRoot ? createPortal(searchStrip, headerRoot) : null}
  </>
  );
}
