'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
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
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, Mail, Lock, User, Loader2, CheckCircle2 } from 'lucide-react'

interface RegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSwitchToLogin: () => void
}

export function RegisterModal({ open, onOpenChange, onSwitchToLogin }: RegisterModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Có lỗi xảy ra khi đăng ký')
        return
      }

      setSuccess(true)

      // Auto sign in after registration
      setTimeout(async () => {
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        })

        if (result?.ok) {
          onOpenChange(false)
          setName('')
          setEmail('')
          setPassword('')
          setConfirmPassword('')
          setSuccess(false)
        }
      }, 1500)
    } catch {
      setError('Có lỗi xảy ra khi đăng ký')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleRegister = async () => {
    setGoogleLoading(true)
    try {
      await signIn('google', { callbackUrl: '/' })
    } catch {
      setError('Có lỗi xảy ra khi đăng nhập bằng Google')
      setGoogleLoading(false)
    }
  }

  const passwordStrength = () => {
    if (!password) return { level: 0, text: '', color: '' }
    let score = 0
    if (password.length >= 6) score++
    if (password.length >= 10) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    if (score <= 2) return { level: 1, text: 'Yếu', color: '#ef4444' }
    if (score <= 3) return { level: 2, text: 'Trung bình', color: '#f5a623' }
    return { level: 3, text: 'Mạnh', color: '#22c55e' }
  }

  const strength = passwordStrength()

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[440px] border-[#303030] bg-[#181818] text-[#f1f1f1]">
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-16 w-16 text-[#22c55e]" />
            <h2 className="text-xl font-bold text-[#f1f1f1]">Đăng ký thành công!</h2>
            <p className="text-sm text-[#888]">Đang tự động đăng nhập...</p>
            <Loader2 className="h-5 w-5 animate-spin text-[#f5a623]" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] border-[#303030] bg-[#181818] text-[#f1f1f1] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#22c55e] to-[#16a34a]" />

        <div className="px-6 pt-4 pb-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center text-[#f1f1f1]">
              Tạo tài khoản ReaTube
            </DialogTitle>
            <DialogDescription className="text-center text-[#888] text-sm">
              Tham gia cộng đồng REAPER lớn nhất
            </DialogDescription>
          </DialogHeader>

          {/* Google Button */}
          <div className="mt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-[#303030] bg-[#222] text-[#f1f1f1] hover:bg-[#272727] hover:border-[#404040] gap-3 text-sm font-medium"
              onClick={handleGoogleRegister}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Đăng ký với Google
            </Button>
          </div>

          <div className="relative my-6">
            <Separator className="bg-[#303030]" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#181818] px-3 text-xs text-[#888]">
              hoặc
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reg-name" className="text-sm text-[#ccc]">Tên hiển thị</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                <Input
                  id="reg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tên của bạn"
                  className="h-11 pl-10 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#f5a623] focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-email" className="text-sm text-[#ccc]">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                <Input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 pl-10 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#f5a623] focus-visible:ring-0"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-password" className="text-sm text-[#ccc]">Mật khẩu</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                <Input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ít nhất 6 ký tự"
                  className="h-11 pl-10 pr-10 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#f5a623] focus-visible:ring-0"
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
              {/* Password strength indicator */}
              {password && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-colors"
                        style={{ backgroundColor: i <= strength.level ? strength.color : '#303030' }}
                      />
                    ))}
                  </div>
                  <span className="text-xs" style={{ color: strength.color }}>{strength.text}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-confirm" className="text-sm text-[#ccc]">Xác nhận mật khẩu</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                <Input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  className="h-11 pl-10 border-[#303030] bg-[#121212] text-[#f1f1f1] placeholder:text-[#666] focus:border-[#f5a623] focus-visible:ring-0"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-[#22c55e] text-black font-semibold hover:bg-[#16a34a] text-sm"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Đăng ký'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[#888]">
            Đã có tài khoản?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-[#3ea6ff] hover:underline font-medium"
            >
              Đăng nhập
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
