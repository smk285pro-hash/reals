'use client'

import {
  X, Star, Download, Eye, ShoppingCart, BadgeCheck,
  Share2, Heart, Flag, FileCode, Check, Copy, Youtube,
  Loader2, Lock
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { Thumbnail } from '@/components/product/Thumbnail'
import { useI18n } from '@/components/providers/I18nProvider'
import { useAppStore, useCartStore, useWishlistStore, useRecentlyViewedStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { Product } from '@/types'
import { useState, useRef, useCallback, useEffect } from 'react'
import { trackAnalyticsEvent } from '@/components/analytics/AnalyticsTracker'

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v')
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null
    }
    if (parsed.pathname.startsWith('/embed/')) {
      return parsed.pathname.split('/')[2] || null
    }
    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/')[2] || null
    }
    if (parsed.hostname === 'm.youtube.com' && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v')
    }
    return null
  } catch {
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|watch\?v=))([a-zA-Z0-9_-]{11})/
    )
    return match ? match[1] : null
  }
}

function formatViews(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function getProductBadges(product: Product): { label: string; color: string }[] {
  const badges: { label: string; color: string }[] = []
  const daysSinceCreation = (Date.now() - new Date(product.createdAt).getTime()) / 86400000
  if (daysSinceCreation < 7) badges.push({ label: 'NEW', color: 'bg-[#3ea6ff] text-white' })
  if (product.sales > 500) badges.push({ label: 'HOT', color: 'bg-[#ff6b6b] text-white' })
  if (product.rating >= 4.8) badges.push({ label: 'TOP RATED', color: 'bg-[#f5a623] text-black' })
  return badges.slice(0, 2)
}

interface ProductDetailProps {
  product: Product
}

export function ProductDetail({ product }: ProductDetailProps) {
  const { t } = useI18n()
  const { setDetailProductId, setLoginModalOpen, setCartDrawerOpen } = useAppStore()
  const { addItem, isInCart } = useCartStore()
  const { isInWishlist, toggleItem } = useWishlistStore()
  const { data: session } = useSession()
  const inCart = isInCart(product.id)
  const inWishlist = isInWishlist(product.id)
  // Treat legacy rows with price 0 as free even if their old isFree flag is false.
  const isFreeProduct = product.isFree || product.price <= 0
  const badges = getProductBadges(product)
  const [copied, setCopied] = useState(false)
  const [muted, setMuted] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Ownership state — does the current user own this product?
  const [ownsProduct, setOwnsProduct] = useState(false)
  const [checkingOwnership, setCheckingOwnership] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    trackAnalyticsEvent('PRODUCT_VIEW', product.id)
  }, [product.id])

  useEffect(() => {
    if (!session?.user) {
      setOwnsProduct(false)
      setCheckingOwnership(false)
      return
    }
    setCheckingOwnership(true)
    fetch('/api/purchases')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ownedProductIds?.includes(product.id)) {
          setOwnsProduct(true)
        } else {
          setOwnsProduct(false)
        }
      })
      .catch(() => setOwnsProduct(false))
      .finally(() => setCheckingOwnership(false))
  }, [session, product.id])

  // Download handler — asks /api/products/[id]/download for a presigned R2 URL
  // and navigates to it. We deliberately do NOT fetch the file itself: the
  // bucket is private and sends no CORS headers, so following the redirect from
  // script would fail, and a 500MB plugin should not be buffered into a Blob in
  // memory. The presigned URL carries Content-Disposition: attachment, so the
  // navigation downloads rather than replacing the page.
  const handleDownload = useCallback(async () => {
    if (!session?.user) {
      toast.info('Vui lòng đăng nhập để tải file')
      setLoginModalOpen(true)
      return
    }
    setDownloading(true)
    try {
      const res = await fetch(`/api/products/${product.id}/download`, {
        headers: { Accept: 'application/json' },
      })
      if (res.status === 401) {
        toast.info('Vui lòng đăng nhập để tải file')
        setLoginModalOpen(true)
        return
      }
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}))
        if (data?.needPurchase) {
          toast.error('Bạn cần mua sản phẩm trước khi tải')
          setCartDrawerOpen(true)
        } else {
          toast.error(data?.error || 'Không có quyền tải file')
        }
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error || 'Lỗi tải file')
        return
      }
      const data = await res.json()
      if (!data?.url) {
        toast.error('Không lấy được link tải')
        return
      }
      window.location.href = data.url
      toast.success('Đang bắt đầu tải...')
    } catch (e) {
      console.error('[download] error:', e)
      toast.error('Lỗi kết nối server')
    } finally {
      setDownloading(false)
    }
  }, [session, product.id, setLoginModalOpen, setCartDrawerOpen])

  // YouTube embed logic — auto-play, fully chromeless (no controls ever)
  const ytVideoId = product.videoUrl ? extractYouTubeVideoId(product.videoUrl) : null
  // Stable URL — mute=1 always in URL so iframe never reloads; toggle via postMessage
  const embedUrl = ytVideoId
    ? `https://www.youtube.com/embed/${ytVideoId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&iv_load_policy=3&cc_load_policy=0&annotations=0&playsinline=1&disablekb=1&fs=0`
    : null

  // Toggle mute via YouTube postMessage API (no iframe reload)
  const toggleMute = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    const nextMuted = !muted
    const cmd = nextMuted ? 'mute' : 'unMute'
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: cmd, args: [] }),
      'https://www.youtube.com'
    )
    setMuted(nextMuted)
  }, [muted])

  const initials = product.seller.name
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'RF'

  const handleShare = async () => {
    const url = `${window.location.origin}/products/${encodeURIComponent(product.id)}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/70"
        onClick={() => setDetailProductId(null)}
      />

      {/* Modal */}
      <div className="fixed inset-2 z-50 flex items-center justify-center sm:inset-3 md:inset-4">
        <div className="flex h-[94vh] max-h-[94vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-[#303030] bg-black shadow-2xl md:flex-row">
          {/* Left - Video/Image */}
          <div
            className="relative aspect-video w-full shrink-0 self-start bg-black md:w-[min(70%,167.111vh)] md:self-center"
          >
            {ytVideoId ? (
              // YouTube video: auto-play, fully chromeless — no YouTube UI ever shown
              <div className="relative h-full w-full">
                <iframe
                  ref={iframeRef}
                  src={embedUrl!}
                  title={product.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  className="h-full w-full border-0"
                />
                {/* Minimal custom overlay: mute toggle + YouTube link (always visible) */}
                <div
                  className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-4 py-3"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}
                >
                  <button
                    onClick={toggleMute}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
                  >
                    {muted ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
                    )}
                  </button>
                  <a
                    href={`https://www.youtube.com/watch?v=${ytVideoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                  >
                    <Youtube className="h-3.5 w-3.5" />
                    YouTube
                  </a>
                </div>
              </div>
            ) : (
              // No video — just thumbnail
              <Thumbnail
                src={product.thumbnail}
                alt={product.title}
                className="h-full w-full object-contain"
              />
            )}
            {product.duration && !ytVideoId && (
              <div className="absolute bottom-3 right-3 rounded bg-black/80 px-2 py-1 text-sm font-medium text-white">
                {product.duration}
              </div>
            )}
            {/* Badges overlay */}
            {badges.length > 0 && (
              <div className="absolute left-3 top-3 flex gap-1">
                {badges.map((b) => (
                  <span key={b.label} className={`rounded px-2 py-1 text-xs font-bold ${b.color}`}>
                    {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right - Info */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#0f0f0f]">
            {/* Close button */}
            <div className="flex justify-end p-3">
              <Button
                variant="ghost"
                size="icon"
                className="text-[#aaa] hover:bg-[#272727] hover:text-white"
                onClick={() => setDetailProductId(null)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-4 px-5 pb-5">
              {/* Title */}
              <h2 className="text-lg font-semibold leading-snug text-[#f1f1f1]">
                {product.title}
              </h2>

              {/* Seller */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f5a623] to-[#ff6b6b] text-sm font-bold text-black">
                  {initials}
                </div>
                <div>
                  <div className="flex items-center gap-1 text-sm font-medium text-[#f1f1f1]">
                    {product.seller.name}
                    <BadgeCheck className="h-4 w-4 text-[#3ea6ff]" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#aaa]">
                    <span>{t('views', { count: formatViews(product.views) })}</span>
                    <span>•</span>
                    <span>{t('sales', { count: product.sales })}</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-4">
                <div className="flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4 fill-[#f5a623] text-[#f5a623]" />
                  <span className="font-semibold text-white">{product.rating}</span>
                  <span className="text-[#aaa]">/ 5</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-[#aaa]">
                  <Eye className="h-4 w-4" />
                  {formatViews(product.views)}
                </div>
                <div className="flex items-center gap-1 text-sm text-[#aaa]">
                  <Download className="h-4 w-4" />
                  {product.sales}
                </div>
              </div>

              {/* Format & Category */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-[#303030] bg-[#1f1f1f] text-[#3ea6ff]">
                  <FileCode className="mr-1 h-3 w-3" />
                  {product.format}
                </Badge>
                <Badge variant="outline" className="border-[#303030] bg-[#1f1f1f] text-[#aaa]">
                  {product.categorySlug}
                </Badge>
                {product.tags.split(',').map((tag) => (
                  <Badge key={tag} variant="outline" className="border-[#303030] bg-[#1a1a1a] text-[#888]">
                    {tag}
                  </Badge>
                ))}
              </div>

              <Separator className="bg-[#303030]" />

              {/* Description */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[#f1f1f1]">{t('description')}</h3>
                <p className="text-sm leading-relaxed text-[#ccc]">
                  {product.description}
                </p>
              </div>

              <Separator className="bg-[#303030]" />

              {/* Price & Buy */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#aaa]">{t('price')}</span>
                  <span className={`text-2xl font-bold ${isFreeProduct ? 'text-[#3fb950]' : 'text-[#f5a623]'}`}>
                    {isFreeProduct ? t('free').toUpperCase() : `$${product.price}`}
                  </span>
                </div>

                {isFreeProduct ? (
                  /* FREE product — login required to download */
                  <Button
                    className="w-full gap-2 rounded-lg bg-[#3fb950] py-3 text-sm font-semibold text-black hover:bg-[#2ea043]"
                    onClick={handleDownload}
                    disabled={downloading || checkingOwnership}
                  >
                    {downloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {downloading ? t('downloading') : t('downloadFree')}
                  </Button>
                ) : ownsProduct ? (
                  /* PAID product — already purchased → show Download button */
                  <Button
                    className="w-full gap-2 rounded-lg bg-[#3fb950] py-3 text-sm font-semibold text-black hover:bg-[#2ea043]"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {downloading ? t('downloading') : t('downloadPurchased')}
                  </Button>
                ) : (
                  /* PAID product — not purchased. No payment provider is wired
                     up yet, so there is nothing to add it to the cart for. The
                     server rejects paid checkouts regardless; this just avoids
                     walking the user into a dead end. */
                  <Button
                    disabled
                    className="w-full gap-2 rounded-lg bg-[#272727] py-3 text-sm font-semibold text-[#888] disabled:opacity-100"
                  >
                    <Lock className="h-4 w-4" />
                    {t('comingSoon')}
                  </Button>
                )}

                {/* Sub-status hint */}
                {!isFreeProduct && ownsProduct && (
                  <p className="text-center text-xs text-[#3fb950]">
                    ✓ Bạn đã sở hữu sản phẩm này — tải không giới hạn
                  </p>
                )}
                {!isFreeProduct && !ownsProduct && session?.user && (
                  <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[#888]">
                    <Lock className="h-3 w-3" />
                    Tính năng thanh toán đang được hoàn thiện — sản phẩm này chưa thể mua
                  </p>
                )}
                {isFreeProduct && !session?.user && (
                  <p className="flex items-center justify-center gap-1.5 text-center text-xs text-[#888]">
                    <Lock className="h-3 w-3" />
                    Đăng nhập để tải file miễn phí
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-around pt-1">
                <Button
                  variant="ghost"
                  className={`flex flex-col items-center gap-1 text-xs hover:bg-[#1f1f1f] ${inWishlist ? 'text-red-400' : 'text-[#aaa] hover:text-white'}`}
                  onClick={() => toggleItem(product)}
                >
                  <Heart className={`h-5 w-5 ${inWishlist ? 'fill-red-400' : ''}`} />
                  {inWishlist ? t('liked') : t('favorite')}
                </Button>
                <Button
                  variant="ghost"
                  className="flex flex-col items-center gap-1 text-xs text-[#aaa] hover:bg-[#1f1f1f] hover:text-white"
                  onClick={handleShare}
                >
                  {copied ? <Check className="h-5 w-5 text-[#3fb950]" /> : <Copy className="h-5 w-5" />}
                  {copied ? t('copied') : t('copyLink')}
                </Button>
                <Button
                  variant="ghost"
                  className="flex flex-col items-center gap-1 text-xs text-[#aaa] hover:bg-[#1f1f1f] hover:text-white"
                >
                  <Flag className="h-5 w-5" />
                  {t('report')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
