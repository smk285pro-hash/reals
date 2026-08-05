'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Store, CheckCircle, XCircle, Clock } from 'lucide-react'

interface SellerApplyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ApplicationStatus {
  isSeller: boolean
  application: {
    id: string
    displayName: string
    status: string
    adminNote?: string | null
    createdAt: string
    reviewedAt?: string | null
  } | null
}

export function SellerApplyModal({ open, onOpenChange }: SellerApplyModalProps) {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [appStatus, setAppStatus] = useState<ApplicationStatus | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [categories, setCategories] = useState('')
  const [reason, setReason] = useState('')

  // Fetch application status on open
  useEffect(() => {
    if (open && session?.user) {
      setFetching(true)
      fetch('/api/seller/apply')
        .then(r => r.json())
        .then(data => {
          setAppStatus(data)
          if (data.application) {
            setDisplayName(data.application.displayName || '')
          }
        })
        .catch(() => {})
        .finally(() => setFetching(false))
    }
  }, [open, session])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/seller/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, bio, portfolioUrl, categories, reason }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Có lỗi xảy ra')
      } else {
        // Refresh status
        const statusRes = await fetch('/api/seller/apply')
        const statusData = await statusRes.json()
        setAppStatus(statusData)
      }
    } catch {
      setError('Có lỗi xảy ra khi gửi đơn')
    } finally {
      setLoading(false)
    }
  }

  const isAlreadySeller = appStatus?.isSeller
  const hasApplication = appStatus?.application
  const appStatusValue = appStatus?.application?.status

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border-[#303030] bg-[#181818] text-[#f1f1f1] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#f5a623] to-[#e09515]" />

        <div className="px-6 pt-4 pb-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center flex items-center justify-center gap-2">
              <Store className="h-5 w-5 text-[#f5a623]" />
              Đăng ký Seller
            </DialogTitle>
            <DialogDescription className="text-center text-[#888] text-sm">
              Trở thành seller để bán plugin & script trên RealS
            </DialogDescription>
          </DialogHeader>

          {fetching ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#f5a623]" />
            </div>
          ) : isAlreadySeller ? (
            /* Already a seller */
            <div className="mt-6 flex flex-col items-center gap-3 py-4">
              <CheckCircle className="h-12 w-12 text-green-400" />
              <p className="text-lg font-medium text-green-400">Bạn đã là Seller!</p>
              <p className="text-sm text-[#888]">Bạn có thể đăng và quản lý sản phẩm ngay.</p>
              <Button onClick={() => onOpenChange(false)} className="mt-2 bg-[#f5a623] text-black hover:bg-[#e09515]">
                Đóng
              </Button>
            </div>
          ) : hasApplication && appStatusValue === 'PENDING' ? (
            /* Application pending */
            <div className="mt-6 flex flex-col items-center gap-3 py-4">
              <Clock className="h-12 w-12 text-[#f5a623]" />
              <p className="text-lg font-medium text-[#f5a623]">Đang chờ duyệt</p>
              <p className="text-sm text-[#888]">Đơn đăng ký của bạn đang được admin xem xét.</p>
              <p className="text-xs text-[#666]">Gửi lúc: {new Date(appStatus.application!.createdAt).toLocaleString('vi-VN')}</p>
              <Button onClick={() => onOpenChange(false)} className="mt-2 bg-[#303030] text-[#f1f1f1] hover:bg-[#404040]">
                Đóng
              </Button>
            </div>
          ) : hasApplication && appStatusValue === 'REJECTED' ? (
            /* Application rejected — can re-apply */
            <div className="mt-6">
              <div className="flex flex-col items-center gap-3 mb-6">
                <XCircle className="h-12 w-12 text-red-400" />
                <p className="text-lg font-medium text-red-400">Đơn bị từ chối</p>
                {appStatus?.application?.adminNote && (
                  <div className="w-full rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                    Lý do: {appStatus.application.adminNote}
                  </div>
                )}
                <p className="text-sm text-[#888]">Bạn có thể chỉnh sửa và gửi lại đơn.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}
                <ApplyFormFields
                  displayName={displayName} setDisplayName={setDisplayName}
                  bio={bio} setBio={setBio}
                  portfolioUrl={portfolioUrl} setPortfolioUrl={setPortfolioUrl}
                  categories={categories} setCategories={setCategories}
                  reason={reason} setReason={setReason}
                />
                <Button type="submit" className="w-full h-11 bg-[#f5a623] text-black font-semibold hover:bg-[#e09515]" disabled={loading}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Gửi lại đơn đăng ký'}
                </Button>
              </form>
            </div>
          ) : (
            /* New application form */
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}
              <ApplyFormFields
                displayName={displayName} setDisplayName={setDisplayName}
                bio={bio} setBio={setBio}
                portfolioUrl={portfolioUrl} setPortfolioUrl={setPortfolioUrl}
                categories={categories} setCategories={setCategories}
                reason={reason} setReason={setReason}
              />
              <Button type="submit" className="w-full h-11 bg-[#f5a623] text-black font-semibold hover:bg-[#e09515]" disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Gửi đơn đăng ký'}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ApplyFormFields({
  displayName, setDisplayName,
  bio, setBio,
  portfolioUrl, setPortfolioUrl,
  categories, setCategories,
  reason, setReason,
}: {
  displayName: string; setDisplayName: (v: string) => void
  bio: string; setBio: (v: string) => void
  portfolioUrl: string; setPortfolioUrl: (v: string) => void
  categories: string; setCategories: (v: string) => void
  reason: string; setReason: (v: string) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-sm text-[#ccc]">Tên gian hàng <span className="text-red-400">*</span></Label>
        <Input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="VD: Audio Plugins Pro"
          className="h-11 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#f5a623] focus-visible:ring-0"
          required
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm text-[#ccc]">Giới thiệu</Label>
        <Textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="Mô tả ngắn về sản phẩm bạn muốn bán..."
          className="min-h-[80px] border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#f5a623] focus-visible:ring-0 resize-none"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm text-[#ccc]">Website / Portfolio</Label>
        <Input
          value={portfolioUrl}
          onChange={e => setPortfolioUrl(e.target.value)}
          placeholder="https://yoursite.com"
          className="h-11 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#f5a623] focus-visible:ring-0"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm text-[#ccc]">Danh mục muốn bán</Label>
        <Input
          value={categories}
          onChange={e => setCategories(e.target.value)}
          placeholder="JSFX, ReaScript, Extension..."
          className="h-11 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#f5a623] focus-visible:ring-0"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm text-[#ccc]">Lý do muốn thành seller</Label>
        <Textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Tại sao bạn muốn bán trên RealS?"
          className="min-h-[60px] border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#f5a623] focus-visible:ring-0 resize-none"
        />
      </div>
    </>
  )
}
