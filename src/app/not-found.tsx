import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page Not Found | RealS',
  robots: {
    index: false,
    follow: false,
  },
}

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4 text-[#f1f1f1]">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#303030] bg-[#181818] p-10 max-w-md text-center">
        <h1 className="text-4xl font-bold text-[#f5a623]">404</h1>
        <h2 className="text-xl font-semibold text-white">Page Not Found</h2>
        <p className="text-sm text-[#888]">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center rounded-full bg-[#f5a623] px-6 py-2.5 text-sm font-semibold text-black hover:bg-[#e09515]"
        >
          Return Home
        </Link>
      </div>
    </main>
  )
}
