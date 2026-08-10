import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

// GET /api/admin/analytics - Detailed analytics data
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const url = req.nextUrl
    const range = url.searchParams.get('range') || '30d' // 7d, 30d, 90d, all

    // Calculate date filter
    const now = new Date()
    let since: Date | undefined
    if (range === '7d') since = new Date(now.getTime() - 7 * 86400000)
    else if (range === '30d') since = new Date(now.getTime() - 30 * 86400000)
    else if (range === '90d') since = new Date(now.getTime() - 90 * 86400000)
    // 'all' = no filter

    const dateFilter = since ? { createdAt: { gte: since } } : {}

    // Parallel queries for performance
    const [
      usersByRole,
      newUsers,
      productsByStatus,
      productsByCategory,
      topSellers,
      topProducts,
      reportsByStatus,
      reportsByType,
      revenueByFormat,
      recentActivity,
      pageViews,
      productViews,
      uniqueVisitors,
      topPages,
      trafficByDevice,
      trafficByBrowser,
      trafficByCountry,
      trafficByReferrer,
      dailyTraffic,
    ] = await Promise.all([
      // Users by role
      db.user.groupBy({ by: ['role'], _count: true }),

      // New users in period
      db.user.count({ where: dateFilter }),

      // Products by review status
      db.product.groupBy({ by: ['reviewStatus'], _count: true }),

      // Products by category
      db.product.groupBy({ by: ['categorySlug'], _count: true, orderBy: { _count: { categorySlug: 'desc' } } }),

      // Top sellers (by product count)
      db.user.findMany({
        where: { isSeller: true },
        select: {
          id: true, name: true, email: true, avatar: true,
          _count: { select: { products: true } },
          products: { select: { sales: true }, where: { published: true } },
        },
        orderBy: { products: { _count: 'desc' } },
        take: 10,
      }),

      // Top products (by sales)
      db.product.findMany({
        where: { published: true, ...dateFilter },
        select: {
          id: true, title: true, price: true, sales: true, views: true, rating: true,
          categorySlug: true,
          seller: { select: { name: true } },
        },
        orderBy: { sales: 'desc' },
        take: 10,
      }),

      // Reports by status
      db.report.groupBy({ by: ['status'], _count: true }),

      // Reports by type
      db.report.groupBy({ by: ['type'], _count: true }),

      // Revenue by format
      db.product.groupBy({
        by: ['format'],
        _sum: { price: true, sales: true },
        _count: true,
        where: { published: true },
      }),

      // Recent activity (last 20 actions)
      Promise.all([
        db.user.findMany({
          take: 5, orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, email: true, createdAt: true },
        }).then(users => users.map(u => ({ type: 'USER_REGISTER', ...u }))),
        db.product.findMany({
          take: 5, orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, createdAt: true, seller: { select: { name: true } } },
        }).then(products => products.map(p => ({ type: 'PRODUCT_CREATED', ...p }))),
        db.report.findMany({
          take: 5, orderBy: { createdAt: 'desc' },
          include: { reporter: { select: { name: true } } },
        }).then(reports => reports.map(r => ({ type: 'REPORT_SUBMITTED', id: r.id, createdAt: r.createdAt, reason: r.reason, reporterName: r.reporter.name }))),
      ]).then(arrays => arrays.flat().sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15)),

      db.analyticsEvent.count({ where: { eventType: 'PAGE_VIEW', ...dateFilter } }),
      db.analyticsEvent.count({ where: { eventType: 'PRODUCT_VIEW', ...dateFilter } }),
      db.analyticsEvent.findMany({ where: dateFilter, distinct: ['visitorId'], select: { visitorId: true } }),
      db.analyticsEvent.groupBy({ by: ['path'], where: { eventType: 'PAGE_VIEW', ...dateFilter }, _count: true, orderBy: { _count: { path: 'desc' } }, take: 10 }),
      db.analyticsEvent.groupBy({ by: ['device'], where: { eventType: 'PAGE_VIEW', ...dateFilter }, _count: true, orderBy: { _count: { device: 'desc' } } }),
      db.analyticsEvent.groupBy({ by: ['browser'], where: { eventType: 'PAGE_VIEW', ...dateFilter }, _count: true, orderBy: { _count: { browser: 'desc' } } }),
      db.analyticsEvent.groupBy({ by: ['country'], where: { eventType: 'PAGE_VIEW', ...dateFilter }, _count: true, orderBy: { _count: { country: 'desc' } }, take: 10 }),
      db.analyticsEvent.groupBy({ by: ['referrer'], where: { eventType: 'PAGE_VIEW', ...dateFilter }, _count: true, orderBy: { _count: { referrer: 'desc' } }, take: 10 }),
      db.analyticsEvent.findMany({ where: { eventType: 'PAGE_VIEW', ...dateFilter }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
    ])

    // Process top sellers - calculate total sales
    const processedSellers = topSellers.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      avatar: s.avatar,
      productCount: s._count.products,
      totalSales: s.products.reduce((sum, p) => sum + p.sales, 0),
    })).sort((a, b) => b.totalSales - a.totalSales)

    return NextResponse.json({
      range,
      usersByRole,
      newUsers,
      productsByStatus,
      productsByCategory,
      topSellers: processedSellers,
      topProducts,
      reportsByStatus,
      reportsByType,
      revenueByFormat,
      recentActivity,
      traffic: {
        pageViews,
        productViews,
        uniqueVisitors: uniqueVisitors.length,
        topPages,
        byDevice: trafficByDevice,
        byBrowser: trafficByBrowser,
        byCountry: trafficByCountry,
        byReferrer: trafficByReferrer,
        daily: dailyTraffic.reduce((acc: Record<string, number>, event) => {
          const day = event.createdAt.toISOString().slice(0, 10)
          acc[day] = (acc[day] || 0) + 1
          return acc
        }, {}),
      },
    })
  } catch (error: any) {
    console.error('[GET /api/admin/analytics] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải analytics' }, { status: 500 })
  }
}
