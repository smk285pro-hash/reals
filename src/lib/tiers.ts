// Tier system — main-app là nguồn sự thật duy nhất về tier của user.
//
// Bước 2 (monorepo): cấu trúc + API. Bước 4: giá trị limit dưới đây được dùng
// để enforce quota tách nhạc ở stem backend (xem /api/usage/separation).
// Đổi giá trị = sửa file này + deploy, không cần đụng database.
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const TIERS = ['FREE', 'BASIC', 'MAX', 'ULTRA'] as const
export type Tier = (typeof TIERS)[number]

export interface TierLimit {
  /** Số lần tách nhạc (separation) mỗi 24h. null = không giới hạn. */
  dailySeparations: number | null
  /** Nhãn hiển thị cho user */
  label: string
}

// PROVISIONAL VALUES — chốt cùng user ở Bước 4
export const TIER_LIMITS: Record<Tier, TierLimit> = {
  FREE: { dailySeparations: 3, label: 'Free' },
  BASIC: { dailySeparations: 10, label: 'Basic' },
  MAX: { dailySeparations: 30, label: 'Max' },
  ULTRA: { dailySeparations: null, label: 'Ultra' }, // null = unlimited
}

export interface UserTierInfo {
  tier: Tier
  limit: number | null
  usedToday: number
  creditsRemaining: number | null
  expiresAt: string | null
}

function isKnownTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value)
}

/**
 * Đọc tier hiện tại của user từ DB.
 * - Không có dòng Subscription / status != ACTIVE / đã hết hạn → tính là FREE
 *   (không cần backfill data cho user hiện có).
 * - creditsRemaining = limit - số UsageEvent(separation) trong 24h qua.
 *  (limit = null → không giới hạn → creditsRemaining = null)
 * - `client` cho phép gọi bên trong $transaction (Bước 4: check-and-record
 *   quota atomic ở /api/usage/separation).
 */
export async function getUserTierInfo(
  userId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<UserTierInfo> {
  const subscription = await client.subscription.findUnique({ where: { userId } })

  let tier: Tier = 'FREE'
  let expiresAt: Date | null = null

  if (
    subscription &&
    subscription.status === 'ACTIVE' &&
    (!subscription.expiresAt || subscription.expiresAt.getTime() > Date.now()) &&
    isKnownTier(subscription.tier)
  ) {
    tier = subscription.tier
    expiresAt = subscription.expiresAt
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const usedToday = await client.usageEvent.count({
    where: {
      userId,
      app: 'stem-app',
      action: 'separation',
      createdAt: { gte: since },
    },
  })

  const limit = TIER_LIMITS[tier].dailySeparations
  const creditsRemaining = limit === null ? null : Math.max(0, limit - usedToday)

  return {
    tier,
    limit,
    usedToday,
    creditsRemaining,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  }
}
