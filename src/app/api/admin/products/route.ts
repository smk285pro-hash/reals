import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'
import { notifyProductApproved, notifyProductRejected } from '@/lib/notifications'

// GET /api/admin/products - All products (with review status filter)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const url = req.nextUrl
    const status = url.searchParams.get('status') // PENDING, APPROVED, REJECTED, ALL
    const search = url.searchParams.get('search') || ''
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')

    const where: any = {}
    if (status && status !== 'ALL') {
      where.reviewStatus = status
    }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { tags: { contains: search } },
      ]
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: { seller: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ])

    return NextResponse.json({ products, total, page, limit })
  } catch (error: any) {
    console.error('[GET /api/admin/products] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải sản phẩm' }, { status: 500 })
  }
}

// PUT /api/admin/products - Review product (approve/reject)
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const body = await req.json()
    const { id, reviewStatus, reviewNote, published, featured } = body

    if (!id) return NextResponse.json({ error: 'Thiếu product ID' }, { status: 400 })

    const data: any = {}
    if (reviewStatus) {
      if (!['PENDING', 'APPROVED', 'REJECTED'].includes(reviewStatus)) {
        return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
      }
      data.reviewStatus = reviewStatus
      // Auto-publish when approved
      if (reviewStatus === 'APPROVED') data.published = true
    }
    if (reviewNote !== undefined) data.reviewNote = reviewNote
    if (typeof published === 'boolean') data.published = published
    if (typeof featured === 'boolean') data.featured = featured

    const product = await db.product.update({
      where: { id },
      data,
      include: { seller: { select: { id: true, name: true, email: true } } },
    })

    // Notify seller about product review decision
    if (reviewStatus === 'APPROVED') {
      await notifyProductApproved(product.sellerId, product.title)
    } else if (reviewStatus === 'REJECTED') {
      await notifyProductRejected(product.sellerId, product.title, reviewNote || undefined)
    }

    return NextResponse.json(product)
  } catch (error: any) {
    console.error('[PUT /api/admin/products] Error:', error)
    return NextResponse.json({ error: 'Lỗi cập nhật sản phẩm' }, { status: 500 })
  }
}

// DELETE /api/admin/products - Delete any product (admin override)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Thiếu product ID' }, { status: 400 })

    await db.review.deleteMany({ where: { productId: id } })
    await db.product.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/admin/products] Error:', error)
    return NextResponse.json({ error: 'Lỗi xóa sản phẩm' }, { status: 500 })
  }
}
