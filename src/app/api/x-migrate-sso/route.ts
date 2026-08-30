// POST /api/x-migrate-sso — chạy 1 LẦN để tạo bảng Subscription + UsageEvent
// (sql/001-add-subscription-and-usageevent.sql) trên production DB.
//
// An toàn:
// - Bắt buộc header x-migrate-key (giá trị nằm trong env MIGRATE_SSO_KEY tạm)
// - Idempotent: bảng đã tồn tại → báo cáo, không chạy lại
// - Chỉ chạy đúng các statement trong sql/001 — không đụng dữ liệu cũ
// - Route này sẽ bị XOÁ khỏi repo ngay sau khi migration xong
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const SQL_CREATE_SUBSCRIPTION = `CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "source" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
)`

const SQL_CREATE_USAGE_EVENT = `CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "app" TEXT NOT NULL DEFAULT 'stem-app',
    "action" TEXT NOT NULL DEFAULT 'separation',
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
)`

const SQL_INDEXES: Array<[string, string]> = [
  ['Subscription_userId_key (unique)', `CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId")`],
  ['Subscription_status_tier_idx', `CREATE INDEX "Subscription_status_tier_idx" ON "Subscription"("status", "tier")`],
  ['UsageEvent_userId_app_action_createdAt_idx', `CREATE INDEX "UsageEvent_userId_app_action_createdAt_idx" ON "UsageEvent"("userId", "app", "action", "createdAt")`],
]

const SQL_FKS: Array<[string, string]> = [
  ['Subscription_userId_fkey', `ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ['UsageEvent_userId_fkey', `ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
]

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-migrate-key')
  if (!process.env.MIGRATE_SSO_KEY || key !== process.env.MIGRATE_SSO_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const report: Record<string, unknown> = { steps: [] as string[] }
  try {
    // 1. Kiểm tra bảng đã tồn tại chưa (idempotent)
    const existing = await db.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Subscription','UsageEvent')`,
    )
    const existingNames = existing.map((r) => r.tablename)
    report.existing_tables = existingNames

    if (existingNames.includes('Subscription') && existingNames.includes('UsageEvent')) {
      report.steps.push('Cả 2 bảng đã tồn tại — không cần migration')
      report.already_migrated = true
      return NextResponse.json({ ok: true, ...report })
    }

    // 2. Tạo bảng còn thiếu
    if (!existingNames.includes('Subscription')) {
      await db.$executeRawUnsafe(SQL_CREATE_SUBSCRIPTION)
      report.steps.push('CREATE TABLE Subscription — OK')
    }
    if (!existingNames.includes('UsageEvent')) {
      await db.$executeRawUnsafe(SQL_CREATE_USAGE_EVENT)
      report.steps.push('CREATE TABLE UsageEvent — OK')
    }

    // 3. Indexes (bỏ qua nếu đã có — query pg_indexes)
    const existingIdx = await db.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('Subscription','UsageEvent')`,
    )
    const idxNames = new Set(existingIdx.map((r) => r.indexname))
    for (const [label, sql] of SQL_INDEXES) {
      const name = sql.match(/"([^"]+)"\s+ON/)?.[1] ?? label
      if (idxNames.has(name)) {
        report.steps.push(`INDEX ${label} — đã có, bỏ qua`)
        continue
      }
      await db.$executeRawUnsafe(sql)
      report.steps.push(`CREATE INDEX ${label} — OK`)
    }

    // 4. Foreign keys (kiểm tra pg_constraint tránh trùng)
    const existingFks = await db.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conname IN ('Subscription_userId_fkey','UsageEvent_userId_fkey')`,
    )
    const fkNames = new Set(existingFks.map((r) => r.conname))
    for (const [name, sql] of SQL_FKS) {
      if (fkNames.has(name)) {
        report.steps.push(`FK ${name} — đã có, bỏ qua`)
        continue
      }
      await db.$executeRawUnsafe(sql)
      report.steps.push(`FK ${name} — OK`)
    }

    // 5. Verify cuối: đếm dòng được đọc từ 2 bảng qua Prisma (Prisma client có sẵn model)
    const subCount = await db.subscription.count()
    const usageCount = await db.usageEvent.count()
    report.steps.push(`Verify: Prisma đọc được Subscription (${subCount} dòng) + UsageEvent (${usageCount} dòng)`)
    report.ok = true
    report.already_migrated = false
    return NextResponse.json(report)
  } catch (err) {
    report.ok = false
    report.error = err instanceof Error ? err.message : String(err)
    return NextResponse.json(report, { status: 500 })
  }
}
