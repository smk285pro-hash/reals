'use client'

import {
  Home, Flame, Clock, Tag, Heart, Download,
  Settings, HelpCircle, ChevronDown, ChevronUp, ShoppingBag, Star, LayoutDashboard, LogIn, Store, Bell
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useAppStore, useWishlistStore, useNotificationStore } from '@/stores'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useI18n } from '@/components/providers/I18nProvider'
import { stripLocaleFromPathname } from '@/i18n/config'
import Link from 'next/link'

const mainLinks = [
  { icon: Home, label: 'Trang chủ', id: 'all' },
  { icon: Flame, label: 'Nổi bật', id: 'featured' },
  { icon: ShoppingBag, label: 'Bán chạy', id: 'best-selling' },
  { icon: Clock, label: 'Mới nhất', id: 'latest' },
  { icon: Tag, label: 'Miễn phí', id: 'free' },
]

const categoryLinks = [
  { icon: Download, label: 'JSFX', id: 'jsfx' },
  { icon: Download, label: 'ReaScript', id: 'reascript' },
  { icon: Download, label: 'Extension', id: 'extension' },
  { icon: Download, label: 'Mixing', id: 'mixing' },
  { icon: Download, label: 'Game Audio', id: 'game-audio' },
  { icon: Download, label: 'MIDI', id: 'midi' },
  { icon: Download, label: 'Template', id: 'template' },
]

export function Sidebar() {
  const router = useRouter()
  const { locale, t } = useI18n()
  const { sidebarOpen, setActiveCategory, activeCategory, setLoginModalOpen, setSidebarOpen, setSellerApplyModalOpen, setNotificationOpen } = useAppStore()
  const wishlistCount = useWishlistStore((s) => s.items.length)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const { data: session } = useSession()
  const [categoriesExpanded, setCategoriesExpanded] = useState(true)

  const handleCategoryClick = (catId: string) => {
    setActiveCategory(catId)
    setSidebarOpen(false)
    const barePath = typeof window !== 'undefined' ? stripLocaleFromPathname(window.location.pathname) : '/'
    if (barePath !== '/') {
      router.push(`/${locale}?category=${catId}`)
    }
  }

  if (!sidebarOpen) return null

  const userInitial = session?.user?.name
    ? session.user.name.charAt(0).toUpperCase()
    : 'U'

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => useAppStore.getState().setSidebarOpen(false)}
      />

      {/* Sidebar panel */}
      <aside className="fixed left-0 top-0 z-50 flex h-full w-[240px] flex-col overflow-y-auto bg-[#0f0f0f] pt-14 shadow-xl">
        {/* User profile section */}
        {session?.user ? (
          <div className="flex items-center gap-3 border-b border-[#303030] px-4 py-4">
            <Avatar className="h-9 w-9 border border-[#303030]">
              <AvatarImage src={session.user.image || undefined} alt={session.user.name || 'User'} />
              <AvatarFallback className="bg-[#f5a623] text-black text-sm font-bold">
                {userInitial}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-[#f1f1f1]">{session.user.name || 'User'}</p>
              <p className="truncate text-xs text-[#888]">{session.user.email}</p>
            </div>
          </div>
        ) : (
          <div className="border-b border-[#303030] px-4 py-3">
            <Button
              className="w-full gap-2 bg-[#f5a623] text-black font-semibold hover:bg-[#e09515] text-sm"
              onClick={() => {
                setLoginModalOpen(true)
                setSidebarOpen(false)
              }}
            >
              <LogIn className="h-4 w-4" />
              {t('login')}
            </Button>
          </div>
        )}

        <div className="flex-1 space-y-1 px-3 py-4">
          {/* AI Audio Lab Highlight Banner */}
          <Link
            href="/audio-lab"
            onClick={() => useAppStore.getState().setSidebarOpen(false)}
            className="block mb-2"
          >
            <Button
              className="w-full justify-start gap-3 rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-purple-600/15 to-transparent px-3 py-2.5 text-sm font-bold text-amber-400 hover:from-amber-500/25 hover:border-amber-500/60 transition-all cursor-pointer"
            >
              <span className="text-base">⚡</span>
              AI Audio Lab
              <span className="ml-auto rounded-full bg-gradient-to-r from-amber-500 to-purple-600 px-1.5 py-0.5 text-[9px] font-bold text-white">AI</span>
            </Button>
          </Link>

          {/* Main navigation */}
          {mainLinks.map((link) => (
            <Button
              key={link.id}
              variant="ghost"
              className={`w-full justify-start gap-6 px-3 text-sm ${
                activeCategory === link.id
                  ? 'bg-[#272727] font-medium text-white'
                  : 'text-[#f1f1f1] hover:bg-[#1f1f1f]'
              }`}
              onClick={() => handleCategoryClick(link.id)}
            >
              <link.icon className="h-5 w-5" />
              {link.id === 'all' ? t('home') : link.id === 'featured' ? t('featured') : link.id === 'best-selling' ? t('bestSelling') : link.id === 'latest' ? t('latest') : link.id === 'free' ? t('free') : link.label}
            </Button>
          ))}

          <Separator className="my-3 bg-[#303030]" />

          {/* Categories section */}
          <Button
            variant="ghost"
            className="w-full justify-between px-3 text-sm text-[#f1f1f1] hover:bg-transparent"
            onClick={() => setCategoriesExpanded(!categoriesExpanded)}
          >
            <span className="flex items-center gap-6">
              <Star className="h-5 w-5" />
              {t('categories')}
            </span>
            {categoriesExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {categoriesExpanded && (
            <div className="space-y-1 pl-4">
              {categoryLinks.map((link) => (
                <Button
                  key={link.id}
                  variant="ghost"
                  className={`w-full justify-start gap-5 px-3 text-sm ${
                    activeCategory === link.id
                      ? 'bg-[#272727] font-medium text-white'
                      : 'text-[#aaa] hover:bg-[#1f1f1f] hover:text-white'
                  }`}
                  onClick={() => handleCategoryClick(link.id)}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Button>
              ))}
            </div>
          )}

          <Separator className="my-3 bg-[#303030]" />

          <Button
            variant="ghost"
            className="w-full justify-start gap-6 px-3 text-sm text-[#f1f1f1] hover:bg-[#1f1f1f]"
            onClick={() => handleCategoryClick('wishlist')}
          >
            <Heart className="h-5 w-5" />
            {t('wishlist')}
            {wishlistCount > 0 && (
              <span className="ml-auto rounded-full bg-[#ff6b6b] px-2 py-0.5 text-[10px] font-bold text-white">
                {wishlistCount}
              </span>
            )}
          </Button>

          {session?.user && (
            <Button
              variant="ghost"
              className="w-full justify-start gap-6 px-3 text-sm text-[#f1f1f1] hover:bg-[#1f1f1f]"
              onClick={() => {
                setNotificationOpen(true)
                useAppStore.getState().setSidebarOpen(false)
              }}
            >
              <Bell className="h-5 w-5" />
              {t('notifications')}
              {unreadCount > 0 && (
                <span className="ml-auto rounded-full bg-[#f5a623] px-2 py-0.5 text-[10px] font-bold text-black">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          )}

          <Separator className="my-3 bg-[#303030]" />

          {session?.user && (session.user as any)?.isSeller ? (
            <Button
              variant="ghost"
              className={`w-full justify-start gap-6 px-3 text-sm ${
                activeCategory === 'seller'
                  ? 'bg-[#272727] font-medium text-[#f5a623]'
                  : 'text-[#f1f1f1] hover:bg-[#1f1f1f]'
              }`}
              onClick={() => handleCategoryClick('seller')}
            >
              <LayoutDashboard className="h-5 w-5" />
              Seller Dashboard
            </Button>
          ) : session?.user ? (
            <Button
              className="w-full justify-start gap-3 rounded-lg border border-[#f5a623]/30 bg-gradient-to-r from-[#f5a623]/10 to-transparent px-3 py-2.5 text-sm font-medium text-[#f5a623] hover:from-[#f5a623]/20 hover:border-[#f5a623]/50 transition-all"
              onClick={() => {
                useAppStore.getState().setSellerApplyModalOpen(true)
                setTimeout(() => useAppStore.getState().setSidebarOpen(false), 50)
              }}
            >
              <Store className="h-5 w-5" />
              {t('sellerApply')}
              <span className="ml-auto rounded-full bg-[#f5a623] px-1.5 py-0.5 text-[9px] font-bold text-black">{t('new')}</span>
            </Button>
          ) : null}

          <Button
            variant="ghost"
            className="w-full justify-start gap-6 px-3 text-sm text-[#f1f1f1] hover:bg-[#1f1f1f]"
          >
            <Settings className="h-5 w-5" />
            {t('settings')}
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-6 px-3 text-sm text-[#f1f1f1] hover:bg-[#1f1f1f]"
          >
            <HelpCircle className="h-5 w-5" />
            {t('help')}
          </Button>
        </div>

        {/* Footer */}
        <div className="border-t border-[#303030] px-4 py-4 text-xs text-[#888]">
          <p>© 2025 RealS</p>
          <p className="mt-1">Plugin & Script marketplace cho REAPER</p>
        </div>
      </aside>
    </>
  )
}
