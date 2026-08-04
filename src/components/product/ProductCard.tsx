'use client'

import { BadgeCheck, Star, Eye } from 'lucide-react'
import type { Product } from '@/types'
import { useAppStore } from '@/stores'

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

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const { setDetailProductId } = useAppStore()

  const initials = product.seller.name
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'RF'

  return (
    <div
      className="group cursor-pointer"
      onClick={() => setDetailProductId(product.id)}
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

        {/* Duration badge */}
        {product.duration && (
          <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
            {product.duration}
          </div>
        )}

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
  )
}
