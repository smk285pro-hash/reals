// GET /api/auth/stem/authorize?redirect=<stem-app callback URL>
//
// Trái tim của SSO token exchange:
// 1. User mở stem-app, chưa có token hợp lệ → SPA redirect tới endpoint này
//    kèm ?redirect=<stem callback URL> (origin phải nằm trong whitelist).
// 2a. Chưa login NextAuth → redirect sang màn login NextAuth với callbackUrl
//     quay lại ĐÚNG endpoint này (silent re-auth sau này không thấy login nữa).
// 2b. Đã login → mint bridge token (JWT HS256, TTL 24h) → 302 về
//     <redirect>#token=<jwt>. Dùng URL fragment (#) thay vì query (?) để
//     token không rơi vào server logs / referrer header của stem-app.
// 3. SPA stem-app đọc location.hash, lưu token, gửi kèm mỗi request API.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db } from '@/lib/db'
import { mintBridgeToken, isAllowedRedirect } from '@/lib/stem-sso'
import { getUserTierInfo } from '@/lib/tiers'

export async function GET(req: NextRequest) {
  const redirectUrl = req.nextUrl.searchParams.get('redirect')

  // Chống open-redirect — kiểm tra TRƯỚC khi đụng session/DB
  if (!isAllowedRedirect(redirectUrl)) {
    return NextResponse.json(
      { error: 'Invalid redirect URL (origin not allowed)' },
      { status: 400 },
    )
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    // Chưa login → màn login NextAuth default, sau login quay lại đây
    const signinUrl = new URL('/api/auth/signin', req.nextUrl.origin)
    signinUrl.searchParams.set('callbackUrl', req.nextUrl.toString())
    // 302 (giống convention NextAuth) — redirect tạm, browser GET → GET
    return NextResponse.redirect(signinUrl, 302)
  }

  const user = await db.user.findUnique({ where: { email: session.user.email } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const info = await getUserTierInfo(user.id)
  const token = await mintBridgeToken({ id: user.id, email: user.email, tier: info.tier })

  // Token truyền qua URL fragment (#) — browser KHÔNG gửi fragment lên server
  // nên token không xuất hiện trong access log của stem-app hay referrer.
  const target = new URL(redirectUrl!)
  target.hash = `token=${token}`
  // 302: redirect tạm — lần sau SPA sẽ silent re-auth lấy token mới (token TTL 24h)
  return NextResponse.redirect(target, 302)
}
