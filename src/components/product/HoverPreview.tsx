'use client'

import { Star, Eye, BadgeCheck } from 'lucide-react'
import type { Product } from '@/types'

interface HoverPreviewProps {
  product: Product
  children: React.ReactNode
}

function formatViews(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export function HoverPreview({ product, children }: HoverPreviewProps) {
  return (
    <div className="group/preview relative">
      {children}
      {/* Hover tooltip - only on desktop */}
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-[280px] -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover/preview:opacity-100 max-xl:hidden">
        <div className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-3 shadow-2xl">
          {/* Mini preview */}
          <img
            src={product.thumbnail}
            alt={product.title}
            className="mb-2 aspect-video w-full rounded-lg object-cover"
          />
          <h4 className="mb-1 line-clamp-2 text-sm font-medium text-[#f1f1f1]">
            {product.title}
          </h4>
          <div className="flex items-center gap-1 text-xs text-[#aaa]">
            <span>{product.seller.name}</span>
            <BadgeCheck className="h-3 w-3 text-[#3ea6ff]" />
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-[#888]">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-[#f5a623] text-[#f5a623]" />
              {product.rating}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {formatViews(product.views)}
            </span>
            <span>{product.sales} đã bán</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-sm font-bold ${product.isFree ? 'text-[#3fb950]' : 'text-[#f5a623]'}`}>
              {product.isFree ? 'FREE' : `$${product.price}`}
            </span>
            <span className="rounded border border-[#303030] bg-[#0f0f0f] px-1.5 py-0.5 text-[10px] text-[#3ea6ff]">
              {product.format}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
