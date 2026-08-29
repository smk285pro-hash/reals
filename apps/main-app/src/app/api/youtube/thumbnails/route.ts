import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/youtube/thumbnails?url=<youtube_url>
 *
 * Extracts the YouTube video ID from various URL formats and returns
 * all available thumbnail resolutions. No API key needed — YouTube
 * thumbnail URLs are publicly accessible by convention.
 *
 * Supported URL formats:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *   - https://www.youtube.com/embed/VIDEO_ID
 *   - https://youtube.com/shorts/VIDEO_ID
 *   - https://m.youtube.com/watch?v=VIDEO_ID
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Thiếu tham số url' }, { status: 400 })
  }

  // Extract video ID from various YouTube URL formats
  const videoId = extractYouTubeVideoId(url)

  if (!videoId) {
    return NextResponse.json({ error: 'URL YouTube không hợp lệ' }, { status: 400 })
  }

  // YouTube provides these thumbnail resolutions for free (no API key needed)
  // https://img.youtube.com/vi/VIDEO_ID/<quality>.jpg
  const thumbnails = [
    {
      quality: 'maxres',
      label: 'HD (1280×720)',
      url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      width: 1280,
      height: 720,
    },
    {
      quality: 'sd',
      label: 'SD (640×480)',
      url: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
      width: 640,
      height: 480,
    },
    {
      quality: 'hq',
      label: 'HQ (480×360)',
      url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      width: 480,
      height: 360,
    },
    {
      quality: 'mq',
      label: 'MQ (320×180)',
      url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      width: 320,
      height: 180,
    },
    {
      quality: 'default',
      label: 'Mặc định (120×90)',
      url: `https://img.youtube.com/vi/${videoId}/default.jpg`,
      width: 120,
      height: 90,
    },
  ]

  // Verify which thumbnails actually exist by checking the first few
  // (maxres doesn't exist for all videos — fallback gracefully)
  const verifiedThumbnails: typeof thumbnails = []

  for (const thumb of thumbnails) {
    try {
      const resp = await fetch(thumb.url, { method: 'HEAD' })
      if (resp.ok) {
        verifiedThumbnails.push(thumb)
      }
    } catch {
      // Skip thumbnails that fail to verify
    }
  }

  // If no thumbnails verified (e.g. private/unlisted video), still return them
  // The client will handle broken images gracefully
  const result = verifiedThumbnails.length > 0 ? verifiedThumbnails : thumbnails.slice(2) // At least return hq + mq

  return NextResponse.json({
    videoId,
    thumbnails: result,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  })
}

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url)

    // youtube.com/watch?v=VIDEO_ID
    if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v')
    }

    // youtu.be/VIDEO_ID (short URL)
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null
    }

    // youtube.com/embed/VIDEO_ID
    if (parsed.pathname.startsWith('/embed/')) {
      return parsed.pathname.split('/')[2] || null
    }

    // youtube.com/shorts/VIDEO_ID
    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/')[2] || null
    }

    // m.youtube.com/watch?v=VIDEO_ID (mobile)
    if (parsed.hostname === 'm.youtube.com' && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v')
    }

    return null
  } catch {
    // If URL parsing fails, try regex fallback
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|watch\?v=))([a-zA-Z0-9_-]{11})/
    )
    return match ? match[1] : null
  }
}
