'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { useEffect, useRef } from 'react'
import { I18nProvider } from '@/components/providers/I18nProvider'
import type { Locale } from '@/i18n/config'

/**
 * Checks seller status from server on first authentication.
 * If the server's isSeller doesn't match the session's isSeller (e.g. admin just
 * promoted/demoted the user), force a session refresh so all UI components
 * (Navbar, Sidebar, SellerDashboard, etc.) get the correct value immediately.
 */
function SessionSyncChecker() {
  const { status, data: session, update } = useSession()
  const checked = useRef(false)

  useEffect(() => {
    if (status !== 'authenticated' || checked.current) return
    checked.current = true

    fetch('/api/seller/apply', { method: 'GET' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const serverIsSeller = data.isSeller === true
        const sessionIsSeller = (session?.user as any)?.isSeller === true
        if (serverIsSeller !== sessionIsSeller) {
          // Session is stale — force refresh so navbar/sidebar/etc. update
          update()
        }
      })
      .catch(() => {})
  }, [status])

  return null
}

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <SessionProvider refetchInterval={30} refetchOnWindowFocus={true}>
        <SessionSyncChecker />
        {children}
      </SessionProvider>
    </I18nProvider>
  )
}
