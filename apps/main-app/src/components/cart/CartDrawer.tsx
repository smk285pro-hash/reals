'use client'

import { X, ShoppingCart, Minus, Plus, Trash2, CreditCard } from 'lucide-react'
import { Thumbnail } from '@/components/product/Thumbnail'
import { useCartStore, useAppStore } from '@/stores'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/components/providers/I18nProvider'

export function CartDrawer() {
  const { t } = useI18n()
  const { cartDrawerOpen, setCartDrawerOpen, setCheckoutOpen } = useAppStore()
  const { items, removeItem, updateQuantity, totalPrice, clearCart } = useCartStore()
  const hasFreeItems = items.some((item) => item.product.isFree || item.product.price <= 0)

  if (!cartDrawerOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={() => setCartDrawerOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col bg-[#0f0f0f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#303030] px-5 py-4">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-[#f5a623]" />
            <div className="text-lg font-semibold text-white">{t('cart')}</div>
            <span className="rounded-full bg-[#272727] px-2.5 py-0.5 text-xs text-[#aaa]">
              {items.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-[#aaa] hover:bg-[#272727] hover:text-white"
            onClick={() => setCartDrawerOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[#888]">
            <ShoppingCart className="h-16 w-16 opacity-30" />
            <p className="text-sm">{t('cartEmpty')}</p>
            <Button
              variant="ghost"
              className="text-sm text-[#3ea6ff] hover:text-[#3ea6ff]"
              onClick={() => setCartDrawerOpen(false)}
            >
              {t('continueShopping')}
            </Button>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1">
              <div className="space-y-0 p-5">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-3 py-3">
                    <Thumbnail
                      src={item.product.thumbnail}
                      alt={item.product.title}
                      className="h-16 w-28 rounded-lg object-cover"
                    />
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <h4 className="line-clamp-2 text-sm font-medium text-[#f1f1f1]">
                          {item.product.title}
                        </h4>
                        <span className="text-xs text-[#aaa]">{item.product.format}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#f5a623]">
                          {(item.product.isFree || item.product.price <= 0) ? 'FREE' : `$${item.product.price}`}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-[#aaa] hover:bg-[#272727] hover:text-white"
                            onClick={() =>
                              updateQuantity(item.product.id, item.quantity - 1)
                            }
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm text-white">
                            {item.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-[#aaa] hover:bg-[#272727] hover:text-white"
                            onClick={() =>
                              updateQuantity(item.product.id, item.quantity + 1)
                            }
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:bg-[#272727] hover:text-red-300"
                            onClick={() => removeItem(item.product.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-[#303030] p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-[#aaa]">{t('total')}</span>
                <span className="text-xl font-bold text-white">${totalPrice().toFixed(2)}</span>
              </div>
              <Button
                disabled={!hasFreeItems}
                className="w-full gap-2 rounded-lg bg-[#f5a623] py-3 text-sm font-semibold text-black hover:bg-[#e09515] disabled:cursor-not-allowed disabled:bg-[#272727] disabled:text-[#888]"
                onClick={() => {
                  setCartDrawerOpen(false)
                  setCheckoutOpen(true)
                }}
              >
                <CreditCard className="h-4 w-4" />
                {hasFreeItems ? t('getFree') : t('paymentLocked')}
              </Button>
              <Button
                variant="ghost"
                className="mt-2 w-full text-sm text-red-400 hover:bg-[#1a1111] hover:text-red-300"
                onClick={clearCart}
              >
                {t('clearAll')}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
