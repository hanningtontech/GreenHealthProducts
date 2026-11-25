# GreenWorld Kenya — First Storefront Plan

## Scope

Build the first version as a single-owner Green World supplements storefront. Public visitors can browse products by category, open product details, add items to a cart, and send an order enquiry. A simple open `/admin` workspace is included for the current local setup so the owner can add, edit, hide, and delete products, manage categories, set retail/distributor prices, stock, claims notes, and upload image files. Authentication and multiple distributor accounts are intentionally deferred to a later phase.

The starter catalogue uses sample records based on the uploaded Green World PDF. Product content uses careful wellness wording and labels medical claims, price, stock, and regulatory details as requiring confirmation.

## Implementation approach

- React + Wouter frontend using the existing starter.
- Local browser persistence with `localStorage` for this first local owner prototype; this keeps the open admin usable without forcing a password or login before the owner is ready.
- Product records include name, category, pack size, ingredients, retail price, distributor price, stock, English description, Kiswahili description, usage, warnings, verification status, and image.
- Future-ready route structure for `/`, `/shop`, `/product/:id`, `/admin`, and `/about`.
- `manus-routes.json` declares all user-facing routes.
- Later phase: move product records and images to managed database/storage, add owner authentication, then add distributor profiles, commissions, orders, and payments.

## Design

### Candidate styles

- **Botanical editorial** — 0.06
- **Clean clinical commerce** — 0.04
- **Warm Kenyan market garden** — 0.08

### Chosen style: Botanical editorial

**Design movement:** Modern botanical editorial with quiet luxury and practical ecommerce clarity.

**Core principles:** grounded, spacious, trustworthy, easy to scan.

**Color philosophy:** deep forest green signals nature and trust; warm cream makes long product descriptions comfortable; terracotta accents add human warmth without looking medicinal.

**Layout paradigm:** editorial split sections and offset product shelves rather than a generic centered grid. Product cards remain compact and scannable.

**Signature elements:** leaf-shaped accent marks, cream paper panels, and thin botanical divider lines.

**Interaction philosophy:** calm, direct actions. Every product card exposes the main action without forcing users through heavy UI.

**Animation:** subtle lift on cards, soft fade for drawers, no distracting motion.

**Typography system:** Georgia for display headlines, Inter/system sans for controls and body copy.

**Brand essence:** A clear, honest online shelf for Green World wellness products in Kenya. Personality: grounded, helpful, transparent.

**Brand voice:** Explain simply and never overpromise. Example lines: “Choose wellness with better information.” and “Check the label, then choose what fits your routine.”

**Wordmark & logo:** wordmark paired with a simple three-leaf mark made from rounded CSS shapes.

**Signature brand color:** forest green `#1D4D3A`.

## Project structure

- `client/src/App.tsx`: route map and app shell.
- `client/src/pages/Home.tsx`: public storefront, shop, product details, about, and cart interactions.
- `client/src/pages/Admin.tsx`: open local owner workspace for product/category CRUD and image upload.
- `client/src/index.css`: botanical editorial visual system.
- `public/manus-routes.json`: route manifest for the deployed app.
