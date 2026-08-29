// POST /api/usage/separation — ghi nhận 1 lần tách nhạc (quota consumption).
//
// Luồng (Bước 4 monorepo): stem backend (FastAPI) gọi endpoint này NGAY TRƯỚC
// khi bắt đầu GPU work, kèm bridge token của user (Authorization: Bearer).
// Endpoint thực hiện check-and-record ATOMIC trong transaction Serializable:
//   - còn quota → ghi UsageEvent, trả 200 { allowed: true, ...tier info mới }
//   - hết quota → KHÔNG ghi, trả 409 { allowed: false, reason: 'quota_exceeded', ... }
//
// Vì check + record nằm trong cùng 1 transaction serializable, 2 request
// đồng thời của cùng user không thể cùng vượt quota (conflict → retry → 1 bên
// thua). Cache verify 60s ở stem backend không ảnh hưởng tính đúng đắn vì
// quyết định quota luôn do endpoint NÀY đưa ra với số liệu live.
//
// Bảo mật: giữ nguyên pattern rate-limit 120 req/min/IP như verify-session.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { verifyBridgeToken } from '@/lib/stem-sso'
import { getUserTierInfo } from '@/lib/tiers'

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
  const key = `usage-sep:${ip}`
  const entry = rateLimitMap.get(key)
  if (!entry || now >= entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT_MAX
}

/** Thực thi fn trong transaction Serializable; retry 1 lần khi write-conflict. */
async function serializableTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      // Transaction conflict — retry một lần (đủ cho mức xung đột thực tế)
      return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    }
    throw error
  }
}

export async function POST(req: NextRequest) {
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ allowed: false, reason: 'rate_limited' }, { status: 429 })
  }

  const auth = req.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ allowed: false, reason: 'missing_token' }, { status: 401 })
  }
  const token = auth.slice(7).trim()
  if (!token) {
    return NextResponse.json({ allowed: false, reason: 'missing_token' }, { status: 401 })
  }

  const payload = await verifyBridgeToken(token)
  if (!payload) {
    return NextResponse.json({ allowed: false, reason: 'invalid_or_expired_token' }, { status: 401 })
  }

  // meta tuỳ chọn từ stem backend (taskId, stemMode, endpoint...) — chỉ nhận object nhỏ
  let meta: Record<string, unknown> | undefined
  try {
    const body = await req.json()
    if (body?.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) {
      meta = body.meta
    }
  } catch {
    // body rỗng/sai format — vẫn ghi usage không meta
  }

  try {
    const outcome = await serializableTx(async (tx) => {
      const info = await getUserTierInfo(payload.id, tx)
      if (info.limit !== null && info.usedToday >= info.limit) {
        return { allowed: false as const, info }
      }
      await tx.usageEvent.create({
        data: {
          userId: payload.id,
          app: 'stem-app',
          action: 'separation',
          // meta là cột String? (JSON string) theo schema — xem prisma/schema.prisma
          meta: meta ? JSON.stringify(meta).slice(0, 2000) : null,
        },
      })
      // Đọc lại số liệu sau khi ghi để trả creditsRemaining chuẩn
      const after = await getUserTierInfo(payload.id, tx)
      return { allowed: true as const, info: after }
    })

    return NextResponse.json(
      {
        allowed: outcome.allowed,
        ...(outcome.allowed ? {} : { reason: 'quota_exceeded' }),
        userId: payload.id,
        tier: outcome.info.tier,
        limit: outcome.info.limit,
        usedToday: outcome.info.usedToday,
        creditsRemaining: outcome.info.creditsRemaining,
        expiresAt: outcome.info.expiresAt,
      },
      { status: outcome.allowed ? 200 : 409 },
    )
  } catch (error) {
    // P2034 sau retry (xung đột quá dày) hoặc lỗi DB khác → 503, stem backend
    // sẽ fail-closed (không chạy GPU work khi không chắc còn quota)
    console.error('[POST /api/usage/separation] error:', error)
    return NextResponse.json({ allowed: false, reason: 'db_unavailable' }, { status: 503 })
  }
}
