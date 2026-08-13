import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { productUrl, siteUrl } from '@/lib/product-seo'

export const revalidate = 300

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/products`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

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

    routes.push(...products.map((product) => ({
      url: productUrl(product.id),
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })))
  } catch (error) {
    console.error('[sitemap] Could not load published products', error)
  }

  return routes
}
