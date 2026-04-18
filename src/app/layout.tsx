import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'VortexTrips — Save 40-60% on Every Trip',
  description: 'Exclusive travel savings membership. AI-powered deal matching. Members save thousands every year on hotels, flights, and vacation packages.',
  openGraph: {
    title: 'VortexTrips — Save 40-60% on Every Trip',
    description: 'Exclusive travel savings membership. Join 2,000+ members saving thousands.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
