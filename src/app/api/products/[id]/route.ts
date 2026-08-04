import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET single product by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const product = await db.product.findUnique({
    where: { id },
    include: { seller: { select: { id: true, name: true, avatar: true, isSeller: true } } },
  })
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(product)
}

// PUT - Update product
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const product = await db.product.update({
    where: { id },
    data: {
      title: body.title,
      description: body.description,
      price: body.price,
      isFree: body.isFree,
      format: body.format,
      categorySlug: body.categorySlug,
      thumbnail: body.thumbnail,
      duration: body.duration,
      tags: body.tags,
      featured: body.featured,
      published: body.published,
    },
  })

  return NextResponse.json(product)
}

// DELETE product
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  await db.review.deleteMany({ where: { productId: id } })
  await db.product.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
