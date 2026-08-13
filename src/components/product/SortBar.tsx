'use client'

import { SlidersHorizontal, ArrowUpDown } from 'lucide-react'
import { useAppStore } from '@/stores'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/components/providers/I18nProvider'

export function SortBar() {
  const { t } = useI18n()
  const sortOptions = [
    { value: 'latest' as const, label: t('latest') },
    { value: 'popular' as const, label: t('popular') },
    { value: 'rating' as const, label: t('topRated') },
    { value: 'price-asc' as const, label: t('priceLow') },
    { value: 'price-desc' as const, label: t('priceHigh') },
    { value: 'best-selling' as const, label: t('bestSelling') },
  ]
  const { sortBy, setSortBy } = useAppStore()
  const currentLabel = sortOptions.find((o) => o.value === sortBy)?.label || t('sort')

  return (
    <div className="flex items-center justify-between px-4 py-2 md:px-6">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-[#aaa]" />
        <span className="text-sm text-[#aaa]">{t('sort')}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="gap-1 text-sm text-[#f1f1f1] hover:bg-[#272727]"
            >
              <ArrowUpDown className="h-3 w-3" />
              {currentLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="border-[#303030] bg-[#1f1f1f] text-[#f1f1f1]"
          >
            {sortOptions.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                className={`cursor-pointer ${
                  sortBy === opt.value
                    ? 'bg-[#272727] text-[#f5a623]'
                    : 'hover:bg-[#272727]'
                }`}
                onClick={() => setSortBy(opt.value)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
