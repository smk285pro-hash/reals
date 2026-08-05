'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Bell, X, CheckCircle, XCircle, Package, DollarSign,
  Star, Megaphone, Check, CheckCheck, Trash2
} from 'lucide-react'
import { useAppStore, useNotificationStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  read: boolean
  createdAt: string
}

// Icon + color mapping per notification type
const typeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  SELLER_APPROVED: { icon: CheckCircle, color: 'text-[#3fb950]', bg: 'bg-[#3fb950]/10' },
  SELLER_REJECTED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
  PRODUCT_APPROVED: { icon: CheckCircle, color: 'text-[#3fb950]', bg: 'bg-[#3fb950]/10' },
  PRODUCT_REJECTED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
  NEW_SALE: { icon: DollarSign, color: 'text-[#f5a623]', bg: 'bg-[#f5a623]/10' },
  NEW_REVIEW: { icon: Star, color: 'text-[#3ea6ff]', bg: 'bg-[#3ea6ff]/10' },
  SYSTEM: { icon: Megaphone, color: 'text-[#f5a623]', bg: 'bg-[#f5a623]/10' },
}

const defaultConfig = { icon: Bell, color: 'text-[#888]', bg: 'bg-[#272727]' }

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày trước`
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

export function NotificationDropdown() {
  const { notificationOpen, setNotificationOpen, setActiveCategory, setSellerApplyModalOpen } = useAppStore()
  const { setUnreadCount: setStoreUnreadCount } = useNotificationStore()
  const { data: session } = useSession()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [localUnread, setLocalUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  const fetchNotifications = useCallback(async () => {
    if (!session?.user) return
    try {
      const res = await fetch('/api/notifications?limit=20')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setLocalUnread(data.unreadCount || 0)
        setStoreUnreadCount(data.unreadCount || 0)
        setTotalCount(data.totalCount || 0)
      }
    } catch {}
  }, [session])

  // Fetch when dropdown opens
  useEffect(() => {
    if (notificationOpen && session?.user) {
      setLoading(true)
      fetchNotifications().finally(() => setLoading(false))
    }
  }, [notificationOpen, session, fetchNotifications])

  // Poll for unread count every 30s (lightweight)
  useEffect(() => {
    if (!session?.user) return
    const poll = async () => {
      try {
        const res = await fetch('/api/notifications?limit=1&unread=true')
        if (res.ok) {
          const data = await res.json()
          setLocalUnread(data.unreadCount || 0)
          setStoreUnreadCount(data.unreadCount || 0)
        }
      } catch {}
    }
    poll() // Initial
    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [session])

  const markAsRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setLocalUnread(prev => Math.max(0, prev - 1))
      setStoreUnreadCount(Math.max(0, localUnread - 1))
    } catch {}
  }

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setLocalUnread(0)
      setStoreUnreadCount(0)
    } catch {}
  }

  const deleteNotification = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setNotifications(prev => prev.filter(n => n.id !== id))
      setTotalCount(prev => prev - 1)
    } catch {}
  }

  const handleNotificationClick = (n: Notification) => {
    // Mark as read
    if (!n.read) markAsRead(n.id)

    // Navigate based on type/link
    if (n.type === 'SELLER_APPROVED') {
      setNotificationOpen(false)
      setActiveCategory('seller')
    } else if (n.type === 'SELLER_REJECTED') {
      setNotificationOpen(false)
      setSellerApplyModalOpen(true)
    } else if (n.link) {
      setNotificationOpen(false)
      // Handle internal links
      if (n.link.startsWith('/?category=seller')) {
        setActiveCategory('seller')
      }
    }
  }

  if (!notificationOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setNotificationOpen(false)} />
      <div className="fixed right-4 top-14 z-50 w-[380px] overflow-hidden rounded-xl border border-[#303030] bg-[#0f0f0f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#303030] px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#f5a623]" />
            <span className="text-sm font-semibold text-white">Thông báo</span>
            {localUnread > 0 && (
              <span className="rounded-full bg-[#f5a623] px-1.5 py-0.5 text-[10px] font-bold text-black">
                {localUnread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {localUnread > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#3fb950] hover:bg-[#3fb950]/10"
                onClick={markAllAsRead}
                title="Đánh dấu tất cả đã đọc"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#aaa] hover:bg-[#272727] hover:text-white"
              onClick={() => setNotificationOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full bg-[#1f1f1f]" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4 bg-[#1f1f1f]" />
                    <Skeleton className="h-3 w-full bg-[#1f1f1f]" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <Bell className="h-10 w-10 text-[#303030]" />
              <p className="text-sm text-[#888]">Không có thông báo</p>
            </div>
          ) : (
            notifications.map(n => {
              const config = typeConfig[n.type] || defaultConfig
              const Icon = config.icon
              return (
                <div
                  key={n.id}
                  className={`group flex gap-3 border-b border-[#303030] px-4 py-3 transition-colors hover:bg-[#1a1a1a] cursor-pointer ${!n.read ? 'bg-[#1a1a1a]/50' : ''}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.bg} ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${!n.read ? 'text-[#f1f1f1]' : 'text-[#ccc]'}`}>{n.title}</p>
                    <p className="text-xs text-[#aaa] line-clamp-2">{n.message}</p>
                    <p className="mt-1 text-[10px] text-[#666]">{timeAgo(n.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {!n.read && <div className="mt-1.5 h-2 w-2 rounded-full bg-[#3ea6ff]" />}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#888] hover:bg-[#272727] hover:text-red-400 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); deleteNotification(n.id) }}
                      title="Xóa"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        {totalCount > notifications.length && (
          <div className="border-t border-[#303030] px-4 py-2">
            <Button
              variant="ghost"
              className="w-full text-xs text-[#3ea6ff] hover:text-[#3ea6ff]"
              onClick={() => {
                // Load more notifications
                fetch('/api/notifications?limit=50')
                  .then(r => r.ok ? r.json() : null)
                  .then(data => {
                    if (data) {
                      setNotifications(data.notifications || [])
                    }
                  })
                  .catch(() => {})
              }}
            >
              Xem tất cả {totalCount} thông báo
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
