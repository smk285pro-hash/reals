'use client'

import { useEffect } from 'react'

function getVisitorId() {
  const key = 'reals_visitor_id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  window.localStorage.setItem(key, id)
  return id
}

export function trackAnalyticsEvent(eventType: 'PAGE_VIEW' | 'PRODUCT_VIEW', productId?: string) {
  if (typeof window === 'undefined') return
  const payload = {
    eventType,
    visitorId: getVisitorId(),
    path: `${window.location.pathname}${window.location.search}`,
    productId,
  }
  void fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {})
}

export function AnalyticsTracker() {
  useEffect(() => {
    trackAnalyticsEvent('PAGE_VIEW')
  }, [])
  return null
}
