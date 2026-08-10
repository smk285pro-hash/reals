'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { SellerDashboard } from '@/components/seller/SellerDashboard'
import AdminDashboard from '@/app/admin/page'
import { ScrollToTop } from '@/components/ui-custom/ScrollToTop'
import { LoginModal } from '@/components/auth/LoginModal'
import { RegisterModal } from '@/components/auth/RegisterModal'
import { ForgotPasswordModal } from '@/components/auth/ForgotPasswordModal'
import { SellerApplyModal } from '@/components/auth/SellerApplyModal'
import { useAppStore, useWishlistStore, useRecentlyViewedStore } from '@/stores'
import { Skeleton } from '@/components/ui/skeleton'
import type { Product, Category } from '@/types'
import { Search, PackageOpen, Heart } from 'lucide-react'
import { Toaster } from 'sonner'
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker'

export default function HomePage() {
  const {
    activeCategory, searchQuery, sortBy, detailProductId, setDetailProductId,
    loginModalOpen, setLoginModalOpen,
    registerModalOpen, setRegisterModalOpen,
    forgotPasswordModalOpen, setForgotPasswordModalOpen,
    sellerApplyModalOpen, setSellerApplyModalOpen,
  } = useAppStore()
  const wishlistItems = useWishlistStore((s) => s.items)
  const { addItem: addRecent } = useRecentlyViewedStore()
  const [products, setProducts] = useState<Product[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  const isSellerView = activeCategory === 'seller'
  const isAdminView = activeCategory === 'admin'

  // Fetch products
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
      } else if (activeCategory === 'featured') {
        // client filter
      } else {
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

  useEffect(() => {
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
  }, [fetchProducts, activeCategory, wishlistItems])

  const selectedProduct = detailProductId
    ? [...allProducts, ...wishlistItems].find((p) => p.id === detailProductId)
    : null

  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f0f] text-[#f1f1f1]">
      <Toaster theme="dark" position="bottom-right" richColors />
      <AnalyticsTracker />
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
        onOpenChange={(open) => { console.log('LoginModal onOpenChange', open); setLoginModalOpen(open); }}
        onSwitchToRegister={() => { console.log('switchToRegister'); setLoginModalOpen(false); setTimeout(() => { console.log('setTimeout: opening register'); setRegisterModalOpen(true); }, 150); }}
        onSwitchToForgot={() => { console.log('switchToForgot'); setLoginModalOpen(false); setTimeout(() => { console.log('setTimeout: opening forgot'); setForgotPasswordModalOpen(true); }, 150); }}
      />
      <RegisterModal
        open={registerModalOpen}
        onOpenChange={(open) => { console.log('RegisterModal onOpenChange', open); setRegisterModalOpen(open); }}
        onSwitchToLogin={() => { console.log('switchToLogin from register'); setRegisterModalOpen(false); setTimeout(() => { console.log('setTimeout: opening login from register'); setLoginModalOpen(true); }, 150); }}
      />
      <ForgotPasswordModal
        open={forgotPasswordModalOpen}
        onOpenChange={(open) => { console.log('ForgotPasswordModal onOpenChange', open); setForgotPasswordModalOpen(open); }}
        onSwitchToLogin={() => { console.log('switchToLogin from forgot'); setForgotPasswordModalOpen(false); setTimeout(() => { console.log('setTimeout: opening login from forgot'); setLoginModalOpen(true); }, 150); }}
      />
      <SellerApplyModal
        open={sellerApplyModalOpen}
        onOpenChange={setSellerApplyModalOpen}
      />

      {/* Admin Dashboard View */}
      {isAdminView ? (
        <AdminDashboard />
      ) : isSellerView ? (
        <SellerDashboard />
      ) : (
        <>
          {/* Main content */}
          <main className="flex-1 pb-16 md:pb-0">
            <div className="mx-auto max-w-[1400px]">
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
                      Yêu thích ({wishlistItems.length})
                    </span>
                  </div>
                ) : !loading ? (
                  <p className="text-xs text-[#888]">
                    {total > 0
                      ? `${total} sản phẩm ${searchQuery ? `cho "${searchQuery}"` : ''}`
                      : searchQuery
                        ? `Không tìm thấy kết quả cho "${searchQuery}"`
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
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-20 text-[#888]">
                    {activeCategory === 'wishlist' ? (
                      <>
                        <Heart className="h-16 w-16 opacity-30" />
                        <p className="text-lg font-medium">Chưa có sản phẩm yêu thích</p>
                        <p className="text-sm">Bấm tim ❤️ trên sản phẩm để thêm vào danh sách</p>
                      </>
                    ) : searchQuery ? (
                      <>
                        <Search className="h-16 w-16 opacity-30" />
                        <p className="text-lg font-medium">Không tìm thấy kết quả</p>
                        <p className="text-sm">Thử tìm với từ khóa khác hoặc duyệt danh mục</p>
                      </>
                    ) : (
                      <>
                        <PackageOpen className="h-16 w-16 opacity-30" />
                        <p className="text-lg font-medium">Chưa có sản phẩm</p>
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
