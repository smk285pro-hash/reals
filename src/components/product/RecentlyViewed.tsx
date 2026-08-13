'use client'

import { Clock, Trash2 } from 'lucide-react'
import { Thumbnail } from '@/components/product/Thumbnail'
import { useRecentlyViewedStore, useAppStore } from '@/stores'
import { Button } from '@/components/ui/button'
import type { Product } from '@/types'
import { useI18n } from '@/components/providers/I18nProvider'

interface RecentlyViewedProps {
  onProductClick: (product: Product) => void
}

export function RecentlyViewed({ onProductClick }: RecentlyViewedProps) {
  const { t } = useI18n()
  const { items, clearAll } = useRecentlyViewedStore()

  if (items.length === 0) return null

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#aaa]">
          <Clock className="h-4 w-4" />
          <span className="text-sm font-medium">{t('recentlyViewed')}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-[#888] hover:text-red-400"
          onClick={clearAll}
        >
          <Trash2 className="h-3 w-3" />
          {t('clear')}
        </Button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((product) => (
          <div
            key={product.id}
            className="group shrink-0 cursor-pointer"
            onClick={() => onProductClick(product)}
          >
            <div className="relative h-20 w-36 overflow-hidden rounded-lg bg-[#333]">
              <Thumbnail
                src={product.thumbnail}
                alt={product.title}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              {product.duration && (
                <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[9px] text-white">
                  {product.duration}
                </div>
              )}
            </div>
            <p className="mt-1 w-36 truncate text-[11px] text-[#ccc]">{product.title}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
