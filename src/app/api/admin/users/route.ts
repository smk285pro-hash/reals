import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

// GET /api/admin/users - List all users with pagination
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const url = req.nextUrl
    const search = url.searchParams.get('search') || ''
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')

    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, role: true, isSeller: true,
          image: true, avatar: true, bio: true, createdAt: true,
          _count: { select: { products: true, reviews: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ])

    return NextResponse.json({ users, total, page, limit })
  } catch (error: any) {
    console.error('[GET /api/admin/users] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải danh sách user' }, { status: 500 })
  }
}

// PUT /api/admin/users - Update user role/status
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const body = await req.json()
    const { id, role, isSeller } = body

    if (!id) {
      return NextResponse.json({ error: 'Thiếu user ID' }, { status: 400 })
    }

    // Prevent admin from demoting themselves
    if (id === (session.user as any).id && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không thể tự hạ quyền admin' }, { status: 400 })
    }

    const data: any = {}
    if (role) data.role = role
    if (typeof isSeller === 'boolean') data.isSeller = isSeller

    const user = await db.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, isSeller: true },
    })

    return NextResponse.json(user)
  } catch (error: any) {
    console.error('[PUT /api/admin/users] Error:', error)
    return NextResponse.json({ error: 'Lỗi cập nhật user' }, { status: 500 })
  }
}

// DELETE /api/admin/users - Delete user
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Thiếu user ID' }, { status: 400 })
    if (id === (session.user as any).id) {
      return NextResponse.json({ error: 'Không thể xóa chính mình' }, { status: 400 })
    }

    // Delete user (cascade will handle products, reviews, sessions, accounts)
    await db.user.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/admin/users] Error:', error)
    return NextResponse.json({ error: 'Lỗi xóa user' }, { status: 500 })
  }
}
