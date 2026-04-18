'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { QuoteFormData } from '@/types'

export default function QuotePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<QuoteFormData>({
    first_name: '',
    email: '',
    destination: '',
    travel_dates_start: '',
    travel_dates_end: '',
    travelers: 2,
    budget: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/automations/quote-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#1A1A2E] px-6 py-4">
        <a href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></a>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-[#1A1A2E] mb-3">Get Your Savings Quote</h1>
          <p className="text-gray-500 text-lg">Tell us about your trip and we&apos;ll show you exactly how much you can save as a member.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">First Name</label>
                <input
                  type="text" required placeholder="Jane"
                  value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email" required placeholder="jane@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Destination</label>
              <input
                type="text" required placeholder="Cancún, Mexico / Paris, France / Anywhere!"
                value={form.destination}
                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Departure Date</label>
                <input
                  type="date" required
                  value={form.travel_dates_start}
                  onChange={e => setForm(f => ({ ...f, travel_dates_start: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Return Date</label>
                <input
                  type="date" required
                  value={form.travel_dates_end}
                  onChange={e => setForm(f => ({ ...f, travel_dates_end: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Travelers</label>
                <input
                  type="number" required min={1} max={20}
                  value={form.travelers}
                  onChange={e => setForm(f => ({ ...f, travelers: parseInt(e.target.value) }))}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Budget Range</label>
                <select
                  required
                  value={form.budget}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35] bg-white"
                >
                  <option value="">Select budget</option>
                  <option value="Under $1k">Under $1,000</option>
                  <option value="$1k-$3k">$1,000 – $3,000</option>
                  <option value="$3k-$5k">$3,000 – $5,000</option>
                  <option value="$5k-$10k">$5,000 – $10,000</option>
                  <option value="$10k+">$10,000+</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Additional Notes (optional)</label>
              <textarea
                rows={3} placeholder="Any special requests, preferences, or questions..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FF6B35] resize-none"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full bg-[#FF6B35] hover:bg-[#e55a25] text-white font-bold py-4 px-6 rounded-lg text-lg transition-all disabled:opacity-60 shadow-lg"
            >
              {loading ? 'Generating your quote...' : 'Get My Savings Quote →'}
            </button>

            <p className="text-xs text-center text-gray-400">
              Your personalized AI-written savings quote will be emailed within 2 minutes.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
