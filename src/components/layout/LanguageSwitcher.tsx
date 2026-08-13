'use client'

import { Check, Languages } from 'lucide-react'
import { localeOptions } from '@/i18n/config'
import { useI18n } from '@/components/providers/I18nProvider'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  const current = localeOptions.find((option) => option.code === locale) || localeOptions[1]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2 text-white hover:bg-[#272727]" title={t('language')}>
          <Languages className="h-4 w-4" />
          <span className="hidden text-xs lg:inline">{current.flag} {current.code.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[360px] w-52 overflow-y-auto border-[#303030] bg-[#181818] text-[#f1f1f1]">
        {localeOptions.map((option) => (
          <DropdownMenuItem
            key={option.code}
            className="cursor-pointer gap-3 focus:bg-[#272727] focus:text-white"
            onClick={() => setLocale(option.code)}
          >
            <span className="text-lg">{option.flag}</span>
            <span className="flex-1">{option.label}</span>
            {locale === option.code && <Check className="h-4 w-4 text-[#f5a623]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
