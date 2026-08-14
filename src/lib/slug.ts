import { db } from '@/lib/db'

/**
 * Convert an arbitrary product title into a URL-safe slug.
 * Strips Vietnamese diacritics (including đ/Đ), lowercases and collapses
 * every non-alphanumeric run into a single hyphen.
 */
export function slugify(value: string): string {
  const base = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
  return base || 'product'
}

/**
 * Generate a Product slug that does not collide with an existing row.
 * Pass `seed` (e.g. the product id) to get a deterministic suffix on
 * collision; without it a time-based suffix is used for new products.
 */
export async function generateUniqueProductSlug(title: string, seed?: string): Promise<string> {
  const base = slugify(title)
  const taken = await db.product.findFirst({ where: { slug: base }, select: { id: true } })
  if (!taken) return base
  const suffix = seed ? seed.slice(-6) : Date.now().toString(36).slice(-6)
  return `${base}-${suffix}`
}
