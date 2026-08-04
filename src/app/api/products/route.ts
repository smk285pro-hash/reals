import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const category = url.searchParams.get('category')
  const search = url.searchParams.get('search')
  const sort = url.searchParams.get('sort') || 'latest'
  const free = url.searchParams.get('free')
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = parseInt(url.searchParams.get('limit') || '20')

  const where: Record<string, unknown> = { published: true }

  if (category && category !== 'all') {
    where.categorySlug = category
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { tags: { contains: search } },
      { format: { contains: search } },
    ]
  }

  if (free === 'true') {
    where.isFree = true
  }

  const orderBy: Record<string, string> = {}
  switch (sort) {
    case 'popular':
      orderBy.views = 'desc'
      break
    case 'price-asc':
      orderBy.price = 'asc'
      break
    case 'price-desc':
      orderBy.price = 'desc'
      break
    case 'rating':
      orderBy.rating = 'desc'
      break
    case 'best-selling':
      orderBy.sales = 'desc'
      break
    default:
      orderBy.createdAt = 'desc'
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { seller: { select: { id: true, name: true, avatar: true, isSeller: true } } },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.product.count({ where }),
  ])

  const categories = await db.category.findMany({ orderBy: { order: 'asc' } })

  return NextResponse.json({ products, total, page, limit, categories })
}
