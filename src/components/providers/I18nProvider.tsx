'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { defaultLocale, isLocale, localeCookie, type Locale } from '@/i18n/config'
import { messages } from '@/i18n/messages'

type Variables = Record<string, string | number>

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, variables?: Variables) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || defaultLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => {
    if (!isLocale(nextLocale)) return
    setLocaleState(nextLocale)
    document.cookie = `${localeCookie}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`
    document.documentElement.lang = nextLocale
  }, [])

  const t = useCallback((key: string, variables?: Variables) => {
    let text = messages[locale][key] || messages.en[key] || key
    if (variables) {
      for (const [name, value] of Object.entries(variables)) {
        text = text.replaceAll(`{${name}}`, String(value))
      }
    }
    return text
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
