import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Rate limiting store (in-memory, resets on redeploy)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = {
  default: 60,    // 60 req/min for normal pages
  api: 30,        // 30 req/min for API
  auth: 20,       // 20 req/min for auth endpoints (OAuth needs multiple calls)
}

function rateLimit(ip: string, path: string): { allowed: boolean; remaining: number } {
  const now = Date.now()

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
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
             req.headers.get('x-real-ip') ||
             'unknown'

  const { allowed, remaining } = rateLimit(ip, pathname)
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
  if (pathname.startsWith('/seller') && !pathname.startsWith('/seller/') === false) {
    // /seller/dashboard, /seller/products etc. need SELLER or ADMIN role
    if (pathname.includes('/dashboard') || pathname.includes('/manage')) {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
      if (!token) {
        const loginUrl = new URL('/', req.url)
        loginUrl.searchParams.set('callbackUrl', pathname)
        return NextResponse.redirect(loginUrl)
      }
      if (token.role !== 'SELLER' && token.role !== 'ADMIN' && !token.isSeller) {
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
