# E2E Test Suite Ready

## Test Runner
- Command: `npm run test:e2e` or `node scripts/run-e2e-tests.js`
- Target URL: `http://localhost:3000` (configurable via `--baseUrl` or `BASE_URL` env var)
- CLI Flags:
  - `--baseUrl=http://localhost:3000` (Default target server)
  - `--tier=1|2|3|4|all` (Target specific tier)
  - `--verbose` (Diagnostic request/response details on failure)
  - `--json-output` (Exports test metrics to `test-results.json`)

## Coverage Summary
| Tier | Count | Description |
|------|------:|-------------|
| 1. Feature Coverage | 47 | Critical SEO & Indexability (SSR HTML, H1 tags, Googlebot 308/302 redirects, sitemap.xml 11 locales, robots.txt unblocking) |
| 2. Boundary & Corner | 25 | Localized Metadata & Hreflang Integrity (Canonical tags, 11+1 hreflang tags, OG tags, Twitter cards, Meta keywords) |
| 3. Cross-Feature | 16 | Structured Data / JSON-LD Validation (WebSite, Organization logo PNG, CollectionPage, ItemList, Product + SoftwareApp offers.availability=InStock, BreadcrumbList) |
| 4. Real-World Application | 9 | Edge Cases & Security Resilience (404 pages, noindex meta tags, security headers, rate-limiting headers, multi-locale alt attributes) |
| **Total** | **97** | **100% Requirement-Driven Opaque-Box Coverage across R1-R4** |

## Feature Checklist
| Feature | Requirement | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Total Tests |
|---------|-------------|:------:|:------:|:------:|:------:|:-----------:|
| SSR/RSC Home Page Conversion | R1 | 11 | 2 | 2 | 2 | 17 |
| Googlebot i18n Middleware Redirects | R1 | 5 | 2 | 1 | 1 | 9 |
| Heading Hierarchy & Home `<h1>` | R2 | 13 | 2 | 2 | 1 | 18 |
| Multi-Language Alt Attributes | R2 | 3 | 3 | 2 | 2 | 10 |
| Metadata & OG/Twitter Cards | R2 | 2 | 11 | 2 | 1 | 16 |
| Schema.org JSON-LD Fixes | R3 | 2 | 2 | 6 | 1 | 11 |
| Product Thumbnail Image Fallbacks | R3 | 2 | 1 | 1 | 1 | 5 |
| Sitemap.ts & Robots.txt Verification | R4 | 7 | 2 | 0 | 0 | 9 |
| **Total** | | **45** | **25** | **16** | **9** | **97** |
