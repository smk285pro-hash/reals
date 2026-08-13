import { cache } from 'react'
import { db } from '@/lib/db'

export const siteUrl = 'https://reals.media'

export const getPublishedProduct = cache(async (id: string) => {
  try {
    return await db.product.findFirst({
      where: {
        id,
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
          select: { rating: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })
  } catch (error) {
    console.error(`[product-seo] Could not load product ${id}`, error)
    return null
  }
})

export function productUrl(id: string) {
  return `${siteUrl}/products/${encodeURIComponent(id)}`
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
