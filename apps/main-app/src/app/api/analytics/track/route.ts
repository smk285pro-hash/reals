import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createHash } from 'crypto'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'

function classifyDevice(userAgent: string) {
  if (/tablet|ipad|android(?!.*mobile)/i.test(userAgent)) return 'tablet'
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

function classifyBrowser(userAgent: string) {
  if (/headlesschrome/i.test(userAgent)) return 'HeadlessChrome'
  if (/edg\//i.test(userAgent)) return 'Edge'
  if (/chrome|crios/i.test(userAgent)) return 'Chrome'
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox'
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) return 'Safari'
  return 'Other'
}

function classifyBot(userAgent: string) {
  const signals: Array<[RegExp, string]> = [
    [/headlesschrome|playwright|puppeteer/i, 'Trình duyệt kiểm thử tự động'],
    [/googlebot|bingbot|yandexbot|baiduspider|duckduckbot/i, 'Công cụ tìm kiếm'],
    [/bot|crawler|spider|slurp|lighthouse/i, 'Bot hoặc crawler'],
    [/curl|wget|python-requests|postmanruntime/i, 'Công cụ tự động'],
  ]
  return signals.find(([pattern]) => pattern.test(userAgent))?.[1] || null
}

function asLimitedString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function asCounter(value: unknown, max: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(Number(value)))) : 0
}

function getClientIp(req: NextRequest) {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim()
}

function maskIp(ip: string) {
  if (!ip) return null
  if (ip.includes('.')) {
    const parts = ip.split('.')
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : null
  }
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::/48`
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const requestedType = asLimitedString(body.eventType, 30)
    const eventType = ['PAGE_VIEW', 'PRODUCT_VIEW', 'SESSION_START', 'HEARTBEAT', 'SESSION_END'].includes(requestedType) ? requestedType : 'PAGE_VIEW'
    const visitorId = asLimitedString(body.visitorId, 100)
    const sessionId = asLimitedString(body.sessionId, 100)
    const path = asLimitedString(body.path, 500) || '/'
    const activeSeconds = asCounter(body.activeSeconds, 60)
    const interactions = asCounter(body.interactions, 1000)
    if (!visitorId || !sessionId) return NextResponse.json({ ok: false }, { status: 400 })

    const session = await getServerSession(authOptions)
    const userId = (session?.user as any)?.id || null
    const isAdmin = (session?.user as any)?.role === 'ADMIN'
    const userAgent = req.headers.get('user-agent') || ''
    const referrer = req.headers.get('referer')?.slice(0, 500) || null
    const country = req.headers.get('x-vercel-ip-country')?.slice(0, 10) || null
    const device = classifyDevice(userAgent)
    const browser = classifyBrowser(userAgent)
    const botReason = classifyBot(userAgent)
    const clientIp = getClientIp(req)
    const ipHash = clientIp ? createHash('sha256').update(`${process.env.ANALYTICS_IP_SALT || 'reals'}:${clientIp}`).digest('hex') : null
    const ipMasked = maskIp(clientIp)
    const now = new Date()

    const existingSession = await db.analyticsSession.findUnique({ where: { sessionId }, select: { id: true, lastSeenAt: true } })
    const isPageView = eventType === 'SESSION_START' || (eventType === 'PAGE_VIEW' && (!existingSession || now.getTime() - existingSession.lastSeenAt.getTime() > 2000))
    if (!existingSession) {
      await db.analyticsSession.create({
        data: {
          sessionId,
          visitorId,
          userId,
          startedAt: now,
          lastSeenAt: now,
          endedAt: eventType === 'SESSION_END' ? now : undefined,
          activeSeconds,
          pageViews: isPageView ? 1 : 0,
          interactionCount: interactions,
          entryPath: path,
          exitPath: path,
          referrer,
          userAgent: userAgent.slice(0, 1000),
          device,
          browser,
          country,
          isBot: Boolean(botReason),
          botReason,
          isInternal: isAdmin,
        },
      })
    } else {
      await db.analyticsSession.update({
        where: { sessionId },
        data: {
          lastSeenAt: now,
          endedAt: eventType === 'SESSION_END' ? now : null,
          activeSeconds: { increment: activeSeconds },
          pageViews: isPageView ? { increment: 1 } : undefined,
          interactionCount: { increment: interactions },
          exitPath: path,
          userId: userId || undefined,
          country: country || undefined,
          isInternal: isAdmin || undefined,
        },
      })
    }

    if (eventType === 'HEARTBEAT' || eventType === 'SESSION_END' || (eventType === 'PAGE_VIEW' && !isPageView)) {
      return NextResponse.json({ ok: true, counted: false })
    }

    let productId: string | null = null
    if (eventType === 'PRODUCT_VIEW' && typeof body.productId === 'string') {
      const product = await db.product.findFirst({ where: { id: body.productId, published: true }, select: { id: true } })
      if (!product) return NextResponse.json({ ok: false }, { status: 404 })
      productId = product.id
      const recentView = await db.analyticsEvent.findFirst({
        where: { eventType, productId, visitorId, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
        select: { id: true },
      })
      if (recentView) return NextResponse.json({ ok: true, counted: false })
    }

    const storedEventType = eventType === 'SESSION_START' ? 'PAGE_VIEW' : eventType
    await db.analyticsEvent.create({
      data: {
        eventType: storedEventType,
        visitorId,
        sessionId,
        path,
        productId,
        referrer,
        userAgent: userAgent.slice(0, 1000),
        device,
        browser,
        country,
        ipHash,
        ipMasked,
        userId,
      },
    })

    if (productId) await db.product.update({ where: { id: productId }, data: { views: { increment: 1 } } })
    return NextResponse.json({ ok: true, counted: true })
  } catch (error) {
    console.error('[POST /api/analytics/track] Error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
