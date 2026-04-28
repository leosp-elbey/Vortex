'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface LeadFormProps {
  id: string
  form: { first_name: string; email: string; phone: string; smsConsent: boolean }
  loading: boolean
  error: string
  onChange: (field: string, value: string | boolean) => void
  onSubmit: (e: React.FormEvent) => void
}

function LeadForm({ id, form, loading, error, onChange, onSubmit }: LeadFormProps) {
  return (
    <form onSubmit={onSubmit} id={id} className="space-y-4">
      <input
        type="text"
        placeholder="First Name"
        required
        autoComplete="given-name"
        value={form.first_name}
        onChange={e => onChange('first_name', e.target.value)}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
      />
      <input
        type="email"
        placeholder="Email Address"
        required
        autoComplete="email"
        value={form.email}
        onChange={e => onChange('email', e.target.value)}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
      />
      <input
        type="tel"
        placeholder="Phone Number (optional — for 60-sec savings call)"
        autoComplete="tel"
        value={form.phone}
        onChange={e => onChange('phone', e.target.value)}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
      />
      <p className="text-xs text-gray-400 -mt-2">Msg &amp; data rates may apply. Reply HELP for help, STOP to cancel. Message frequency varies.</p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          required
          checked={form.smsConsent}
          onChange={e => onChange('smsConsent', e.target.checked)}
          className="mt-0.5 flex-shrink-0 accent-[#FF6B35]"
        />
        <span className="text-xs text-gray-500">
          By checking this box, I consent to receive SMS messages from VortexTrips about my travel savings inquiry. View our{' '}
          <a href="/privacy" className="text-[#FF6B35] underline">Privacy Policy</a> and{' '}
          <a href="/terms" className="text-[#FF6B35] underline">Terms</a>.
        </span>
      </label>
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
}

export default function LandingPage() {
  const router = useRouter()
  const [form, setForm] = useState({ first_name: '', email: '', phone: '', smsConsent: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field: string, value: string | boolean) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/webhooks/lead-created', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vortex-Form-Token': process.env.NEXT_PUBLIC_FORM_TOKEN ?? '',
        },
        body: JSON.stringify({ ...form, source: 'landing-page' }),
      })

      if (!res.ok) {
        const data = await res.json()
        const msg = data.error === 'Email already registered'
          ? "You're already in our system! Check your inbox or call us at support@vortextrips.com."
          : data.error || 'Something went wrong'
        throw new Error(msg)
      }

      window.location.href = 'https://myvortex365.com/leosp'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-[#1A1A2E] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
          <a href="/quiz" className="hover:text-white transition-colors">Travel Quiz</a>
          <a href="/destinations/cancun" className="hover:text-white transition-colors">Destinations</a>
          <a href="/reviews" className="hover:text-white transition-colors">Reviews</a>
          <a href="/sba" className="hover:text-white transition-colors">Earn With Us</a>
        </div>
        <a href="https://myvortex365.com/leosp" target="_blank" rel="noopener noreferrer" className="bg-[#FF6B35] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#e55a25] transition-colors">
          Get Free Account
        </a>
      </nav>

      {/* Hero */}
      <section
        id="hero-form"
        className="relative text-white py-20 px-6"
        style={{ backgroundImage: 'url(/hero-background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 bg-[#1A1A2E]/70" />
        <div className="relative z-10 max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
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
            <div className="text-center mb-6">
              <a
                href="https://myvortex365.com/leosp"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-[#16C79A] hover:bg-emerald-500 text-white font-black py-4 px-6 rounded-xl text-lg transition-all shadow-lg"
              >
                ✅ Create My FREE Savings Account →
              </a>
              <p className="text-xs text-gray-400 mt-2">Zero cost. No credit card. Start saving instantly.</p>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-gray-400 text-sm">or get a personalized quote</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-2">Get a Free Savings Quote</h2>
            <p className="text-gray-500 mb-4 text-sm">Leave your info — our team calls you in 60 seconds with your personalized breakdown.</p>
            <LeadForm
              id="hero-form"
              form={form}
              loading={loading}
              error={error}
              onChange={handleChange}
              onSubmit={handleSubmit}
            />
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
              { step: '01', icon: '✅', title: 'Create Free Account', desc: 'Sign up at myvortex365.com/leosp — takes 30 seconds, zero cost, no credit card ever required.' },
              { step: '02', icon: '💰', title: 'Browse & Save', desc: 'Instantly access 500,000+ hotels, flights, and packages at wholesale member rates — 40-60% below retail.' },
              { step: '03', icon: '💼', title: 'Want to Earn Too?', desc: 'Share your link and earn commissions every time someone you refer books a trip. No quotas. No monthly fees.' },
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
              { name: 'Jessica T.', location: 'Austin, TX', saved: '$1,847', trip: 'Cancún family trip', quote: 'I was skeptical at first, but we saved almost $2,000 on our family vacation compared to Expedia. The hotel alone was 52% cheaper. This membership paid for itself 10x over.', photo: '/testimonials/testimonial-jessica.jpg' },
              { name: 'Michelle R.', location: 'Atlanta, GA', saved: '$3,200', trip: 'Europe honeymoon', quote: 'VortexTrips found us a 5-star hotel in Paris for the price of a 3-star. Our entire honeymoon cost less than what most people spend on flights alone. Cannot recommend enough.', photo: '/testimonials/testimonial-michelle.jpg' },
              { name: 'Scott L.', location: 'Chicago, IL', saved: '$940', trip: 'Vegas weekend', quote: 'Called by Maya within a minute of signing up. She walked me through everything and got us a suite for $189/night that was listed at $389 everywhere else. Incredible service.', photo: '/testimonials/testimonial-scott.jpg' },
            ].map(({ name, location, saved, trip, quote, photo }) => (
              <div key={name} className="p-6 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src={photo}
                    alt={name}
                    className="w-12 h-12 rounded-full object-cover object-top flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-[#1A1A2E] whitespace-nowrap">{name}</p>
                      <p className="text-[#16C79A] font-black text-base whitespace-nowrap">Saved {saved}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-gray-500">{location}</p>
                      <p className="text-xs text-gray-400">{trip}</p>
                    </div>
                  </div>
                </div>
                <p className="text-gray-600 text-sm italic">"{quote}"</p>
                <div className="mt-3 text-[#FF6B35]">⭐⭐⭐⭐⭐</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Destinations */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-black text-[#1A1A2E] mb-4">Popular Destinations</h2>
            <p className="text-gray-500 text-lg">See exactly what members are saving on top trips</p>
          </div>
          <div className="grid md:grid-cols-5 gap-4">
            {[
              { slug: 'cancun', name: 'Cancún', emoji: '🌴', saved: 'Save up to 59%' },
              { slug: 'paris', name: 'Paris', emoji: '🗼', saved: 'Save up to 50%' },
              { slug: 'vegas', name: 'Las Vegas', emoji: '🎰', saved: 'Save up to 55%' },
              { slug: 'caribbean', name: 'Caribbean', emoji: '🚢', saved: 'Save up to 52%' },
              { slug: 'orlando', name: 'Orlando', emoji: '🎡', saved: 'Save up to 48%' },
            ].map(({ slug, name, emoji, saved }) => (
              <a
                key={slug}
                href={`/destinations/${slug}`}
                className="bg-white rounded-xl p-5 text-center shadow-sm hover:shadow-md hover:border-[#FF6B35] border-2 border-transparent transition-all group"
              >
                <div className="text-4xl mb-3">{emoji}</div>
                <p className="font-bold text-[#1A1A2E] group-hover:text-[#FF6B35] transition-colors">{name}</p>
                <p className="text-xs text-[#16C79A] font-semibold mt-1">{saved}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Quiz CTA banner */}
      <section className="py-14 px-6 bg-[#FF6B35]">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black text-white mb-2">Not Sure Where to Go?</h2>
            <p className="text-white/80 text-lg">Take our 60-second travel quiz — we'll match you with the perfect destination and your best savings.</p>
          </div>
          <a
            href="/quiz"
            className="shrink-0 bg-white text-[#FF6B35] font-black px-8 py-4 rounded-xl text-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
          >
            Take the Quiz →
          </a>
        </div>
      </section>

      {/* Final CTA */}
      <section id="join" className="py-20 px-6 bg-[#1A1A2E]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-black text-white mb-4">
            Start Saving for Free — Right Now
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            No credit card. No catch. Create your free account and start saving on your next trip in minutes.
          </p>
          <a
            href="https://myvortex365.com/leosp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#16C79A] hover:bg-emerald-500 text-white font-black text-xl px-12 py-5 rounded-2xl transition-all shadow-xl mb-6"
          >
            ✅ Create My Free Account →
          </a>
          <p className="text-gray-500 text-sm mb-10">or leave your info below and we'll call you in 60 seconds</p>
          <div className="bg-white rounded-2xl p-8">
            <LeadForm
              id="cta-form"
              form={form}
              loading={loading}
              error={error}
              onChange={handleChange}
              onSubmit={handleSubmit}
            />
          </div>
          <div className="mt-8 pt-8 border-t border-white/10">
            <p className="text-gray-400 mb-4">Want to earn commissions sharing travel deals?</p>
            <a href="/sba" className="inline-block border border-[#FF6B35] text-[#FF6B35] font-bold px-8 py-3 rounded-xl hover:bg-[#FF6B35] hover:text-white transition-colors">
              Learn About the SBA Opportunity →
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0d0d1a] text-gray-500 py-10 px-6 text-center text-sm">
        <div className="max-w-5xl mx-auto">
          <p className="text-white font-bold text-lg mb-2">VortexTrips</p>
          <div className="flex justify-center gap-6 mb-4 flex-wrap">
            <a href="/quiz" className="hover:text-white transition-colors">Travel Quiz</a>
            <a href="/destinations/cancun" className="hover:text-white transition-colors">Destinations</a>
            <a href="/reviews" className="hover:text-white transition-colors">Member Reviews</a>
            <a href="/quote" className="hover:text-white transition-colors">Get a Quote</a>
            <a href="/join" className="hover:text-white transition-colors">Join Now</a>
            <a href="mailto:support@vortextrips.com" className="hover:text-white transition-colors">Contact</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms</a>
          </div>
          <p>© {new Date().getFullYear()} VortexTrips. All rights reserved.</p>
          <p className="mt-2 text-xs text-gray-600">Savings vary based on destination, travel dates, and availability. Member savings are estimates based on comparison to standard retail rates.</p>
        </div>
      </footer>
    </div>
  )
}
