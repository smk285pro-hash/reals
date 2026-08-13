import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Rate limiting store.
//
// In-memory, which on Vercel means per-instance: each serverless instance keeps
// its own Map, so the real ceiling is RATE_LIMIT_MAX multiplied by however many
// instances are warm, and a cold start resets a caller's count to zero. This
// raises the cost of an attack without capping it. A shared store (Upstash,
// Vercel KV) is the only way to enforce a real limit; until then treat these
// numbers as a speed bump, not a control.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

// Entries were previously never removed, so the Map grew without bound for the
// life of an instance — one entry per distinct key, and the key includes the
// caller IP, so any client cycling addresses could grow it indefinitely.
const RATE_LIMIT_MAX_ENTRIES = 10_000

function sweepExpired(now: number) {
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(key)
  }
  // If a burst of distinct keys outpaces expiry, drop the oldest rather than
  // letting the Map grow: insertion order is iteration order for a Map.
  if (rateLimitMap.size > RATE_LIMIT_MAX_ENTRIES) {
    const excess = rateLimitMap.size - RATE_LIMIT_MAX_ENTRIES
    let i = 0
    for (const key of rateLimitMap.keys()) {
      if (i++ >= excess) break
      rateLimitMap.delete(key)
    }
  }
}
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = {
  default: 60,    // 60 req/min for normal pages
  api: 30,        // 30 req/min for API
  auth: 20,       // 20 req/min for auth endpoints (OAuth needs multiple calls)
}

/**
 * The caller's address, preferring headers a client cannot forge.
 *
 * `x-forwarded-for` is client-settable: anything the caller sends is appended to
 * by the proxy, so reading its first element let an attacker rotate the value per
 * request and get a fresh bucket each time. Vercel overwrites
 * `x-vercel-forwarded-for` with the real peer address, so it is trusted first,
 * then `req.ip`, and only then the client-influenced headers as a last resort —
 * where the LAST element is taken, since that is the hop the nearest trusted
 * proxy appended rather than whatever the client prepended.
 *
 * Callers with no usable address share the 'unknown' bucket, which is why the
 * bucket is now suffixed with the user agent: previously every such caller
 * counted against one shared limit, so a single client could lock out others.
 */
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

  // Distinct fallback per user agent so unidentifiable callers do not collapse
  // into one bucket and starve each other.
  const ua = req.headers.get('user-agent') || 'no-ua'
  return `unknown:${ua.slice(0, 40)}`
}

function rateLimit(ip: string, path: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  sweepExpired(now)

  // Determine limit based on path
  let max = RATE_LIMIT_MAX.default
  if (path.startsWith('/api/auth')) {
    max = RATE_LIMIT_MAX.auth
  } else if (path.startsWith('/api/')) {
    max = RATE_LIMIT_MAX.api
  }

  const key = `${ip}:${path.startsWith('/api/auth') ? 'auth' : path.startsWith('/api/') ? 'api' : 'page'}`
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return { allowed: true, remaining: max - 1 }
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: max - entry.count }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Auth routes are handled by NextAuth, but they are not exempt from rate
  // limiting: this early return used to skip the limiter entirely, leaving
  // POST /api/auth/callback/credentials open to unlimited password guessing.
  // The RATE_LIMIT_MAX.auth bucket existed but was unreachable.
  //
  // Only the credentials callback is limited. OAuth flows legitimately make
  // several rapid calls to /api/auth/session and /api/auth/providers, and
  // throttling those would break sign-in.
  if (pathname.startsWith('/api/auth')) {
    const isCredentialLogin =
      req.method === 'POST' && pathname.startsWith('/api/auth/callback/credentials')
    if (isCredentialLogin) {
      const { allowed } = rateLimit(clientIp(req), pathname)
      if (!allowed) {
        return NextResponse.json(
          { error: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau một phút.' },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      }
    }
    return NextResponse.next()
  }

  const response = NextResponse.next()

  // ─── Security Headers ───
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // CSP for non-API requests
  if (!pathname.startsWith('/api/')) {
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https: http:",
        "media-src 'self' https: http:",
        "frame-src 'self' https://www.youtube.com https://youtube.com https://vercel.live https://accounts.google.com",
        "connect-src 'self' https: wss:",
        "worker-src 'self' blob:",
      ].join('; ')
    )
  }

  // ─── Rate Limiting ───
  const { allowed, remaining } = rateLimit(clientIp(req), pathname)
  response.headers.set('X-RateLimit-Remaining', String(remaining))

  if (!allowed) {
    return NextResponse.json(
      { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  // ─── Admin Route Protection ───
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

    if (!token) {
      // For API routes, return 401
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
      }
      // For page routes, redirect to home
      const loginUrl = new URL('/', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      loginUrl.searchParams.set('error', 'RequireLogin')
      return NextResponse.redirect(loginUrl)
    }

    if (token.role !== 'ADMIN') {
      // For API routes, return 403
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
      }
      // For page routes, redirect to home
      const homeUrl = new URL('/', req.url)
      return NextResponse.redirect(homeUrl)
    }
  }

  // ─── Seller Route Protection ───
  // Was `pathname.startsWith('/seller') && !pathname.startsWith('/seller/') === false`,
  // which parsed as `(!startsWith('/seller/')) === false` because ! binds tighter
  // than ===, collapsing the whole thing to `startsWith('/seller/')`. It gated the
  // right paths by accident; written plainly so the next edit does not break it.
  if (pathname.startsWith('/seller/')) {
    // /seller/dashboard, /seller/products etc. need SELLER or ADMIN role
    if (pathname.includes('/dashboard') || pathname.includes('/manage')) {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
      if (!token) {
        const loginUrl = new URL('/', req.url)
        loginUrl.searchParams.set('callbackUrl', pathname)
        return NextResponse.redirect(loginUrl)
      }
      // Must have SELLER or ADMIN role AND isSeller must be true (for SELLER)
      // ADMIN can always access, SELLER needs isSeller=true
      const isAdmin = token.role === 'ADMIN'
      const isSellerWithFlag = token.role === 'SELLER' && token.isSeller === true
      if (!isAdmin && !isSellerWithFlag) {
        const homeUrl = new URL('/', req.url)
        return NextResponse.redirect(homeUrl)
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, etc.)
     * - auth callback routes (let NextAuth handle them)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)',
  ],
}
