'use client'

import { TrendingUp, Star, BadgeCheck } from 'lucide-react'
import { Thumbnail } from '@/components/product/Thumbnail'
import type { Product } from '@/types'
import { useI18n } from '@/components/providers/I18nProvider'

interface TrendingSectionProps {
  products: Product[]
}

function formatViews(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export function TrendingSection({ products }: TrendingSectionProps) {
  const { t } = useI18n()
  // Get top 5 by views
  const trending = [...products]
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)

  if (trending.length === 0) return null

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-[#303030] bg-gradient-to-r from-[#1a1400] to-[#0f0f0f]">
      <div className="flex items-center gap-2 px-4 py-3">
        <TrendingUp className="h-5 w-5 text-[#f5a623]" />
        <h2 className="text-sm font-semibold text-[#f5a623]">{t('trending')}</h2>
      </div>
      <div className="flex gap-0 overflow-x-auto px-2 pb-3">
        {trending.map((product, i) => (
          <div
            key={product.id}
            className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[#272727] cursor-pointer"
          >
            <span className={`text-lg font-black ${i === 0 ? 'text-[#f5a623]' : i === 1 ? 'text-[#ccc]' : i === 2 ? 'text-[#cd7f32]' : 'text-[#555]'}`}>
              {i + 1}
            </span>
            <Thumbnail
              src={product.thumbnail}
              alt={product.title}
              className="h-10 w-16 rounded object-cover"
            />
            <div className="w-[140px]">
              <p className="truncate text-xs font-medium text-[#f1f1f1]">{product.title}</p>
              <div className="flex items-center gap-1 text-[10px] text-[#aaa]">
                <span>{product.seller.name}</span>
                <BadgeCheck className="h-2.5 w-2.5 text-[#3ea6ff]" />
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#888]">
                <Star className="h-2.5 w-2.5 fill-[#f5a623] text-[#f5a623]" />
                {product.rating} • {t('views', { count: formatViews(product.views) })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
