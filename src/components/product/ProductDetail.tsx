'use client'

import {
  X, Star, Download, Eye, ShoppingCart, BadgeCheck,
  Share2, Heart, Flag, FileCode, Check, Copy, Youtube, Play
} from 'lucide-react'
import { useAppStore, useCartStore, useWishlistStore, useRecentlyViewedStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { Product } from '@/types'
import { useState } from 'react'

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
  const { setDetailProductId } = useAppStore()
  const { addItem, isInCart } = useCartStore()
  const { isInWishlist, toggleItem } = useWishlistStore()
  const inCart = isInCart(product.id)
  const inWishlist = isInWishlist(product.id)
  const badges = getProductBadges(product)
  const [copied, setCopied] = useState(false)
  const [playing, setPlaying] = useState(false)

  // YouTube embed logic
  const ytVideoId = product.videoUrl ? extractYouTubeVideoId(product.videoUrl) : null
  const embedUrl = ytVideoId ? `https://www.youtube.com/embed/${ytVideoId}?autoplay=1&rel=0` : null

  const initials = product.seller.name
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'RF'

  const handleShare = async () => {
    const url = `${window.location.origin}?product=${product.id}`
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
      <div className="fixed inset-4 z-50 flex items-center justify-center sm:inset-8 md:inset-16">
        <div className="flex max-h-[90vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-[#303030] bg-[#0f0f0f] shadow-2xl md:flex-row">
          {/* Left - Video/Image */}
          <div className="relative aspect-video w-full shrink-0 bg-black md:aspect-auto md:h-auto md:w-[55%]">
            {playing && embedUrl ? (
              // YouTube iframe player
              <iframe
                src={embedUrl}
                title={product.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            ) : (
              // Thumbnail with play button overlay (if YouTube video available)
              <>
                <img
                  src={product.thumbnail}
                  alt={product.title}
                  className="h-full w-full object-cover"
                />
                {ytVideoId && (
                  <button
                    onClick={() => setPlaying(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg transition-transform hover:scale-110">
                      <Play className="h-6 w-6 fill-white text-white ml-0.5" />
                    </div>
                  </button>
                )}
              </>
            )}
            {product.duration && (
              <div className="absolute bottom-3 right-3 rounded bg-black/80 px-2 py-1 text-sm font-medium text-white">
                {product.duration}
              </div>
            )}
            {/* YouTube badge */}
            {ytVideoId && !playing && (
              <div className="absolute left-3 top-3 flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-bold text-white">
                <Youtube className="h-3.5 w-3.5" />
                YouTube
              </div>
            )}
            {/* Badges overlay */}
            {badges.length > 0 && (
              <div className={`absolute ${ytVideoId && !playing ? 'left-3 top-10' : 'left-3 top-3'} flex gap-1`}>
                {badges.map((b) => (
                  <span key={b.label} className={`rounded px-2 py-1 text-xs font-bold ${b.color}`}>
                    {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right - Info */}
          <div className="flex flex-1 flex-col overflow-y-auto">
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
                    <span>{formatViews(product.views)} views</span>
                    <span>•</span>
                    <span>{product.sales} đã bán</span>
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
                <h3 className="mb-2 text-sm font-semibold text-[#f1f1f1]">Mô tả</h3>
                <p className="text-sm leading-relaxed text-[#ccc]">
                  {product.description}
                </p>
              </div>

              <Separator className="bg-[#303030]" />

              {/* Price & Buy */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#aaa]">Giá</span>
                  <span className={`text-2xl font-bold ${product.isFree ? 'text-[#3fb950]' : 'text-[#f5a623]'}`}>
                    {product.isFree ? 'MIỄN PHÍ' : `$${product.price}`}
                  </span>
                </div>

                {product.isFree ? (
                  <Button className="w-full gap-2 rounded-lg bg-[#3fb950] py-3 text-sm font-semibold text-black hover:bg-[#2ea043]">
                    <Download className="h-4 w-4" />
                    Tải miễn phí
                  </Button>
                ) : (
                  <Button
                    className={`w-full gap-2 rounded-lg py-3 text-sm font-semibold ${
                      inCart
                        ? 'bg-[#272727] text-[#f5a623] hover:bg-[#333]'
                        : 'bg-[#f5a623] text-black hover:bg-[#e09515]'
                    }`}
                    onClick={() => {
                      if (!inCart) addItem(product)
                    }}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {inCart ? 'Đã thêm vào giỏ ✓' : 'Thêm vào giỏ hàng'}
                  </Button>
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
                  {inWishlist ? 'Đã thích' : 'Yêu thích'}
                </Button>
                <Button
                  variant="ghost"
                  className="flex flex-col items-center gap-1 text-xs text-[#aaa] hover:bg-[#1f1f1f] hover:text-white"
                  onClick={handleShare}
                >
                  {copied ? <Check className="h-5 w-5 text-[#3fb950]" /> : <Copy className="h-5 w-5" />}
                  {copied ? 'Đã copy!' : 'Copy link'}
                </Button>
                <Button
                  variant="ghost"
                  className="flex flex-col items-center gap-1 text-xs text-[#aaa] hover:bg-[#1f1f1f] hover:text-white"
                >
                  <Flag className="h-5 w-5" />
                  Báo cáo
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
