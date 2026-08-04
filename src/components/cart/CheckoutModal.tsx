'use client'

import { X, CreditCard, Lock, CheckCircle } from 'lucide-react'
import { useCartStore, useAppStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useState } from 'react'

export function CheckoutModal() {
  const { checkoutOpen, setCheckoutOpen } = useAppStore()
  const { items, totalPrice, clearCart } = useCartStore()
  const [step, setStep] = useState<'info' | 'payment' | 'success'>('info')

  if (!checkoutOpen) return null

  const handleClose = () => {
    setCheckoutOpen(false)
    setStep('info')
  }

  const handleComplete = () => {
    clearCart()
    setStep('success')
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70" onClick={handleClose} />

      <div className="fixed inset-4 z-50 flex items-center justify-center sm:inset-8 md:inset-24">
        <div className="flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-y-auto rounded-2xl border border-[#303030] bg-[#0f0f0f] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#303030] px-6 py-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-[#f5a623]" />
              <h2 className="text-lg font-semibold text-white">Thanh toán</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-[#aaa] hover:bg-[#272727] hover:text-white"
              onClick={handleClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-6">
            {step === 'success' ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <CheckCircle className="h-16 w-16 text-[#3fb950]" />
                <h3 className="text-xl font-semibold text-white">Thanh toán thành công!</h3>
                <p className="text-center text-sm text-[#aaa]">
                  Cảm ơn bạn đã mua sắm. Sản phẩm sẽ được gửi qua email trong vài phút.
                </p>
                <Button
                  className="mt-4 rounded-lg bg-[#f5a623] px-8 text-black hover:bg-[#e09515]"
                  onClick={handleClose}
                >
                  Tiếp tục mua sắm
                </Button>
              </div>
            ) : (
              <>
                {/* Progress steps */}
                <div className="mb-6 flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${step === 'info' ? 'bg-[#f5a623] text-black' : 'bg-[#3fb950] text-black'}`}>
                    {step === 'info' ? '1' : '✓'}
                  </div>
                  <div className={`h-0.5 flex-1 ${step === 'payment' ? 'bg-[#3fb950]' : 'bg-[#303030]'}`} />
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${step === 'payment' ? 'bg-[#f5a623] text-black' : 'bg-[#303030] text-[#888]'}`}>
                    2
                  </div>
                </div>

                {step === 'info' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-white">Thông tin nhận hàng</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input placeholder="Họ và tên" className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]" />
                      <Input placeholder="Email" type="email" className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]" />
                    </div>
                    <Input placeholder="Số điện thoại" className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]" />
                    <Input placeholder="Ghi chú (tùy chọn)" className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]" />

                    <Separator className="bg-[#303030]" />

                    {/* Order summary */}
                    <h4 className="text-sm font-semibold text-[#aaa]">Đơn hàng ({items.length} sản phẩm)</h4>
                    {items.map((item) => (
                      <div key={item.product.id} className="flex items-center justify-between text-sm">
                        <span className="flex-1 truncate text-[#ccc]">{item.product.title}</span>
                        <span className="ml-2 font-medium text-[#f5a623]">${item.product.price}</span>
                      </div>
                    ))}
                    <Separator className="bg-[#303030]" />
                    <div className="flex items-center justify-between">
                      <span className="text-[#aaa]">Tổng cộng</span>
                      <span className="text-xl font-bold text-white">${totalPrice().toFixed(2)}</span>
                    </div>

                    <Button
                      className="w-full rounded-lg bg-[#f5a623] py-3 text-black hover:bg-[#e09515]"
                      onClick={() => setStep('payment')}
                    >
                      Tiếp tục thanh toán
                    </Button>
                  </div>
                )}

                {step === 'payment' && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-white">Phương thức thanh toán</h3>

                    {/* Payment options */}
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#f5a623] bg-[#1a1a1a] p-4">
                        <input type="radio" name="payment" defaultChecked className="accent-[#f5a623]" />
                        <CreditCard className="h-5 w-5 text-[#f5a623]" />
                        <div>
                          <div className="text-sm font-medium text-white">Thẻ tín dụng / Ghi nợ</div>
                          <div className="text-xs text-[#888]">Visa, Mastercard, JCB</div>
                        </div>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#303030] bg-[#1a1a1a] p-4 hover:border-[#555]">
                        <input type="radio" name="payment" className="accent-[#f5a623]" />
                        <span className="text-lg">🏦</span>
                        <div>
                          <div className="text-sm font-medium text-white">Chuyển khoản ngân hàng</div>
                          <div className="text-xs text-[#888]">QR Code, Internet Banking</div>
                        </div>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#303030] bg-[#1a1a1a] p-4 hover:border-[#555]">
                        <input type="radio" name="payment" className="accent-[#f5a623]" />
                        <span className="text-lg">🅿️</span>
                        <div>
                          <div className="text-sm font-medium text-white">PayPal</div>
                          <div className="text-xs text-[#888]">International payment</div>
                        </div>
                      </label>
                    </div>

                    <div className="space-y-3">
                      <Input placeholder="Số thẻ" className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]" />
                      <div className="grid grid-cols-2 gap-3">
                        <Input placeholder="MM/YY" className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]" />
                        <Input placeholder="CVV" className="border-[#303030] bg-[#1a1a1a] text-white placeholder:text-[#666]" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#888]">
                      <Lock className="h-3 w-3" />
                      Thanh toán được mã hóa SSL 256-bit
                    </div>

                    <Separator className="bg-[#303030]" />
                    <div className="flex items-center justify-between">
                      <span className="text-[#aaa]">Tổng thanh toán</span>
                      <span className="text-xl font-bold text-[#f5a623]">${totalPrice().toFixed(2)}</span>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        variant="ghost"
                        className="flex-1 text-[#aaa] hover:bg-[#272727] hover:text-white"
                        onClick={() => setStep('info')}
                      >
                        Quay lại
                      </Button>
                      <Button
                        className="flex-1 gap-2 rounded-lg bg-[#f5a623] text-black hover:bg-[#e09515]"
                        onClick={handleComplete}
                      >
                        <Lock className="h-4 w-4" />
                        Xác nhận
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
