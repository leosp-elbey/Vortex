'use client'

import { useState, useEffect } from 'react'

interface Review {
  id: string
  first_name: string
  location: string
  destination: string
  rating: number
  review_text: string
  saved_amount?: number
  created_at: string
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ first_name: '', location: '', destination: '', rating: 5, review_text: '', saved_amount: '', contact_id: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch('/api/reviews?limit=30')
      .then(r => r.json())
      .then(data => { setReviews(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))

    // Pre-fill contact_id from URL param if present (from review request link)
    const params = new URLSearchParams(window.location.search)
    const cid = params.get('cid')
    if (cid) setForm(f => ({ ...f, contact_id: cid }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: form.contact_id || null,
          rating: form.rating,
          review_text: form.review_text,
          saved_amount: form.saved_amount ? parseInt(form.saved_amount) : null,
        }),
      })
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#1A1A2E] px-6 py-4 flex items-center justify-between">
        <a href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></a>
        <a href="/quote" className="bg-[#FF6B35] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#e55a25] transition-colors">Get Quote</a>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-[#1A1A2E] mb-3">Real Members. Real Savings.</h1>
          <p className="text-gray-500 text-lg">Every review below is from a verified VortexTrips member.</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {[
            { label: 'Active Members', value: '2,000+' },
            { label: 'Total Saved', value: '$3.2M' },
            { label: 'Avg. Rating', value: '4.9 / 5' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl p-6 text-center shadow-sm">
              <p className="text-3xl font-black text-[#FF6B35]">{stat.value}</p>
              <p className="text-gray-500 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Review grid */}
        {loading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1,2,3,4].map(i => <div key={i} className="h-40 bg-gray-200 rounded-2xl animate-pulse" />)}
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center text-gray-400 py-12">No reviews yet — be the first!</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {reviews.map(r => (
              <div key={r.id} className="bg-white rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-[#1A1A2E]">{r.first_name}</p>
                    <p className="text-xs text-gray-400">{r.location}{r.destination ? ` · ${r.destination}` : ''}</p>
                  </div>
                  {r.saved_amount && (
                    <div className="text-right">
                      <p className="text-[#16C79A] font-black">Saved ${r.saved_amount.toLocaleString()}</p>
                    </div>
                  )}
                </div>
                <div className="text-[#FF6B35] mb-2">{'⭐'.repeat(r.rating)}</div>
                <p className="text-gray-600 text-sm italic">"{r.review_text}"</p>
              </div>
            ))}
          </div>
        )}

        {/* Submit review form */}
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-[#1A1A2E] mb-2">Share Your Experience</h2>
          <p className="text-gray-500 mb-6 text-sm">Help other travelers make smarter decisions. Takes 60 seconds.</p>

          {submitted ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-xl font-bold text-[#1A1A2E] mb-2">Thank you, {form.first_name}!</h3>
              <p className="text-gray-500">Your review has been submitted and will appear after a quick review by our team.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Your Rating</label>
                  <select value={form.rating} onChange={e => setForm(f => ({ ...f, rating: parseInt(e.target.value) }))}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B35]">
                    {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">How much did you save? <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="number" placeholder="e.g. 1200" value={form.saved_amount}
                    onChange={e => setForm(f => ({ ...f, saved_amount: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Your Review</label>
                <textarea required rows={4} placeholder="Tell other travelers about your experience — where you went, what you saved, and what surprised you most..."
                  value={form.review_text} onChange={e => setForm(f => ({ ...f, review_text: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35] resize-none" />
              </div>
              <button type="submit" disabled={submitting}
                className="w-full bg-[#FF6B35] hover:bg-[#e55a25] text-white font-bold py-4 rounded-lg text-lg transition-all disabled:opacity-60">
                {submitting ? 'Submitting...' : 'Submit My Review →'}
              </button>
            </form>
          )}
        </div>
      </div>

      <footer className="bg-[#0d0d1a] text-gray-500 py-8 px-6 text-center text-sm mt-16">
        <p className="text-white font-bold mb-2">VortexTrips <span className="text-[#FF6B35]">/ Travel Team Perks</span></p>
        <div className="flex justify-center gap-6 mb-3 flex-wrap">
          <a href="/" className="hover:text-white">Home</a>
          <a href="/quote" className="hover:text-white">Get a Quote</a>
          <a href="/privacy" className="hover:text-white">Privacy</a>
        </div>
        <p>© {new Date().getFullYear()} VortexTrips. All rights reserved.</p>
      </footer>
    </div>
  )
}
