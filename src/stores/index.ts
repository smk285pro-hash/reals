'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product, CartItemType } from '@/types'

// ==================== CART STORE ====================
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
    { name: 'reals-cart' }
  )
)

// ==================== WISHLIST STORE ====================
interface WishlistStore {
  items: Product[]
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  toggleItem: (product: Product) => void
  isInWishlist: (productId: string) => boolean
  clearWishlist: () => void
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product: Product) => {
        if (!get().items.some((i) => i.id === product.id)) {
          set({ items: [...get().items, product] })
        }
      },

      removeItem: (productId: string) => {
        set({ items: get().items.filter((i) => i.id !== productId) })
      },

      toggleItem: (product: Product) => {
        if (get().items.some((i) => i.id === product.id)) {
          get().removeItem(product.id)
        } else {
          get().addItem(product)
        }
      },

      isInWishlist: (productId: string) =>
        get().items.some((i) => i.id === productId),

      clearWishlist: () => set({ items: [] }),
    }),
    { name: 'reals-wishlist' }
  )
)

// ==================== RECENTLY VIEWED STORE ====================
interface RecentlyViewedStore {
  items: Product[]
  addItem: (product: Product) => void
  clearAll: () => void
}

export const useRecentlyViewedStore = create<RecentlyViewedStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product: Product) => {
        const filtered = get().items.filter((i) => i.id !== product.id)
        set({ items: [product, ...filtered].slice(0, 10) })
      },

      clearAll: () => set({ items: [] }),
    }),
    { name: 'reals-recent' }
  )
)

// ==================== APP STORE ====================
interface AppStore {
  sidebarOpen: boolean
  searchQuery: string
  activeCategory: string
  cartDrawerOpen: boolean
  detailProductId: string | null
  checkoutOpen: boolean
  notificationOpen: boolean
  // Auth modals
  loginModalOpen: boolean
  registerModalOpen: boolean
  forgotPasswordModalOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSearchQuery: (q: string) => void
  setActiveCategory: (c: string) => void
  setCartDrawerOpen: (open: boolean) => void
  setDetailProductId: (id: string | null) => void
  setCheckoutOpen: (open: boolean) => void
  setNotificationOpen: (open: boolean) => void
  setLoginModalOpen: (open: boolean) => void
  setRegisterModalOpen: (open: boolean) => void
  setForgotPasswordModalOpen: (open: boolean) => void
  sortBy: 'latest' | 'popular' | 'price-asc' | 'price-desc' | 'rating' | 'best-selling'
  setSortBy: (s: AppStore['sortBy']) => void
}

export const useAppStore = create<AppStore>()((set) => ({
  sidebarOpen: false,
  searchQuery: '',
  activeCategory: 'all',
  cartDrawerOpen: false,
  detailProductId: null,
  checkoutOpen: false,
  notificationOpen: false,
  loginModalOpen: false,
  registerModalOpen: false,
  forgotPasswordModalOpen: false,
  sortBy: 'latest',
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveCategory: (c) => set({ activeCategory: c }),
  setCartDrawerOpen: (open) => set({ cartDrawerOpen: open }),
  setDetailProductId: (id) => set({ detailProductId: id }),
  setCheckoutOpen: (open) => set({ checkoutOpen: open }),
  setNotificationOpen: (open) => set({ notificationOpen: open }),
  setLoginModalOpen: (open) => set({ loginModalOpen: open }),
  setRegisterModalOpen: (open) => set({ registerModalOpen: open }),
  setForgotPasswordModalOpen: (open) => set({ forgotPasswordModalOpen: open }),
  setSortBy: (s) => set({ sortBy: s }),
}))
