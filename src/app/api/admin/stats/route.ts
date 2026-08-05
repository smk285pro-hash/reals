import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

// GET /api/admin/stats - Dashboard statistics
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const [
      totalUsers, totalSellers, totalProducts, publishedProducts,
      pendingProducts, totalRevenue, recentUsers, recentProducts
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { isSeller: true } }),
      db.product.count(),
      db.product.count({ where: { published: true } }),
      db.product.count({ where: { reviewStatus: 'PENDING' } }),
      db.sellerApplication.count({ where: { status: 'PENDING' } }),
      db.product.aggregate({ _sum: { price: true }, where: { published: true } }),
      db.user.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, email: true, role: true, isSeller: true, createdAt: true } }),
      db.product.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { seller: { select: { name: true, email: true } } } }),
    ])

    return NextResponse.json({
      totalUsers,
      totalSellers,
      totalProducts,
      publishedProducts,
      pendingProducts,
      pendingApplications,
      totalRevenue: totalRevenue._sum.price || 0,
      recentUsers,
      recentProducts,
    })
  } catch (error: any) {
    console.error('[GET /api/admin/stats] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải thống kê' }, { status: 500 })
  }
}
