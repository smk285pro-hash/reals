# Project: RealS Media SEO Optimization

## Architecture
- Framework: Next.js 16 App Router (React Server Components + Client Wrappers)
- Database: Prisma ORM (`db.product`, `db.category`)
- Internationalization: Custom i18n middleware + dictionary lookup (`src/i18n/messages.ts`, `src/i18n/seo.ts`) supporting 11 locales (`vi`, `en`, `zh`, `ja`, `ko`, `es`, `fr`, `de`, `pt`, `th`, `ru`).
- Structured Data: Schema.org JSON-LD scripts (`Organization`, `WebSite`, `Product`, `SoftwareApplication`, `BreadcrumbList`, `CollectionPage`).

## Feature Inventory
Every feature from the Survey phase appears here with its assigned milestone.
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | SSR/RSC Home Page Conversion | Refactor `src/app/page.tsx` to async Server Component with server DB queries and semantic HTML | M1 | survey |
| 2 | Googlebot i18n Middleware Redirects | Update middleware for 308/302 crawler redirects and `x-default` preservation | M1 | survey |
| 3 | Heading Hierarchy & Home `<h1>` | Add semantic `<h1>` to home page and verify h1-h3 hierarchy across routes | M2 | survey |
| 4 | Multi-Language Alt Attributes & i18n Strings | Replace hardcoded Vietnamese alt/ARIA/UI strings across 11 locales | M2 | survey |
| 5 | Metadata & OG/Twitter Cards | Complete metadata (keywords, OG, Twitter, canonical, hreflang) across routes | M2 | survey |
| 6 | Schema.org JSON-LD Fixes | Fix `offers.availability` (InStock), logo format PNG, SearchAction sitelinks | M3 | survey |
| 7 | Product Thumbnail Image Fallbacks | Ensure default image fallbacks for Product schema and OG/Twitter tags | M3 | survey |
| 8 | Sitemap.ts & Robots.txt Verification | Verify 11-locale sitemap.ts coverage and robots.txt unblocking CSS/JS/images | M4 | survey |
| 9 | End-to-End Test Suite | Build requirement-driven E2E test suite (Tiers 1-4) covering all features | M_E2E | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Technical SEO & SSR | SSR/RSC for home page (`src/app/page.tsx`) + middleware 308/302 crawler redirects | none | DONE (conv: 72a6dd3a-9c30-4f48-8726-fbd59b2d150b) |
| M2 | On-Page SEO & Content Semantics | Heading hierarchy (`<h1>`), multi-lang alt attributes (11 locales), complete metadata | M1 | IN_PROGRESS (conv: 7fc64085-8fcd-4e1b-9feb-ae9b4dab1786) |
| M3 | Structured Data JSON-LD | Fix `offers.availability` (InStock), logo PNG, SearchAction, image fallbacks | M1 | IN_PROGRESS (conv: 42d5c1e4-223e-4317-a49a-93585a0a3be0) |
| M4 | Indexability & Sitemaps | Verify `sitemap.ts` & `robots.txt` indexability rules for all 11 locales | M1 | IN_PROGRESS (conv: 339b1169-b19b-4d77-9357-fb25b55d6fc5) |
| M_E2E | E2E Testing Track | Requirement-driven opaque-box E2E test runner and test cases (Tiers 1-4) | none | DONE (published TEST_READY.md, 97 test cases) |

## Interface Contracts
### `src/app/page.tsx` (RSC) ↔ `src/components/home/ClientHomePage.tsx` (Client)
- Server Component fetches `initialProducts`, `initialCategories`, `initialTotal` from Prisma `db.product` and `db.category`.
- Server Component renders `generateMetadata()`, JSON-LD scripts (`WebSite`, `CollectionPage`, `ItemList`), `<h1>` header, `<p>` description, and `<article>` product previews.
- Client Component wraps interactive elements (Search, Filter, Wishlist, Modals, SortBar).

### i18n & SEO Helpers (`src/i18n/messages.ts` & `src/i18n/seo.ts`)
- `getSeoMetadata(locale, path)` returns canonical URL, 11 alternate hreflang tags + `x-default`.
- `t('for_reaper')` returns localized "for REAPER" / "cho REAPER" / "dành cho REAPER" / etc. across 11 locales.

## Code Layout
- `src/app/page.tsx` — Server-side home page
- `src/components/home/ClientHomePage.tsx` — Interactive home page client wrapper
- `src/middleware.ts` — i18n locale routing and crawler detection middleware
- `src/app/products/page.tsx` — Products catalog server component
- `src/app/products/[id]/page.tsx` — Product detail server component
- `src/components/product/ProductCard.tsx` — Product card component
- `src/components/product/ProductDetail.tsx` — Product detail component
- `src/i18n/messages.ts` — Multi-language message dictionaries (11 locales)
- `src/i18n/seo.ts` — SEO metadata helpers
- `src/app/sitemap.ts` — Dynamic sitemap generator
- `public/robots.txt` — Web crawler directives
