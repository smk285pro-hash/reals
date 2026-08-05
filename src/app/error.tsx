'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RotateCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[App Error Boundary]', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#303030] bg-[#181818] p-12 max-w-md text-center">
        <AlertTriangle className="h-12 w-12 text-[#f5a623]" />
        <h2 className="text-lg font-bold text-white">Đã xảy ra lỗi</h2>
        <p className="text-sm text-[#888]">
          {error.message || 'Một lỗi không mong muốn đã xảy ra. Vui lòng thử lại.'}
        </p>
        <Button
          className="bg-[#f5a623] text-black hover:bg-[#e09515]"
          onClick={reset}
        >
          <RotateCw className="mr-2 h-4 w-4" />
          Thử lại
        </Button>
      </div>
    </div>
  )
}
