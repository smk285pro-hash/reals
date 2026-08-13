import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { Analytics } from "@vercel/analytics/next";
import { cookies, headers } from 'next/headers'
import { defaultLocale, isLocale, localeCookie, localeFromAcceptLanguage, localeFromCountry } from '@/i18n/config'

const siteUrl = 'https://reals.media'
const siteName = 'RealS'
const siteDescription = 'Marketplace plugin, JSFX, ReaScript, extension và template chuyên nghiệp dành cho REAPER DAW.'

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${siteUrl}/#organization`,
  name: siteName,
  url: siteUrl,
  logo: `${siteUrl}/logo.svg`,
  description: siteDescription,
}

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  url: siteUrl,
  name: siteName,
  description: siteDescription,
  publisher: { '@id': `${siteUrl}/#organization` },
  inLanguage: ['vi', 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'th', 'ru'],
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RealS — Plugin & Script Marketplace cho REAPER",
    template: "%s | RealS",
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: ["REAPER", "JSFX", "ReaScript", "REAPER extension", "audio plugin", "DAW", "mixing", "mastering"],
  authors: [{ name: siteName, url: siteUrl }],
  creator: siteName,
  publisher: siteName,
  category: 'technology',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName,
    title: "RealS — Plugin & Script Marketplace cho REAPER",
    description: siteDescription,
    images: [{ url: '/logo.svg', width: 512, height: 512, alt: 'RealS' }],
  },
  twitter: {
    card: 'summary',
    title: "RealS — Plugin & Script Marketplace cho REAPER",
    description: siteDescription,
    images: ['/logo.svg'],
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
  icons: {
    icon: [{ url: '/logo.svg', type: 'image/svg+xml' }],
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0f0f0f",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const savedLocale = cookieStore.get(localeCookie)?.value
  const locale = isLocale(savedLocale)
    ? savedLocale
    : localeFromCountry(headerStore.get('x-vercel-ip-country') || headerStore.get('cf-ipcountry'))
      || localeFromAcceptLanguage(headerStore.get('accept-language'))
      || defaultLocale

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
