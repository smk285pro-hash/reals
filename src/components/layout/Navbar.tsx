'use client'

import { Search, Menu, Video, Bell, ShoppingCart, Upload, User } from 'lucide-react'
import { useAppStore, useCartStore } from '@/stores'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useEffect, useState } from 'react'

export function Navbar() {
  const { toggleSidebar, setSearchQuery, setCartDrawerOpen, searchQuery } = useAppStore()
  const totalItems = useCartStore((s) => s.totalItems())
  const [localSearch, setLocalSearch] = useState(searchQuery)

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(localSearch), 300)
    return () => clearTimeout(timer)
  }, [localSearch, setSearchQuery])

  return (
    <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-[#303030] bg-[#0f0f0f] px-4 md:px-6">
      {/* Left */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-[#272727]"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <a href="#" className="flex items-center gap-1 text-xl font-bold tracking-tight text-white">
          Rea<span className="text-[#f5a623]">Tube</span>{' '}
          <span className="hidden text-sm font-normal text-[#aaa] sm:inline">Store</span>
        </a>
      </div>

      {/* Center - Search */}
      <div className="mx-4 hidden max-w-[600px] flex-1 md:flex">
        <div className="flex w-full">
          <Input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Tìm plugin, script, tutorial..."
            className="h-10 rounded-l-full rounded-r-none border-[#303030] bg-[#121212] text-white placeholder:text-[#888] focus:border-[#3ea6ff] focus-visible:ring-0"
          />
          <Button className="h-10 rounded-r-full rounded-l-none border border-l-0 border-[#303030] bg-[#222] text-[#aaa] hover:bg-[#272727]">
            <Search className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 md:gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="hidden text-white hover:bg-[#272727] md:flex"
        >
          <Upload className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden text-white hover:bg-[#272727] md:flex"
        >
          <Video className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-[#272727]">
          <Bell className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden text-white hover:bg-[#272727] md:flex"
        >
          <User className="h-5 w-5" />
        </Button>
        <Button
          onClick={() => setCartDrawerOpen(true)}
          className="flex items-center gap-2 rounded-full bg-[#f5a623] px-4 text-sm font-semibold text-black hover:bg-[#e09515]"
        >
          <ShoppingCart className="h-4 w-4" />
          <span className="hidden sm:inline">Giỏ hàng</span>
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
