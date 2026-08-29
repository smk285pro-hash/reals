import { cache } from 'react'
import { db } from '@/lib/db'
import type { Locale } from '@/i18n/config'
import { localizedUrl, siteUrl } from '@/i18n/seo'

export { siteUrl }

export const getPublishedProduct = cache(async (token: string) => {
  try {
    return await db.product.findFirst({
      where: {
        // Public URLs use the slug, but old CUID links keep resolving.
        OR: [{ slug: token }, { id: token }],
        published: true,
        reviewStatus: 'APPROVED',
      },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            image: true,
            avatar: true,
            isSeller: true,
          },
        },
        reviews: {
          select: {
            rating: true,
            comment: true,
            createdAt: true,
            user: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { reviews: true },
        },
      },
    })
  } catch (error) {
    console.error(`[product-seo] Could not load product ${token}`, error)
    return null
  }
})

/** Public URL token for a product: the human-readable slug, falling back to the id. */
export function productToken(product: { slug: string | null; id: string }): string {
  return product.slug || product.id
}

export function productUrl(token: string) {
  return `${siteUrl}/products/${encodeURIComponent(token)}`
}

export function localizedProductUrl(locale: Locale, token: string) {
  return localizedUrl(locale, `/products/${encodeURIComponent(token)}`)
}

export function absoluteAssetUrl(value: string | null | undefined) {
  if (!value) return undefined

  try {
    return new URL(value, siteUrl).toString()
  } catch {
    return undefined
  }
}

export function plainText(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function metaDescription(value: string, fallback: string) {
  const text = plainText(value) || fallback
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text
}
