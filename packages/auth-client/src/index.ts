// @reals/auth-client — SSO client cho stem-app frontend (Bước 3 monorepo).
//
// Luồng token exchange với main-app (reals.media):
//   1. User mở stem-app lần đầu (không có token) → ensureAuth() redirect tới
//      `${mainAppUrl}/api/auth/stem/authorize?redirect=<current page>`
//   2. Main-app: chưa login NextAuth → màn login; đã login → 302 về
//      `<current page>#token=<JWT bridge TTL 24h>`
//   3. extractTokenFromLocation() đọc hash, lưu localStorage, xoá hash khỏi URL
//   4. Mọi API call tới stem backend đi qua authFetch() — tự gắn
//      `Authorization: Bearer <token>`
//   5. Token hết hạn → backend trả 401 → authFetch tự clearToken + redirect
//      ngầm về authorize (silent re-auth — user vẫn giữ session NextAuth 30 ngày
//      nên không phải gõ mật khẩu lần 2)
//
// Client KHÔNG gọi thẳng API của main-app từ browser (không cần CORS trên
// main-app) — việc verify token + đọc tier live do stem backend thực hiện
// server-to-server qua POST /api/auth/verify-session (xem backend/app/core/reals_auth.py).
//
// SSR-safe: không đụng window/localStorage ở module scope; mọi hàm có side
// effect đều guard `typeof window`.

export type Tier = 'FREE' | 'BASIC' | 'MAX' | 'ULTRA'

/** Thông tin user + tier — khớp 1:1 response POST /api/auth/verify-session của main-app */
export interface RealsAuthUser {
  userId: string
  email: string
  tier: Tier
  /** Số lần tách nhạc mỗi 24h; null = không giới hạn (ULTRA) */
  limit: number | null
  usedToday: number
  creditsRemaining: number | null
  /** ISO date khi subscription hết hạn; null = không có/vĩnh viễn */
  expiresAt: string | null
}

export interface RealsAuthConfig {
  /** URL gốc main-app, ví dụ 'https://reals.media' (bắt buộc) */
  mainAppUrl: string
  /** Key localStorage lưu bridge token (mặc định 'reals_stem_sso_token') */
  storageKey?: string
}

/** Throw khi authFetch/ensureAuth đã bắt đầu redirect sang main-app — caller nên abort flow hiện tại */
export class RealsAuthRedirectError extends Error {
  constructor(message = 'Redirecting to main-app for authentication') {
    super(message)
    this.name = 'RealsAuthRedirectError'
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

let mainAppUrl = ''
let storageKey = 'reals_stem_sso_token'

export function configureRealsAuth(config: RealsAuthConfig): void {
  mainAppUrl = config.mainAppUrl.replace(/\/+$/, '')
  storageKey = config.storageKey || 'reals_stem_sso_token'
}

function requireMainAppUrl(): string {
  if (!mainAppUrl) {
    throw new Error(
      '[auth-client] Chưa configureRealsAuth({ mainAppUrl }) — gọi configureRealsAuth trước khi dùng.',
    )
  }
  return mainAppUrl
}

// ---------------------------------------------------------------------------
// Token storage (localStorage — persist giữa các lần mở app; token TTL 24h)
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(storageKey) || null
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, token)
  } catch {
    // localStorage bị chặn (private mode...) — app vẫn chạy, chỉ mất persistence
  }
}

export function clearToken(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {}
}

// ---------------------------------------------------------------------------
// Nhận token từ URL fragment (pure helpers — dễ unit test)
// ---------------------------------------------------------------------------

/** Đọc token từ hash string, ví dụ '#token=eyJhbGci...' → 'eyJhbGci...' */
export function parseTokenFromHash(hash: string): string | null {
  if (!hash || !hash.startsWith('#')) return null
  const params = hash.slice(1).split('&')
  for (const p of params) {
    if (p.startsWith('token=')) {
      const value = decodeURIComponent(p.slice('token='.length))
      return value || null
    }
  }
  return null
}

/** Bỏ hash khỏi URL để token không còn nằm trên address bar (tránh copy nhầm) */
export function stripHashFromUrl(url: string): string {
  const idx = url.indexOf('#')
  return idx === -1 ? url : url.slice(0, idx)
}

/**
 * Đọc #token=... từ location hiện tại → lưu localStorage → xoá hash khỏi URL.
 * Gọi 1 lần khi app mount (trước ensureAuth). Trả token nếu có.
 */
export function extractTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const token = parseTokenFromHash(window.location.hash)
  if (!token) return null
  setToken(token)
  try {
    window.history.replaceState(null, '', stripHashFromUrl(window.location.href))
  } catch {}
  return token
}

// ---------------------------------------------------------------------------
// Auth flow — redirect sang main-app authorize
// ---------------------------------------------------------------------------

/**
 * URL authorize của main-app. redirectUri mặc định = trang hiện tại
 * (origin + pathname + search, bỏ hash để không mang token cũ theo).
 */
export function buildAuthorizeUrl(redirectUri?: string): string {
  const base = requireMainAppUrl()
  let target = redirectUri
  if (!target && typeof window !== 'undefined') {
    target = window.location.origin + window.location.pathname + window.location.search
  }
  if (!target) {
    throw new Error('[auth-client] buildAuthorizeUrl cần redirectUri (không có window ở SSR)')
  }
  return `${base}/api/auth/stem/authorize?redirect=${encodeURIComponent(target)}`
}

/**
 * Bắt đầu silent re-auth: clear token cũ + redirect browser sang main-app.
 *
 * Không cần guard chống loop: (1) gọi nhiều lần cùng lúc vô hại — browser chỉ
 * thực thi location.replace cuối cùng; (2) khi user CHƯA login NextAuth,
 * authorize redirect sang trang signin → flow tự dừng ở đó (không loop);
 * (3) sau khi Back về SPA, ensureAuth() có thể gọi lại bình thường (không có
 * flag vĩnh viễn kẹt app).
 */
export function startReauth(): void {
  if (typeof window === 'undefined') return
  clearToken()
  window.location.replace(buildAuthorizeUrl())
}

/**
 * Trả bridge token nếu đã có; nếu chưa → bắt đầu redirect sang main-app
 * login/authorize và trả null (caller nên abort render/flow hiện tại).
 */
export function ensureAuth(): string | null {
  const token = getToken()
  if (token) return token
  startReauth()
  return null
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Headers auth cho XHR/fetch tự quản (ví dụ upload có progress bar). */
export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

/**
 * fetch() kèm Authorization: Bearer <token>.
 * - Thiếu token → redirect authorize + throw RealsAuthRedirectError
 * - Backend trả 401 (token hết hạn/sai) → clear + silent re-auth + throw
 * - 503/429 (auth service quá tải) KHÔNG redirect — trả response cho caller xử lý
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getToken()
  if (!token) {
    startReauth()
    throw new RealsAuthRedirectError()
  }

  const headers = new Headers(init?.headers)
  headers.set('authorization', `Bearer ${token}`)

  const res = await fetch(input, { ...init, headers })

  if (res.status === 401) {
    startReauth()
    throw new RealsAuthRedirectError('Bridge token hết hạn hoặc không hợp lệ — đang re-auth')
  }
  return res
}

/**
 * GET <apiBaseUrl>/api/auth/me — endpoint stem backend proxy verify-session
 * của main-app (thêm ở Bước 4). Trả user + tier hiện tại.
 */
export async function fetchAuthMe(apiBaseUrl?: string): Promise<RealsAuthUser> {
  const base = (apiBaseUrl || '').replace(/\/+$/, '')
  const res = await authFetch(`${base}/api/auth/me`)
  if (!res.ok) {
    throw new Error(`GET /api/auth/me failed with status ${res.status}`)
  }
  return (await res.json()) as RealsAuthUser
}
