'use client'

import { Bell, X, ShoppingBag, Tag, Zap, Gift } from 'lucide-react'
import { useAppStore } from '@/stores'
import { Button } from '@/components/ui/button'

const notifications = [
  { icon: Zap, color: 'text-[#f5a623]', title: 'Flash Sale', desc: 'Giảm 30% tất cả JSFX — chỉ 24h nữa!', time: '2 phút trước' },
  { icon: Gift, color: 'text-[#3fb950]', title: 'Quà tặng miễn phí', desc: 'Tải Pitch Drift Mini — plugin mới nhất từ ReaForge', time: '1 giờ trước' },
  { icon: ShoppingBag, color: 'text-[#3ea6ff]', title: 'Bán chạy tuần này', desc: 'Glue Bus Comp đang hot — 290 lượt mua', time: '3 giờ trước' },
  { icon: Tag, color: 'text-[#ff6b6b]', title: 'Sản phẩm mới', desc: 'Spatial Panner 3D vừa được đăng — xem ngay!', time: '5 giờ trước' },
]

export function NotificationDropdown() {
  const { notificationOpen, setNotificationOpen } = useAppStore()

  if (!notificationOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setNotificationOpen(false)} />
      <div className="fixed right-4 top-14 z-50 w-[360px] overflow-hidden rounded-xl border border-[#303030] bg-[#0f0f0f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#303030] px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#f5a623]" />
            <span className="text-sm font-semibold text-white">Thông báo</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#aaa] hover:bg-[#272727] hover:text-white"
            onClick={() => setNotificationOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.map((n, i) => (
            <div
              key={i}
              className="flex gap-3 border-b border-[#303030] px-4 py-3 transition-colors hover:bg-[#1a1a1a] cursor-pointer"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1f1f1f] ${n.color}`}>
                <n.icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#f1f1f1]">{n.title}</p>
                <p className="text-xs text-[#aaa]">{n.desc}</p>
                <p className="mt-1 text-[10px] text-[#666]">{n.time}</p>
              </div>
              {i === 0 && <div className="mt-1.5 h-2 w-2 rounded-full bg-[#3ea6ff]" />}
            </div>
          ))}
        </div>
        <div className="px-4 py-2">
          <Button
            variant="ghost"
            className="w-full text-xs text-[#3ea6ff] hover:text-[#3ea6ff]"
          >
            Xem tất cả thông báo
          </Button>
        </div>
      </div>
    </>
  )
}
