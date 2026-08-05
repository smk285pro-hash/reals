import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

/**
 * GET /api/purchases
 *
 * Returns the list of products the current user owns (free downloads included).
 * Used by ProductDetail to show "Đã mua — Tải xuống" instead of buy button.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 })
    }

    const purchases = await db.purchase.findMany({
      where: { userId },
      select: {
        productId: true,
        price: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      purchases,
      ownedProductIds: purchases.map((p) => p.productId),
    })
  } catch (error: any) {
    console.error('[GET /api/purchases] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải danh sách mua hàng' }, { status: 500 })
  }
}
