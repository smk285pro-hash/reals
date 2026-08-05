'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const email = searchParams.get('email')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token || !email) {
      setError('Liên kết đặt lại mật khẩu không hợp lệ')
    }
  }, [token, email])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp')
      return
    }

    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Có lỗi xảy ra')
        return
      }

      setSuccess(true)
      setTimeout(() => router.push('/'), 3000)
    } catch {
      setError('Có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4">
      <div className="w-full max-w-[440px] rounded-xl border border-[#303030] bg-[#181818] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#3ea6ff] to-[#1a8cd8]" />

        <div className="px-6 py-8">
          {success ? (
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="h-16 w-16 text-[#22c55e]" />
              <h1 className="text-xl font-bold text-[#f1f1f1]">Mật khẩu đã được đặt lại!</h1>
              <p className="text-sm text-[#888]">Đang chuyển về trang chủ...</p>
              <Loader2 className="h-4 w-4 animate-spin text-[#f5a623]" />
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-center text-[#f1f1f1] mb-2">
                Đặt lại mật khẩu
              </h1>
              <p className="text-center text-sm text-[#888] mb-6">
                Tạo mật khẩu mới cho <span className="text-[#f5a623]">{email}</span>
              </p>

              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-[#ccc]">Mật khẩu mới</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ít nhất 6 ký tự"
                      className="h-11 pl-10 pr-10 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#3ea6ff] focus-visible:ring-0"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888] hover:text-[#ccc]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-[#ccc]">Xác nhận mật khẩu mới</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu"
                      className="h-11 pl-10 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#3ea6ff] focus-visible:ring-0"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-[#3ea6ff] text-black font-semibold hover:bg-[#1a8cd8] text-sm"
                  disabled={loading || !token || !email}
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Đặt lại mật khẩu'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
