// SSO bridge token cho stem-app (Bước 2 monorepo).
//
// Cơ chế: Token Exchange — main-app cấp JWT ngắn hạn (HS256, secret riêng
// STEM_SSO_SECRET), stem-app verify ngược qua POST /api/auth/verify-session.
// TTL mặc định 24h (user đã duyệt); hết hạn thì SPA stem-app tự redirect
// qua /api/auth/stem/authorize để cấp lại ngầm (silent re-auth) — user vẫn
// giữ session NextAuth 30 ngày nên không phải nhìn thấy màn login lần 2.
//
// Env bắt buộc:
//   STEM_SSO_SECRET           — secret ≥ 16 ký tự, KHÁC NEXTAUTH_SECRET
//   STEM_SSO_ALLOWED_REDIRECTS — (tuỳ chọn) comma-separated list các origin
//                                được phép nhận redirect sau login.
//                                Mặc định: https://stem.reals.media,
//                                http://localhost:3100, http://127.0.0.1:3100
//                                (3100 = stem-app frontend dev port)
import { SignJWT, jwtVerify } from 'jose'
import { randomUUID } from 'crypto'

const BRIDGE_TOKEN_TTL_SECONDS = 24 * 60 * 60 // 24h — đã duyệt cùng user
const TOKEN_ISSUER = 'reals-main-app'
const TOKEN_AUDIENCE = 'reals-stem-app'

function getSecret(): Uint8Array {
  const secret = process.env.STEM_SSO_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      '[stem-sso] STEM_SSO_SECRET is missing or shorter than 16 chars. ' +
        'Generate one with: openssl rand -base64 32',
    )
  }
  return new TextEncoder().encode(secret)
}

export interface BridgeTokenUser {
  id: string
  email: string
  /** tier tại thời điểm mint — chỉ dùng hiển thị, enforcement luôn đọc live DB */
  tier: string
}

export interface BridgeTokenPayload extends BridgeTokenUser {
  jti: string
  exp: number
}

/** Cấp bridge token cho user đã đăng nhập NextAuth. */
export async function mintBridgeToken(user: BridgeTokenUser): Promise<string> {
  return new SignJWT({ email: user.email, tier: user.tier })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setExpirationTime(Math.floor(Date.now() / 1000) + BRIDGE_TOKEN_TTL_SECONDS)
    .sign(getSecret())
}

/**
 * Verify bridge token. Trả về payload nếu hợp lệ, null nếu sai signature /
 * hết hạn / sai issuer-audience. Không throw.
 */
export async function verifyBridgeToken(token: string): Promise<BridgeTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    })
    if (!payload.sub || typeof payload.email !== 'string') return null
    return {
      id: payload.sub,
      email: payload.email,
      tier: typeof payload.tier === 'string' ? payload.tier : 'FREE',
      jti: typeof payload.jti === 'string' ? payload.jti : '',
      exp: payload.exp ?? 0,
    }
  } catch {
    // sai signature, hết hạn, sai format... — mọi lỗi đều = token không hợp lệ
    return null
  }
}

/**
 * Chống open-redirect: chỉ chấp nhận origin nằm trong whitelist.
 * So khớp CHÍNH XÁC origin (scheme + host + port), không phải prefix-match.
 */
export function isAllowedRedirect(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const allowed = (
      process.env.STEM_SSO_ALLOWED_REDIRECTS ||
      'https://stem.reals.media,http://localhost:3100,http://127.0.0.1:3100'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return allowed.some((origin) => u.origin === origin)
  } catch {
    return false
  }
}
