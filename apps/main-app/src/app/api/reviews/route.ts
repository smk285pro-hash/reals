import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'
import { notifyNewReview } from '@/lib/notifications'

// POST /api/reviews — Submit a review for a product
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    }

    const body = await req.json()
    const { productId, rating, comment } = body

    if (!productId) {
      return NextResponse.json({ error: 'Thiếu sản phẩm ID' }, { status: 400 })
    }
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Đánh giá phải từ 1 đến 5 sao' }, { status: 400 })
    }
    if (!comment?.trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập nhận xét' }, { status: 400 })
    }

    // Verify product exists and is published
    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) {
      return NextResponse.json({ error: 'Không tìm thấy sản phẩm' }, { status: 404 })
    }
    if (!product.published) {
      return NextResponse.json({ error: 'Không thể đánh giá sản phẩm chưa xuất bản' }, { status: 400 })
    }

    // Prevent seller from reviewing their own product
    if (product.sellerId === userId) {
      return NextResponse.json({ error: 'Không thể đánh giá sản phẩm của chính mình' }, { status: 400 })
    }

    // Check for existing review (one per user per product)
    const existing = await db.review.findFirst({
      where: { productId, userId },
    })
    if (existing) {
      // Update existing review instead
      const updated = await db.review.update({
        where: { id: existing.id },
        data: { rating, comment: comment.trim() },
      })
      return NextResponse.json({ review: updated, message: 'Đã cập nhật đánh giá' })
    }

    // Create review
    const review = await db.review.create({
      data: {
        productId,
        userId,
        rating,
        comment: comment.trim(),
      },
    })

    // Update product rating (average)
    const allReviews = await db.review.findMany({
      where: { productId },
      select: { rating: true },
    })
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
    await db.product.update({
      where: { id: productId },
      data: { rating: Math.round(avgRating * 10) / 10 },
    })

    // Notify seller about new review
    await notifyNewReview(product.sellerId, product.title, rating)

    return NextResponse.json({ review, message: 'Đã gửi đánh giá' }, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/reviews] Error:', error)
    return NextResponse.json({ error: 'Lỗi gửi đánh giá' }, { status: 500 })
  }
}

// GET /api/reviews?productId=xxx — Get reviews for a product
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const productId = url.searchParams.get('productId')
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '10')

    if (!productId) {
      return NextResponse.json({ error: 'Thiếu sản phẩm ID' }, { status: 400 })
    }

    const [reviews, total] = await Promise.all([
      db.review.findMany({
        where: { productId },
        include: {
          user: { select: { id: true, name: true, image: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.review.count({ where: { productId } }),
    ])

    return NextResponse.json({ reviews, total, page, limit })
  } catch (error: any) {
    console.error('[GET /api/reviews] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải đánh giá' }, { status: 500 })
  }
}
