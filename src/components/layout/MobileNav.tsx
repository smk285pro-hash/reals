'use client'

import { Home, Search, Heart, ShoppingCart, LayoutDashboard } from 'lucide-react'
import { useAppStore, useCartStore, useWishlistStore } from '@/stores'

export function MobileNav() {
  const { setActiveCategory, setCartDrawerOpen } = useAppStore()
  const cartCount = useCartStore((s) => s.totalItems())
  const wishlistCount = useWishlistStore((s) => s.items.length)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#303030] bg-[#0f0f0f] px-2 pb-safe md:hidden">
      <div className="flex items-center justify-around py-2">
        <button
          onClick={() => setActiveCategory('all')}
          className="flex flex-col items-center gap-0.5 text-[#f1f1f1]"
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px]">Trang chủ</span>
        </button>
        <button className="flex flex-col items-center gap-0.5 text-[#aaa]">
          <Search className="h-5 w-5" />
          <span className="text-[10px]">Tìm kiếm</span>
        </button>
        <button
          onClick={() => setActiveCategory('wishlist')}
          className="relative flex flex-col items-center gap-0.5 text-[#aaa]"
        >
          <Heart className="h-5 w-5" />
          <span className="text-[10px]">Yêu thích</span>
          {wishlistCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ff6b6b] px-1 text-[9px] font-bold text-white">
              {wishlistCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setCartDrawerOpen(true)}
          className="relative flex flex-col items-center gap-0.5 text-[#aaa]"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="text-[10px]">Giỏ hàng</span>
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#f5a623] px-1 text-[9px] font-bold text-black">
              {cartCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveCategory('seller')}
          className="flex flex-col items-center gap-0.5 text-[#aaa]"
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="text-[10px]">Dashboard</span>
        </button>
      </div>
    </nav>
  )
}
