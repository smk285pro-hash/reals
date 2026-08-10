import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

function classifyDevice(userAgent: string) {
  if (/tablet|ipad|android(?!.*mobile)/i.test(userAgent)) return 'tablet'
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

function classifyBrowser(userAgent: string) {
  if (/edg\//i.test(userAgent)) return 'Edge'
  if (/chrome|crios/i.test(userAgent)) return 'Chrome'
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox'
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) return 'Safari'
  return 'Other'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const eventType = body.eventType === 'PRODUCT_VIEW' ? 'PRODUCT_VIEW' : 'PAGE_VIEW'
    const visitorId = typeof body.visitorId === 'string' ? body.visitorId.slice(0, 100) : ''
    const path = typeof body.path === 'string' ? body.path.slice(0, 500) : '/'
    if (!visitorId) return NextResponse.json({ ok: false }, { status: 400 })

    const session = await getServerSession(authOptions)
    const userId = (session?.user as any)?.id || null
    let productId: string | null = null

    if (eventType === 'PRODUCT_VIEW' && typeof body.productId === 'string') {
      const product = await db.product.findFirst({ where: { id: body.productId, published: true }, select: { id: true } })
      if (!product) return NextResponse.json({ ok: false }, { status: 404 })
      productId = product.id
    }

    const userAgent = req.headers.get('user-agent') || ''
    const referrer = req.headers.get('referer')?.slice(0, 500) || null
    const country = req.headers.get('x-vercel-ip-country')?.slice(0, 10) || null

    // Prevent refreshes from inflating product views for the same visitor in one session.
    if (eventType === 'PRODUCT_VIEW') {
      const recentView = await db.analyticsEvent.findFirst({
        where: { eventType, productId, visitorId, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
        select: { id: true },
      })
      if (recentView) return NextResponse.json({ ok: true, counted: false })
    }

    await db.analyticsEvent.create({
      data: {
        eventType,
        visitorId,
        path,
        productId,
        referrer,
        userAgent: userAgent.slice(0, 1000),
        device: classifyDevice(userAgent),
        browser: classifyBrowser(userAgent),
        country,
        userId,
      },
    })

    if (productId) {
      await db.product.update({ where: { id: productId }, data: { views: { increment: 1 } } })
    }

    return NextResponse.json({ ok: true, counted: true })
  } catch (error) {
    console.error('[POST /api/analytics/track] Error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
