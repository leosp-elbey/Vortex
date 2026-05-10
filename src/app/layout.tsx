import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'VortexTrips — Save 40-60% on Every Trip',
  description: 'Exclusive travel savings membership. AI-powered deal matching. Members save thousands every year on hotels, flights, and vacation packages.',
  openGraph: {
    title: 'VortexTrips — Save 40-60% on Every Trip',
    description: 'Exclusive travel savings membership. Join 2,000+ members saving thousands on hotels, flights & vacation packages.',
    type: 'website',
    url: 'https://www.vortextrips.com',
    siteName: 'VortexTrips',
    images: [
      {
        url: 'https://www.vortextrips.com/og',
        width: 1200,
        height: 630,
        alt: 'VortexTrips — Save 40-60% on Every Trip',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VortexTrips — Save 40-60% on Every Trip',
    description: 'Exclusive travel savings membership. Join 2,000+ members saving thousands.',
    images: ['https://www.vortextrips.com/og'],
  },
  // Phase 14AO.1 — TikTok URL Properties verification via HTML meta tag.
  // The Sandbox app's domain ownership check (Developer Portal → URL
  // Properties → Verify) fetches the HOMEPAGE and looks for this meta
  // tag — NOT the /.well-known/tiktok-developers-site-verification.txt
  // file. The .well-known file is kept for any future TikTok verification
  // path that uses the file method, but the Sandbox app uses the meta tag.
  // Token rotates per app context (Sandbox vs Production); after audit
  // approval the operator may need to swap this content value.
  other: {
    'tiktok-developers-site-verification': '67nU5MQ9tImfxRNclDxmeXpeDBinpjoM',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fbPixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Facebook Pixel */}
        {fbPixelId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
                n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
                t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
                document,'script','https://connect.facebook.net/en_US/fbevents.js');
                fbq('init','${fbPixelId}');fbq('track','PageView');
              `,
            }}
          />
        )}
        {/* Google Analytics */}
        {gaId && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer=window.dataLayer||[];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js',new Date());gtag('config','${gaId}');
                `,
              }}
            />
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  )
}
