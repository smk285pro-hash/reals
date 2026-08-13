export const locales = ['vi', 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'th', 'ru'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'
export const localeCookie = 'reals_locale'
export const localeHeader = 'x-reals-locale'

export const localeOptions: Array<{ code: Locale; label: string; flag: string }> = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'th', label: 'ไทย', flag: '🇹🇭' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
]

const countryLocales: Record<string, Locale> = {
  VN: 'vi', US: 'en', GB: 'en', AU: 'en', CA: 'en', NZ: 'en', IE: 'en',
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', JP: 'ja', KR: 'ko',
  ES: 'es', MX: 'es', AR: 'es', CL: 'es', CO: 'es', PE: 'es', VE: 'es',
  FR: 'fr', BE: 'fr', CH: 'fr', DE: 'de', AT: 'de',
  BR: 'pt', PT: 'pt', TH: 'th', RU: 'ru', BY: 'ru', KZ: 'ru',
}

export function isLocale(value?: string | null): value is Locale {
  return locales.includes(value as Locale)
}

export function localeFromCountry(country?: string | null): Locale | null {
  return country ? countryLocales[country.toUpperCase()] || null : null
}

export function localeFromAcceptLanguage(header?: string | null): Locale | null {
  if (!header) return null
  for (const entry of header.split(',')) {
    const language = entry.trim().split(';')[0]?.toLowerCase()
    const base = language?.split('-')[0]
    if (isLocale(base)) return base
  }
  return null
}

export function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split('/')[1]
  return isLocale(segment) ? segment : null
}

export function stripLocaleFromPathname(pathname: string): string {
  const locale = localeFromPathname(pathname)
  if (!locale) return pathname || '/'

  const stripped = pathname.slice(locale.length + 1)
  return stripped || '/'
}

export function localizePathname(pathname: string, locale: Locale): string {
  const barePath = stripLocaleFromPathname(pathname)
  return barePath === '/' ? `/${locale}` : `/${locale}${barePath}`
}

export function isPublicSeoPath(pathname: string): boolean {
  const barePath = stripLocaleFromPathname(pathname)
  return barePath === '/' || barePath === '/products' || barePath.startsWith('/products/')
}
