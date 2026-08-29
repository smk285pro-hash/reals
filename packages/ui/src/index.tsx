// @reals/ui — components dùng chung (Bước 5 monorepo).
//
// Nguyên tắc: KHÔNG phụ thuộc Tailwind config của app (main-app v4,
// stem-app v3) — component dùng inline style bám vào tokens.css
// (CSS variables) + nhận className tuỳ ý để app tự tinh chỉnh.
// "use client" vì có interactivity nhẹ; app SSR import bình thường.
'use client'

import React from 'react'

export type Tier = 'FREE' | 'BASIC' | 'MAX' | 'ULTRA'

export const TIER_LABELS: Record<Tier, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  MAX: 'Max',
  ULTRA: 'Ultra',
}

const TIER_VARS: Record<Tier, { bg: string; fg: string; border: string }> = {
  FREE: {
    bg: 'var(--reals-tier-free-bg)',
    fg: 'var(--reals-tier-free-fg)',
    border: 'var(--reals-tier-free-border)',
  },
  BASIC: {
    bg: 'var(--reals-tier-basic-bg)',
    fg: 'var(--reals-tier-basic-fg)',
    border: 'var(--reals-tier-basic-border)',
  },
  MAX: {
    bg: 'var(--reals-tier-max-bg)',
    fg: 'var(--reals-tier-max-fg)',
    border: 'var(--reals-tier-max-border)',
  },
  ULTRA: {
    bg: 'var(--reals-tier-ultra-bg)',
    fg: 'var(--reals-tier-ultra-fg)',
    border: 'var(--reals-tier-ultra-border)',
  },
}

export interface TierBadgeProps {
  tier: Tier
  /** Số lượt còn lại; null = không giới hạn (ULTRA). Bỏ qua nếu chỉ cần badge tên tier. */
  creditsRemaining?: number | null
  /** Tổng lượt theo tier (hiển thị "còn X/Y lượt"). */
  limit?: number | null
  /** ClassName tuỳ ý của app (Tailwind utility...) — override được style mặc định. */
  className?: string
  /** Tooltip đầy đủ (email, nguồn đăng nhập...). */
  title?: string
}

/** Badge tier — hiển thị đồng nhất ở stem-app Header và main-app (account/pricing). */
export function TierBadge({
  tier,
  creditsRemaining,
  limit,
  className,
  title,
}: TierBadgeProps): React.ReactElement {
  const v = TIER_VARS[tier] || TIER_VARS.FREE
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.375rem 0.75rem',
    borderRadius: 'var(--reals-radius-full)',
    background: 'var(--reals-surface)',
    border: '1px solid var(--reals-surface-border)',
    fontSize: '0.75rem',
    lineHeight: '1rem',
    color: 'var(--reals-text-muted)',
  }
  const tierChip: React.CSSProperties = {
    padding: '0.125rem 0.5rem',
    borderRadius: 'var(--reals-radius-sm)',
    background: v.bg,
    color: v.fg,
    border: `1px solid ${v.border}`,
    fontWeight: 700,
    fontSize: '0.625rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  }
  return (
    <span className={className} style={base} title={title}>
      <span style={tierChip}>{tier}</span>
      {creditsRemaining === undefined ? null : creditsRemaining === null ? (
        <span style={{ color: 'var(--reals-tier-ultra-fg)', fontWeight: 500 }}>
          Không giới hạn
        </span>
      ) : (
        <span>
          còn{' '}
          <strong style={{ color: 'var(--reals-text)' }}>{creditsRemaining}</strong>/
          {limit ?? '∞'} lượt
        </span>
      )}
    </span>
  )
}

export interface StatusDotProps {
  ok: boolean
  label?: string
  className?: string
}

/** Chấm trạng thái online/offline (backend, GPU...) dùng token màu. */
export function StatusDot({ ok, label, className }: StatusDotProps): React.ReactElement {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.75rem',
        color: 'var(--reals-text-muted)',
      }}
    >
      <span
        style={{
          width: '0.625rem',
          height: '0.625rem',
          borderRadius: 'var(--reals-radius-full)',
          background: ok ? 'var(--reals-ok)' : 'var(--reals-danger)',
          boxShadow: `0 0 0.375rem ${ok ? 'var(--reals-ok)' : 'var(--reals-danger)'}`,
        }}
      />
      {label}
    </span>
  )
}
