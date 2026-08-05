'use client'

import { BadgeCheck, Star, Eye, Heart } from 'lucide-react'
import type { Product } from '@/types'
import { useAppStore, useWishlistStore, useRecentlyViewedStore } from '@/stores'
import { HoverPreview } from './HoverPreview'
import { useState, useRef, useCallback } from 'react'

function formatViews(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function getProductBadges(product: Product): { label: string; color: string }[] {
  const badges: { label: string; color: string }[] = []
  const daysSinceCreation = (Date.now() - new Date(product.createdAt).getTime()) / 86400000
  if (daysSinceCreation < 7) badges.push({ label: 'NEW', color: 'bg-[#3ea6ff] text-white' })
  if (product.sales > 500) badges.push({ label: 'HOT', color: 'bg-[#ff6b6b] text-white' })
  if (product.rating >= 4.8) badges.push({ label: 'TOP', color: 'bg-[#f5a623] text-black' })
  return badges.slice(0, 2)
}

interface ProductCardProps {
  product: Product
}

/** Extract YouTube video ID from URL */
function extractYTId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') && u.pathname === '/watch') return u.searchParams.get('v')
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null
    if (u.hostname === 'm.youtube.com' && u.pathname === '/watch') return u.searchParams.get('v')
    return null
  } catch {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|watch\?v=))([a-zA-Z0-9_-]{11})/)
    return m ? m[1] : null
  }
}

export function ProductCard({ product }: ProductCardProps) {
  const { setDetailProductId } = useAppStore()
  const { isInWishlist, toggleItem } = useWishlistStore()
  const { addItem: addRecent } = useRecentlyViewedStore()
  const inWishlist = isInWishlist(product.id)
  const badges = getProductBadges(product)

  // YouTube hover-to-play
  const ytId = product.videoUrl ? extractYTId(product.videoUrl) : null
  const [hovering, setHovering] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback(() => {
    setHovering(true)
    // Delay 400ms before loading iframe (avoid loading for quick passes)
    if (ytId) {
      hoverTimer.current = setTimeout(() => setShowVideo(true), 400)
    }
  }, [ytId])

  const handleMouseLeave = useCallback(() => {
    setHovering(false)
    setShowVideo(false)
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }, [])

  const initials = product.seller.name
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'RF'

  const handleClick = () => {
    addRecent(product)
    setDetailProductId(product.id)
  }

  return (
    <HoverPreview product={product}>
      <div
        className="group relative cursor-pointer"
        onClick={handleClick}
      >
        {/* Thumbnail / Video Preview */}
        <div
          className="relative aspect-video overflow-hidden rounded-xl bg-[#333]"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {showVideo && ytId ? (
            <div className="relative h-full w-full overflow-hidden">
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&cc_load_policy=0&annotations=0`}
                title={product.title}
                allow="autoplay; encrypted-media"
                className="absolute -inset-[12%] h-[124%] w-[124%] border-0"
                style={{ pointerEvents: 'none' }}
              />
            </div>
          ) : (
            <img
              src={product.thumbnail}
              alt={product.title}
              className={`h-full w-full object-cover transition-transform duration-200 ${hovering ? 'scale-105' : ''}`}
              loading="lazy"
            />
          )}

          {/* Price badge */}
          <div
            className={`absolute left-2 top-2 rounded px-2 py-0.5 text-xs font-bold uppercase ${
              product.isFree
                ? 'bg-[#3fb950] text-black'
                : 'bg-[#f5a623] text-black'
            }`}
          >
            {product.isFree ? 'FREE' : `$${Math.round(product.price)}`}
          </div>

          {/* Product badges NEW/HOT/TOP */}
          {badges.length > 0 && (
            <div className="absolute right-2 top-2 flex gap-1">
              {badges.map((b) => (
                <span key={b.label} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${b.color}`}>
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {/* Duration badge */}
          {product.duration && (
            <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
              {product.duration}
            </div>
          )}

          {/* Wishlist heart button */}
          <button
            className={`absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 transition-all hover:scale-110 ${
              inWishlist ? 'text-red-500' : 'text-white/70 hover:text-white'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              toggleItem(product)
            }}
          >
            <Heart className={`h-3.5 w-3.5 ${inWishlist ? 'fill-red-500' : ''}`} />
          </button>
        </div>

        {/* Info */}
        <div className="mt-3 flex gap-3">
          {/* Avatar */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f5a623] to-[#ff6b6b] text-xs font-bold text-black">
            {initials}
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <h3 className="line-clamp-2 break-words text-sm font-medium leading-snug text-[#f1f1f1]">
              {product.title}
            </h3>
            <div className="flex items-center gap-1 text-xs text-[#aaa]">
              <span className="truncate">{product.seller.name}</span>
              <BadgeCheck className="h-3 w-3 shrink-0 text-[#3ea6ff]" />
            </div>
            {/* Stats: rating • views • sales — always visible */}
            <div className="flex items-center gap-2 text-xs text-[#888]">
              <span className="flex shrink-0 items-center gap-0.5">
                <Star className="h-3 w-3 fill-[#f5a623] text-[#f5a623]" />
                <span className="text-[#f5a623]">{product.rating}</span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <Eye className="h-3 w-3" />
                {formatViews(product.views)}
              </span>
              <span className="shrink-0">{product.sales} bán</span>
            </div>
            {/* Format tag */}
            <span className="mt-1 inline-block rounded border border-[#303030] bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] font-medium text-[#3ea6ff]">
              {product.format}
            </span>
          </div>
        </div>
      </div>
    </HoverPreview>
  )
}
