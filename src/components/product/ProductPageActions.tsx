'use client'

import { useState } from 'react'
import { Check, Copy, Download, Lock } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/components/providers/I18nProvider'

interface ProductPageActionsProps {
  productId: string
  productTitle: string
  isFree: boolean
}

export function ProductPageActions({ productId, productTitle, isFree }: ProductPageActionsProps) {
  const { t } = useI18n()
  const { data: session } = useSession()
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleDownload = async () => {
    if (!session?.user) {
      toast.info('Vui lòng đăng nhập để tải file')
      window.location.href = `/api/auth/signin?callbackUrl=${encodeURIComponent(window.location.href)}`
      return
    }

    setDownloading(true)
    try {
      const response = await fetch(`/api/products/${productId}/download`, {
        headers: { Accept: 'application/json' },
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data?.url) {
        toast.error(data?.error || 'Không thể tải sản phẩm')
        return
      }

      window.location.href = data.url
      toast.success('Đang bắt đầu tải...')
    } catch {
      toast.error('Không thể kết nối máy chủ')
    } finally {
      setDownloading(false)
    }
  }

  const handleShare = async () => {
    const shareData = { title: productTitle, url: window.location.href }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }

      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The native share sheet can be dismissed without it being an error.
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      {isFree ? (
        <Button
          className="h-12 gap-2 bg-[#3fb950] font-semibold text-black hover:bg-[#2ea043]"
          onClick={handleDownload}
          disabled={downloading}
        >
          <Download className="h-4 w-4" />
          {downloading ? t('downloading') : t('downloadFree')}
        </Button>
      ) : (
        <Button disabled className="h-12 gap-2 bg-[#272727] text-[#999] disabled:opacity-100">
          <Lock className="h-4 w-4" />
          {t('comingSoon')}
        </Button>
      )}

      <Button
        variant="outline"
        className="h-12 gap-2 border-[#303030] bg-[#181818] text-white hover:bg-[#272727]"
        onClick={handleShare}
      >
        {copied ? <Check className="h-4 w-4 text-[#3fb950]" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Đã sao chép' : 'Chia sẻ'}
      </Button>
    </div>
  )
}
