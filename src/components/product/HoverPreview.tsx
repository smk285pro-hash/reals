'use client'

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
  onVideoHover?: (show: boolean) => void
}

export function HoverPreview({ product, children, onVideoHover }: HoverPreviewProps) {
  const ytId = product.videoUrl ? extractYTId(product.videoUrl) : null
  const [showVideo, setShowVideo] = useState(false)
  const videoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleHoverEnter = useCallback(() => {
    if (ytId) {
      videoTimer.current = setTimeout(() => {
        setShowVideo(true)
        onVideoHover?.(true)
      }, 600)
    }
  }, [ytId, onVideoHover])

  const handleHoverLeave = useCallback(() => {
    setShowVideo(false)
    onVideoHover?.(false)
    if (videoTimer.current) {
      clearTimeout(videoTimer.current)
      videoTimer.current = null
    }
  }, [onVideoHover])

  return (
    <div
      className="group/preview relative"
      onMouseEnter={handleHoverEnter}
      onMouseLeave={handleHoverLeave}
    >
      {children}
    </div>
  )
}
