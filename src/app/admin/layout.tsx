import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Quản trị hệ thống',
  alternates: {
    canonical: '/admin',
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
