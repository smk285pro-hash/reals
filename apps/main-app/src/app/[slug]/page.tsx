import { permanentRedirect, notFound } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { defaultLocale, isLocale, localeCookie, localeHeader } from '@/i18n/config'
import { db } from '@/lib/db'

interface LegacyProductUrlProps {
  params: Promise<{ slug: string }>
}

async function requestLocale() {
  const headerStore = await headers()
  const headerLocale = headerStore.get(localeHeader)
  if (isLocale(headerLocale)) return headerLocale
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(localeCookie)?.value
  return isLocale(cookieLocale) ? cookieLocale : defaultLocale
}

// Legacy flat product URLs (/reals-test-product) that Google indexed before
// products moved to /{locale}/products/{slug}. This root catch-all only
// receives single-segment paths that no static route claims, and 308s them
// to the localized product URL. Old CUIDs resolve too, so every product link
// that ever existed keeps working.
export default async function LegacyProductUrl({ params }: LegacyProductUrlProps) {
  const { slug } = await params
  let token = slug
  try {
    token = decodeURIComponent(slug)
  } catch {
    // keep the raw value; malformed escapes simply 404 below
  }

  const product = await db.product
    .findFirst({
      where: { OR: [{ slug: token }, { id: token }] },
      select: { slug: true, id: true },
    })
    .catch(() => null)
  if (!product) notFound()

  const locale = await requestLocale()
  permanentRedirect(`/${locale}/products/${encodeURIComponent(product.slug || product.id)}`)
}
