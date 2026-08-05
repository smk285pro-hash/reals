import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

// GET single product by ID (public)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const product = await db.product.findUnique({
    where: { id },
    include: { seller: { select: { id: true, name: true, image: true, avatar: true, isSeller: true } } },
  })
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(product)
}

// PUT - Update product (only by owner)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { id } = await params
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    }

    // Check ownership
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy sản phẩm' }, { status: 404 })
    }
    if (existing.sellerId !== userId) {
      return NextResponse.json({ error: 'Bạn không có quyền sửa sản phẩm này' }, { status: 403 })
    }

    const body = await req.json()

    // Verify category if changed
    if (body.categorySlug) {
      const catExists = await db.category.findUnique({ where: { slug: body.categorySlug } })
      if (!catExists) {
        return NextResponse.json({ error: `Danh mục "${body.categorySlug}" không tồn tại` }, { status: 400 })
      }
    }

    const product = await db.product.update({
      where: { id },
      data: {
        title: body.title?.trim(),
        description: body.description,
        price: body.price,
        isFree: body.isFree,
        format: body.format,
        categorySlug: body.categorySlug,
        thumbnail: body.thumbnail,
        videoUrl: body.videoUrl,
        duration: body.duration,
        tags: body.tags,
        featured: body.featured,
        // Only allow seller to set reviewStatus back to PENDING (re-submit)
        // They cannot set it to APPROVED directly
        ...(body.reviewStatus === 'PENDING' && existing.reviewStatus === 'REJECTED'
          ? { reviewStatus: 'PENDING', reviewNote: null, published: false }
          : {}),
      },
    })

    return NextResponse.json(product)
  } catch (error: any) {
    console.error('[PUT /api/products/id] Error:', error)
    return NextResponse.json({ error: 'Lỗi cập nhật sản phẩm' }, { status: 500 })
  }
}

// DELETE product (only by owner)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { id } = await params
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    }

    // Check ownership
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy sản phẩm' }, { status: 404 })
    }
    if (existing.sellerId !== userId) {
      return NextResponse.json({ error: 'Bạn không có quyền xóa sản phẩm này' }, { status: 403 })
    }

    // Delete reviews first, then product
    await db.review.deleteMany({ where: { productId: id } })
    await db.product.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/products/id] Error:', error)
    return NextResponse.json({ error: 'Lỗi xóa sản phẩm' }, { status: 500 })
  }
}
