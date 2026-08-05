'use client'

import { Star, Eye, BadgeCheck } from 'lucide-react'
import type { Product } from '@/types'
import { useState, useRef, useCallback } from 'react'

/** Extract YouTube video ID from URL */
function extractYTId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') && u.pathname === '/watch') return u.searchParams.get('v')
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null
    if (u.hostname === 'm.youtube.com' && u.pathname === '/watch') return u.searchParams.get('v')
    return null
  } catch {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|watch\?v=))([a-zA-Z0-9_-]{11})/)
    return m ? m[1] : null
  }
}

interface HoverPreviewProps {
  product: Product
  children: React.ReactNode
}

function formatViews(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export function HoverPreview({ product, children }: HoverPreviewProps) {
  const ytId = product.videoUrl ? extractYTId(product.videoUrl) : null
  const [showVideo, setShowVideo] = useState(false)
  const videoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleHoverEnter = useCallback(() => {
    if (ytId) {
      videoTimer.current = setTimeout(() => setShowVideo(true), 600)
    }
  }, [ytId])

  const handleHoverLeave = useCallback(() => {
    setShowVideo(false)
    if (videoTimer.current) {
      clearTimeout(videoTimer.current)
      videoTimer.current = null
    }
  }, [])

  return (
    <div
      className="group/preview relative"
      onMouseEnter={handleHoverEnter}
      onMouseLeave={handleHoverLeave}
    >
      {children}
      {/* Hover tooltip - only on desktop */}
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-[280px] -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover/preview:opacity-100 max-xl:hidden">
        <div className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-3 shadow-2xl">
          {/* Mini preview - video or image */}
          <div className="relative mb-2 aspect-video w-full overflow-hidden rounded-lg bg-black">
            {showVideo && ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&playsinline=1`}
                title={product.title}
                allow="autoplay; encrypted-media"
                className="h-full w-full border-0"
                style={{ pointerEvents: 'none' }}
              />
            ) : (
              <img
                src={product.thumbnail}
                alt={product.title}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <h4 className="mb-1 line-clamp-2 text-sm font-medium text-[#f1f1f1]">
            {product.title}
          </h4>
          <div className="flex items-center gap-1 text-xs text-[#aaa]">
            <span>{product.seller.name}</span>
            <BadgeCheck className="h-3 w-3 text-[#3ea6ff]" />
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-[#888]">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-[#f5a623] text-[#f5a623]" />
              {product.rating}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {formatViews(product.views)}
            </span>
            <span>{product.sales} đã bán</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-sm font-bold ${product.isFree ? 'text-[#3fb950]' : 'text-[#f5a623]'}`}>
              {product.isFree ? 'FREE' : `$${product.price}`}
            </span>
            <span className="rounded border border-[#303030] bg-[#0f0f0f] px-1.5 py-0.5 text-[10px] text-[#3ea6ff]">
              {product.format}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
