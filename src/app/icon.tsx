import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1A1A2E',
          color: '#FF6B35',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 900,
          fontSize: 22,
          letterSpacing: -1,
          fontFamily: 'sans-serif',
        }}
      >
        V
      </div>
    ),
    { ...size },
  )
}
