import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET /api/admin/applications — List seller applications
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') // PENDING, APPROVED, REJECTED, or all

    const where = status && status !== 'ALL' ? { status } : {}

    const applications = await db.sellerApplication.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            avatar: true,
            isSeller: true,
            createdAt: true,
            _count: { select: { products: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Count by status
    const counts = await db.sellerApplication.groupBy({
      by: ['status'],
      _count: true,
    })

    const statusCounts = {
      PENDING: counts.find(c => c.status === 'PENDING')?._count || 0,
      APPROVED: counts.find(c => c.status === 'APPROVED')?._count || 0,
      REJECTED: counts.find(c => c.status === 'REJECTED')?._count || 0,
    }

    return NextResponse.json({ applications, counts: statusCounts })
  } catch (error: any) {
    console.error('[Admin Applications] Error:', error)
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}

// PUT /api/admin/applications — Approve or reject
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const admin = await db.user.findUnique({ where: { email: session.user.email } })
    if (admin?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const body = await req.json()
    const { id, status, adminNote } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })
    }

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Status phải là APPROVED hoặc REJECTED' }, { status: 400 })
    }

    const application = await db.sellerApplication.findUnique({
      where: { id },
      include: { user: true },
    })

    if (!application) {
      return NextResponse.json({ error: 'Không tìm thấy đơn đăng ký' }, { status: 404 })
    }

    if (application.status !== 'PENDING') {
      return NextResponse.json({ error: 'Đơn đăng ký đã được xử lý' }, { status: 400 })
    }

    // Update application
    const updated = await db.sellerApplication.update({
      where: { id },
      data: {
        status,
        adminNote: adminNote?.trim() || null,
        reviewedAt: new Date(),
      },
    })

    // If approved, promote user to seller
    if (status === 'APPROVED') {
      await db.user.update({
        where: { id: application.userId },
        data: {
          isSeller: true,
          role: application.user.role === 'USER' ? 'SELLER' : application.user.role,
          name: application.displayName, // Use their chosen shop name
        },
      })
    }

    return NextResponse.json({
      application: updated,
      message: status === 'APPROVED'
        ? 'Đã duyệt đơn đăng ký seller'
        : 'Đã từ chối đơn đăng ký seller',
    })
  } catch (error: any) {
    console.error('[Admin Applications] Error:', error)
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}
