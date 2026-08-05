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
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react'

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSwitchToRegister: () => void
  onSwitchToForgot: () => void
}

export function LoginModal({ open, onOpenChange, onSwitchToRegister, onSwitchToForgot }: LoginModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError(result.error)
      } else {
        onOpenChange(false)
        setEmail('')
        setPassword('')
      }
    } catch {
      setError('Có lỗi xảy ra khi đăng nhập')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    try {
      await signIn('google', { callbackUrl: '/' })
    } catch {
      setError('Có lỗi xảy ra khi đăng nhập bằng Google')
      setGoogleLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] border-[#303030] bg-[#181818] text-[#f1f1f1] p-0 overflow-hidden">
        {/* Header with accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-[#f5a623] to-[#e09515]" />
        
        <div className="px-6 pt-4 pb-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center text-[#f1f1f1]">
              Đăng nhập RealS
            </DialogTitle>
            <DialogDescription className="text-center text-[#888] text-sm">
              Mua bán plugin & script cho REAPER DAW
            </DialogDescription>
          </DialogHeader>

          {/* Google Button */}
          <div className="mt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-[#303030] bg-[#222] text-[#f1f1f1] hover:bg-[#272727] hover:border-[#404040] gap-3 text-sm font-medium"
              onClick={handleGoogleLogin}
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
              Tiếp tục với Google
            </Button>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <Separator className="bg-[#303030]" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#181818] px-3 text-xs text-[#888]">
              hoặc
            </span>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-sm text-[#ccc]">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                <Input
                  id="login-email"
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
              <Label htmlFor="login-password" className="text-sm text-[#ccc]">Mật khẩu</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
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
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-[#aaa] cursor-pointer">
                <input type="checkbox" className="rounded border-[#303030] bg-[#121212] accent-[#f5a623]" />
                Ghi nhớ đăng nhập
              </label>
              <button
                type="button"
                onClick={onSwitchToForgot}
                className="text-sm text-[#3ea6ff] hover:underline"
              >
                Quên mật khẩu?
              </button>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-[#f5a623] text-black font-semibold hover:bg-[#e09515] text-sm"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Đăng nhập'}
            </Button>
          </form>

          {/* Switch to Register */}
          <p className="mt-6 text-center text-sm text-[#888]">
            Chưa có tài khoản?{' '}
            <button
              onClick={onSwitchToRegister}
              className="text-[#3ea6ff] hover:underline font-medium"
            >
              Đăng ký ngay
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
