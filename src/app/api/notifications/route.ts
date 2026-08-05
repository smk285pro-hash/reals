import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

// GET /api/notifications — List current user's notifications
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User không tồn tại' }, { status: 404 })
    }

    const url = req.nextUrl
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const unreadOnly = url.searchParams.get('unread') === 'true'

    const where: any = { userId: user.id }
    if (unreadOnly) where.read = false

    const [notifications, unreadCount, totalCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.notification.count({ where: { userId: user.id, read: false } }),
      db.notification.count({ where: { userId: user.id } }),
    ])

    return NextResponse.json({
      notifications,
      unreadCount,
      totalCount,
      page,
      limit,
    })
  } catch (error: any) {
    console.error('[GET /api/notifications] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải thông báo' }, { status: 500 })
  }
}

// PUT /api/notifications — Mark as read (single or all)
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User không tồn tại' }, { status: 404 })
    }

    const body = await req.json()
    const { id, markAll } = body

    if (markAll) {
      // Mark all as read
      await db.notification.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
      })
      return NextResponse.json({ success: true, message: 'Đã đánh dấu tất cả đã đọc' })
    }

    if (!id) {
      return NextResponse.json({ error: 'Thiếu notification ID' }, { status: 400 })
    }

    // Mark single as read
    const notification = await db.notification.update({
      where: { id },
      data: { read: true },
    })

    return NextResponse.json(notification)
  } catch (error: any) {
    console.error('[PUT /api/notifications] Error:', error)
    return NextResponse.json({ error: 'Lỗi cập nhật thông báo' }, { status: 500 })
  }
}

// DELETE /api/notifications — Delete a notification
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User không tồn tại' }, { status: 404 })
    }

    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'Thiếu notification ID' }, { status: 400 })
    }

    await db.notification.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/notifications] Error:', error)
    return NextResponse.json({ error: 'Lỗi xóa thông báo' }, { status: 500 })
  }
}
