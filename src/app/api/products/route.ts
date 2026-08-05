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

// POST - Create new product
export async function POST(req: NextRequest) {
  const body = await req.json()

  // Find or create a default seller
  let sellerId = body.sellerId
  if (!sellerId) {
    const defaultSeller = await db.user.findFirst({ where: { isSeller: true } })
    if (!defaultSeller) {
      const newSeller = await db.user.create({
        data: { email: `seller${Date.now()}@reatube.com`, name: 'New Seller', isSeller: true },
      })
      sellerId = newSeller.id
    } else {
      sellerId = defaultSeller.id
    }
  }

  const product = await db.product.create({
    data: {
      title: body.title,
      description: body.description || '',
      price: body.price || 0,
      isFree: body.isFree || false,
      format: body.format || 'JSFX',
      categorySlug: body.categorySlug || 'jsfx',
      thumbnail: body.thumbnail || 'https://images.unsplash.com/photo-1598488035243-1a23a6e36919?w=640&h=360&fit=crop',
      duration: body.duration || null,
      tags: body.tags || '',
      featured: body.featured || false,
      published: body.published ?? true,
      sellerId,
    },
    include: { seller: { select: { id: true, name: true, avatar: true, isSeller: true } } },
  })

  return NextResponse.json(product, { status: 201 })
}
