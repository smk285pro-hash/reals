import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { locales } from '@/i18n/config'
import { languageAlternates, localizedUrl } from '@/i18n/seo'
import { localizedProductUrl } from '@/lib/product-seo'

export const revalidate = 300

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const routes: MetadataRoute.Sitemap = locales.flatMap((locale) => [
    {
      url: localizedUrl(locale),
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 1,
      alternates: { languages: languageAlternates('/') },
    },
    {
      url: localizedUrl(locale, '/products'),
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.9,
      alternates: { languages: languageAlternates('/products') },
    },
  ])

  try {
    const products = await db.product.findMany({
      where: {
        published: true,
        reviewStatus: 'APPROVED',
      },
      select: {
        id: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    routes.push(...products.flatMap((product) => locales.map((locale) => ({
      url: localizedProductUrl(locale, product.id),
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      alternates: { languages: languageAlternates(`/products/${encodeURIComponent(product.id)}`) },
    }))))
  } catch (error) {
    console.error('[sitemap] Could not load published products', error)
  }

  return routes
}
