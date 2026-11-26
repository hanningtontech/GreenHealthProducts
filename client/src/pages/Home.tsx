import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowRight, Check, ClipboardList, HelpCircle, Leaf, Mail, MessageCircle, Phone, Search, ShoppingBag, ShieldCheck, UserRound, ZoomIn, X } from "lucide-react";
import {
  directionRows,
  loadCategories,
  loadProducts,
  productCardImage,
  productDetailImages,
  productImageSrc,
  retailMoney,
  saveProducts,
  shortCategoryLabel,
  shortProductLead,
  type Product,
} from "@/lib/catalog";
import { fetchProductsFromFirestore } from "@/lib/firestoreCatalog";
import { BUSINESS_CONTACT } from "@/lib/reportCopy";
import BrandMark from "@/components/BrandMark";
import SiteNavActions from "@/components/SiteNavActions";
import { pickFeaturedProducts, writeLastStoreSearch } from "@/lib/pickFeaturedProducts";

type CartItem = { product: Product; quantity: number };

function ProductArtwork({ product, large = false }: { product: Product; large?: boolean }) {
  const src = productCardImage(product);
  return src ? <img src={src} alt={product.name} className={`product-art object-contain ${large ? "product-art-large" : ""}`} /> : (
    <div className={`product-art ${large ? "product-art-large" : ""}`}>
      <div className="leaf-orbit"><Leaf size={large ? 44 : 30} strokeWidth={1.5} /></div>
      <span>{product.name.split(" ").slice(0, 2).map((word) => word[0]).join("")}</span>
    </div>
  );
}

function ProductMedia({ product }: { product: Product }) {
  const gallery = useMemo(() => productDetailImages(product), [product]);
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const current = gallery[active] ?? gallery[0];
  const src = productImageSrc(current);

  useEffect(() => {
    setActive(0);
    setZoomed(false);
  }, [product.id]);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(false);
      if (event.key === "ArrowRight" && gallery.length > 1) setActive((index) => (index + 1) % gallery.length);
      if (event.key === "ArrowLeft" && gallery.length > 1) setActive((index) => (index - 1 + gallery.length) % gallery.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, gallery.length]);

  if (!src) {
    return <ProductArtwork product={product} large />;
  }

  return (
    <div className="product-media">
      <button type="button" className="product-media-stage" onClick={() => setZoomed(true)} aria-label={`Zoom ${product.name} image`}>
        <img src={src} alt={`${product.name} ${current?.role || "product"} view`} className="product-media-main" />
        <span className="product-media-zoom-hint"><ZoomIn size={16} /> Zoom</span>
      </button>
      {gallery.length > 1 && (
        <div className="product-gallery" role="tablist" aria-label={`${product.name} image views`}>
          {gallery.map((image, index) => {
            const thumb = productImageSrc(image);
            return (
              <button
                key={`${image.slot || image.file_name}-${index}`}
                type="button"
                role="tab"
                aria-selected={index === active}
                className={`product-gallery-thumb ${index === active ? "is-active" : ""}`}
                onClick={() => setActive(index)}
              >
                <img src={thumb} alt={`${product.name} view ${index + 1}`} />
              </button>
            );
          })}
        </div>
      )}
      {zoomed && (
        <div className="image-zoom-backdrop" onClick={() => setZoomed(false)} role="dialog" aria-modal="true" aria-label={`${product.name} zoomed image`}>
          <button type="button" className="image-zoom-close icon-button" aria-label="Close zoom" onClick={() => setZoomed(false)}><X size={22} /></button>
          <div className="image-zoom-frame" onClick={(event) => event.stopPropagation()}>
            <img src={src} alt={`${product.name} zoomed view`} className="image-zoom-img" />
            {gallery.length > 1 && (
              <div className="image-zoom-thumbs">
                {gallery.map((image, index) => (
                  <button key={`${image.slot || image.file_name}-z${index}`} type="button" className={`product-gallery-thumb ${index === active ? "is-active" : ""}`} onClick={() => setActive(index)}>
                    <img src={productImageSrc(image)} alt={`${product.name} view ${index + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ cartCount, onCart, products }: { cartCount: number; onCart: () => void; products: Product[] }) {
  return (
    <header className="site-header">
      <div className="container nav-wrap">
        <Link href="/" className="brand">
          <BrandMark />
          <span>GreenHealth<em>Products</em></span>
        </Link>
        <nav className="main-nav main-nav-desktop">
          <Link href="/shop">Shop products</Link>
          <Link href="/about">Our approach</Link>
          <Link href="/results">My results</Link>
          <Link href="/help">Get help</Link>
          <Link href="/profile">My profile</Link>
        </nav>
        <SiteNavActions variant="store" cartCount={cartCount} onCart={onCart} products={products} />
      </div>
    </header>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="notice"><ShieldCheck size={17} /><span>{children}</span></div>;
}

function HomePage({ products, onCart }: { products: Product[]; onCart: (product?: Product) => void }) {
  const featured = useMemo(() => pickFeaturedProducts(products, { count: 4 }), [products]);
  const [helpOpen, setHelpOpen] = useState(false);
  const waHelpUrl = `${BUSINESS_CONTACT.whatsappUrl}?text=${encodeURIComponent("Hello, I need help choosing a wellness product.")}`;

  return <>
    <section className="hero container">
      <div className="hero-copy">
        <p className="eyebrow">Simple wellness, better information</p>
        <h1>Choose your daily wellness with <span>clarity.</span></h1>
        <div className="hero-actions">
          <Link href="/shop" className="button button-primary">Browse products <ArrowRight size={17} /></Link>
          <Link href="/help" className="button button-secondary hero-feeling-btn">Tell us how you are feeling today <ArrowRight size={16} /></Link>
        </div>
        <button type="button" className="text-link home-need-help" onClick={() => setHelpOpen(true)}>
          <HelpCircle size={16} /> Need help? Ask us a question
        </button>
        <div className="hero-points"><span><Check size={16} /> Simple English product explanations</span><span><Check size={16} /> Kiswahili explanations</span><span><Check size={16} /> Six clear product categories</span></div>
      </div>
      <div className="hero-art"><div className="hero-circle circle-one" /><div className="hero-circle circle-two" /><div className="hero-card hero-card-main"><Leaf size={52} /><small>GREENHEALTH</small><strong>From nature,<br />with care.</strong><span>Wellness product shelf</span></div><div className="hero-card hero-card-note"><span>01</span><p>Check the label.<br /><b>Choose what fits.</b></p></div></div>
    </section>
    <section className="section container"><div className="section-heading"><div><p className="eyebrow">Start with the shelf</p><h2>Featured products</h2></div><Link href="/shop" className="text-link">View all products <ArrowRight size={16} /></Link></div><div className="product-grid">{featured.map((product) => <ProductCard key={product.id} product={product} onCart={onCart} />)}</div></section>
    <section className="trust-band container"><div><p className="eyebrow">A careful beginning</p><h2>Information first. Selling second.</h2></div><p>Research notes, label gaps, category boundaries, prices, and safety reminders are kept visible. Confirm the current package and stock before a customer relies on any product detail.</p><button type="button" className="round-arrow" aria-label="Need help" onClick={() => setHelpOpen(true)}><HelpCircle size={19} /></button></section>
    {helpOpen && (
      <div className="modal-backdrop home-help-backdrop" onClick={() => setHelpOpen(false)}>
        <div className="home-help-modal" role="dialog" aria-modal="true" aria-labelledby="home-help-title" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <div>
              <p className="eyebrow">We are here</p>
              <h2 id="home-help-title">Need help?</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => setHelpOpen(false)}><X size={19} /></button>
          </div>
          <p>Have a question about a product or how you are feeling? Chat with us on WhatsApp, or send a note through Get help.</p>
          <div className="home-help-actions">
            <a className="button button-primary wide-button" href={waHelpUrl} target="_blank" rel="noreferrer">
              <MessageCircle size={18} /> Chat on WhatsApp {BUSINESS_CONTACT.whatsappDisplay}
            </a>
            <Link href="/help" className="button button-secondary wide-button" onClick={() => setHelpOpen(false)}>
              <HelpCircle size={18} /> Go to Get help
            </Link>
          </div>
        </div>
      </div>
    )}
  </>;
}

function ProductCard({ product, onCart }: { product: Product; onCart: (product?: Product) => void }) {
  return <article className="product-card"><Link href={`/product/${product.id}`} className="product-image-wrap"><ProductArtwork product={product} /><span className="product-tag">{shortCategoryLabel(product.category)}</span></Link><div className="product-card-body"><Link href={`/product/${product.id}`}><h3>{product.name}</h3></Link><p className="product-short">{product.description}</p><div className="product-footer"><strong>{retailMoney(product)}</strong><button className="mini-button" onClick={() => onCart(product)}><ShoppingBag size={15} /> Add</button></div></div></article>;
}

function ShopPage({ products, onCart }: { products: Product[]; onCart: (product?: Product) => void }) {
  const categories = loadCategories();
  const [category, setCategory] = useState("All products");
  const [query, setQuery] = useState("");
  const visible = products.filter((p) => p.visible && (category === "All products" || p.category === category) && `${p.code} ${p.name} ${p.category} ${p.categorySwahili} ${p.ingredients}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="section container shop-page"><div className="page-intro"><p className="eyebrow">The researched catalogue</p><h1>Shop the shelf</h1><p>Browse products currently mapped from the order sheet. Product information marked for review is waiting for the official current label, package photo, or distributor confirmation.</p></div><div className="shop-toolbar"><div className="search-box"><Search size={18} /><input value={query} onChange={(e) => { const v = e.target.value; setQuery(v); writeLastStoreSearch(v); }} placeholder="Search name or ingredient" /></div><div className="category-pills"><button className={category === "All products" ? "active" : ""} onClick={() => setCategory("All products")}>All products</button>{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{shortCategoryLabel(item)}</button>)}</div></div><p className="catalog-count">Showing {visible.length} of {products.length} catalogue records</p>{visible.length ? <div className="product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} onCart={onCart} />)}</div> : <div className="empty-state"><Search size={28} /><h3>No products found</h3><p>Try another search or category.</p></div>}</section>;
}

type DetailInfoTab = "description" | "directions" | "additional";

function ProductPage({ products, onCart }: { products: Product[]; onCart: (product?: Product) => void }) {
  const [, params] = useRoute("/product/:id");
  const product = products.find((item) => item.id === params?.id);
  const [infoTab, setInfoTab] = useState<DetailInfoTab>("description");

  useEffect(() => {
    setInfoTab("description");
  }, [product?.id]);

  if (!product) {
    return (
      <section className="section container empty-state">
        <h2>Product not found</h2>
        <Link href="/shop" className="button button-primary">Back to shop</Link>
      </section>
    );
  }

  const lead = shortProductLead(product.description);
  const directions = directionRows(product.usage);
  const claims = (product.marketingClaims || []).filter(Boolean);

  return (
    <section className="section container product-detail">
      <Link href="/shop" className="back-link">← Back to all products</Link>

      <div className="detail-layout">
        <ProductMedia product={product} />
        <div className="detail-copy">
          <p className="eyebrow">{product.category}</p>
          <h1>{product.name}</h1>
          <p className="detail-subcategory">
            {product.categorySwahili ? `${product.categorySwahili} · ` : ""}
            {product.packSize}
          </p>
          {lead && <p className="detail-lead">{lead}</p>}
          <div className="price-line">
            <strong>{retailMoney(product)}</strong>
          </div>
          <button className="button button-primary wide-button" onClick={() => onCart(product)}>
            <ShoppingBag size={18} /> Add to order enquiry
          </button>
          <Notice>
            Supplements, beverages, topical products, oral-care items, and fertilizers are not automatically medical treatment.
            Confirm the current package, permitted use, price, and stock. If you are pregnant, breastfeeding, taking medicine,
            or managing a condition, speak with a qualified health professional first.
          </Notice>
        </div>
      </div>

      <div className="detail-info">
        <div className="detail-tabs" role="tablist" aria-label="Product information">
          <button
            type="button"
            role="tab"
            aria-selected={infoTab === "description"}
            className={infoTab === "description" ? "is-active" : ""}
            onClick={() => setInfoTab("description")}
          >
            Description
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={infoTab === "directions"}
            className={infoTab === "directions" ? "is-active" : ""}
            onClick={() => setInfoTab("directions")}
          >
            Directions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={infoTab === "additional"}
            className={infoTab === "additional" ? "is-active" : ""}
            onClick={() => setInfoTab("additional")}
          >
            Additional information
          </button>
        </div>

        <div className="detail-tab-panel" role="tabpanel">
          {infoTab === "description" && (
            <div className="detail-desc-grid">
              <div>
                <h3>In simple English</h3>
                <p>{product.description || "No English description yet."}</p>
              </div>
              <div>
                <h3>Kwa Kiswahili rahisi</h3>
                <p>{product.swahili || "Maelezo kwa Kiswahili bado hayajaongezwa."}</p>
              </div>
            </div>
          )}

          {infoTab === "directions" && (
            directions.length ? (
              <dl className="direction-list">
                {directions.map((row, index) => (
                  <div className="direction-row" key={`${row.label}-${index}`}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">No directions recorded for this product yet. Follow the current package label.</p>
            )
          )}

          {infoTab === "additional" && (
            <div className="detail-additional">
              <div>
                <h3>Ingredients &amp; pack</h3>
                <p>
                  {product.ingredients || "Check the current package label for ingredients."}
                  {product.packSize ? ` Pack: ${product.packSize}.` : ""}
                </p>
              </div>
              <div>
                <h3>Safety information</h3>
                <p>{product.warnings || "Follow the current package label for safety information."}</p>
              </div>
              <div>
                <h3>Category guidance</h3>
                <p>{product.categoryDescription || "Use according to the product category and current label."}</p>
              </div>
              {claims.length > 0 && (
                <div>
                  <h3>Label notes</h3>
                  <ul className="detail-claims">
                    {claims.map((claim) => (
                      <li key={claim}>{claim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AboutPage() { return <section className="section container about-page"><div className="page-intro"><p className="eyebrow">Our approach</p><h1>Wellness information that feels human.</h1><p>GreenHealthProducts starts as one distributor’s store. The first goal is simple: make it easier for people to see what is available, understand the label, and ask the right questions before ordering.</p></div><div className="about-columns"><div className="about-card"><Leaf size={24} /><h3>What we can explain</h3><p>Product ingredients, pack size, category, intended nutritional role, usage directions from the label where available, and safety reminders—in plain English and Kiswahili.</p></div><div className="about-card"><ShieldCheck size={24} /><h3>What we will not promise</h3><p>We will not present a supplement, drink, fertilizer, oral-care item, or topical product as a cure for cancer, HIV/AIDS, diabetes, infertility, hypertension, or another serious condition without the required evidence and approval.</p></div><div className="about-card"><MessageCircle size={24} /><h3>Need help?</h3><p>Use the order enquiry and contact the owner before buying. A question about your health, crop, oral care, or personal use is a good reason to speak with a qualified professional too.</p></div></div></section>; }

export default function Home() {
  const [location, setLocation] = useLocation();
  const [products, setProducts] = useState<Product[]>(() => loadProducts());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchProductsFromFirestore();
        if (cancelled || !remote?.length) return;
        setProducts(remote);
        saveProducts(remote);
      } catch {
        // Keep local researched catalogue when Firestore is empty/unreachable.
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const addToCart = (product?: Product) => { if (!product) return; setCart((current) => { const found = current.find((item) => item.product.id === product.id); return found ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { product, quantity: 1 }]; }); setCartOpen(true); };
  const cartText = useMemo(() => cart.map((item) => `${item.quantity} × ${item.product.name}`).join("\n"), [cart]);
  const page = location === "/shop" ? <ShopPage products={products} onCart={addToCart} /> : location === "/about" ? <AboutPage /> : location.startsWith("/product/") ? <ProductPage products={products} onCart={addToCart} /> : <HomePage products={products} onCart={addToCart} />;
  return (
    <div className="app-shell">
      <Header cartCount={cartCount} onCart={() => setCartOpen(true)} products={products} />
      <main>{page}</main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <Link href="/" className="brand"><BrandMark /><span>GreenHealth<em>Products</em></span></Link>
            <p>A growing owner-managed catalogue for GreenHealthProducts wellness, personal care, oral care, topical, beverage, and agricultural products.</p>
          </div>
          <div className="footer-explore">
            <b>Explore</b>
            <Link href="/shop"><ShoppingBag size={16} /><span>Shop products</span></Link>
            <Link href="/about"><ShieldCheck size={16} /><span>Our approach</span></Link>
            <Link href="/results"><ClipboardList size={16} /><span>My results</span></Link>
            <Link href="/help"><HelpCircle size={16} /><span>Get help</span></Link>
            <Link href="/profile"><UserRound size={16} /><span>My profile</span></Link>
          </div>
          <div className="footer-contact">
            <b>Contact</b>
            <a href={`tel:${BUSINESS_CONTACT.phone.replace(/\s+/g, "")}`}><Phone size={16} /><span>{BUSINESS_CONTACT.phone}</span></a>
            <a href={BUSINESS_CONTACT.whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={16} /><span>WhatsApp {BUSINESS_CONTACT.whatsappDisplay}</span></a>
            <a href={`mailto:${BUSINESS_CONTACT.email}`}><Mail size={16} /><span>{BUSINESS_CONTACT.email}</span></a>
            <p>Product details, prices, stock, and claims are confirmed before publication or purchase.</p>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© 2026 GreenHealthProducts</span>
          <span>Product information is not medical treatment.</span>
        </div>
      </footer>
      {cartOpen && (
        <div className="drawer-backdrop" onClick={() => setCartOpen(false)}>
          <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div><p className="eyebrow">Your enquiry</p><h2>Order list</h2></div>
              <button type="button" className="icon-button" onClick={() => setCartOpen(false)}><X size={19} /></button>
            </div>
            {cart.length ? (
              <>
                <div className="cart-list">
                  {cart.map((item) => (
                    <div className="cart-row" key={item.product.id}>
                      <ProductArtwork product={item.product} />
                      <div>
                        <b>{item.product.name}</b>
                        <small>{item.quantity} × {retailMoney(item.product)}</small>
                      </div>
                    </div>
                  ))}
                </div>
                <a
                  className="button button-primary wide-button"
                  href={`https://wa.me/${BUSINESS_CONTACT.whatsappDigits}?text=${encodeURIComponent(`Hello, I would like to ask about:\n${cartText}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={18} /> Continue on WhatsApp
                </a>
                <p className="drawer-note">This sends an enquiry, not an automatic payment. Confirm stock and price before purchase.</p>
              </>
            ) : (
              <div className="empty-state">
                <ShoppingBag size={27} />
                <h3>Your list is empty</h3>
                <p>Add a product to start an order enquiry.</p>
                <button type="button" className="button button-primary" onClick={() => { setCartOpen(false); setLocation("/shop"); }}>Browse products</button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
