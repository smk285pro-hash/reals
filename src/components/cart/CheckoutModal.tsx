'use client'

import { X, CreditCard, Lock, CheckCircle, Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useCartStore, useAppStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { useState } from 'react'

export function CheckoutModal() {
  const { checkoutOpen, setCheckoutOpen, setLoginModalOpen } = useAppStore()
  const { items, clearCart } = useCartStore()
  const { data: session } = useSession()
  const [completing, setCompleting] = useState(false)

  if (!checkoutOpen) return null

  // Split by price, because only the free half can actually be claimed right
  // now. The server enforces this too — it re-reads isFree/price from the
  // database and refuses paid items — so this split is presentation, not
  // protection.
  const freeItems = items.filter((i) => i.product.isFree || i.product.price <= 0)
  const paidItems = items.filter((i) => !i.product.isFree && i.product.price > 0)

  const handleClose = () => {
    if (completing) return
    setCheckoutOpen(false)
  }

  const handleComplete = async () => {
    // Require login before checkout — without a user record we can't save Purchase rows
    if (!session?.user) {
      toast.info('Vui lòng đăng nhập để hoàn tất')
      setCheckoutOpen(false)
      setLoginModalOpen(true)
      return
    }

    setCompleting(true)
    try {
      const res = await fetch('/api/checkout/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: freeItems.map((i) => ({
            productId: i.product.id,
            price: i.product.price,
            isFree: i.product.isFree || i.product.price <= 0,
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error || 'Lỗi xử lý')
        return
      }
      const data = await res.json()
      clearCart()
      setCheckoutOpen(false)
      if (data.purchased?.length > 0) {
        toast.success(`Đã nhận ${data.purchased.length} sản phẩm — vào trang sản phẩm để tải`)
      } else {
        toast.info('Không có sản phẩm nào được thêm')
      }
    } catch (e) {
      console.error('[checkout/complete] error:', e)
      toast.error('Lỗi kết nối server')
    } finally {
      setCompleting(false)
    }
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
              <h2 className="text-lg font-semibold text-white">Xác nhận nhận sản phẩm</h2>
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

          <div className="space-y-4 p-6">
            {/* Free items — these are what actually get claimed */}
            {freeItems.length > 0 && (
              <>
                <h4 className="text-sm font-semibold text-[#aaa]">
                  Sản phẩm miễn phí ({freeItems.length})
                </h4>
                {freeItems.map((item) => (
                  <div key={item.product.id} className="flex items-center justify-between text-sm">
                    <span className="flex-1 truncate text-[#ccc]">{item.product.title}</span>
                    <span className="ml-2 font-medium text-[#3fb950]">MIỄN PHÍ</span>
                  </div>
                ))}
              </>
            )}

            {/* Paid items — shown so nothing silently vanishes from the cart */}
            {paidItems.length > 0 && (
              <>
                <Separator className="bg-[#303030]" />
                <div className="rounded-lg border border-[#3a3000] bg-[#1a1400] p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#f5a623]">
                    <Lock className="h-3.5 w-3.5" />
                    Chưa hỗ trợ thanh toán
                  </div>
                  {paidItems.map((item) => (
                    <div key={item.product.id} className="flex items-center justify-between text-sm">
                      <span className="flex-1 truncate text-[#888] line-through">
                        {item.product.title}
                      </span>
                      <span className="ml-2 text-xs text-[#888]">${item.product.price}</span>
                    </div>
                  ))}
                  <p className="mt-2 text-[11px] leading-relaxed text-[#888]">
                    Cổng thanh toán đang được hoàn thiện. Những sản phẩm này sẽ không được
                    tính trong lần xác nhận này.
                  </p>
                </div>
              </>
            )}

            {freeItems.length === 0 ? (
              <div className="py-4 text-center text-sm text-[#888]">
                Giỏ hàng không có sản phẩm miễn phí nào để nhận.
              </div>
            ) : (
              <Button
                className="w-full gap-2 rounded-lg bg-[#3fb950] py-3 font-semibold text-black hover:bg-[#2ea043]"
                onClick={handleComplete}
                disabled={completing}
              >
                {completing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {completing ? 'Đang xử lý...' : `Nhận ${freeItems.length} sản phẩm miễn phí`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
