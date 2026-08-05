'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Flag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ReportButtonProps {
  type: 'PRODUCT' | 'USER' | 'REVIEW'
  targetId: string
  className?: string
}

const reasons = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'INAPPROPRIATE', label: 'Không phù hợp' },
  { value: 'COPYRIGHT', label: 'Vi phạm bản quyền' },
  { value: 'OTHER', label: 'Lý do khác' },
]

export function ReportButton({ type, targetId, className }: ReportButtonProps) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!session) return null

  const handleSubmit = async () => {
    if (!reason) { toast.error('Vui lòng chọn lý do'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, targetId, reason, description: description || undefined }),
      })
      if (res.ok) {
        toast.success('Đã gửi báo cáo. Admin sẽ xem xét sớm.')
        setOpen(false)
        setReason('')
        setDescription('')
      } else {
        const e = await res.json()
        toast.error(e.error || 'Lỗi gửi báo cáo')
      }
    } catch {
      toast.error('Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={`text-[#888] hover:text-red-400 ${className || ''}`}
        onClick={() => setOpen(true)}
        title="Báo cáo"
      >
        <Flag className="h-4 w-4" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-[#303030] bg-[#181818] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Báo cáo</h3>
              <button onClick={() => setOpen(false)} className="text-[#888] hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#aaa]">Lý do</label>
                <div className="grid grid-cols-2 gap-2">
                  {reasons.map(r => (
                    <button
                      key={r.value}
                      className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                        reason === r.value
                          ? 'border-red-500 bg-red-500/10 text-red-400'
                          : 'border-[#303030] text-[#aaa] hover:border-[#555] hover:text-white'
                      }`}
                      onClick={() => setReason(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#aaa]">Mô tả thêm (tuỳ chọn)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Mô tả chi tiết..."
                  className="w-full rounded-lg border border-[#303030] bg-[#0f0f0f] p-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#f5a623]"
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" className="text-[#aaa]" onClick={() => setOpen(false)}>Huỷ</Button>
                <Button
                  className="bg-red-500 text-white hover:bg-red-600"
                  disabled={!reason || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Đang gửi...' : 'Gửi báo cáo'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
