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
      visitorEvents,
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
      db.analyticsEvent.findMany({
        where: dateFilter,
        select: { eventType: true, visitorId: true, country: true, device: true, browser: true, userId: true, createdAt: true, path: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ])

    const visitorMap = new Map<string, any>()
    for (const event of visitorEvents) {
      const key = event.visitorId
      const current = visitorMap.get(key)
      if (!current) {
        visitorMap.set(key, {
          visitorId: key,
          userId: event.userId,
          user: event.user,
          country: event.country,
          devices: new Set(event.device ? [event.device] : []),
          browsers: new Set(event.browser ? [event.browser] : []),
          sessions: 1,
          lastSeen: event.createdAt,
          lastPath: event.path,
          recentEvents: [],
          minuteBuckets: new Map<string, number>(),
        })
      } else {
        if (event.device) current.devices.add(event.device)
        if (event.browser) current.browsers.add(event.browser)
        if (!current.userId && event.userId) { current.userId = event.userId; current.user = event.user }
        current.sessions += 1
      }
      const visitor = visitorMap.get(key)
      if (visitor.recentEvents.length < 20) visitor.recentEvents.push({ eventType: event.eventType, path: event.path, createdAt: event.createdAt })
      const minute = event.createdAt.toISOString().slice(0, 16)
      visitor.minuteBuckets.set(minute, (visitor.minuteBuckets.get(minute) || 0) + 1)
    }
    const visitors = Array.from(visitorMap.values()).map((v: any) => ({
      ...v,
      devices: Array.from(v.devices),
      browsers: Array.from(v.browsers),
      maxEventsPerMinute: Math.max(0, ...Array.from(v.minuteBuckets.values()) as number[]),
      minuteBuckets: undefined,
    })).map((v: any) => {
      let riskScore = 0
      const reasons: string[] = []
      if (v.maxEventsPerMinute >= 20) { riskScore += 60; reasons.push('Truy cập quá nhanh') }
      else if (v.maxEventsPerMinute >= 10) { riskScore += 30; reasons.push('Tần suất cao') }
      if (v.sessions >= 200) { riskScore += 30; reasons.push(`${v.sessions} sự kiện trong kỳ`) }
      else if (v.sessions >= 100) { riskScore += 15; reasons.push('Khối lượng truy cập lớn') }
      const riskLevel = riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW'
      return { ...v, riskScore: Math.min(riskScore, 100), riskLevel, riskReasons: reasons }
    }).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()).slice(0, 100)

    const securityAlerts = visitors
      .filter((v: any) => v.riskLevel !== 'LOW')
      .sort((a: any, b: any) => b.riskScore - a.riskScore)
      .slice(0, 20)
      .map((v: any) => ({ type: 'VISITOR_RISK', severity: v.riskLevel, visitorId: v.visitorId, title: v.riskReasons.join(' • '), createdAt: v.lastSeen }))

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
        visitors,
        securityAlerts,
      },
    })
  } catch (error: any) {
    console.error('[GET /api/admin/analytics] Error:', error)
    return NextResponse.json({ error: 'Lỗi tải analytics' }, { status: 500 })
  }
}
