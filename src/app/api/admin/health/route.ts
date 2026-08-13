import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const started = Date.now()
    const checks: Record<string, any> = {}
    const dbStarted = Date.now()
    try {
      await db.$queryRaw`SELECT 1`
      checks.database = { status: 'healthy', latencyMs: Date.now() - dbStarted }
    } catch {
      checks.database = { status: 'error' }
    }

    const r2Variables = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BUCKET', 'R2_PUBLIC_URL']
    const missingR2 = r2Variables.filter(name => !process.env[name])
    checks.storage = missingR2.length === 0
      ? { status: 'configured', privateBucket: true, publicBucket: true }
      : { status: 'warning', missingCount: missingR2.length }

    const lastEvent = await db.analyticsEvent.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }).catch(() => null)
    checks.analytics = {
      status: lastEvent && Date.now() - lastEvent.createdAt.getTime() < 24 * 60 * 60 * 1000 ? 'healthy' : 'warning',
      lastEventAt: lastEvent?.createdAt || null,
    }

    const [pendingProducts, pendingApplications, pendingReports] = checks.database.status === 'healthy'
      ? await Promise.all([
          db.product.count({ where: { reviewStatus: 'PENDING' } }),
          db.sellerApplication.count({ where: { status: 'PENDING' } }),
          db.report.count({ where: { status: 'PENDING' } }),
        ])
      : [0, 0, 0]

    return NextResponse.json({
      status: Object.values(checks).some((check: any) => check.status === 'error') ? 'degraded' : 'healthy',
      checkedAt: new Date(),
      responseTimeMs: Date.now() - started,
      checks,
      alerts: [
        pendingProducts > 0 && { type: 'PENDING_PRODUCTS', severity: 'MEDIUM', count: pendingProducts, title: `${pendingProducts} sản phẩm chờ duyệt` },
        pendingApplications > 0 && { type: 'PENDING_SELLERS', severity: 'MEDIUM', count: pendingApplications, title: `${pendingApplications} đơn Seller chờ duyệt` },
        pendingReports > 0 && { type: 'PENDING_REPORTS', severity: 'HIGH', count: pendingReports, title: `${pendingReports} báo cáo chờ xử lý` },
        checks.database.status === 'error' && { type: 'DATABASE', severity: 'HIGH', count: 1, title: 'Không thể kết nối database' },
      ].filter(Boolean),
    })
  } catch (error) {
    console.error('[GET /api/admin/health] Error:', error)
    return NextResponse.json({ error: 'Không thể kiểm tra sức khỏe hệ thống' }, { status: 500 })
  }
}
