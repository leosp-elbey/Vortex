/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/join',
        destination: 'https://signup.surge365.com/signup',
        permanent: false,
      },
      {
        source: '/free',
        destination: 'https://myvortex365.com/leosp',
        permanent: false,
      },
      {
        source: '/book',
        destination: '/book-now',
        permanent: false,
      },
      {
        source: '/booking',
        destination: '/book-now',
        permanent: false,
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
