'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product, CartItemType } from '@/types'

interface CartStore {
  items: CartItemType[]
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  totalItems: () => number
  totalPrice: () => number
  isInCart: (productId: string) => boolean
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product: Product) => {
        const items = get().items
        const existing = items.find((i) => i.product.id === product.id)
        if (existing) {
          set({
            items: items.map((i) =>
              i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
            ),
          })
        } else {
          set({ items: [...items, { id: product.id, product, quantity: 1 }] })
        }
      },

      removeItem: (productId: string) => {
        set({ items: get().items.filter((i) => i.product.id !== productId) })
      },

      updateQuantity: (productId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(productId)
          return
        }
        set({
          items: get().items.map((i) =>
            i.product.id === productId ? { ...i, quantity } : i
          ),
        })
      },

      clearCart: () => set({ items: [] }),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      totalPrice: () =>
        get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),

      isInCart: (productId: string) =>
        get().items.some((i) => i.product.id === productId),
    }),
    { name: 'reatube-cart' }
  )
)

// App-level store for UI state
interface AppStore {
  sidebarOpen: boolean
  searchQuery: string
  activeCategory: string
  cartDrawerOpen: boolean
  detailProductId: string | null
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSearchQuery: (q: string) => void
  setActiveCategory: (c: string) => void
  setCartDrawerOpen: (open: boolean) => void
  setDetailProductId: (id: string | null) => void
  sortBy: 'latest' | 'popular' | 'price-asc' | 'price-desc' | 'rating'
  setSortBy: (s: AppStore['sortBy']) => void
}

export const useAppStore = create<AppStore>()((set) => ({
  sidebarOpen: false,
  searchQuery: '',
  activeCategory: 'all',
  cartDrawerOpen: false,
  detailProductId: null,
  sortBy: 'latest',
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveCategory: (c) => set({ activeCategory: c }),
  setCartDrawerOpen: (open) => set({ cartDrawerOpen: open }),
  setDetailProductId: (id) => set({ detailProductId: id }),
  setSortBy: (s) => set({ sortBy: s }),
}))
