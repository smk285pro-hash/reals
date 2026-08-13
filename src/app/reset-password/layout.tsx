import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Đặt lại mật khẩu',
  alternates: {
    canonical: '/reset-password',
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

export default function ResetPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
