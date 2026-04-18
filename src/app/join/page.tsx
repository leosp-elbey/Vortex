'use client'

import { useState } from 'react'

export default function JoinPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/automations/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Checkout failed')
      if (data.url) window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#1A1A2E] px-6 py-4">
        <a href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></a>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <div className="inline-block bg-[#16C79A]/10 text-[#16C79A] text-sm font-semibold px-3 py-1 rounded-full mb-4">
            Limited Memberships Available
          </div>
          <h1 className="text-5xl font-black text-[#1A1A2E] mb-4">Join Travel Team Perks</h1>
          <p className="text-gray-500 text-xl">One membership. Unlimited travel savings. Cancel anytime.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Pricing card */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-[#FF6B35]">
            <div className="bg-[#FF6B35] p-6 text-white text-center">
              <p className="text-sm font-semibold uppercase tracking-wide mb-1">Most Popular</p>
              <h2 className="text-3xl font-black">Annual Membership</h2>
              <div className="mt-4">
                <span className="text-5xl font-black">$399</span>
                <span className="text-lg opacity-80">/year</span>
              </div>
              <p className="text-sm opacity-80 mt-1">Just $33/month — less than one hotel night&apos;s savings</p>
            </div>
            <div className="p-6 space-y-3">
              {[
                'Access to 500,000+ hotels at wholesale rates',
                'AI-powered deal matching & alerts',
                'Personal travel consultant',
                'Unpublished flight deals',
                'Cruise & resort package pricing',
                'Digital membership card',
                'Members-only mobile app',
                'Cancel anytime',
              ].map(benefit => (
                <div key={benefit} className="flex items-center gap-3">
                  <span className="text-[#16C79A] font-bold">✓</span>
                  <span className="text-gray-700 text-sm">{benefit}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleCheckout} className="px-6 pb-6">
              <input
                type="email" required placeholder="Your email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 mb-3 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              />
              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
              <button
                type="submit" disabled={loading}
                className="w-full bg-[#FF6B35] hover:bg-[#e55a25] text-white font-bold py-4 rounded-lg text-lg transition-all disabled:opacity-60"
              >
                {loading ? 'Redirecting...' : 'Join Now — Start Saving Today →'}
              </button>
              <p className="text-xs text-center text-gray-400 mt-2">Secure checkout via Stripe. 30-day money-back guarantee.</p>
            </form>
          </div>

          {/* Value calculator */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="font-bold text-[#1A1A2E] text-lg mb-4">Calculate Your Savings</h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Avg. hotel savings per trip', value: '+$340' },
                  { label: 'Avg. flight savings per trip', value: '+$180' },
                  { label: 'Avg. package deals', value: '+$620' },
                  { label: '2 trips per year average', value: '= $2,280 saved' },
                  { label: 'Annual membership cost', value: '- $399' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">{label}</span>
                    <span className={`font-bold ${value.startsWith('+') || value.startsWith('=') ? 'text-[#16C79A]' : 'text-red-500'}`}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-2 mt-2">
                  <span className="font-bold text-[#1A1A2E] text-base">Your NET savings</span>
                  <span className="font-black text-[#16C79A] text-xl">$1,881/yr</span>
                </div>
              </div>
            </div>

            <div className="bg-[#1A1A2E] rounded-xl p-6 text-white">
              <p className="text-[#16C79A] font-semibold mb-2">🛡️ 30-Day Money-Back Guarantee</p>
              <p className="text-gray-300 text-sm">
                If you don&apos;t save more than your membership cost on your first trip within 30 days, we&apos;ll refund you — no questions asked.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <p className="font-bold text-[#1A1A2E] mb-3">What members are saying:</p>
              <blockquote className="text-gray-600 text-sm italic">
                &quot;Paid for itself 10x over in the first month. Best travel decision I&apos;ve ever made.&quot;
              </blockquote>
              <p className="text-xs text-gray-400 mt-2">— Marcus R., Atlanta</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
