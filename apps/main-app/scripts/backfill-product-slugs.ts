// One-shot backfill: give every product a URL slug derived from its title.
// Run with: npx tsx scripts/backfill-product-slugs.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

function slugify(value: string): string {
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

async function main() {
  const products = await db.product.findMany({
    select: { id: true, title: true, slug: true },
  })
  const taken = new Set(products.map((p) => p.slug).filter((s): s is string => !!s))
  let updated = 0

  for (const product of products) {
    if (product.slug) continue
    let slug = slugify(product.title)
    // Title collisions get a deterministic suffix from the product id.
    let guard = 0
    while (taken.has(slug) && guard < 5) {
      guard += 1
      slug = `${slugify(product.title)}-${product.id.slice(-(5 + guard))}`
    }
    await db.product.update({ where: { id: product.id }, data: { slug } })
    taken.add(slug)
    updated += 1
    console.log(`${product.id} -> ${slug}`)
  }

  console.log(`Done: ${updated} product(s) updated`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
