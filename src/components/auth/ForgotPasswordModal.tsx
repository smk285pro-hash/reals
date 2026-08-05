'use client'

import { useState } from 'react'
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
import { Mail, Loader2, ArrowLeft, CheckCircle2, Send } from 'lucide-react'

interface ForgotPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSwitchToLogin: () => void
}

export function ForgotPasswordModal({ open, onOpenChange, onSwitchToLogin }: ForgotPasswordModalProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Có lỗi xảy ra')
        return
      }

      setSent(true)
    } catch {
      setError('Có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] border-[#303030] bg-[#181818] text-[#f1f1f1] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#3ea6ff] to-[#1a8cd8]" />

        <div className="px-6 pt-4 pb-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center text-[#f1f1f1]">
              Quên mật khẩu
            </DialogTitle>
            <DialogDescription className="text-center text-[#888] text-sm">
              {sent
                ? 'Kiểm tra hộp thư của bạn'
                : 'Nhập email để nhận hướng dẫn đặt lại mật khẩu'
              }
            </DialogDescription>
          </DialogHeader>

          {sent ? (
            <div className="mt-8 flex flex-col items-center gap-4">
              <div className="rounded-full bg-[#22c55e]/10 p-4">
                <CheckCircle2 className="h-12 w-12 text-[#22c55e]" />
              </div>
              <div className="text-center">
                <p className="text-sm text-[#ccc]">
                  Nếu <span className="text-[#f5a623] font-medium">{email}</span> đã đăng ký,
                  bạn sẽ nhận được email hướng dẫn đặt lại mật khẩu.
                </p>
                <p className="mt-2 text-xs text-[#888]">
                  (Kiểm tra cả thư mục Spam/Junk)
                </p>
              </div>
              <Button
                onClick={onSwitchToLogin}
                className="mt-4 bg-[#3ea6ff] text-black font-semibold hover:bg-[#1a8cd8] text-sm"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Quay lại đăng nhập
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="forgot-email" className="text-sm text-[#ccc]">Email đã đăng ký</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11 pl-10 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#3ea6ff] focus-visible:ring-0"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-[#3ea6ff] text-black font-semibold hover:bg-[#1a8cd8] text-sm gap-2"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Gửi hướng dẫn đặt lại mật khẩu
                  </>
                )}
              </Button>

              <button
                type="button"
                onClick={onSwitchToLogin}
                className="flex items-center gap-1 mx-auto text-sm text-[#888] hover:text-[#ccc]"
              >
                <ArrowLeft className="h-3 w-3" />
                Quay lại đăng nhập
              </button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
