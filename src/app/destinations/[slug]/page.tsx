'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { notFound } from 'next/navigation'

const DESTINATIONS: Record<string, {
  name: string
  tagline: string
  description: string
  heroImage: string
  savings: string
  avgSaved: string
  highlights: string[]
  deals: { title: string; retail: string; member: string; savings: string }[]
}> = {
  cancun: {
    name: 'Cancún, Mexico',
    tagline: 'All-inclusive paradise at member-only prices',
    description: 'White sand beaches, crystal-clear water, and world-class resorts — at up to 60% below what you\'d pay on Expedia. Cancún is our most popular destination for a reason.',
    heroImage: '/hero-background.jpg',
    savings: '40–60%',
    avgSaved: '$1,400',
    highlights: ['All-inclusive resorts from $89/night', 'Direct flights from 50+ US cities', 'No passport required for US citizens', 'Private airport transfers included'],
    deals: [
      { title: 'Luxury All-Inclusive (5 nights)', retail: '$3,200', member: '$1,540', savings: '52%' },
      { title: 'Beachfront Hotel Room', retail: '$289/night', member: '$119/night', savings: '59%' },
      { title: 'Family Package (2 adults, 2 kids)', retail: '$4,800', member: '$2,100', savings: '56%' },
    ],
  },
  paris: {
    name: 'Paris, France',
    tagline: 'The City of Light — for less than you think',
    description: 'Stay in the heart of Paris at boutique hotels and 4-star properties at wholesale rates. We\'ve helped hundreds of members experience Paris for what most people pay for a budget trip.',
    heroImage: '/hero-background.jpg',
    savings: '35–55%',
    avgSaved: '$1,800',
    highlights: ['4-star hotels from €95/night', 'Central arrondissement locations', 'Breakfast included at select properties', 'Flexible cancellation on most bookings'],
    deals: [
      { title: '4-Star Hotel (7 nights)', retail: '$2,800', member: '$1,260', savings: '55%' },
      { title: 'Boutique Hotel near Eiffel Tower', retail: '$320/night', member: '$145/night', savings: '55%' },
      { title: 'Paris + Amsterdam combo (10 nights)', retail: '$5,200', member: '$2,600', savings: '50%' },
    ],
  },
  vegas: {
    name: 'Las Vegas, NV',
    tagline: 'Suite life at hotel prices',
    description: 'Vegas hotel rates fluctuate wildly. Our wholesale access locks you into rates that stay low regardless of event calendars. Members regularly stay in suites for what others pay for standard rooms.',
    heroImage: '/hero-background.jpg',
    savings: '45–65%',
    avgSaved: '$800',
    highlights: ['Strip suites from $99/night', 'No resort fees on select properties', 'Weekend and weekday rates', 'Concert and show package add-ons'],
    deals: [
      { title: 'Strip Suite (3 nights, weekend)', retail: '$1,100', member: '$420', savings: '62%' },
      { title: 'Luxury Resort Standard Room', retail: '$389/night', member: '$159/night', savings: '59%' },
      { title: 'Couples Getaway Package', retail: '$1,800', member: '$720', savings: '60%' },
    ],
  },
  caribbean: {
    name: 'Caribbean Islands',
    tagline: 'Island hop at insider rates',
    description: 'From the Bahamas to St. Lucia, our member rates cover 50+ Caribbean islands. Mix and match properties across the region — all at wholesale pricing unavailable to the public.',
    heroImage: '/hero-background.jpg',
    savings: '40–60%',
    avgSaved: '$1,600',
    highlights: ['Overwater bungalows from $180/night', 'All-inclusive and room-only options', 'Island hopping packages available', 'Private villa access for groups'],
    deals: [
      { title: 'Bahamas All-Inclusive (5 nights)', retail: '$3,600', member: '$1,620', savings: '55%' },
      { title: 'St. Lucia Overwater Villa (4 nights)', retail: '$4,200', member: '$1,890', savings: '55%' },
      { title: 'Caribbean Cruise (7 nights)', retail: '$2,900', member: '$1,305', savings: '55%' },
    ],
  },
  orlando: {
    name: 'Orlando, FL',
    tagline: 'Theme park capital — save on every night',
    description: 'Orlando hotels fluctuate massively based on park calendars. Our member rates stay consistent — so you pay the same whether you\'re visiting during spring break or a quiet Tuesday.',
    heroImage: '/hero-background.jpg',
    savings: '40–55%',
    avgSaved: '$700',
    highlights: ['Disney/Universal area hotels from $79/night', 'Free parking at select properties', 'Theme park ticket add-ons', 'Suite upgrades at hotel rates'],
    deals: [
      { title: 'Resort Hotel (5 nights, family of 4)', retail: '$1,800', member: '$810', savings: '55%' },
      { title: 'Disney-area Suite', retail: '$280/night', member: '$126/night', savings: '55%' },
      { title: 'Universal Studios Hotel Package', retail: '$2,200', member: '$990', savings: '55%' },
    ],
  },
}

export default function DestinationPage() {
  const params = useParams()
  const slug = params?.slug as string
  const destination = DESTINATIONS[slug]

  const router = useRouter()
  const [form, setForm] = useState({ first_name: '', email: '', phone: '', smsConsent: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!destination) return notFound()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/webhooks/lead-created', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          source: `destination-${slug}`,
          utm_source: slug,
          utm_medium: 'destination-page',
          utm_campaign: slug,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error === 'Email already registered'
          ? "You're already in our system! Check your inbox."
          : data.error || 'Something went wrong')
      }
      router.push('/thank-you?from=lead')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-[#1A1A2E] px-6 py-4 flex items-center justify-between">
        <a href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></a>
        <a href="/quote" className="bg-[#FF6B35] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#e55a25] transition-colors">Get Quote</a>
      </nav>

      {/* Hero */}
      <section
        className="relative text-white py-24 px-6"
        style={{ backgroundImage: `url(${destination.heroImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 bg-[#1A1A2E]/72" />
        <div className="relative z-10 max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-block bg-[#16C79A]/20 text-[#16C79A] text-sm font-semibold px-3 py-1 rounded-full mb-4">
              ✈️ Members save avg. {destination.avgSaved} on {destination.name.split(',')[0]}
            </div>
            <h1 className="text-5xl font-black leading-tight mb-4">{destination.name}</h1>
            <p className="text-2xl text-[#FF6B35] font-bold mb-4">Save {destination.savings} vs. retail prices</p>
            <p className="text-gray-300 text-lg mb-6">{destination.description}</p>
            <div className="flex flex-wrap gap-3">
              {destination.highlights.map(h => (
                <span key={h} className="text-sm text-gray-300 bg-white/10 px-3 py-1 rounded-full">✓ {h}</span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">See {destination.name.split(',')[0]} Member Rates</h2>
            <p className="text-gray-500 text-sm mb-5">Free access — our team calls you within 60 seconds.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="First Name" required value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
              <input type="email" placeholder="Email Address" required value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
              <input type="tel" placeholder="Phone (e.g. 555-867-5309)" required value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
              <p className="text-xs text-gray-400">Msg &amp; data rates may apply. Reply HELP for help, STOP to cancel.</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" required checked={form.smsConsent}
                  onChange={e => setForm(f => ({ ...f, smsConsent: e.target.checked }))}
                  className="mt-0.5 flex-shrink-0 accent-[#FF6B35]" />
                <span className="text-xs text-gray-500">I consent to SMS from VortexTrips. <a href="/privacy" className="text-[#FF6B35] underline">Privacy</a> · <a href="/terms" className="text-[#FF6B35] underline">Terms</a></span>
              </label>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-[#FF6B35] hover:bg-[#e55a25] text-white font-bold py-4 rounded-lg text-lg transition-all disabled:opacity-60 shadow-lg">
                {loading ? 'Getting your rates...' : `See ${destination.name.split(',')[0]} Rates →`}
              </button>
              <p className="text-xs text-center text-gray-400">No credit card required. Free to access.</p>
            </form>
          </div>
        </div>
      </section>

      {/* Deals */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-[#1A1A2E] text-center mb-12">Current Member Rates — {destination.name}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {destination.deals.map(deal => (
              <div key={deal.title} className="border-2 border-gray-100 hover:border-[#FF6B35] rounded-xl p-6 transition-colors">
                <h3 className="font-bold text-[#1A1A2E] mb-4">{deal.title}</h3>
                <div className="flex items-end gap-3 mb-2">
                  <span className="text-3xl font-black text-[#16C79A]">{deal.member}</span>
                  <span className="text-gray-400 line-through text-sm mb-1">{deal.retail}</span>
                </div>
                <div className="inline-block bg-[#FF6B35]/10 text-[#FF6B35] font-bold text-sm px-3 py-1 rounded-full">
                  Save {deal.savings}
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">Rates based on recent member bookings vs. public retail pricing. Availability varies.</p>
        </div>
      </section>

      {/* All destinations nav */}
      <section className="py-10 px-6 bg-gray-50 border-t">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-gray-500 mb-4 text-sm font-semibold uppercase tracking-wide">More Destinations</p>
          <div className="flex flex-wrap justify-center gap-3">
            {Object.entries(DESTINATIONS).filter(([s]) => s !== slug).map(([s, d]) => (
              <a key={s} href={`/destinations/${s}`}
                className="bg-white border border-gray-200 hover:border-[#FF6B35] text-gray-700 hover:text-[#FF6B35] px-4 py-2 rounded-full text-sm font-medium transition-colors">
                {d.name.split(',')[0]}
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#0d0d1a] text-gray-500 py-8 px-6 text-center text-sm">
        <p className="text-white font-bold text-lg mb-2">VortexTrips <span className="text-[#FF6B35]">/ Travel Team Perks</span></p>
        <div className="flex justify-center gap-6 mb-4 flex-wrap">
          <a href="/" className="hover:text-white transition-colors">Home</a>
          <a href="/quote" className="hover:text-white transition-colors">Get a Quote</a>
          <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
          <a href="/terms" className="hover:text-white transition-colors">Terms</a>
        </div>
        <p>© {new Date().getFullYear()} VortexTrips / Travel Team Perks. All rights reserved.</p>
      </footer>
    </div>
  )
}
