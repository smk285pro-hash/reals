import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET all products for seller management (including unpublished)
export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const sellerId = url.searchParams.get('sellerId')

  const where: Record<string, unknown> = {}
  if (sellerId) where.sellerId = sellerId

  const [products, total, categories] = await Promise.all([
    db.product.findMany({
      where,
      include: { seller: { select: { id: true, name: true, avatar: true, isSeller: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.product.count({ where }),
    db.category.findMany({ orderBy: { order: 'asc' } }),
  ])

  return NextResponse.json({ products, total, categories })
}
