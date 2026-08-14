import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { defaultLocale, isLocale, localeHeader } from '@/i18n/config'
import { alternateLocaleTags, localeTags, localizedAlternates, localizedUrl, openGraphImage, seoCopy, siteName } from '@/i18n/seo'
import { localizedProductUrl, metaDescription } from '@/lib/product-seo'

export const revalidate = 300

async function requestLocale() {
  const value = (await headers()).get(localeHeader)
  return isLocale(value) ? value : defaultLocale
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale()
  const copy = seoCopy(locale)
  const canonical = localizedUrl(locale, '/products')

  return {
    title: copy.productsTitle,
    description: copy.productsDescription,
    keywords: ['REAPER', 'JSFX', 'ReaScript', 'REAPER plugins', 'REAPER templates', 'audio plugins'],
    alternates: localizedAlternates(locale, '/products'),
    openGraph: {
      type: 'website',
      url: canonical,
      title: `${copy.productsTitle} | RealS`,
      description: copy.productsDescription,
      siteName,
      locale: localeTags[locale],
      alternateLocale: alternateLocaleTags(locale),
      images: [{ url: openGraphImage, width: 1200, height: 630, alt: copy.productsHeading }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${copy.productsTitle} | RealS`,
      description: copy.productsDescription,
      images: [openGraphImage],
    },
  }
}

export default async function ProductsPage() {
  const locale = await requestLocale()
  const copy = seoCopy(locale)
  const homeUrl = localizedUrl(locale)
  const productsUrl = localizedUrl(locale, '/products')
  const products = await db.product.findMany({
    where: {
      published: true,
      reviewStatus: 'APPROVED',
    },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnail: true,
      format: true,
      categorySlug: true,
      isFree: true,
      price: true,
      updatedAt: true,
      seller: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  }).catch((error) => {
    console.error('[products] Could not load published products', error)
    return []
  })

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.productsHeading,
    description: copy.productsDescription,
    url: productsUrl,
    inLanguage: locale,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: product.title,
        url: localizedProductUrl(locale, product.id),
      })),
    },
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] px-4 py-8 text-[#f1f1f1] sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd).replace(/</g, '\\u003c') }}
      />
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href={homeUrl} className="text-sm text-[#f5a623] hover:text-[#ffc15b]">RealS</Link>
            <h1 className="mt-2 text-3xl font-bold text-white">{copy.productsHeading}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aaa]">
              {copy.productsDescription}
            </p>
          </div>
          <Link href={homeUrl} className="rounded-full border border-[#303030] bg-[#181818] px-4 py-2 text-sm hover:bg-[#272727]">
            {copy.backHome}
          </Link>
        </header>

        {products.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const isFree = product.isFree || product.price <= 0
              return (
                <article key={product.id} className="overflow-hidden rounded-xl border border-[#303030] bg-[#181818]">
                  <Link href={`/${locale}/products/${encodeURIComponent(product.id)}`} className="block h-full hover:bg-[#202020]">
                    <div className="aspect-video bg-black">
                      {product.thumbnail ? (
                        <img
                          src={product.thumbnail}
                          alt={`${product.title} — ${product.format} ${copy.forReaper}`}
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-[#666]">RealS</div>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded bg-[#3ea6ff]/10 px-2 py-1 text-[#3ea6ff]">{product.format}</span>
                        <span className="rounded bg-[#272727] px-2 py-1 text-[#aaa]">{product.categorySlug}</span>
                      </div>
                      <h2 className="line-clamp-2 text-base font-semibold text-white">{product.title}</h2>
                      <p className="line-clamp-3 text-sm leading-6 text-[#aaa]">
                        {metaDescription(product.description, `${product.title} for REAPER`)}
                      </p>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-[#888]">{product.seller.name || copy.seller}</span>
                        <strong className={isFree ? 'text-[#3fb950]' : 'text-[#f5a623]'}>
                          {isFree ? copy.free : `$${product.price.toFixed(2)}`}
                        </strong>
                      </div>
                    </div>
                  </Link>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-[#303030] bg-[#181818] p-8 text-center text-[#aaa]">
            {copy.productsEmpty}
          </p>
        )}
      </div>
    </main>
  )
}
