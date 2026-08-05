import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

// POST /api/reports - Submit a report (any authenticated user)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const body = await req.json()
    const { type, targetId, reason, description } = body

    if (!type || !targetId || !reason) {
      return NextResponse.json({ error: 'Thiếu thông tin báo cáo' }, { status: 400 })
    }

    if (!['PRODUCT', 'USER', 'REVIEW'].includes(type)) {
      return NextResponse.json({ error: 'Loại báo cáo không hợp lệ' }, { status: 400 })
    }

    if (!['SPAM', 'INAPPROPRIATE', 'COPYRIGHT', 'OTHER'].includes(reason)) {
      return NextResponse.json({ error: 'Lý do không hợp lệ' }, { status: 400 })
    }

    // Check for duplicate report (same user, same target, still pending)
    const existing = await db.report.findFirst({
      where: {
        reporterId: (session.user as any).id,
        targetId,
        status: 'PENDING',
      },
    })
    if (existing) {
      return NextResponse.json({ error: 'Bạn đã báo cáo mục này và đang chờ xử lý' }, { status: 400 })
    }

    const report = await db.report.create({
      data: {
        type,
        targetId,
        reason,
        description: description || null,
        reporterId: (session.user as any).id,
      },
    })

    return NextResponse.json(report, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/reports] Error:', error)
    return NextResponse.json({ error: 'Lỗi gửi báo cáo' }, { status: 500 })
  }
}
