'use client'

import { Suspense } from 'react'
import ResetPasswordContent from './ResetPasswordContent'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f5a623] border-t-transparent" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
