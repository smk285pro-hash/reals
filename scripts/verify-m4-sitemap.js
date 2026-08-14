const http = require('http');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SUPPORTED_LOCALES = ['vi', 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'th', 'ru'];

async function main() {
  console.log('=== EMPIRICAL STRESS VERIFICATION FOR M4: SITEMAP & ROBOTS.TXT ===\n');

  // 1. Fetch /sitemap.xml from local server
  const xmlData = await new Promise((resolve, reject) => {
    http.get('http://localhost:3000/sitemap.xml', (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });

  if (xmlData.status !== 200) {
    console.error(`[FAIL] HTTP status for /sitemap.xml: expected 200, got ${xmlData.status}`);
    process.exit(1);
  }
  console.log(`[PASS] /sitemap.xml returned HTTP 200 (length: ${xmlData.body.length} bytes)`);

  const xml = xmlData.body;

  // Extract all <url> blocks
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  console.log(`Found ${urlBlocks.length} <url> blocks in XML sitemap.`);

  // Query DB for approved products
  const dbProducts = await prisma.product.findMany({
    where: { published: true, reviewStatus: 'APPROVED' },
    select: { id: true, updatedAt: true }
  });
  console.log(`Prisma DB approved products count: ${dbProducts.length}`);

  const expectedStaticCount = 11 * 2; // 11 locales * (Home + Products)
  const expectedDynamicCount = 11 * dbProducts.length;
  const expectedTotalCount = expectedStaticCount + expectedDynamicCount;

  console.log(`Expected URL entry count: ${expectedTotalCount}`);

  let failures = [];

  if (urlBlocks.length !== expectedTotalCount) {
    failures.push(`URL entry count mismatch: expected ${expectedTotalCount}, got ${urlBlocks.length}`);
  }

  // Parse each <url> block
  let validLocalesCount = 0;
  let validXDefaultCount = 0;
  let validPriorityCount = 0;
  let validLastModCount = 0;

  urlBlocks.forEach((block, idx) => {
    const locMatch = block.match(/<loc>(.*?)<\/loc>/);
    const loc = locMatch ? locMatch[1] : '';

    const priorityMatch = block.match(/<priority>(.*?)<\/priority>/);
    const priority = priorityMatch ? parseFloat(priorityMatch[1]) : null;

    const lastmodMatch = block.match(/<lastmod>(.*?)<\/lastmod>/);
    const lastmod = lastmodMatch ? lastmodMatch[1] : '';

    // Extract all xhtml:link hreflangs
    const hreflangMatches = [...block.matchAll(/hreflang="(.*?)"\s+href="(.*?)"/g)];
    const hreflangMap = {};
    hreflangMatches.forEach(m => {
      hreflangMap[m[1]] = m[2];
    });

    // Also check self-closing or different attr order
    const hreflangMatchesAlt = [...block.matchAll(/rel="alternate"\s+hreflang="(.*?)"\s+href="(.*?)"/g)];
    hreflangMatchesAlt.forEach(m => {
      hreflangMap[m[1]] = m[2];
    });

    // 1. Locales check in URL
    const isHome = loc.match(/^https:\/\/reals\.media\/([a-z]{2})$/);
    const isCatalog = loc.match(/^https:\/\/reals\.media\/([a-z]{2})\/products$/);
    const isProduct = loc.match(/^https:\/\/reals\.media\/([a-z]{2})\/products\/(.+)$/);

    if (isHome || isCatalog || isProduct) {
      const urlLocale = isHome ? isHome[1] : (isCatalog ? isCatalog[1] : isProduct[1]);
      if (SUPPORTED_LOCALES.includes(urlLocale)) {
        validLocalesCount++;
      } else {
        failures.push(`Block ${idx} URL locale '${urlLocale}' is not supported: ${loc}`);
      }
    } else {
      failures.push(`Block ${idx} URL format unrecognized: ${loc}`);
    }

    // 2. Priority check
    if (isHome && priority === 1.0) {
      validPriorityCount++;
    } else if (isCatalog && priority === 0.9) {
      validPriorityCount++;
    } else if (isProduct && priority === 0.8) {
      validPriorityCount++;
    } else {
      failures.push(`Block ${idx} priority violation for ${loc}: expected ${isHome ? 1.0 : (isCatalog ? 0.9 : 0.8)}, got ${priority}`);
    }

    // 3. x-default check
    const hasAllLocalesInHreflang = SUPPORTED_LOCALES.every(l => l in hreflangMap);
    const xDefault = hreflangMap['x-default'];
    const enHref = hreflangMap['en'];

    if (hasAllLocalesInHreflang && xDefault && enHref && xDefault === enHref && xDefault.includes('/en')) {
      validXDefaultCount++;
    } else {
      failures.push(`Block ${idx} x-default violation for ${loc}: x-default='${xDefault}', en='${enHref}', missingLocales=${SUPPORTED_LOCALES.filter(l => !(l in hreflangMap)).join(',')}`);
    }

    // 4. Timestamps check
    const d = new Date(lastmod);
    if (!isNaN(d.getTime())) {
      validLastModCount++;
    } else {
      failures.push(`Block ${idx} invalid ISO timestamp: '${lastmod}' in ${loc}`);
    }
  });

  console.log(`\nDetailed Check Results:`);
  console.log(`- Supported Locales in URLs: ${validLocalesCount} / ${urlBlocks.length}`);
  console.log(`- Strict Priorities (1.0 Home, 0.9 Catalog, 0.8 Product): ${validPriorityCount} / ${urlBlocks.length}`);
  console.log(`- Valid x-default -> 'en' Fallback: ${validXDefaultCount} / ${urlBlocks.length}`);
  console.log(`- Valid ISO Timestamps (lastmod): ${validLastModCount} / ${urlBlocks.length}`);

  // 5. Verify robots.txt
  const robotsData = await new Promise((resolve, reject) => {
    http.get('http://localhost:3000/robots.txt', (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });

  if (robotsData.status !== 200) {
    failures.push(`robots.txt returned status ${robotsData.status}`);
  } else {
    const r = robotsData.body;
    if (!r.includes('User-agent: *')) failures.push('robots.txt missing User-agent: *');
    if (!r.includes('Allow: /')) failures.push('robots.txt missing Allow: /');
    if (!r.includes('Disallow: /api/')) failures.push('robots.txt missing Disallow: /api/');
    if (!r.includes('Disallow: /admin/')) failures.push('robots.txt missing Disallow: /admin/');
    if (!r.includes('Disallow: /seller/')) failures.push('robots.txt missing Disallow: /seller/');
    if (!r.includes('Sitemap: https://reals.media/sitemap.xml')) failures.push('robots.txt missing sitemap.xml directive');
    if (r.includes('Disallow: /_next/') || r.includes('Disallow: /static/')) failures.push('robots.txt incorrectly disallows static assets');
    console.log('[PASS] robots.txt directives and asset access verified.');
  }

  await prisma.$disconnect();

  console.log('\n==================================================');
  if (failures.length === 0) {
    console.log('VERDICT: APPROVE');
    console.log('All 4 core requirements + robots.txt verified 100% PASS.');
    process.exit(0);
  } else {
    console.log('VERDICT: REJECT');
    console.log(`Detected ${failures.length} failure(s):`);
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
