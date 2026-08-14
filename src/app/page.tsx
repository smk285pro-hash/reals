import type { Metadata } from 'next'
import { headers, cookies } from 'next/headers'
import { db } from '@/lib/db'
import { defaultLocale, isLocale, localeCookie, localeHeader, type Locale } from '@/i18n/config'
import { localizedUrl, localizedAlternates, seoCopy, siteName, openGraphImage, localeTags, alternateLocaleTags } from '@/i18n/seo'
import { localizedProductUrl } from '@/lib/product-seo'
import { ClientHomePage } from '@/components/home/ClientHomePage'
import type { Product, Category } from '@/types'

export const revalidate = 300

async function getRequestLocale(): Promise<Locale> {
  const headerStore = await headers()
  const cookieStore = await cookies()
  const headerValue = headerStore.get(localeHeader)
  const cookieValue = cookieStore.get(localeCookie)?.value

  if (isLocale(headerValue)) return headerValue
  if (isLocale(cookieValue)) return cookieValue
  return defaultLocale
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const copy = seoCopy(locale)
  const canonical = localizedUrl(locale, '/')

  return {
    title: copy.homeTitle,
    description: copy.homeDescription,
    alternates: localizedAlternates(locale, '/'),
    openGraph: {
      type: 'website',
      url: canonical,
      title: copy.homeTitle,
      description: copy.homeDescription,
      siteName,
      locale: localeTags[locale],
      alternateLocale: alternateLocaleTags(locale),
      images: [{ url: openGraphImage, width: 1200, height: 630, alt: 'RealS — REAPER plugins and scripts marketplace' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.homeTitle,
      description: copy.homeDescription,
      images: [openGraphImage],
    },
  }
}

export default async function HomePage() {
  const locale = await getRequestLocale()
  const copy = seoCopy(locale)
  const homeUrl = localizedUrl(locale, '/')

  const [dbProducts, dbCategories, totalCount] = await Promise.all([
    db.product.findMany({
      where: {
        published: true,
        reviewStatus: 'APPROVED',
      },
      include: {
        seller: {
          select: { id: true, name: true, image: true, avatar: true, isSeller: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch((err) => {
      console.error('[HomePage RSC] Error fetching products:', err)
      return []
    }),
    db.category.findMany({
      orderBy: { order: 'asc' },
    }).catch((err) => {
      console.error('[HomePage RSC] Error fetching categories:', err)
      return []
    }),
    db.product.count({
      where: {
        published: true,
        reviewStatus: 'APPROVED',
      },
    }).catch((err) => {
      console.error('[HomePage RSC] Error counting products:', err)
      return 0
    }),
  ])

  // Serialize dates for RSC -> Client Component prop passing
  const initialProducts: Product[] = JSON.parse(JSON.stringify(dbProducts))
  const initialCategories: Category[] = JSON.parse(JSON.stringify(dbCategories))

  // Structured Data Schemas
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.homeTitle,
    description: copy.homeDescription,
    url: homeUrl,
    inLanguage: locale,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: totalCount,
      itemListElement: initialProducts.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: product.title,
        url: localizedProductUrl(locale, product.id),
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd).replace(/</g, '\\u003c') }}
      />

      <ClientHomePage
        initialProducts={initialProducts}
        initialCategories={initialCategories}
        initialTotal={totalCount}
        locale={locale}
      />
    </>
  )
}
