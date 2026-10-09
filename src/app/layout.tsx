import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { Analytics } from "@vercel/analytics/next";
import { cookies, headers } from 'next/headers'
import { defaultLocale, isLocale, localeCookie, localeFromAcceptLanguage, localeFromCountry, localeHeader, locales } from '@/i18n/config'
import { alternateLocaleTags, localeTags, localizedAlternates, localizedUrl, openGraphImage, seoCopy, siteName, siteUrl } from '@/i18n/seo'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

async function getRequestLocale() {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const requestLocale = headerStore.get(localeHeader)
  const savedLocale = cookieStore.get(localeCookie)?.value

  return isLocale(requestLocale)
    ? requestLocale
    : isLocale(savedLocale)
      ? savedLocale
      : localeFromCountry(headerStore.get('x-vercel-ip-country') || headerStore.get('cf-ipcountry'))
        || localeFromAcceptLanguage(headerStore.get('accept-language'))
        || defaultLocale
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const copy = seoCopy(locale)
  const canonical = localizedUrl(locale)

  return {
    metadataBase: new URL(siteUrl),
    title: { default: copy.homeTitle, template: '%s | RealS' },
    description: copy.homeDescription,
    applicationName: siteName,
    keywords: copy.keywords,
    authors: [{ name: siteName, url: siteUrl }],
    creator: siteName,
    publisher: siteName,
    category: 'technology',
    alternates: localizedAlternates(locale),
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || process.env.GOOGLE_SITE_VERIFICATION || 'Wj1kBciTa23yEPyuhdQozio9fukgfcJ3zPDOoIkb0iU',
      other: {
        'msvalidate.01': 'D0E0BE6F3CBB9C3ACCD90560EF8F5277',
      },
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName,
      title: copy.homeTitle,
      description: copy.homeDescription,
      locale: localeTags[locale],
      alternateLocale: alternateLocaleTags(locale),
      images: [{ url: openGraphImage, width: 1200, height: 630, alt: 'RealS — REAPER plugins and scripts marketplace' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.homeTitle,
      description: copy.homeDescription,
      images: [openGraphImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  }
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0f0f0f",
};

const siteDescription = 'RealS AI (reals.media) is an AI workflow automation platform for media and audio engineering teams, built on Anthropic Claude API and Model Context Protocol (MCP) for DSP scripting, stem separation, and REAPER DAW automation.'

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${siteUrl}/#organization`,
  name: siteName,
  legalName: 'RealS AI',
  alternateName: ['RealS AI', 'RealS Media', 'reals.media'],
  url: siteUrl,
  logo: `${siteUrl}/reals-mark.png`,
  description: siteDescription,
  foundingDate: '2025-01',
  founder: {
    '@type': 'Person',
    name: 'Bao Phuc Nguyen',
    jobTitle: 'Founder & CEO',
  },
  email: 'ceo@reals.media',
  contactPoint: [
    {
      '@type': 'ContactPoint',
      email: 'ceo@reals.media',
      contactType: 'founder',
    },
    {
      '@type': 'ContactPoint',
      email: 'founder@reals.media',
      contactType: 'technical support',
    },
  ],
  knowsAbout: [
    'Anthropic Claude API',
    'Claude Sonnet 4.5',
    'Model Context Protocol (MCP)',
    'AI Audio Workflow Automation',
    'DSP Code Generation',
    'REAPER DAW',
  ],
}

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  url: siteUrl,
  name: siteName,
  alternateName: 'RealS AI',
  description: siteDescription,
  publisher: { '@id': `${siteUrl}/#organization` },
  inLanguage: locales,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${siteUrl}/en/products?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd).replace(/</g, '\\u003c') }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, '\\u003c') }}
        />
        <Providers initialLocale={locale}>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
