'use client'

import { useEffect } from 'react'

type AnalyticsEventType = 'PAGE_VIEW' | 'PRODUCT_VIEW' | 'SESSION_START' | 'HEARTBEAT' | 'SESSION_END'

const VISITOR_KEY = 'reals_visitor_id'
const SESSION_KEY = 'reals_analytics_session'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const HEARTBEAT_MS = 15 * 1000

interface StoredSession {
  id: string
  lastActivityAt: number
}

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_KEY)
  if (existing) return existing
  const id = createId()
  window.localStorage.setItem(VISITOR_KEY, id)
  return id
}

function readStoredSession(): StoredSession | null {
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY)
    return value ? JSON.parse(value) as StoredSession : null
  } catch {
    return null
  }
}

function getAnalyticsSession() {
  const now = Date.now()
  const existing = readStoredSession()
  if (existing && now - existing.lastActivityAt < SESSION_TIMEOUT_MS) return { ...existing, isNew: false }
  const next = { id: createId(), lastActivityAt: now }
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
  return { ...next, isNew: true }
}

function touchAnalyticsSession(id: string) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastActivityAt: Date.now() }))
}

function sendAnalyticsEvent(eventType: AnalyticsEventType, options: { productId?: string; activeSeconds?: number; interactions?: number; useBeacon?: boolean } = {}) {
  if (typeof window === 'undefined') return
  const analyticsSession = getAnalyticsSession()
  touchAnalyticsSession(analyticsSession.id)
  const payload = JSON.stringify({
    eventType,
    visitorId: getVisitorId(),
    sessionId: analyticsSession.id,
    path: `${window.location.pathname}${window.location.search}`,
    productId: options.productId,
    activeSeconds: options.activeSeconds || 0,
    interactions: options.interactions || 0,
  })

  if (options.useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/track', new Blob([payload], { type: 'application/json' }))
    return
  }

  void fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {})
}

export function trackAnalyticsEvent(eventType: 'PAGE_VIEW' | 'PRODUCT_VIEW', productId?: string) {
  sendAnalyticsEvent(eventType, { productId })
}

export function AnalyticsTracker() {
  useEffect(() => {
    const analyticsSession = getAnalyticsSession()
    if (analyticsSession.isNew) sendAnalyticsEvent('SESSION_START')

    let activeSince = document.visibilityState === 'visible' ? Date.now() : 0
    let pendingActiveSeconds = 0
    let pendingInteractions = 0
    let lastInteractionAt = 0

    const collectActiveTime = () => {
      if (!activeSince) return
      pendingActiveSeconds += Math.max(0, Math.round((Date.now() - activeSince) / 1000))
      activeSince = 0
    }

    const flush = (eventType: 'HEARTBEAT' | 'SESSION_END', useBeacon = false) => {
      collectActiveTime()
      if (eventType === 'HEARTBEAT' && pendingActiveSeconds === 0 && pendingInteractions === 0) return
      sendAnalyticsEvent(eventType, { activeSeconds: pendingActiveSeconds, interactions: pendingInteractions, useBeacon })
      pendingActiveSeconds = 0
      pendingInteractions = 0
      if (document.visibilityState === 'visible') activeSince = Date.now()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush('HEARTBEAT', true)
      else if (!activeSince) activeSince = Date.now()
    }

    const handleInteraction = () => {
      const now = Date.now()
      if (now - lastInteractionAt < 1000) return
      lastInteractionAt = now
      pendingInteractions += 1
      touchAnalyticsSession(analyticsSession.id)
    }

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) flush('HEARTBEAT', true)
      else flush('SESSION_END', true)
    }
    const interval = window.setInterval(() => flush('HEARTBEAT'), HEARTBEAT_MS)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('click', handleInteraction, { passive: true })
    window.addEventListener('scroll', handleInteraction, { passive: true })
    window.addEventListener('keydown', handleInteraction)

    return () => {
      window.clearInterval(interval)
      flush('HEARTBEAT', true)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('scroll', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
    }
  }, [])

  return null
}
