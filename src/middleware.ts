import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import {
  defaultLocale,
  isPublicSeoPath,
  isLocale,
  localeCookie,
  localeFromAcceptLanguage,
  localeFromCountry,
  localeFromPathname,
  localeHeader,
  stripLocaleFromPathname,
} from '@/i18n/config'

// Search Crawler Bot User-Agents & Test Runners
const SEARCH_BOT_REGEX = /Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|facebookexternalhit|ia_archiver|RealS-E2E-Tester/i

function isSearchBot(userAgent: string | null): boolean {
  if (!userAgent) return false
  return SEARCH_BOT_REGEX.test(userAgent)
}

function applySeoHeaders<T extends NextResponse>(response: T, req: NextRequest, barePath: string): T {
  const origin = req.nextUrl.origin
  const defaultUrl = `${origin}/en${barePath === '/' ? '' : barePath}`
  response.headers.set('Link', `<${defaultUrl}>; rel="alternate"; hreflang="x-default"`)
  response.headers.set('X-Default-Locale', defaultLocale)
  return response
}

// Rate limiting store.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_MAX_ENTRIES = 10_000

function sweepExpired(now: number) {
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(key)
  }
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
  default: 1000,   // 1000 req/min for normal pages
  api: 500,        // 500 req/min for API
  auth: 200,       // 200 req/min for auth endpoints
}

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

  const ua = req.headers.get('user-agent') || 'no-ua'
  return `unknown:${ua.slice(0, 40)}`
}

function rateLimit(ip: string, path: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  sweepExpired(now)
  const bucket: keyof typeof RATE_LIMIT_MAX = path.startsWith('/api/') ? 'api' : 'default'
  const limit = RATE_LIMIT_MAX[bucket]
  const key = `${bucket}:${ip}`
  const entry = rateLimitMap.get(key)
  if (!entry || now >= entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return { allowed: true, remaining: limit - 1 }
  }
  entry.count += 1
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) }
}

function tooManyRequests(pathname: string): NextResponse {
  return applySecurityHeaders(
    NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
    pathname,
  )
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const userAgent = req.headers.get('user-agent')
  const isBot = isSearchBot(userAgent)

  // Consolidate www.* hosts onto the apex domain so canonical, hreflang and
  // sitemap signals all live on a single host.
  const host = req.headers.get('host') || ''
  if (host.startsWith('www.')) {
    const url = req.nextUrl.clone()
    url.host = host.slice(4)
    return applySecurityHeaders(NextResponse.redirect(url, 308), pathname)
  }

  // Guard against internal rewrite loops: if x-reals-locale header is present, pass through
  if (req.headers.get(localeHeader)) {
    const response = NextResponse.next()
    return applySecurityHeaders(response, pathname)
  }

  const urlLocale = localeFromPathname(pathname)
  const barePath = stripLocaleFromPathname(pathname)
  const canLocalize = (req.method === 'GET' || req.method === 'HEAD') && isPublicSeoPath(pathname)

  if (canLocalize && !urlLocale) {
    const cookieLocale = req.cookies.get(localeCookie)?.value
    const detectedLocale = isLocale(cookieLocale) ? cookieLocale : null
    const locale = detectedLocale
      || localeFromCountry(req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry'))
      || localeFromAcceptLanguage(req.headers.get('accept-language'))
      || defaultLocale
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = barePath === '/' ? `/${locale}` : `/${locale}${barePath}`
    
    // HTTP 308 (Permanent Redirect) for search crawlers and public SEO paths
    const redirect = NextResponse.redirect(redirectUrl, 308)
    redirect.cookies.set(localeCookie, locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
    applySecurityHeaders(redirect, pathname)
    return applySeoHeaders(redirect, req, barePath)
  }

  if (canLocalize && urlLocale) {
    // Exempt search crawlers from rate limiting on public SEO routes
    let remaining = 60
    if (!isBot) {
      const res = rateLimit(clientIp(req), pathname)
      if (!res.allowed) return tooManyRequests(pathname)
      remaining = res.remaining
    }

    const rewriteUrl = req.nextUrl.clone()
    rewriteUrl.pathname = barePath
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set(localeHeader, urlLocale)
    const rewrite = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    rewrite.cookies.set(localeCookie, urlLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
    rewrite.headers.set('X-RateLimit-Remaining', String(remaining))
    applySecurityHeaders(rewrite, pathname)
    return applySeoHeaders(rewrite, req, barePath)
  }

  // Auth routes rate limiting
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  applySecurityHeaders(response, pathname)

  // Rate Limiting for non-localized routes
  if (!isBot) {
    const res = rateLimit(clientIp(req), pathname)
    if (!res.allowed) return tooManyRequests(pathname)
    response.headers.set('X-RateLimit-Remaining', String(res.remaining))
  }

  // Admin Route Protection
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

    if (!token) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
      }
      const loginUrl = new URL('/', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      loginUrl.searchParams.set('error', 'RequireLogin')
      return NextResponse.redirect(loginUrl)
    }

    if (token.role !== 'ADMIN') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
      }
      const homeUrl = new URL('/', req.url)
      return NextResponse.redirect(homeUrl)
    }
  }

  // Seller Route Protection
  if (pathname.startsWith('/seller/')) {
    if (pathname.includes('/dashboard') || pathname.includes('/manage')) {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
      if (!token) {
        const loginUrl = new URL('/', req.url)
        loginUrl.searchParams.set('callbackUrl', pathname)
        return NextResponse.redirect(loginUrl)
      }
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

function applySecurityHeaders<T extends NextResponse>(response: T, pathname: string): T {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

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

  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - robots.txt, sitemap.*, manifest.json, site.webmanifest
     * - static assets (.svg, .png, .jpg, .css, .js, .json, .xml, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap.*|manifest\\.json|site\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|css|js|map|json|xml|txt|webmanifest)$).*)',
  ],
}
