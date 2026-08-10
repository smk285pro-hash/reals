'use client'

/**
 * Product thumbnail with a placeholder for the missing case.
 *
 * Products can legitimately have no thumbnail: `POST /api/products` writes an
 * empty string when one was not supplied. A bare `<img src="">` is not a
 * harmless no-op — browsers resolve the empty string against the current
 * document and re-request the page, so every thumbnail-less product on a grid
 * fires a duplicate page load. This renders an icon instead.
 *
 * Broken URLs are handled the same way. That case is not hypothetical: every
 * product created before this component existed carries a hardcoded Unsplash
 * URL that now 404s.
 */

import { useState } from 'react'
import { ImageOff } from 'lucide-react'

interface ThumbnailProps {
  src: string | null | undefined
  alt: string
  /** Applied to both the real image and the placeholder, so layout is identical either way. */
  className?: string
  loading?: 'lazy' | 'eager'
}

export function Thumbnail({ src, alt, className = '', loading }: ThumbnailProps) {
  // Reset on src change so a previously-failed slot can recover when the
  // product's thumbnail is corrected — list items get recycled by key.
  const [failed, setFailed] = useState(false)
  const [lastSrc, setLastSrc] = useState(src)
  if (src !== lastSrc) {
    setLastSrc(src)
    setFailed(false)
  }

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-[#2a2a2a] ${className}`}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="h-1/3 w-1/3 max-h-6 max-w-6 text-[#555]" aria-hidden="true" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
    />
  )
}
