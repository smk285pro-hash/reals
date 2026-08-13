'use client'

import { Search, Menu, Video, Bell, ShoppingCart, Upload, User, Share2, LogOut, Settings, Package, ChevronDown, Shield, Store } from 'lucide-react'
import { useSession, signOut } from 'next-auth/react'
import { useAppStore, useCartStore, useNotificationStore } from '@/stores'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useEffect, useState } from 'react'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { useI18n } from '@/components/providers/I18nProvider'
import Link from 'next/link'

export function Navbar() {
  const { locale, t } = useI18n()
  const {
    toggleSidebar, setSearchQuery, setCartDrawerOpen, searchQuery,
    notificationOpen, setNotificationOpen,
    setLoginModalOpen, setActiveCategory, setSellerApplyModalOpen,
  } = useAppStore()
  const totalItems = useCartStore((s) => s.totalItems())
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const { data: session, status } = useSession()
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(localSearch), 300)
    return () => clearTimeout(timer)
  }, [localSearch, setSearchQuery])

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'RealS', url: window.location.href })
    } else {
      await navigator.clipboard.writeText(window.location.href)
    }
  }

  const userInitial = session?.user?.name
    ? session.user.name.charAt(0).toUpperCase()
    : session?.user?.email
      ? session.user.email.charAt(0).toUpperCase()
      : 'U'

  return (
    <nav className="sticky top-0 z-50 flex h-14 items-center justify-between gap-2 border-b border-[#303030] bg-[#0f0f0f] px-3 md:gap-4 md:px-6">
      {/* Left */}
      <div className="flex shrink-0 items-center gap-2.5 md:gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full text-[#d9d9d9] hover:bg-[#272727] hover:text-white"
          onClick={toggleSidebar}
          aria-label={t('categories')}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link
          href={`/${locale}`}
          className="group flex h-10 items-center gap-2 rounded-lg px-1 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f93a]/70"
          aria-label={`${t('home')} — RealS`}
          onClick={() => {
            setActiveCategory('all')
            setSearchQuery('')
            setLocalSearch('')
          }}
        >
          <span
            aria-hidden="true"
            className="h-[22px] w-[45px] shrink-0 bg-[#c8f93a] [mask:url('/reals-mark.svg')_center/contain_no-repeat]"
          />
          <span className="text-[20px] font-bold leading-none tracking-[-0.035em] text-white">
            Real<span className="text-[#c8f93a]">S</span>
          </span>
        </Link>
      </div>

      {/* Center - Search */}
      <div className="mx-4 hidden min-w-0 max-w-[600px] flex-1 md:flex">
        <div className="flex w-full">
          <Input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={t('search')}
            className="h-10 rounded-l-full rounded-r-none border-[#303030] bg-[#121212] text-white placeholder:text-[#888] focus:border-[#3ea6ff] focus-visible:ring-0"
          />
          <Button className="h-10 rounded-r-full rounded-l-none border border-l-0 border-[#303030] bg-[#222] text-[#aaa] hover:bg-[#272727]">
            <Search className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Right */}
      <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
        {/* Upload / Seller button - smart based on isSeller status */}
        {session?.user && (session.user as any)?.isSeller ? (
          <Button
            variant="ghost"
            size="icon"
            className="hidden text-white hover:bg-[#272727] md:flex"
            onClick={() => setActiveCategory('seller')}
            title={t('upload')}
          >
            <Upload className="h-5 w-5" />
          </Button>
        ) : session?.user ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 rounded-full border border-[#f5a623]/40 bg-[#f5a623]/10 px-3 text-[#f5a623] hover:bg-[#f5a623]/20"
            onClick={() => setSellerApplyModalOpen(true)}
            title={t('sellerApply')}
          >
            <Store className="h-4 w-4" />
            <span className="hidden sm:inline text-xs font-medium">{t('sellerApply')}</span>
          </Button>
        ) : null}
        {/* Admin button - only show for admin */}
        {session?.user && (session.user as any).role === 'ADMIN' && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden text-red-400 hover:bg-red-400/10 md:flex"
            onClick={() => setActiveCategory('admin')}
            title="Admin Dashboard"
          >
            <Shield className="h-5 w-5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="hidden text-white hover:bg-[#272727] md:flex"
        >
          <Video className="h-5 w-5" />
        </Button>
        <LanguageSwitcher />
        <Button
          variant="ghost"
          size="icon"
          className="relative text-white hover:bg-[#272727]"
          onClick={() => setNotificationOpen(!notificationOpen)}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#f5a623] px-1 text-[9px] font-bold text-black">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden text-white hover:bg-[#272727] md:flex"
          onClick={handleShare}
        >
          <Share2 className="h-5 w-5" />
        </Button>

        {/* Auth: User dropdown or Login button */}
        {status === 'loading' ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-[#272727]" />
        ) : session?.user ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full hover:bg-[#272727] p-0">
                <Avatar className="h-8 w-8 border border-[#303030]">
                  {!imageError && session.user.image ? (
                    <AvatarImage
                      src={session.user.image}
                      alt={session.user.name || 'User'}
                      onError={() => setImageError(true)}
                    />
                  ) : null}
                  <AvatarFallback className="bg-[#f5a623] text-black text-sm font-bold">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 border-[#303030] bg-[#181818] text-[#f1f1f1]"
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{session.user.name || 'User'}</p>
                  <p className="text-xs text-[#888]">{session.user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#303030]" />
              {(session.user as any)?.isSeller ? (
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-[#ccc] focus:bg-[#272727] focus:text-[#f1f1f1]"
                  onClick={() => setActiveCategory('seller')}
                >
                  <Package className="h-4 w-4" />
                  {t('productsManage')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-[#f5a623] focus:bg-[#f5a623]/10 focus:text-[#f5a623]"
                  onClick={() => setSellerApplyModalOpen(true)}
                >
                  <Store className="h-4 w-4" />
                  {t('sellerApply')}
                </DropdownMenuItem>
              )}
              {(session.user as any).role === 'ADMIN' && (
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-red-400 focus:bg-red-400/10 focus:text-red-400"
                  onClick={() => setActiveCategory('admin')}
                >
                  <Shield className="h-4 w-4" />
                  Admin Dashboard
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-[#ccc] focus:bg-[#272727] focus:text-[#f1f1f1]"
              >
                <Settings className="h-4 w-4" />
                {t('settings')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#303030]" />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-red-400 focus:bg-[#272727] focus:text-red-400"
                onClick={() => signOut({ callbackUrl: '/' })}
              >
                <LogOut className="h-4 w-4" />
                {t('logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            onClick={() => setLoginModalOpen(true)}
            variant="ghost"
            size="icon"
            className="hidden text-white hover:bg-[#272727] md:flex"
          >
            <User className="h-5 w-5" />
          </Button>
        )}

        <Button
          onClick={() => setCartDrawerOpen(true)}
          className="flex items-center gap-2 rounded-full bg-[#f5a623] px-4 text-sm font-semibold text-black hover:bg-[#e09515]"
        >
          <ShoppingCart className="h-4 w-4" />
          <span className="hidden sm:inline">{t('cart')}</span>
          {totalItems > 0 && (
            <Badge className="h-5 min-w-[20px] rounded-full bg-black px-1.5 text-[10px] font-bold text-[#f5a623]">
              {totalItems}
            </Badge>
          )}
        </Button>
      </div>

    </nav>
  )
}
