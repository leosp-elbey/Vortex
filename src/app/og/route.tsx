import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#1A1A2E',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Top accent bar */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '6px',
          background: '#FF6B35',
          display: 'flex',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0px' }}>
          <div style={{ fontSize: '60px', fontWeight: 900, color: 'white', letterSpacing: '-1px' }}>
            Vortex
          </div>
          <div style={{ fontSize: '60px', fontWeight: 900, color: '#FF6B35', letterSpacing: '-1px' }}>
            Trips
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: '22px',
          color: 'rgba(255,255,255,0.45)',
          display: 'flex',
          letterSpacing: '2px',
          textTransform: 'uppercase',
        }}>
          Travel Team Perks Membership
        </div>

        {/* Main headline */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          marginTop: '8px',
        }}>
          <div style={{
            fontSize: '96px',
            fontWeight: 900,
            color: '#FF6B35',
            lineHeight: 1,
            display: 'flex',
            letterSpacing: '-2px',
          }}>
            Save 40-60%
          </div>
          <div style={{
            fontSize: '52px',
            fontWeight: 700,
            color: 'white',
            display: 'flex',
            letterSpacing: '-1px',
          }}>
            on Every Trip.
          </div>
        </div>

        {/* Stats pills */}
        <div style={{
          display: 'flex',
          gap: '16px',
          marginTop: '20px',
        }}>
          {[
            { icon: '✈️', text: '500K+ Hotels' },
            { icon: '👥', text: '2,000+ Members' },
            { icon: '💰', text: '$1,200 Avg Savings' },
            { icon: '🌍', text: '180+ Countries' },
          ].map(({ icon, text }) => (
            <div
              key={text}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(22,199,154,0.12)',
                border: '1px solid rgba(22,199,154,0.3)',
                borderRadius: '50px',
                padding: '10px 20px',
                color: '#16C79A',
                fontSize: '18px',
                fontWeight: 600,
              }}
            >
              <span>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* URL */}
        <div style={{
          fontSize: '20px',
          color: 'rgba(255,255,255,0.3)',
          display: 'flex',
          marginTop: '8px',
          letterSpacing: '1px',
        }}>
          vortextrips.com
        </div>

        {/* Bottom accent bar */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: '4px',
          background: 'linear-gradient(to right, #FF6B35, #16C79A)',
          display: 'flex',
        }} />
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
