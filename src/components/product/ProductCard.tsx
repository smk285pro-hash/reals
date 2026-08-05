'use client'

import { BadgeCheck, Star, Eye, Heart } from 'lucide-react'
import type { Product } from '@/types'
import { useAppStore, useWishlistStore, useRecentlyViewedStore } from '@/stores'
import { HoverPreview } from './HoverPreview'

function formatViews(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 7) return `${days} ngày trước`
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`
  return `${Math.floor(days / 365)} năm trước`
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

export function ProductCard({ product }: ProductCardProps) {
  const { setDetailProductId } = useAppStore()
  const { isInWishlist, toggleItem } = useWishlistStore()
  const { addItem: addRecent } = useRecentlyViewedStore()
  const inWishlist = isInWishlist(product.id)
  const badges = getProductBadges(product)

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
        {/* Thumbnail */}
        <div className="relative aspect-video overflow-hidden rounded-xl bg-[#333]">
          <img
            src={product.thumbnail}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />

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

          {/* Rating overlay on hover */}
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex items-center gap-1 text-xs text-white">
              <Star className="h-3 w-3 fill-[#f5a623] text-[#f5a623]" />
              {product.rating}
              <span className="mx-1">•</span>
              <Eye className="h-3 w-3" />
              {formatViews(product.views)}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-3 flex gap-3">
          {/* Avatar */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f5a623] to-[#ff6b6b] text-xs font-bold text-black">
            {initials}
          </div>

          <div className="flex-1 space-y-0.5">
            <h3 className="line-clamp-2 text-sm font-medium leading-snug text-[#f1f1f1]">
              {product.title}
            </h3>
            <div className="flex items-center gap-1 text-xs text-[#aaa]">
              <span>{product.seller.name}</span>
              <BadgeCheck className="h-3 w-3 text-[#3ea6ff]" />
            </div>
            <div className="flex items-center gap-1 text-xs text-[#aaa]">
              <span>{formatViews(product.views)} views</span>
              <span>•</span>
              <span>{timeAgo(product.createdAt)}</span>
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
