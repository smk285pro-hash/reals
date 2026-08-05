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

const sortOptions = [
  { value: 'latest' as const, label: 'Mới nhất' },
  { value: 'popular' as const, label: 'Phổ biến nhất' },
  { value: 'rating' as const, label: 'Đánh giá cao' },
  { value: 'price-asc' as const, label: 'Giá thấp → cao' },
  { value: 'price-desc' as const, label: 'Giá cao → thấp' },
  { value: 'best-selling' as const, label: 'Bán chạy nhất' },
]

export function SortBar() {
  const { sortBy, setSortBy } = useAppStore()
  const currentLabel = sortOptions.find((o) => o.value === sortBy)?.label || 'Sắp xếp'

  return (
    <div className="flex items-center justify-between px-4 py-2 md:px-6">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-[#aaa]" />
        <span className="text-sm text-[#aaa]">Sắp xếp:</span>
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
