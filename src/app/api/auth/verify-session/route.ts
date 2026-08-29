// POST /api/auth/verify-session — verify SSO bridge token của stem-app.
//
// Luồng: stem-app backend (FastAPI) gọi endpoint này server-to-server kèm
// bridge token mà SPA stem-app nhận được từ /api/auth/stem/authorize.
// Response: { valid, userId, email, tier, creditsRemaining }.
//
// Lưu ý bảo mật:
// - Endpoint nằm dưới /api/auth/* nên middleware hiện tại BYPASS rate-limit
//   → route tự giới hạn 120 req/phút/IP (pattern giống src/middleware.ts).
// - Khi DB lỗi → trả 503 + valid:false (fail CLOSED — stem-app phải từ chối).
import { NextRequest, NextResponse } from 'next/server'
import { verifyBridgeToken } from '@/lib/stem-sso'
import { getUserTierInfo } from '@/lib/tiers'

// Rate limiting store (in-memory, same pattern as src/middleware.ts)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000
const RATE_LIMIT_MAX = 120

function clientIp(req: NextRequest): string {
  const vercel = req.headers.get('x-vercel-forwarded-for')
  if (vercel) return vercel.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const hops = fwd.split(',').map((h) => h.trim()).filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }
  return 'unknown'
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(key)
  }
  const key = `verify-session:${ip}`
  const entry = rateLimitMap.get(key)
  if (!entry || now >= entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT_MAX
}

export async function POST(req: NextRequest) {
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ valid: false, reason: 'rate_limited' }, { status: 429 })
  }

  let token = ''
  try {
    const body = await req.json()
    token = typeof body?.token === 'string' ? body.token : ''
  } catch {
    return NextResponse.json({ valid: false, reason: 'invalid_body' })
  }

  if (!token) {
    return NextResponse.json({ valid: false, reason: 'missing_token' })
  }

  const payload = await verifyBridgeToken(token)
  if (!payload) {
    return NextResponse.json({ valid: false, reason: 'invalid_or_expired_token' })
  }

  try {
    // Tier luôn đọc live từ DB (không tin tier nhúng trong token — có thể stale)
    const info = await getUserTierInfo(payload.id)
    return NextResponse.json({
      valid: true,
      userId: payload.id,
      email: payload.email,
      tier: info.tier,
      creditsRemaining: info.creditsRemaining,
      limit: info.limit,
      usedToday: info.usedToday,
      expiresAt: info.expiresAt,
    })
  } catch (error) {
    console.error('[POST /api/auth/verify-session] DB error:', error)
    return NextResponse.json({ valid: false, reason: 'db_unavailable' }, { status: 503 })
  }
}
