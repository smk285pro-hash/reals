'use client'

import { useAppStore } from '@/stores'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import type { Category } from '@/types'
import { useI18n } from '@/components/providers/I18nProvider'

const chips = [
  { slug: 'all', name: 'Tất cả' },
  { slug: 'jsfx', name: 'JSFX' },
  { slug: 'reascript', name: 'ReaScript' },
  { slug: 'extension', name: 'Extension' },
  { slug: 'mixing', name: 'Mixing' },
  { slug: 'game-audio', name: 'Game Audio' },
  { slug: 'midi', name: 'MIDI' },
  { slug: 'template', name: 'Template' },
  { slug: 'free', name: 'Miễn phí' },
  { slug: 'best-selling', name: 'Bán chạy' },
  { slug: 'featured', name: 'Nổi bật' },
]

interface CategoryBarProps {
  categories?: Category[]
}

export function CategoryBar({ categories }: CategoryBarProps) {
  const { t } = useI18n()
  const { activeCategory, setActiveCategory } = useAppStore()

  const mergedChips = categories && categories.length > 0
    ? [
        { slug: 'all', name: t('all') },
        ...categories.map((c) => ({ slug: c.slug, name: c.name })),
        { slug: 'free', name: t('free') },
        { slug: 'best-selling', name: t('bestSelling') },
        { slug: 'featured', name: t('featured') },
      ]
    : chips.map((chip) => ({
        ...chip,
        name: chip.slug === 'all' ? t('all') : chip.slug === 'free' ? t('free') : chip.slug === 'best-selling' ? t('bestSelling') : chip.slug === 'featured' ? t('featured') : chip.name,
      }))

  return (
    <div className="sticky top-14 z-40 border-b border-[#303030] bg-[#0f0f0f]">
      <ScrollArea className="w-full whitespace-nowrap overscroll-x-contain">
        <div className="flex gap-3 px-4 py-3 md:px-6">
          {mergedChips.map((chip) => (
            <button
              key={chip.slug}
              onClick={() => setActiveCategory(chip.slug)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm transition-all ${
                activeCategory === chip.slug
                  ? 'bg-white font-semibold text-black'
                  : 'border border-transparent bg-[#272727] text-white hover:bg-[#3a3a3a]'
              }`}
            >
              {chip.name}
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
    </div>
  )
}
