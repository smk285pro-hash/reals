'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Navbar } from '@/components/layout/Navbar'
import { CategoryBar } from '@/components/layout/CategoryBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { Footer } from '@/components/layout/Footer'
import { MobileNav } from '@/components/layout/MobileNav'
import { NotificationDropdown } from '@/components/layout/NotificationDropdown'
import { ProductCard } from '@/components/product/ProductCard'
import { ProductDetail } from '@/components/product/ProductDetail'
import { SortBar } from '@/components/product/SortBar'
import { TrendingSection } from '@/components/product/TrendingSection'
import { RecentlyViewed } from '@/components/product/RecentlyViewed'
import { CartDrawer } from '@/components/cart/CartDrawer'
import { CheckoutModal } from '@/components/cart/CheckoutModal'
import { ScrollToTop } from '@/components/ui-custom/ScrollToTop'
import { useAppStore, useWishlistStore, useRecentlyViewedStore } from '@/stores'
import { Skeleton } from '@/components/ui/skeleton'
import type { Product, Category } from '@/types'
import { Search, PackageOpen, Heart } from 'lucide-react'
import { Toaster } from 'sonner'
import { useI18n } from '@/components/providers/I18nProvider'
import type { Locale } from '@/i18n/config'
import { seoCopy } from '@/i18n/seo'

// Heavy modules that only render on demand (admin/seller views, auth modals) —
// keep them out of the homepage bundle so the landing page loads faster.
const AdminDashboard = dynamic(() => import('@/app/admin/page'), { ssr: false })
const SellerDashboard = dynamic(
  () => import('@/components/seller/SellerDashboard').then((m) => m.SellerDashboard),
  { ssr: false },
)
const LoginModal = dynamic(
  () => import('@/components/auth/LoginModal').then((m) => m.LoginModal),
  { ssr: false },
)
const RegisterModal = dynamic(
  () => import('@/components/auth/RegisterModal').then((m) => m.RegisterModal),
  { ssr: false },
)
const ForgotPasswordModal = dynamic(
  () => import('@/components/auth/ForgotPasswordModal').then((m) => m.ForgotPasswordModal),
  { ssr: false },
)
const SellerApplyModal = dynamic(
  () => import('@/components/auth/SellerApplyModal').then((m) => m.SellerApplyModal),
  { ssr: false },
)

interface ClientHomePageProps {
  initialProducts: Product[]
  initialCategories: Category[]
  initialTotal: number
  locale: Locale
}

export function ClientHomePage({
  initialProducts,
  initialCategories,
  initialTotal,
  locale,
}: ClientHomePageProps) {
  const { t } = useI18n()
  const {
    activeCategory, searchQuery, sortBy, detailProductId, setDetailProductId,
    loginModalOpen, setLoginModalOpen,
    registerModalOpen, setRegisterModalOpen,
    forgotPasswordModalOpen, setForgotPasswordModalOpen,
    sellerApplyModalOpen, setSellerApplyModalOpen,
  } = useAppStore()
  const wishlistItems = useWishlistStore((s) => s.items)
  const { addItem: addRecent } = useRecentlyViewedStore()

  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [allProducts, setAllProducts] = useState<Product[]>(initialProducts)
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(initialTotal)
  const [isInitialRender, setIsInitialRender] = useState(true)

  const isSellerView = activeCategory === 'seller'
  const isAdminView = activeCategory === 'admin'

  // Fetch products client-side on filter/search change
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeCategory && activeCategory !== 'all' && activeCategory !== 'free' && activeCategory !== 'best-selling' && activeCategory !== 'featured' && activeCategory !== 'latest' && activeCategory !== 'wishlist' && activeCategory !== 'seller' && activeCategory !== 'admin') {
        params.set('category', activeCategory)
      }
      if (searchQuery) params.set('search', searchQuery)
      if (activeCategory === 'free') params.set('free', 'true')
      if (activeCategory === 'best-selling') {
        params.set('sort', 'best-selling')
      } else if (activeCategory !== 'featured') {
        params.set('sort', sortBy)
      }

      const res = await fetch(`/api/products?${params.toString()}`)
      const data = await res.json()

      let filtered = data.products as Product[]

      if (activeCategory === 'featured') {
        filtered = filtered.filter((p: Product) => p.featured)
      }

      setProducts(filtered)
      setAllProducts(data.products)
      setTotal(data.total)
      if (data.categories) setCategories(data.categories)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [activeCategory, searchQuery, sortBy])

  const isPopStateRef = useRef(false)

  // 1. Initial URL search params hydration and browser back/forward (popstate) listener
  useEffect(() => {
    if (typeof window === 'undefined') return

    const searchParams = new URLSearchParams(window.location.search)
    const initialCat = searchParams.get('category')
    const initialProd = searchParams.get('product')
    const initialSearch = searchParams.get('search')

    if (initialCat && initialCat !== useAppStore.getState().activeCategory) {
      useAppStore.setState({ activeCategory: initialCat })
    }
    if (initialProd && initialProd !== useAppStore.getState().detailProductId) {
      useAppStore.setState({ detailProductId: initialProd })
    }
    if (initialSearch && initialSearch !== useAppStore.getState().searchQuery) {
      useAppStore.setState({ searchQuery: initialSearch })
    }

    const handlePopState = () => {
      isPopStateRef.current = true
      const params = new URLSearchParams(window.location.search)
      const cat = params.get('category') || 'all'
      const prod = params.get('product') || null
      const query = params.get('search') || ''

      useAppStore.setState({
        activeCategory: cat,
        detailProductId: prod,
        searchQuery: query,
        cartDrawerOpen: false,
        sidebarOpen: false,
        loginModalOpen: false,
        registerModalOpen: false,
        forgotPasswordModalOpen: false,
        sellerApplyModalOpen: false,
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  // 2. Synchronize store state into browser history stack (pushState)
  useEffect(() => {
    if (isInitialRender) return
    if (typeof window === 'undefined') return
    if (isPopStateRef.current) {
      isPopStateRef.current = false
      return
    }

    const params = new URLSearchParams(window.location.search)

    if (activeCategory && activeCategory !== 'all') {
      params.set('category', activeCategory)
    } else {
      params.delete('category')
    }

    if (searchQuery) {
      params.set('search', searchQuery)
    } else {
      params.delete('search')
    }

    if (detailProductId) {
      params.set('product', detailProductId)
    } else {
      params.delete('product')
    }

    const newQuery = params.toString()
    const targetUrl = newQuery ? `${window.location.pathname}?${newQuery}` : window.location.pathname
    const currentFullUrl = window.location.pathname + window.location.search

    if (targetUrl !== currentFullUrl) {
      window.history.pushState({ reals: true, activeCategory, detailProductId, searchQuery }, '', targetUrl)
    }
  }, [activeCategory, detailProductId, searchQuery, isInitialRender])

  useEffect(() => {
    if (isInitialRender) {
      setIsInitialRender(false)
      return
    }
    if (activeCategory === 'wishlist') {
      setProducts(wishlistItems)
      setLoading(false)
      return
    }
    if (activeCategory === 'seller' || activeCategory === 'admin') {
      setLoading(false)
      return
    }
    fetchProducts()
  }, [fetchProducts, activeCategory, wishlistItems, isInitialRender])

  const selectedProduct = detailProductId
    ? [...allProducts, ...wishlistItems].find((p) => p.id === detailProductId)
    : null

  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f0f] text-[#f1f1f1]">
      <Toaster theme="dark" position="bottom-right" richColors />
      <Navbar />
      {!isSellerView && !isAdminView && <CategoryBar categories={categories} />}
      <Sidebar />
      <CartDrawer />
      <CheckoutModal />
      <NotificationDropdown />
      <ScrollToTop />
      <MobileNav />

      {/* Auth Modals */}
      <LoginModal
        open={loginModalOpen}
        onOpenChange={(open) => { setLoginModalOpen(open) }}
        onSwitchToRegister={() => { setLoginModalOpen(false); setTimeout(() => setRegisterModalOpen(true), 150) }}
        onSwitchToForgot={() => { setLoginModalOpen(false); setTimeout(() => setForgotPasswordModalOpen(true), 150) }}
      />
      <RegisterModal
        open={registerModalOpen}
        onOpenChange={(open) => { setRegisterModalOpen(open) }}
        onSwitchToLogin={() => { setRegisterModalOpen(false); setTimeout(() => setLoginModalOpen(true), 150) }}
      />
      <ForgotPasswordModal
        open={forgotPasswordModalOpen}
        onOpenChange={(open) => { setForgotPasswordModalOpen(open) }}
        onSwitchToLogin={() => { setForgotPasswordModalOpen(false); setTimeout(() => setLoginModalOpen(true), 150) }}
      />
      <SellerApplyModal
        open={sellerApplyModalOpen}
        onOpenChange={setSellerApplyModalOpen}
      />

      {/* Admin Dashboard / Seller Dashboard / Public View Router */}
      {isAdminView ? (
        <AdminDashboard />
      ) : isSellerView ? (
        <SellerDashboard />
      ) : (
        <>
          {/* Main content */}
          <main className="flex-1 pb-16 md:pb-0">
            <div className="mx-auto max-w-[1400px]">
              {/* Header section for Accessibility & SEO */}
              <div className="px-4 pt-6 md:px-6">
                <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {seoCopy(locale).homeTitle}
                </h1>
                <p className="mt-2 text-sm text-[#aaa]">
                  {seoCopy(locale).homeDescription}
                </p>
              </div>

              {/* Trending section */}
              {!searchQuery && (activeCategory === 'all' || activeCategory === 'latest') && !loading && allProducts.length > 0 && (
                <div className="px-4 pt-4 md:px-6">
                  <TrendingSection products={allProducts} />
                </div>
              )}

              {/* Recently Viewed */}
              {activeCategory === 'all' && !searchQuery && (
                <div className="px-4 md:px-6">
                  <RecentlyViewed
                    onProductClick={(product) => {
                      addRecent(product)
                      setDetailProductId(product.id)
                    }}
                  />
                </div>
              )}

              <SortBar />

              {/* Results count / Wishlist header */}
              <div className="px-4 pb-2 md:px-6">
                {activeCategory === 'wishlist' ? (
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-red-400" />
                    <span className="text-sm font-medium text-[#f1f1f1]">
                      {t('wishlist')} ({wishlistItems.length})
                    </span>
                  </div>
                ) : !loading ? (
                  <p className="text-xs text-[#888]">
                    {total > 0
                      ? searchQuery ? t('productsFor', { count: total, query: searchQuery }) : t('products', { count: total })
                      : searchQuery
                        ? t('noResultsFor', { query: searchQuery })
                        : ''}
                  </p>
                ) : null}
              </div>

              {/* Product grid */}
              <div className="px-4 pb-8 md:px-6">
                {loading ? (
                  <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="space-y-3">
                        <Skeleton className="aspect-video w-full rounded-xl bg-[#1f1f1f]" />
                        <div className="flex gap-3">
                          <Skeleton className="h-9 w-9 shrink-0 rounded-full bg-[#1f1f1f]" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-full bg-[#1f1f1f]" />
                            <Skeleton className="h-3 w-3/4 bg-[#1f1f1f]" />
                            <Skeleton className="h-3 w-1/2 bg-[#1f1f1f]" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : products.length > 0 ? (
                  <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {products.map((product) => (
                      <article key={product.id}>
                        <ProductCard product={product} />
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-20 text-[#888]">
                    {activeCategory === 'wishlist' ? (
                      <>
                        <Heart className="h-16 w-16 opacity-30" />
                        <p className="text-lg font-medium">{t('noFavorites')}</p>
                        <p className="text-sm">{t('favoriteHint')}</p>
                      </>
                    ) : searchQuery ? (
                      <>
                        <Search className="h-16 w-16 opacity-30" />
                        <p className="text-lg font-medium">{t('noResults')}</p>
                        <p className="text-sm">{t('searchHint')}</p>
                      </>
                    ) : (
                      <>
                        <PackageOpen className="h-16 w-16 opacity-30" />
                        <p className="text-lg font-medium">{t('noProducts')}</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </main>
          <Footer />
        </>
      )}

      {/* Product detail modal */}
      {selectedProduct && <ProductDetail product={selectedProduct} />}
    </div>
  )
}
