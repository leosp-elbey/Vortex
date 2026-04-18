'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()
  const [form, setForm] = useState({ first_name: '', email: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/webhooks/lead-created', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'landing-page' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Something went wrong')
      }

      router.push('/thank-you')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const LeadForm = ({ id }: { id: string }) => (
    <form onSubmit={handleSubmit} id={id} className="space-y-4">
      <input
        type="text"
        placeholder="First Name"
        required
        value={form.first_name}
        onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
      />
      <input
        type="email"
        placeholder="Email Address"
        required
        value={form.email}
        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
      />
      <input
        type="tel"
        placeholder="Phone Number"
        required
        value={form.phone}
        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#FF6B35] hover:bg-[#e55a25] text-white font-bold py-4 px-6 rounded-lg text-lg transition-all duration-200 disabled:opacity-60 shadow-lg hover:shadow-xl"
      >
        {loading ? 'Getting you in...' : 'Unlock Your Travel Savings →'}
      </button>
      <p className="text-xs text-center text-gray-500">No credit card required. Free to join. Cancel anytime.</p>
    </form>
  )

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-[#1A1A2E] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></span>
          <span className="text-xs text-gray-400 ml-1">by Travel Team Perks</span>
        </div>
        <a href="#join" className="bg-[#FF6B35] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#e55a25] transition-colors">
          Get Access
        </a>
      </nav>

      {/* Hero */}
      <section className="hero-gradient text-white py-20 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-block bg-[#16C79A]/20 text-[#16C79A] text-sm font-semibold px-3 py-1 rounded-full mb-6">
              ✈️ Members save $1,200+ per trip on average
            </div>
            <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6">
              Stop Overpaying.<br />
              <span className="gradient-text">Save 40-60%</span><br />
              on Every Trip.
            </h1>
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              VortexTrips gives you exclusive member-only rates on hotels, flights, and vacation packages — the same deals travel insiders have been using for years.
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-gray-400">
              {['✓ No blackout dates', '✓ 500,000+ hotels worldwide', '✓ AI-powered deal matching', '✓ Personal travel consultant'].map(item => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-[#1A1A2E] mb-2">Get Your Free Savings Quote</h2>
            <p className="text-gray-500 mb-6 text-sm">Our team will call you within 60 seconds with your personalized savings breakdown.</p>
            <LeadForm id="hero-form" />
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <section className="bg-[#FF6B35] py-4 px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-8 text-white text-sm font-semibold text-center">
          <span>⭐⭐⭐⭐⭐ 4.9/5 rating</span>
          <span>👥 2,000+ active members</span>
          <span>💰 $3.2M saved last year</span>
          <span>🌍 180+ countries covered</span>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-black text-[#1A1A2E] mb-4">How It Works</h2>
          <p className="text-gray-500 text-lg mb-16">Three simple steps to your first massive savings</p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', icon: '📝', title: 'Sign Up Free', desc: 'Enter your name, email, and phone. Takes 30 seconds. No credit card needed.' },
              { step: '02', icon: '📞', title: 'Get Your Quote', desc: 'Our AI travel consultant calls you within 60 seconds with a personalized savings breakdown for your next trip.' },
              { step: '03', icon: '🏖️', title: 'Book & Save', desc: 'Access your exclusive member portal. Book at member-only rates. Save 40-60% every single time.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} className="relative p-8 rounded-2xl border-2 border-gray-100 hover:border-[#FF6B35] transition-colors">
                <div className="text-5xl mb-4">{icon}</div>
                <div className="absolute top-4 right-4 text-6xl font-black text-gray-100">{step}</div>
                <h3 className="text-xl font-bold text-[#1A1A2E] mb-3">{title}</h3>
                <p className="text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-[#1A1A2E] mb-4">Everything Members Get</h2>
            <p className="text-gray-500 text-lg">Your all-access pass to the best travel deals on the planet</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: '🏨', title: 'Exclusive Hotel Rates', desc: 'Access to 500,000+ hotels at wholesale rates. Up to 60% below public booking sites.' },
              { icon: '🤖', title: 'AI-Powered Deal Matching', desc: 'Our AI scans millions of deals daily and alerts you when your dream destination goes on sale.' },
              { icon: '👤', title: 'Personal Travel Consultant', desc: 'A dedicated human + AI consultant handles research, bookings, and maximizes every dollar of your savings.' },
              { icon: '✈️', title: 'Members-Only Flight Deals', desc: 'Unpublished fare classes and consolidator rates that aren\'t available to the general public.' },
              { icon: '🚢', title: 'Cruise & Resort Packages', desc: 'Bundle pricing on cruises and all-inclusive resorts at rates 40-50% below retail.' },
              { icon: '🔔', title: 'Deal Alerts & Notifications', desc: 'Get instant alerts when prices drop on your saved destinations. Never miss a deal again.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-6 bg-white rounded-xl shadow-sm">
                <div className="text-3xl flex-shrink-0">{icon}</div>
                <div>
                  <h3 className="font-bold text-[#1A1A2E] mb-1">{title}</h3>
                  <p className="text-gray-500 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-[#1A1A2E] mb-4">Real Members, Real Savings</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Jessica T.', location: 'Austin, TX', saved: '$1,847', trip: 'Cancún family trip', quote: 'I was skeptical at first, but we saved almost $2,000 on our family vacation compared to Expedia. The hotel alone was 52% cheaper. This membership paid for itself 10x over.', avatar: 'JT' },
              { name: 'Marcus R.', location: 'Atlanta, GA', saved: '$3,200', trip: 'Europe honeymoon', quote: 'VortexTrips found us a 5-star hotel in Paris for the price of a 3-star. Our entire honeymoon cost less than what most people spend on flights alone. Cannot recommend enough.', avatar: 'MR' },
              { name: 'Sandra L.', location: 'Chicago, IL', saved: '$940', trip: 'Vegas weekend', quote: 'Called by Maya within a minute of signing up. She walked me through everything and got us a suite for $189/night that was listed at $389 everywhere else. Incredible service.', avatar: 'SL' },
            ].map(({ name, location, saved, trip, quote, avatar }) => (
              <div key={name} className="p-6 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-[#FF6B35] flex items-center justify-center text-white font-bold">
                    {avatar}
                  </div>
                  <div>
                    <p className="font-bold text-[#1A1A2E]">{name}</p>
                    <p className="text-xs text-gray-500">{location}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[#16C79A] font-black text-lg">Saved {saved}</p>
                    <p className="text-xs text-gray-400">{trip}</p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm italic">"{quote}"</p>
                <div className="mt-3 text-[#FF6B35]">⭐⭐⭐⭐⭐</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="join" className="py-20 px-6 bg-[#1A1A2E]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-black text-white mb-4">
            Ready to Start Saving?
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            Join free today. Our team calls you within 60 seconds with your personalized savings breakdown.
          </p>
          <div className="bg-white rounded-2xl p-8">
            <LeadForm id="cta-form" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0d0d1a] text-gray-500 py-10 px-6 text-center text-sm">
        <div className="max-w-5xl mx-auto">
          <p className="text-white font-bold text-lg mb-2">VortexTrips <span className="text-[#FF6B35]">/ Travel Team Perks</span></p>
          <div className="flex justify-center gap-6 mb-4">
            <a href="/quote" className="hover:text-white transition-colors">Get a Quote</a>
            <a href="/join" className="hover:text-white transition-colors">Join Now</a>
            <a href="mailto:support@vortextrips.com" className="hover:text-white transition-colors">Contact</a>
          </div>
          <p>© {new Date().getFullYear()} VortexTrips. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
