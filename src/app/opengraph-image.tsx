import { ImageResponse } from 'next/og'

export const alt = 'RealS — REAPER plugins and scripts marketplace'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          color: '#f5f5f5',
          background: 'linear-gradient(135deg, #0b0b0b 0%, #17120a 55%, #34200b 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 58, fontWeight: 800, letterSpacing: '-3px' }}>
          <span>Real</span><span style={{ color: '#f5a623' }}>S</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ maxWidth: 980, fontSize: 64, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-2px' }}>
            Plugins & scripts built for REAPER
          </div>
          <div style={{ maxWidth: 880, fontSize: 28, lineHeight: 1.35, color: '#c7c7c7' }}>
            Discover JSFX, ReaScript, extensions, tools and templates from the RealS community.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 23, color: '#f5a623' }}>
          reals.media <span style={{ color: '#777' }}>•</span> Marketplace for creators
        </div>
      </div>
    ),
    size,
  )
}
