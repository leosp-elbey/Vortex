/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/join',
        destination: 'https://signup.surge365.com/leosp',
        permanent: false,
      },
      {
        source: '/free',
        destination: 'https://myvortex365.com/leosp',
        permanent: false,
      },
      {
        source: '/book',
        destination: '/traveler.html',
        permanent: false,
      },
      {
        source: '/go',
        destination: '/traveler.html',
        permanent: false,
      },
    ]
  },
  // Phase 14AO — TikTok PULL_FROM_URL ownership proxy.
  //
  // TikTok's Content Posting API requires that any URL passed to its
  // /v2/post/publish/video/init/ endpoint with `source: 'PULL_FROM_URL'`
  // come from a domain registered + verified in the TikTok Developer
  // Portal (we verified `www.vortextrips.com` via the HTML meta tag in
  // src/app/layout.tsx + the root-level signature file under /public).
  //
  // Pre-14AO, the TikTok routes sent video URLs straight from Pexels'
  // CDN (`videos.pexels.com`) — TikTok rejected these with the
  // `URL ownership verification` error from their docs. We can't put a
  // verification file on Pexels' servers (we don't control them).
  //
  // The fix: a Next.js rewrite that proxies `/v/p/:path*` to Pexels'
  // video CDN. Vercel's Edge handles the rewrite (no serverless function
  // invocation, no timeout), so TikTok sees `www.vortextrips.com/v/p/...`
  // (verified host), follows the rewrite, and downloads from Pexels
  // transparently. The video URL stored in `content_calendar.video_url`
  // stays canonical (Pexels URL) for clean record-keeping; the TikTok
  // routes translate to the proxy URL only at publish time.
  //
  // Path shape: `https://videos.pexels.com/video-files/<id>/<file>` →
  // `https://www.vortextrips.com/v/p/<id>/<file>`. The 1:1 mapping makes
  // the URL transformation deterministic and reversible.
  async rewrites() {
    return [
      {
        source: '/v/p/:path*',
        destination: 'https://videos.pexels.com/video-files/:path*',
      },
      {
        // Phase 14AU — Supabase Storage proxy for legacy HeyGen-era TikTok
        // videos (Phase 14L.2.2 pipeline). Same URL-ownership-via-verified-
        // domain pattern as the Pexels /v/p/* rewrite above. Bucket is 'media'
        // and the public path is content/tiktok/<filename>.
        source: '/v/s/:path*',
        destination: 'https://mufpiphjddpacbxlbpqi.supabase.co/storage/v1/object/public/media/content/tiktok/:path*',
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.bland.ai https://api.openai.com https://api.resend.com https://api.twilio.com",
              "frame-src 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
