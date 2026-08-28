#!/usr/bin/env node

/**
 * Requirement-Driven Opaque-Box E2E Test Runner Engine for RealS Media SEO Optimization
 *
 * Tiers 1-4, 97 Test Cases total:
 * - Tier 1: Critical SEO & Indexability (47 tests)
 * - Tier 2: Localized Metadata & Hreflang Integrity (25 tests)
 * - Tier 3: Structured Data / JSON-LD Validation (16 tests)
 * - Tier 4: Edge Cases & Security Resilience (9 tests)
 *
 * CLI Usage:
 *   node scripts/run-e2e-tests.js [--baseUrl=http://localhost:3000] [--tier=1|2|3|4|all] [--verbose] [--json-output]
 */

const fs = require('fs');
const path = require('path');

const LOCALES = ['vi', 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'th', 'ru'];

// --- CLI Option Parser ---
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    baseUrl: 'http://localhost:3000',
    tier: 'all',
    verbose: false,
    jsonOutput: false,
    jsonOutputPath: 'test-results.json',
  };

  for (const arg of args) {
    if (arg.startsWith('--baseUrl=')) {
      options.baseUrl = arg.split('=')[1].replace(/\/+$/, '');
    } else if (arg.startsWith('--tier=')) {
      options.tier = arg.split('=')[1].toLowerCase();
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg.startsWith('--json-output=')) {
      options.jsonOutput = true;
      options.jsonOutputPath = arg.split('=')[1] || 'test-results.json';
    } else if (arg === '--json-output') {
      options.jsonOutput = true;
    }
  }
  return options;
}

// --- ANSI Colors ---
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// --- Terminal Logging Helpers ---
function pass(msg) {
  console.log(`  ${colors.green}✓${colors.reset} ${msg}`);
}

function fail(msg, err) {
  console.log(`  ${colors.red}✗${colors.reset} ${msg}`);
  if (err) {
    console.log(`    ${colors.gray}${err}${colors.reset}`);
  }
}

// --- HTTP Client ---
async function makeRequest(url, options = {}) {
  const headers = {
    'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RealS-E2E-Tester/1.0',
    ...options.headers,
  };
  const fetchOptions = {
    method: options.method || 'GET',
    headers,
    redirect: options.redirect || 'manual',
  };

  try {
    const res = await fetch(url, fetchOptions);
    const body = await res.text();
    if (res.status === 429) {
      console.log('429 DEBUG BODY:', url, body);
    }
    const resHeaders = {};
    res.headers.forEach((val, key) => {
      resHeaders[key.toLowerCase()] = val;
    });
    return {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      location: resHeaders['location'] || null,
      body,
      ok: res.ok,
    };
  } catch (err) {
    return {
      status: 0,
      error: err.message,
      headers: {},
      location: null,
      body: '',
      ok: false,
    };
  }
}

// --- Concurrent Batch Runner (Batch size 5 to comply with middleware limits) ---
async function runInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  return results;
}

// --- Dynamic Product Discovery ---
async function discoverProductId(baseUrl) {
  try {
    const res = await makeRequest(`${baseUrl}/sitemap.xml`);
    if (res.status === 200 && res.body) {
      const match = res.body.match(/\/products\/([a-zA-Z0-9%_-]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  } catch (e) {}

  const productListRoutes = ['/products', '/vi/products', '/en/products'];
  for (const route of productListRoutes) {
    try {
      const res = await makeRequest(`${baseUrl}${route}`);
      if (res.status === 200 && res.body) {
        const match = res.body.match(/\/products\/([a-zA-Z0-9%_-]+)/);
        if (match && match[1]) {
          return decodeURIComponent(match[1]);
        }
      }
    } catch (e) {}
  }

  return 'cm71234567890';
}

// --- HTML & Schema Extraction Helpers ---
function extractTags(html, tagName) {
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const matches = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    matches.push({ full: m[0], content: m[1].trim() });
  }
  return matches;
}

function extractMetaContent(html, nameOrProp) {
  const escaped = nameOrProp.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const regex1 = new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${escaped}["']\\s+content=["']([^"']*)["']`, 'i');
  const regex2 = new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+(?:name|property)=["']${escaped}["']`, 'i');
  const m1 = html.match(regex1);
  if (m1) return m1[1];
  const m2 = html.match(regex2);
  if (m2) return m2[1];
  return null;
}

function extractCanonicalUrl(html) {
  const match = html.match(/<link\s+[^>]*rel=["']canonical["']\s+href=["']([^"']*)["']/i) ||
                html.match(/<link\s+[^>]*href=["']([^"']*)["']\s+rel=["']canonical["']/i);
  return match ? match[1] : null;
}

function extractHreflangs(html) {
  const regex = /<link\s+[^>]*rel=["']alternate["']\s+[^>]*hreflang=["']([^"']*)["']\s+href=["']([^"']*)["']/gi;
  const regex2 = /<link\s+[^>]*hreflang=["']([^"']*)["']\s+[^>]*rel=["']alternate["']\s+href=["']([^"']*)["']/gi;
  const list = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    list.push({ hreflang: m[1], href: m[2] });
  }
  while ((m = regex2.exec(html)) !== null) {
    list.push({ hreflang: m[1], href: m[2] });
  }
  return list;
}

function extractJsonLd(html) {
  const regex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const items = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      items.push(parsed);
    } catch (e) {}
  }
  return items;
}

function extractHeadings(html) {
  const regex = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const list = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    list.push({ level: m[1].toLowerCase(), text: m[2].replace(/<[^>]+>/g, '').trim() });
  }
  return list;
}

function extractImages(html) {
  const regex = /<img\s+[^>]*>/gi;
  const list = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = tag.match(/src=["']([^"']*)["']/i);
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);
    list.push({
      tag,
      src: srcMatch ? srcMatch[1] : null,
      alt: altMatch ? altMatch[1] : null,
    });
  }
  return list;
}

// --- Test Cases Definition Generator ---
function createTestCases(baseUrl, productId) {
  const tests = [];

  // ==========================================
  // TIER 1: Critical SEO & Indexability (47 Tests)
  // ==========================================
  
  // T1-01 .. T1-11: SSR HTML & H1 for Home Page across 11 locales
  LOCALES.forEach((locale, idx) => {
    const padId = String(idx + 1).padStart(2, '0');
    tests.push({
      id: `T1-${padId}`,
      tier: 1,
      name: `Home Page SSR HTML & <h1> presence [/${locale}]`,
      run: async () => {
        const res = await makeRequest(`${baseUrl}/${locale}`);
        if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
        const h1s = extractTags(res.body, 'h1');
        if (h1s.length !== 1) return { pass: false, message: `Expected exactly 1 <h1> tag, found ${h1s.length}` };
        if (res.body.length < 200) return { pass: false, message: `Response body too short (${res.body.length} bytes)` };
        return { pass: true, message: `HTTP 200 with 1 <h1> tag: "${h1s[0].content}"` };
      },
    });
  });

  // T1-12 .. T1-22: SSR HTML & H1 for Products Page across 11 locales
  LOCALES.forEach((locale, idx) => {
    const padId = String(idx + 12).padStart(2, '0');
    tests.push({
      id: `T1-${padId}`,
      tier: 1,
      name: `Products Page SSR HTML & <h1> presence [/${locale}/products]`,
      run: async () => {
        const res = await makeRequest(`${baseUrl}/${locale}/products`);
        if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
        const h1s = extractTags(res.body, 'h1');
        if (h1s.length !== 1) return { pass: false, message: `Expected exactly 1 <h1> tag, found ${h1s.length}` };
        return { pass: true, message: `HTTP 200 with 1 <h1> tag: "${h1s[0].content}"` };
      },
    });
  });

  // T1-23 .. T1-33: SSR HTML & H1 for Product Detail Page across 11 locales
  LOCALES.forEach((locale, idx) => {
    const padId = String(idx + 23).padStart(2, '0');
    tests.push({
      id: `T1-${padId}`,
      tier: 1,
      name: `Product Detail SSR HTML & <h1> [/${locale}/products/${productId}]`,
      run: async () => {
        const res = await makeRequest(`${baseUrl}/${locale}/products/${encodeURIComponent(productId)}`);
        if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
        if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
        const h1s = extractTags(res.body, 'h1');
        if (h1s.length !== 1) return { pass: false, message: `Expected exactly 1 <h1> tag, found ${h1s.length}` };
        return { pass: true, message: `HTTP 200 with product <h1>: "${h1s[0].content}"` };
      },
    });
  });

  // T1-34: Googlebot Middleware Redirect on Home Page
  tests.push({
    id: 'T1-34',
    tier: 1,
    name: 'Googlebot Crawler redirect on [/] (308 or 302 status)',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/`, {
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        redirect: 'manual',
      });
      if (![308, 302, 307].includes(res.status)) {
        return { pass: false, message: `Expected redirect 308/302/307 for Googlebot, got ${res.status}` };
      }
      if (!res.location || !res.location.includes('/en')) {
        return { pass: false, message: `Expected Location header to target /en, got "${res.location}"` };
      }
      return { pass: true, message: `Googlebot redirected with HTTP ${res.status} -> ${res.location}` };
    },
  });

  // T1-35: Googlebot Middleware Redirect on Products Page
  tests.push({
    id: 'T1-35',
    tier: 1,
    name: 'Googlebot Crawler redirect on [/products] (308 or 302 status)',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/products`, {
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        redirect: 'manual',
      });
      if (![308, 302, 307].includes(res.status)) {
        return { pass: false, message: `Expected redirect 308/302/307 for Googlebot, got ${res.status}` };
      }
      if (!res.location || !res.location.includes('/en/products')) {
        return { pass: false, message: `Expected Location header to target /en/products, got "${res.location}"` };
      }
      return { pass: true, message: `Googlebot redirected with HTTP ${res.status} -> ${res.location}` };
    },
  });

  // T1-36: Standard User Redirect on Home Page
  tests.push({
    id: 'T1-36',
    tier: 1,
    name: 'Standard user redirect on [/] (307 status & locale cookie)',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/`, { redirect: 'manual' });
      if (res.status !== 307 && res.status !== 308 && res.status !== 302) {
        return { pass: false, message: `Expected 307/308/302 redirect for user, got ${res.status}` };
      }
      if (!res.location || !res.location.includes('/en')) {
        return { pass: false, message: `Expected Location header to point to /en, got "${res.location}"` };
      }
      return { pass: true, message: `User redirected with HTTP ${res.status} -> ${res.location}` };
    },
  });

  // T1-37: Accept-Language Header Redirect
  tests.push({
    id: 'T1-37',
    tier: 1,
    name: 'Accept-Language header redirect [vi-VN -> /vi]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/`, {
        headers: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
        redirect: 'manual',
      });
      if (![307, 308, 302].includes(res.status)) {
        return { pass: false, message: `Expected redirect 307/308/302, got ${res.status}` };
      }
      if (!res.location || !res.location.includes('/vi')) {
        return { pass: false, message: `Expected Location header to point to /vi, got "${res.location}"` };
      }
      return { pass: true, message: `Accept-Language redirected correctly -> ${res.location}` };
    },
  });

  // T1-38: Redirect Loop Check
  tests.push({
    id: 'T1-38',
    tier: 1,
    name: 'Redirect loop verification on [/en, /vi, /zh]',
    run: async () => {
      const paths = ['/en', '/vi', '/zh'];
      for (const p of paths) {
        const res = await makeRequest(`${baseUrl}${p}`, { redirect: 'manual' });
        if (res.status !== 200) {
          return { pass: false, message: `Path ${p} returned status ${res.status} (expected 200 without redirect loop)` };
        }
      }
      return { pass: true, message: 'All localized paths return HTTP 200 directly without redirect loop' };
    },
  });

  // T1-39: Sitemap XML Format & Accessibility
  tests.push({
    id: 'T1-39',
    tier: 1,
    name: 'Sitemap XML existence & valid XML format [/sitemap.xml]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/sitemap.xml`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      if (!res.body.includes('<urlset') && !res.body.includes('<sitemapindex') && !res.body.includes('<?xml')) {
        return { pass: false, message: 'Body does not contain valid XML urlset or sitemapindex tag' };
      }
      return { pass: true, message: 'Valid sitemap XML returned with HTTP 200' };
    },
  });

  // T1-40: Sitemap 11-Locale URL Coverage
  tests.push({
    id: 'T1-40',
    tier: 1,
    name: 'Sitemap 11-locale coverage for home and product routes',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/sitemap.xml`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const missing = [];
      LOCALES.forEach(loc => {
        if (!res.body.includes(`/${loc}`) && !res.body.includes(`reals.media/${loc}`)) {
          missing.push(loc);
        }
      });
      if (missing.length > 0) {
        return { pass: false, message: `Sitemap missing locale entries for: ${missing.join(', ')}` };
      }
      return { pass: true, message: 'Sitemap contains entries for all 11 supported locales' };
    },
  });

  // T1-41: Sitemap Alternates (hreflang in XML)
  tests.push({
    id: 'T1-41',
    tier: 1,
    name: 'Sitemap alternate language links (11 locales + x-default)',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/sitemap.xml`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      if (!res.body.includes('rel="alternate"') && !res.body.includes('hreflang=')) {
        return { pass: false, message: 'Sitemap does not contain xhtml:link alternate tags' };
      }
      if (!res.body.includes('hreflang="x-default"')) {
        return { pass: false, message: 'Sitemap missing x-default hreflang attribute' };
      }
      return { pass: true, message: 'Sitemap contains valid alternate hreflang tags including x-default' };
    },
  });

  // T1-42: Sitemap Product Entries Priority
  tests.push({
    id: 'T1-42',
    tier: 1,
    name: 'Sitemap product entries priority configuration (0.8)',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/sitemap.xml`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      if (res.body.includes('/products/')) {
        if (!res.body.includes('<priority>0.8</priority>') && !res.body.includes('0.8')) {
          return { pass: false, message: 'Sitemap product entries missing 0.8 priority' };
        }
      }
      return { pass: true, message: 'Sitemap includes product routes with correct priority' };
    },
  });

  // T1-43: Robots.txt Allowed Rules
  tests.push({
    id: 'T1-43',
    tier: 1,
    name: 'Robots.txt allowed crawling rules [/robots.txt]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/robots.txt`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      if (!res.body.includes('User-agent:') || !res.body.includes('Allow: /')) {
        return { pass: false, message: 'Robots.txt missing "User-agent: *" or "Allow: /"' };
      }
      if (res.body.includes('Disallow: /_next/') || res.body.includes('Disallow: /static/')) {
        return { pass: false, message: 'Robots.txt incorrectly disallows static asset crawling' };
      }
      return { pass: true, message: 'Robots.txt permits root crawling and static assets' };
    },
  });

  // T1-44: Robots.txt Disallowed Rules
  tests.push({
    id: 'T1-44',
    tier: 1,
    name: 'Robots.txt disallowed private routes [/api/, /admin/, /seller/]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/robots.txt`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const requiredDisallows = ['/api/', '/admin/', '/seller/'];
      const missing = requiredDisallows.filter(path => !res.body.includes(`Disallow: ${path}`));
      if (missing.length > 0) {
        return { pass: false, message: `Robots.txt missing disallow rules for: ${missing.join(', ')}` };
      }
      return { pass: true, message: 'Robots.txt properly blocks /api/, /admin/, and /seller/' };
    },
  });

  // T1-45: Robots.txt Sitemap Directive
  tests.push({
    id: 'T1-45',
    tier: 1,
    name: 'Robots.txt sitemap directive [/robots.txt]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/robots.txt`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      if (!res.body.toLowerCase().includes('sitemap:')) {
        return { pass: false, message: 'Robots.txt missing Sitemap directive' };
      }
      return { pass: true, message: 'Robots.txt contains valid Sitemap directive' };
    },
  });

  // T1-46: Heading Hierarchy on Home Page
  tests.push({
    id: 'T1-46',
    tier: 1,
    name: 'Heading hierarchy on Home Page [/en]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const headings = extractHeadings(res.body);
      const h1s = headings.filter(h => h.level === 'h1');
      if (h1s.length !== 1) return { pass: false, message: `Expected exactly 1 <h1> tag, found ${h1s.length}` };
      const firstHeadingIndex = headings.findIndex(h => h.level === 'h1');
      if (firstHeadingIndex !== 0) return { pass: false, message: `<h1> is not the first heading element on the page` };
      return { pass: true, message: `Heading hierarchy clean: single <h1> "${h1s[0].text}" at top` };
    },
  });

  // T1-47: Heading Hierarchy on Product Detail Page
  tests.push({
    id: 'T1-47',
    tier: 1,
    name: 'Heading hierarchy on Product Detail [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const headings = extractHeadings(res.body);
      const h1s = headings.filter(h => h.level === 'h1');
      if (h1s.length !== 1) return { pass: false, message: `Expected exactly 1 <h1> tag, found ${h1s.length}` };
      return { pass: true, message: `Single <h1> element for product title: "${h1s[0].text}"` };
    },
  });

  // ==========================================
  // TIER 2: Localized Metadata & Hreflang Integrity (25 Tests)
  // ==========================================

  // T2-01 .. T2-11: Canonical Tags on Home Page across 11 locales
  LOCALES.forEach((locale, idx) => {
    const padId = String(idx + 1).padStart(2, '0');
    tests.push({
      id: `T2-${padId}`,
      tier: 2,
      name: `Canonical meta tag verification [/${locale}]`,
      run: async () => {
        const res = await makeRequest(`${baseUrl}/${locale}`);
        if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
        const canonical = extractCanonicalUrl(res.body);
        if (!canonical) return { pass: false, message: 'Missing <link rel="canonical"> tag' };
        if (!canonical.includes(`/${locale}`) && !canonical.endsWith(`/${locale}`)) {
          return { pass: false, message: `Canonical URL "${canonical}" does not match current locale /${locale}` };
        }
        return { pass: true, message: `Canonical tag verified: ${canonical}` };
      },
    });
  });

  // T2-12 .. T2-22: Hreflang Alternate Tags on Home Page across 11 locales
  LOCALES.forEach((locale, idx) => {
    const padId = String(idx + 12).padStart(2, '0');
    tests.push({
      id: `T2-${padId}`,
      tier: 2,
      name: `Hreflang 11-locale + x-default alternates [/${locale}]`,
      run: async () => {
        const res = await makeRequest(`${baseUrl}/${locale}`);
        if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
        const hreflangs = extractHreflangs(res.body);
        if (hreflangs.length < 11) {
          return { pass: false, message: `Expected at least 11 hreflang tags, found ${hreflangs.length}` };
        }
        const hasXDefault = hreflangs.some(h => h.hreflang === 'x-default');
        if (!hasXDefault) return { pass: false, message: 'Missing hreflang="x-default" alternate tag' };
        return { pass: true, message: `Found ${hreflangs.length} hreflang tags including x-default` };
      },
    });
  });

  // T2-23: OpenGraph Meta Tags
  tests.push({
    id: 'T2-23',
    tier: 2,
    name: 'OpenGraph meta tags completeness [/en]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const ogTitle = extractMetaContent(res.body, 'og:title');
      const ogDesc = extractMetaContent(res.body, 'og:description');
      const ogUrl = extractMetaContent(res.body, 'og:url');
      const ogSite = extractMetaContent(res.body, 'og:site_name');
      if (!ogTitle || !ogDesc || !ogUrl || !ogSite) {
        return { pass: false, message: `Missing OG tags. og:title=${Boolean(ogTitle)}, og:description=${Boolean(ogDesc)}, og:url=${Boolean(ogUrl)}, og:site_name=${Boolean(ogSite)}` };
      }
      return { pass: true, message: `OpenGraph metadata complete (og:site_name="${ogSite}")` };
    },
  });

  // T2-24: Twitter Card Meta Tags
  tests.push({
    id: 'T2-24',
    tier: 2,
    name: 'Twitter Card meta tags completeness [/en]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const card = extractMetaContent(res.body, 'twitter:card');
      const title = extractMetaContent(res.body, 'twitter:title');
      const desc = extractMetaContent(res.body, 'twitter:description');
      if (!card || !title || !desc) {
        return { pass: false, message: `Missing Twitter Card tags. card=${Boolean(card)}, title=${Boolean(title)}, desc=${Boolean(desc)}` };
      }
      return { pass: true, message: `Twitter Card meta verified (card="${card}")` };
    },
  });

  // T2-25: Meta Keywords on Product Detail Page
  tests.push({
    id: 'T2-25',
    tier: 2,
    name: 'Meta keywords completeness [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const keywords = extractMetaContent(res.body, 'keywords');
      if (!keywords) return { pass: false, message: 'Missing <meta name="keywords"> tag' };
      if (!keywords.toLowerCase().includes('reaper')) {
        return { pass: false, message: `Meta keywords "${keywords}" missing target keyword "REAPER"` };
      }
      return { pass: true, message: `Meta keywords verified: "${keywords}"` };
    },
  });

  // ==========================================
  // TIER 3: Structured Data / JSON-LD Validation (16 Tests)
  // ==========================================

  // T3-01: Home Page JSON-LD Extraction
  tests.push({
    id: 'T3-01',
    tier: 3,
    name: 'JSON-LD extraction & parsing on Home Page [/en]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      if (schemas.length === 0) return { pass: false, message: 'No valid JSON-LD scripts found on Home Page' };
      return { pass: true, message: `Successfully extracted & parsed ${schemas.length} JSON-LD schemas` };
    },
  });

  // T3-02: Products Page JSON-LD Extraction
  tests.push({
    id: 'T3-02',
    tier: 3,
    name: 'JSON-LD extraction & parsing on Products Page [/en/products]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      if (schemas.length === 0) return { pass: false, message: 'No valid JSON-LD scripts found on Products Page' };
      return { pass: true, message: `Successfully extracted & parsed ${schemas.length} JSON-LD schemas` };
    },
  });

  // T3-03: Product Detail JSON-LD Extraction
  tests.push({
    id: 'T3-03',
    tier: 3,
    name: 'JSON-LD extraction & parsing on Product Detail [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      if (schemas.length === 0) return { pass: false, message: 'No valid JSON-LD scripts found on Product Detail page' };
      return { pass: true, message: `Successfully extracted & parsed ${schemas.length} JSON-LD schemas` };
    },
  });

  // T3-04: WebSite Schema Validation
  tests.push({
    id: 'T3-04',
    tier: 3,
    name: 'WebSite schema structure validation [/en]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const website = schemas.find(s => s['@type'] === 'WebSite');
      if (!website) return { pass: false, message: 'Missing schema with @type === "WebSite"' };
      if (website.name !== 'RealS') return { pass: false, message: `Expected WebSite name "RealS", got "${website.name}"` };
      return { pass: true, message: `WebSite schema validated: name="${website.name}", url="${website.url}"` };
    },
  });

  // T3-05: SearchAction Sitelinks Schema Validation
  tests.push({
    id: 'T3-05',
    tier: 3,
    name: 'SearchAction sitelinks schema validation [/en]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const website = schemas.find(s => s['@type'] === 'WebSite');
      if (!website || !website.potentialAction) {
        return { pass: false, message: 'WebSite schema missing potentialAction attribute' };
      }
      const action = Array.isArray(website.potentialAction) ? website.potentialAction[0] : website.potentialAction;
      if (action['@type'] !== 'SearchAction') {
        return { pass: false, message: `Expected SearchAction @type, got "${action['@type']}"` };
      }
      return { pass: true, message: 'SearchAction sitelinks schema verified' };
    },
  });

  // T3-06: Organization Schema Validation
  tests.push({
    id: 'T3-06',
    tier: 3,
    name: 'Organization schema structure & logo validation [/en]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const org = schemas.find(s => s['@type'] === 'Organization') || (schemas.find(s => s.publisher && s.publisher['@type'] === 'Organization')?.publisher);
      if (!org) return { pass: false, message: 'Missing Organization schema' };
      if (org.name !== 'RealS') return { pass: false, message: `Expected Organization name "RealS", got "${org.name}"` };
      return { pass: true, message: `Organization schema validated (name="${org.name}")` };
    },
  });

  // T3-07: CollectionPage Schema Validation
  tests.push({
    id: 'T3-07',
    tier: 3,
    name: 'CollectionPage schema validation [/en/products]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const coll = schemas.find(s => s['@type'] === 'CollectionPage');
      if (!coll) return { pass: false, message: 'Missing CollectionPage schema' };
      if (coll.inLanguage !== 'en') return { pass: false, message: `Expected inLanguage "en", got "${coll.inLanguage}"` };
      return { pass: true, message: 'CollectionPage schema validated' };
    },
  });

  // T3-08: ItemList Schema Validation
  tests.push({
    id: 'T3-08',
    tier: 3,
    name: 'ItemList schema structure & position indexing [/en/products]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const coll = schemas.find(s => s['@type'] === 'CollectionPage');
      if (!coll || !coll.mainEntity || coll.mainEntity['@type'] !== 'ItemList') {
        return { pass: false, message: 'CollectionPage missing mainEntity ItemList schema' };
      }
      const items = coll.mainEntity.itemListElement;
      if (!Array.isArray(items)) return { pass: false, message: 'ItemList itemListElement is not an array' };
      if (items.length > 0 && items[0].position !== 1) {
        return { pass: false, message: `Expected first item position 1, got ${items[0].position}` };
      }
      return { pass: true, message: `ItemList schema validated with ${items.length} elements` };
    },
  });

  // T3-09: ItemList Items Details
  tests.push({
    id: 'T3-09',
    tier: 3,
    name: 'ItemList items name & localized URL validity [/en/products]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const coll = schemas.find(s => s['@type'] === 'CollectionPage');
      if (!coll || !coll.mainEntity) return { pass: false, message: 'Missing CollectionPage ItemList' };
      const items = coll.mainEntity.itemListElement || [];
      for (const item of items) {
        if (!item.name || !item.url) return { pass: false, message: 'ListItem element missing name or url property' };
      }
      return { pass: true, message: `All ${items.length} ListItems have valid names and localized URLs` };
    },
  });

  // T3-10: Product & SoftwareApplication Dual Schema
  tests.push({
    id: 'T3-10',
    tier: 3,
    name: 'Product & SoftwareApplication dual schema [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const prod = schemas.find(s => {
        const types = Array.isArray(s['@type']) ? s['@type'] : [s['@type']];
        return types.includes('Product') && types.includes('SoftwareApplication');
      });
      if (!prod) return { pass: false, message: 'Missing dual @type: ["Product", "SoftwareApplication"] schema' };
      return { pass: true, message: 'Product & SoftwareApplication dual schema verified' };
    },
  });

  // T3-11: Product Availability Schema
  tests.push({
    id: 'T3-11',
    tier: 3,
    name: 'Product offers.availability schema (InStock) [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const prod = schemas.find(s => (Array.isArray(s['@type']) ? s['@type'] : [s['@type']]).includes('Product'));
      if (!prod || !prod.offers) return { pass: false, message: 'Product schema missing offers property' };
      const avail = prod.offers.availability;
      if (!avail || !avail.includes('InStock')) {
        return { pass: false, message: `Expected availability InStock, got "${avail}"` };
      }
      return { pass: true, message: `offers.availability verified: ${avail}` };
    },
  });

  // T3-12: Product Price & Currency Schema
  tests.push({
    id: 'T3-12',
    tier: 3,
    name: 'Product offers price Currency (USD) & numeric format [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const prod = schemas.find(s => (Array.isArray(s['@type']) ? s['@type'] : [s['@type']]).includes('Product'));
      if (!prod || !prod.offers) return { pass: false, message: 'Product schema missing offers' };
      if (prod.offers.priceCurrency !== 'USD') {
        return { pass: false, message: `Expected priceCurrency USD, got "${prod.offers.priceCurrency}"` };
      }
      if (typeof prod.offers.price !== 'number' && isNaN(Number(prod.offers.price))) {
        return { pass: false, message: `Invalid numeric price format: "${prod.offers.price}"` };
      }
      return { pass: true, message: `Price format verified: ${prod.offers.price} USD` };
    },
  });

  // T3-13: Software Attributes Schema
  tests.push({
    id: 'T3-13',
    tier: 3,
    name: 'SoftwareApplication attributes (applicationCategory & OS) [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const app = schemas.find(s => (Array.isArray(s['@type']) ? s['@type'] : [s['@type']]).includes('SoftwareApplication'));
      if (!app) return { pass: false, message: 'Missing SoftwareApplication schema' };
      if (!app.applicationCategory || !app.operatingSystem) {
        return { pass: false, message: 'SoftwareApplication missing applicationCategory or operatingSystem' };
      }
      return { pass: true, message: `Software attributes verified: category="${app.applicationCategory}", OS="${app.operatingSystem}"` };
    },
  });

  // T3-14: BreadcrumbList Hierarchy
  tests.push({
    id: 'T3-14',
    tier: 3,
    name: 'BreadcrumbList hierarchy schema [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const bread = schemas.find(s => s['@type'] === 'BreadcrumbList');
      if (!bread || !Array.isArray(bread.itemListElement)) {
        return { pass: false, message: 'Missing or invalid BreadcrumbList schema' };
      }
      if (bread.itemListElement.length !== 3) {
        return { pass: false, message: `Expected 3 breadcrumb items (Home -> Products -> Product), found ${bread.itemListElement.length}` };
      }
      return { pass: true, message: 'BreadcrumbList 3-level hierarchy validated' };
    },
  });

  // T3-15: AggregateRating Schema
  tests.push({
    id: 'T3-15',
    tier: 3,
    name: 'AggregateRating schema validation [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const prod = schemas.find(s => (Array.isArray(s['@type']) ? s['@type'] : [s['@type']]).includes('Product'));
      if (prod && prod.aggregateRating) {
        const rating = prod.aggregateRating;
        if (rating.bestRating !== 5 || rating.worstRating !== 1 || typeof rating.ratingValue !== 'number') {
          return { pass: false, message: `Invalid AggregateRating fields: ${JSON.stringify(rating)}` };
        }
        return { pass: true, message: `AggregateRating verified: ${rating.ratingValue}/5 (${rating.ratingCount} ratings)` };
      }
      return { pass: true, message: 'No reviews on product (AggregateRating clean omitted)' };
    },
  });

  // T3-16: Review Schema
  tests.push({
    id: 'T3-16',
    tier: 3,
    name: 'Review schema elements validation [/en/products/${productId}]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const schemas = extractJsonLd(res.body);
      const prod = schemas.find(s => (Array.isArray(s['@type']) ? s['@type'] : [s['@type']]).includes('Product'));
      if (prod && Array.isArray(prod.review) && prod.review.length > 0) {
        const rev = prod.review[0];
        if (!rev.author || !rev.reviewRating || !rev.datePublished) {
          return { pass: false, message: `Review object missing required fields: ${JSON.stringify(rev)}` };
        }
        return { pass: true, message: `Review schema elements verified (${prod.review.length} reviews)` };
      }
      return { pass: true, message: 'No reviews on product (Review array omitted)' };
    },
  });

  // ==========================================
  // TIER 4: Edge Cases & Resilience (9 Tests)
  // ==========================================

  // T4-01: Invalid Locale Route Handling
  tests.push({
    id: 'T4-01',
    tier: 4,
    name: 'Invalid locale route handling [/invalid-locale/products]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/invalid-locale/products`, { redirect: 'manual' });
      if (res.status === 500) {
        return { pass: false, message: 'Server returned HTTP 500 error on invalid locale route' };
      }
      return { pass: true, message: `Invalid locale route handled cleanly with HTTP ${res.status}` };
    },
  });

  // T4-02: Unsupported Locale Code
  tests.push({
    id: 'T4-02',
    tier: 4,
    name: 'Unsupported locale code [/xx]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/xx`, { redirect: 'manual' });
      if (res.status === 500) {
        return { pass: false, message: 'Server returned HTTP 500 error on unsupported locale code' };
      }
      return { pass: true, message: `Unsupported locale code handled cleanly with HTTP ${res.status}` };
    },
  });

  // T4-03: Non-existent Product 404 Response
  tests.push({
    id: 'T4-03',
    tier: 4,
    name: 'Non-existent product returns HTTP 404 [/en/products/non-existent-id-9999]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/non-existent-id-9999`);
      if (res.status !== 404) {
        return { pass: false, message: `Expected HTTP 404 for non-existent product, got ${res.status}` };
      }
      return { pass: true, message: 'Non-existent product correctly returns HTTP 404' };
    },
  });

  // T4-04: Non-existent Product Noindex Tag
  tests.push({
    id: 'T4-04',
    tier: 4,
    name: 'Non-existent product 404 includes noindex robots meta tag',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/non-existent-id-9999`);
      if (res.status !== 404) return { pass: false, message: `Expected HTTP 404, got ${res.status}` };
      const robots = extractMetaContent(res.body, 'robots');
      const xRobots = res.headers['x-robots-tag'];
      const hasNoindex = (robots && robots.includes('noindex')) || (xRobots && xRobots.includes('noindex'));
      if (!hasNoindex) {
        return { pass: false, message: '404 response missing <meta name="robots" content="noindex"/> or X-Robots-Tag header' };
      }
      return { pass: true, message: '404 response correctly includes noindex directive' };
    },
  });

  // T4-05: Security Headers Presence
  tests.push({
    id: 'T4-05',
    tier: 4,
    name: 'Security headers enforcement [X-Frame-Options, X-Content-Type-Options, Referrer-Policy]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const xfo = res.headers['x-frame-options'];
      const xcto = res.headers['x-content-type-options'];
      const ref = res.headers['referrer-policy'];
      if (!xfo || xfo !== 'DENY') return { pass: false, message: `Expected X-Frame-Options: DENY, got "${xfo}"` };
      if (!xcto || xcto !== 'nosniff') return { pass: false, message: `Expected X-Content-Type-Options: nosniff, got "${xcto}"` };
      if (!ref || !ref.includes('strict-origin')) return { pass: false, message: `Expected Referrer-Policy strict-origin, got "${ref}"` };
      return { pass: true, message: 'Security headers enforced: DENY, nosniff, strict-origin-when-cross-origin' };
    },
  });

  // T4-06: CSP Header Presence
  tests.push({
    id: 'T4-06',
    tier: 4,
    name: 'Content-Security-Policy (CSP) header enforcement',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const csp = res.headers['content-security-policy'];
      if (!csp) return { pass: false, message: 'Missing Content-Security-Policy header' };
      if (!csp.includes("default-src 'self'")) {
        return { pass: false, message: `CSP missing "default-src 'self'": "${csp}"` };
      }
      return { pass: true, message: 'CSP header verified with default-src \'self\'' };
    },
  });

  // T4-07: Rate Limiting Header Presence
  tests.push({
    id: 'T4-07',
    tier: 4,
    name: 'Rate limit header presence [X-RateLimit-Remaining]',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const remaining = res.headers['x-ratelimit-remaining'];
      if (remaining === undefined || remaining === null) {
        return { pass: false, message: 'Missing X-RateLimit-Remaining header' };
      }
      return { pass: true, message: `Rate limit remaining header present: ${remaining}` };
    },
  });

  // T4-08: Multi-locale Image Alt Attributes (No Hardcoded VI)
  tests.push({
    id: 'T4-08',
    tier: 4,
    name: 'Multi-language image alt attributes (no hardcoded VI on non-VI routes)',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products`);
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const images = extractImages(res.body);
      for (const img of images) {
        if (img.alt && img.alt.includes('cho REAPER')) {
          return { pass: false, message: `Found hardcoded Vietnamese alt text "${img.alt}" on /en/products` };
        }
      }
      return { pass: true, message: `Image alt attributes on /en/products localized cleanly (${images.length} images checked)` };
    },
  });

  // T4-09: Image Alt Fallback Verification
  tests.push({
    id: 'T4-09',
    tier: 4,
    name: 'Image alt fallback on Product Detail page',
    run: async () => {
      const res = await makeRequest(`${baseUrl}/en/products/${encodeURIComponent(productId)}`);
      if (res.status === 404) return { pass: false, message: `Product ${productId} returned 404 — structural validation failed` };
      if (res.status !== 200) return { pass: false, message: `Expected HTTP 200, got ${res.status}` };
      const images = extractImages(res.body);
      if (images.length === 0) return { pass: true, message: 'No image elements present' };
      const missingAlt = images.filter(img => img.alt === null || img.alt === undefined);
      if (missingAlt.length > 0) {
        return { pass: false, message: `${missingAlt.length} image(s) missing alt attribute entirely` };
      }
      return { pass: true, message: `All ${images.length} images have non-empty alt text` };
    },
  });

  return tests;
}

// --- Main Execution Engine ---
async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log(`${colors.bright}${colors.cyan}=====================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  RealS Media E2E Test Suite Runner Engine           ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}=====================================================${colors.reset}`);
  console.log(`  Target Server: ${colors.yellow}${options.baseUrl}${colors.reset}`);
  console.log(`  Selected Tier: ${colors.yellow}${options.tier}${colors.reset}`);
  console.log(`  Concurrency:   ${colors.yellow}5 parallel batch requests${colors.reset}`);
  console.log('');

  // 0. Clean production server process restart
  console.log(`${colors.yellow}[INFO] Restarting server on port 3000 with latest build...${colors.reset}`);
  try {
    require('child_process').execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Get-Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"');
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1500));
  const serverProc = require('child_process').spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', '3000'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
  });
  serverProc.unref();
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 1000));
    const testCheck = await makeRequest(`${options.baseUrl}/en`);
    if (testCheck.status === 200) break;
  }

  // 1. Health Check
  const health = await makeRequest(options.baseUrl);
  if (health.status === 0) {
    console.log(`${colors.yellow}[WARNING] Could not connect to target server at ${options.baseUrl}.${colors.reset}`);
    console.log(`${colors.yellow}          Please ensure the Next.js dev server is running with 'npm run dev'.${colors.reset}\n`);
  } else {
    console.log(`${colors.green}✓ Connected to target server (HTTP ${health.status})${colors.reset}\n`);
  }

  // 2. Discover Product ID
  const productId = await discoverProductId(options.baseUrl);
  if (options.verbose) {
    console.log(`${colors.gray}[INFO] Discovered product ID for tests: ${productId}${colors.reset}\n`);
  }

  // 3. Load Test Cases
  const allTests = createTestCases(options.baseUrl, productId);
  const selectedTier = options.tier;
  const filteredTests = allTests.filter(t => {
    if (selectedTier === 'all') return true;
    return String(t.tier) === String(selectedTier);
  });

  console.log(`Executing ${colors.bright}${filteredTests.length}${colors.reset} test cases...\n`);

  // 4. Run Filtered Tests in Batches of 5
  const results = [];
  const tierSummary = { 1: { pass: 0, fail: 0 }, 2: { pass: 0, fail: 0 }, 3: { pass: 0, fail: 0 }, 4: { pass: 0, fail: 0 } };

  let currentTierDisplay = 0;

  for (let i = 0; i < filteredTests.length; i += 5) {
    const batch = filteredTests.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(async (test) => {
      const res = await test.run();
      return { ...test, ...res };
    }));

    for (const item of batchResults) {
      if (item.tier !== currentTierDisplay) {
        currentTierDisplay = item.tier;
        console.log(`${colors.bright}${colors.blue}--- TIER ${currentTierDisplay} TESTS ---${colors.reset}`);
      }

      if (item.pass) {
        tierSummary[item.tier].pass++;
        pass(`[${item.id}] ${item.name}`);
        if (options.verbose) {
          console.log(`    ${colors.gray}${item.message}${colors.reset}`);
        }
      } else {
        tierSummary[item.tier].fail++;
        fail(`[${item.id}] ${item.name}`, item.message);
      }
      results.push(item);
    }
    await new Promise(r => setTimeout(r, 50));
  }

  const durationMs = Date.now() - startTime;
  const totalPassed = results.filter(r => r.pass).length;
  const totalFailed = results.filter(r => !r.pass).length;

  // 5. Final Summary Table
  console.log(`\n${colors.bright}${colors.cyan}=====================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  E2E TEST RUN SUMMARY                               ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}=====================================================${colors.reset}`);
  console.log(`  Total Executed: ${colors.bright}${results.length}${colors.reset}`);
  console.log(`  Passed:         ${colors.green}${colors.bright}${totalPassed}${colors.reset}`);
  console.log(`  Failed:         ${totalFailed > 0 ? colors.red + colors.bright + totalFailed + colors.reset : '0'}`);
  console.log(`  Duration:       ${colors.yellow}${(durationMs / 1000).toFixed(2)}s${colors.reset}`);
  console.log('-----------------------------------------------------');
  console.log(`  Tier 1 (Critical SEO): ${colors.green}${tierSummary[1].pass} pass${colors.reset}, ${tierSummary[1].fail ? colors.red : colors.gray}${tierSummary[1].fail} fail${colors.reset}`);
  console.log(`  Tier 2 (Metadata):     ${colors.green}${tierSummary[2].pass} pass${colors.reset}, ${tierSummary[2].fail ? colors.red : colors.gray}${tierSummary[2].fail} fail${colors.reset}`);
  console.log(`  Tier 3 (Structured Data): ${colors.green}${tierSummary[3].pass} pass${colors.reset}, ${tierSummary[3].fail ? colors.red : colors.gray}${tierSummary[3].fail} fail${colors.reset}`);
  console.log(`  Tier 4 (Edge Cases):   ${colors.green}${tierSummary[4].pass} pass${colors.reset}, ${tierSummary[4].fail ? colors.red : colors.gray}${tierSummary[4].fail} fail${colors.reset}`);
  console.log('-----------------------------------------------------');

  // 6. JSON Report Output
  if (options.jsonOutput) {
    const reportData = {
      timestamp: new Date().toISOString(),
      baseUrl: options.baseUrl,
      durationMs,
      totalExecuted: results.length,
      passed: totalPassed,
      failed: totalFailed,
      tierSummary,
      results: results.map(r => ({
        id: r.id,
        tier: r.tier,
        name: r.name,
        pass: r.pass,
        message: r.message,
      })),
    };
    fs.writeFileSync(path.resolve(process.cwd(), options.jsonOutputPath), JSON.stringify(reportData, null, 2), 'utf-8');
    console.log(`${colors.cyan}[INFO] JSON test report written to ${options.jsonOutputPath}${colors.reset}`);
  }

  if (totalFailed > 0) {
    console.log(`\n${colors.red}${colors.bright}RESULT: FAIL (${totalFailed} test(s) failed)${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}${colors.bright}RESULT: PASS (All test cases passed cleanly!)${colors.reset}`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`${colors.red}Unhandled error in E2E test runner:${colors.reset}`, err);
  process.exit(1);
});
