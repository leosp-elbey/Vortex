import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Smart Business Affiliate — Get Paid to Share Travel Deals | VortexTrips',
  description: 'Earn weekly commissions sharing travel savings with your network. No inventory. No monthly fees. Affiliates earn $400 to $1,200 part-time. Watch the official opportunity video.',
  openGraph: {
    title: 'Get Paid to Share Travel Deals | VortexTrips SBA',
    description: 'Affiliate program for travel savings. Members save 40-60% — you earn on every signup. Watch the official Surge365 opportunity video.',
    type: 'website',
    url: 'https://www.vortextrips.com/sba',
    images: [
      {
        url: 'https://www.vortextrips.com/og?page=sba',
        width: 1200,
        height: 630,
        alt: 'VortexTrips Smart Business Affiliate',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Get Paid to Share Travel Deals',
    description: 'VortexTrips affiliate program — share travel savings, earn commissions weekly.',
    images: ['https://www.vortextrips.com/og?page=sba'],
  },
  alternates: { canonical: 'https://www.vortextrips.com/sba' },
}

export default function SbaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
