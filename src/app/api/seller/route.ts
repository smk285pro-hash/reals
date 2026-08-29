import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

// GET products for the currently logged-in seller (own channel)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    }

    // Verify the user is still a seller (prevents access after downgrade)
    const user = await db.user.findUnique({ where: { id: userId }, select: { isSeller: true } })
    if (!user?.isSeller) {
      return NextResponse.json({ error: 'Bạn không còn quyền seller. Vui lòng liên hệ admin.' }, { status: 403 })
    }

    // Get only this user's products (including unpublished)
    const [products, total, categories] = await Promise.all([
      db.product.findMany({
        where: { sellerId: userId },
        include: { seller: { select: { id: true, name: true, image: true, avatar: true, isSeller: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.product.count({ where: { sellerId: userId } }),
      db.category.findMany({ orderBy: { order: 'asc' } }),
    ])

    return NextResponse.json({ products, total, categories })
  } catch (error: any) {
    console.error('[GET /api/seller] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải sản phẩm' }, { status: 500 })
  }
}
