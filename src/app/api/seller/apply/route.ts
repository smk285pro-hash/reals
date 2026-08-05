import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// POST /api/seller/apply — Submit seller application
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const body = await req.json()
    const { displayName, bio, portfolioUrl, categories, reason } = body

    if (!displayName?.trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập tên gian hàng' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 })
    }

    // Already a seller? No need to apply
    if (user.isSeller) {
      return NextResponse.json({ error: 'Bạn đã là seller rồi' }, { status: 400 })
    }

    // Check for existing application
    const existing = await db.sellerApplication.findUnique({ where: { userId: user.id } })
    if (existing) {
      if (existing.status === 'PENDING') {
        return NextResponse.json({ error: 'Bạn đã gửi đơn đăng ký, đang chờ duyệt' }, { status: 400 })
      }
      if (existing.status === 'APPROVED') {
        return NextResponse.json({ error: 'Đơn đăng ký đã được duyệt' }, { status: 400 })
      }
      // If REJECTED, allow re-application by updating
      const updated = await db.sellerApplication.update({
        where: { userId: user.id },
        data: {
          displayName: displayName.trim(),
          bio: bio?.trim() || null,
          portfolioUrl: portfolioUrl?.trim() || null,
          categories: categories?.trim() || null,
          reason: reason?.trim() || null,
          status: 'PENDING',
          adminNote: null,
          reviewedAt: null,
        },
      })
      return NextResponse.json({ application: updated, message: 'Đã gửi lại đơn đăng ký' })
    }

    const application = await db.sellerApplication.create({
      data: {
        userId: user.id,
        displayName: displayName.trim(),
        bio: bio?.trim() || null,
        portfolioUrl: portfolioUrl?.trim() || null,
        categories: categories?.trim() || null,
        reason: reason?.trim() || null,
      },
    })

    return NextResponse.json({ application, message: 'Đã gửi đơn đăng ký seller thành công' })
  } catch (error: any) {
    console.error('[Seller Apply] Error:', error)
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}

// GET /api/seller/apply — Check current user's application status
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: { sellerApplication: true },
    })

    return NextResponse.json({
      isSeller: user?.isSeller || false,
      application: user?.sellerApplication || null,
    })
  } catch (error: any) {
    console.error('[Seller Apply] Error:', error)
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}
