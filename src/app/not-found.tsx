import Link from 'next/link'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { defaultLocale, isLocale, localeCookie, localeHeader } from '@/i18n/config'
import { seoCopy } from '@/i18n/seo'

async function getRequestLocale() {
  const headerStore = await headers()
  const requestLocale = headerStore.get(localeHeader)
  if (isLocale(requestLocale)) return requestLocale

  const cookieStore = await cookies()
  const savedLocale = cookieStore.get(localeCookie)?.value
  return isLocale(savedLocale) ? savedLocale : defaultLocale
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const copy = seoCopy(locale)

  return {
    title: copy.pageNotFound,
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function NotFound() {
  const locale = await getRequestLocale()
  const copy = seoCopy(locale)

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4 text-[#f1f1f1]">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#303030] bg-[#181818] p-10 max-w-md text-center">
        <h1 className="text-4xl font-bold text-[#f5a623]">404</h1>
        <h2 className="text-xl font-semibold text-white">{copy.pageNotFound}</h2>
        <p className="text-sm text-[#888]">{copy.pageNotFoundDescription}</p>
        <Link
          href={`/${locale}`}
          className="mt-2 inline-flex items-center rounded-full bg-[#f5a623] px-6 py-2.5 text-sm font-semibold text-black hover:bg-[#e09515]"
        >
          {copy.backHome}
        </Link>
      </div>
    </main>
  )
}
