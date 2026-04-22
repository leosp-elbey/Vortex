'use client'

import { useState } from 'react'
import Link from 'next/link'

const EARNINGS = [
  { role: 'Part-Time Affiliate', monthly: '$400 – $1,200', how: '3–8 referrals/month' },
  { role: 'Full-Time SBA', monthly: '$2,000 – $5,000', how: '15–30 referrals/month' },
  { role: 'Team Builder', monthly: '$6,000 – $15,000+', how: 'Team override + personal' },
]

const FAQS = [
  { q: 'Do I need travel experience?', a: 'No. We give you everything — a branded booking link, marketing templates, and a trained AI system that follows up for you.' },
  { q: 'Is there a monthly fee?', a: 'No monthly fees. You pay a one-time $399 affiliate license that also gives you full member access to all travel deals.' },
  { q: 'When do I get paid?', a: 'Commissions are paid weekly on confirmed bookings. No holds, no minimums.' },
  { q: 'Can I do this part-time?', a: 'Yes — most of our top affiliates started with 5–10 hours a week alongside their current job.' },
  { q: 'Is this MLM?', a: 'We use a direct affiliate model. You earn on your referrals. Team builders can earn override commissions on their recruits, but there are no recruitment requirements.' },
]

export default function SBAPage() {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', sms_consent: false })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.first_name || !form.email) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/webhooks/lead-created', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.sms_consent ? form.phone : undefined,
          source: 'sba-landing',
          status: 'sba-prospect',
          sms_consent: form.sms_consent,
          enroll_sba: true,
        }),
      })

      if (res.status === 409) {
        setError('That email is already in our system. Check your inbox for an earlier message from us.')
        return
      }
      if (!res.ok) throw new Error('Server error')

      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center px-4">
        <div className="max-w-lg text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-3xl font-black text-white mb-4">You're In — Check Your Inbox</h1>
          <p className="text-gray-300 text-lg mb-8">
            We just sent your SBA welcome package with your affiliate links, marketing kit, and first commission tips.
          </p>
          <Link href="/" className="inline-block bg-[#FF6B35] text-white font-bold px-8 py-4 rounded-xl hover:bg-orange-600 transition">
            Explore VortexTrips →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1A1A2E] text-white">

      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="text-xl font-black">Vortex<span className="text-[#FF6B35]">Trips</span></Link>
        <Link href="/join" className="text-sm text-gray-300 hover:text-white">Member Access →</Link>
      </nav>

      {/* Hero */}
      <section className="text-center px-4 pt-16 pb-20 max-w-4xl mx-auto">
        <div className="inline-block bg-[#FF6B35]/20 text-[#FF6B35] text-sm font-bold px-4 py-2 rounded-full mb-6 uppercase tracking-wider">
          Smart Business Affiliate Program
        </div>
        <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
          Get Paid to Share<br />
          <span className="text-[#FF6B35]">Travel Deals</span> People<br />
          Already Want
        </h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-10">
          VortexTrips affiliates earn commissions sharing a product that practically sells itself — wholesale travel. No convincing required. No inventory. No monthly quotas.
        </p>
        <a href="#apply" className="inline-block bg-[#FF6B35] text-white font-bold text-lg px-10 py-4 rounded-xl hover:bg-orange-600 transition shadow-lg shadow-orange-900/30">
          Apply Now — Free to Start
        </a>
      </section>

      {/* Why travel */}
      <section className="bg-white/5 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">Why Travel Beats Every Other Affiliate Product</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: '✈️', title: 'Everyone Already Travels', body: '92% of Americans travel at least once a year. You don\'t need to create demand — you just connect people to better prices.' },
              { icon: '💰', title: 'The Savings Are Obvious', body: 'When someone sees $4,200 for a hotel and you show them the same room for $1,100 through our portal, the sale is basically done.' },
              { icon: '🔄', title: 'Repeat Business Built In', body: 'Members travel multiple times a year. Every trip is another commission. Every satisfied member tells 3 friends.' },
            ].map(card => (
              <div key={card.title} className="bg-white/10 rounded-2xl p-8">
                <div className="text-4xl mb-4">{card.icon}</div>
                <h3 className="font-bold text-xl mb-3">{card.title}</h3>
                <p className="text-gray-300 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Earnings table */}
      <section className="py-20 px-4 max-w-4xl mx-auto">
        <h2 className="text-3xl font-black text-center mb-3">What Can You Earn?</h2>
        <p className="text-center text-gray-400 mb-10">Commissions are based on $399 membership activations</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-[#FF6B35]">
                <th className="px-6 py-4 font-bold">Level</th>
                <th className="px-6 py-4 font-bold">Monthly Earnings</th>
                <th className="px-6 py-4 font-bold">How to Get There</th>
              </tr>
            </thead>
            <tbody>
              {EARNINGS.map((row, i) => (
                <tr key={row.role} className={i % 2 === 0 ? 'bg-white/5' : 'bg-white/10'}>
                  <td className="px-6 py-4 font-semibold">{row.role}</td>
                  <td className="px-6 py-4 text-[#FF6B35] font-bold">{row.monthly}</td>
                  <td className="px-6 py-4 text-gray-300">{row.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-4 text-center">Earnings are examples based on active affiliates. Results vary based on effort and market.</p>
      </section>

      {/* What you get */}
      <section className="bg-white/5 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">Everything You Need to Succeed</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: '🔗', title: 'Personal Booking Portal', body: 'Your own branded link — members you refer book directly through your portal.' },
              { icon: '🤖', title: 'AI Follow-Up System', body: 'Our AI follows up with your leads via email and text so you don\'t have to chase anyone.' },
              { icon: '📱', title: 'Social Media Templates', body: 'Ready-to-post captions, images, and video scripts — post and earn.' },
              { icon: '📊', title: 'Real-Time Dashboard', body: 'Track your referrals, commissions, and team growth from your phone.' },
              { icon: '🎓', title: 'Training & Onboarding', body: 'Step-by-step affiliate training delivered to your inbox the day you join.' },
              { icon: '💬', title: 'Support Community', body: 'Private group with top affiliates sharing strategies, wins, and travel tips.' },
            ].map(item => (
              <div key={item.title} className="flex gap-4 bg-white/10 rounded-xl p-6">
                <span className="text-3xl flex-shrink-0">{item.icon}</span>
                <div>
                  <h3 className="font-bold text-lg mb-1">{item.title}</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Apply form */}
      <section id="apply" className="py-20 px-4">
        <div className="max-w-lg mx-auto">
          <h2 className="text-3xl font-black text-center mb-3">Start Your Application</h2>
          <p className="text-center text-gray-400 mb-8">No experience needed. Get your SBA welcome kit in minutes.</p>

          <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur rounded-2xl p-8 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                  placeholder="Last name"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Phone Number <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                placeholder="+1 (555) 000-0000"
              />
            </div>

            {form.phone && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.sms_consent}
                  onChange={e => setForm(f => ({ ...f, sms_consent: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 rounded accent-[#FF6B35]"
                />
                <span className="text-xs text-gray-400 leading-relaxed">
                  I agree to receive SMS messages from VortexTrips about my SBA account and earnings opportunities. Message & data rates may apply. Reply STOP to unsubscribe.
                </span>
              </label>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF6B35] text-white font-bold text-lg py-4 rounded-xl hover:bg-orange-600 transition disabled:opacity-60"
            >
              {loading ? 'Submitting…' : 'Get My SBA Welcome Kit →'}
            </button>

            <p className="text-xs text-gray-500 text-center">
              No spam. No monthly fees. Unsubscribe any time.
            </p>
          </form>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white/5 py-20 px-4 max-w-3xl mx-auto">
        <h2 className="text-3xl font-black text-center mb-10">Common Questions</h2>
        <div className="space-y-4">
          {FAQS.map(faq => (
            <details key={faq.q} className="bg-white/10 rounded-xl px-6 py-4 cursor-pointer group">
              <summary className="font-semibold list-none flex justify-between items-center">
                {faq.q}
                <span className="text-[#FF6B35] text-xl group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-gray-300 text-sm mt-3 leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="text-center py-16 px-4">
        <h2 className="text-3xl font-black mb-4">Ready to Start Earning?</h2>
        <p className="text-gray-400 mb-8">Join thousands of affiliates who share travel deals and get paid weekly.</p>
        <a href="#apply" className="inline-block bg-[#FF6B35] text-white font-bold text-lg px-10 py-4 rounded-xl hover:bg-orange-600 transition">
          Apply Now →
        </a>
      </section>

      <footer className="text-center py-8 text-gray-600 text-sm border-t border-white/10">
        <p>© 2026 VortexTrips · <Link href="/privacy" className="hover:text-gray-400">Privacy</Link> · <Link href="/terms" className="hover:text-gray-400">Terms</Link></p>
      </footer>
    </div>
  )
}
