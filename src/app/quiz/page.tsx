'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const QUESTIONS = [
  {
    id: 'traveler_type',
    question: 'What kind of traveler are you?',
    options: [
      { value: 'beach', label: '🏖️ Beach & relaxation', desc: 'Sun, sand, and zero plans' },
      { value: 'adventure', label: '🧗 Adventure & outdoors', desc: 'Hikes, excursions, and experiences' },
      { value: 'culture', label: '🏛️ Culture & city explorer', desc: 'Museums, food, and local life' },
      { value: 'luxury', label: '💎 Luxury & indulgence', desc: 'Fine dining, spas, and 5-star stays' },
    ],
  },
  {
    id: 'travel_frequency',
    question: 'How often do you travel per year?',
    options: [
      { value: '1', label: '✈️ Once a year', desc: 'One big trip annually' },
      { value: '2-3', label: '✈️✈️ 2–3 times', desc: 'A few getaways a year' },
      { value: '4+', label: '🌍 4+ times', desc: 'Frequent traveler' },
      { value: 'planning', label: '📅 Planning my first trip', desc: 'Just getting started' },
    ],
  },
  {
    id: 'group_type',
    question: 'Who do you usually travel with?',
    options: [
      { value: 'solo', label: '🧍 Solo', desc: 'Just me' },
      { value: 'couple', label: '👫 Partner / couple', desc: 'Romantic getaways' },
      { value: 'family', label: '👨‍👩‍👧‍👦 Family', desc: 'Kids in tow' },
      { value: 'friends', label: '👯 Friends / group', desc: 'Group trips' },
    ],
  },
  {
    id: 'budget_range',
    question: 'What\'s your typical trip budget?',
    options: [
      { value: 'under-1k', label: '💵 Under $1,000', desc: 'Budget-conscious' },
      { value: '1k-3k', label: '💵💵 $1,000–$3,000', desc: 'Mid-range' },
      { value: '3k-7k', label: '💵💵💵 $3,000–$7,000', desc: 'Comfortable spend' },
      { value: '7k+', label: '💎 $7,000+', desc: 'No limits on a great trip' },
    ],
  },
  {
    id: 'top_destination',
    question: 'Where\'s your dream next trip?',
    options: [
      { value: 'cancun', label: '🌴 Cancún / Caribbean', desc: 'Beach paradise' },
      { value: 'europe', label: '🗼 Europe', desc: 'Paris, Rome, London...' },
      { value: 'vegas', label: '🎰 Las Vegas', desc: 'Entertainment capital' },
      { value: 'other', label: '🌍 Somewhere else', desc: 'I have a specific destination' },
    ],
  },
]

const RESULTS: Record<string, { title: string; desc: string; cta: string; href: string }> = {
  beach: { title: 'The Beach Escape Seeker', desc: 'You live for turquoise water and all-inclusive bliss. Members like you save the most on Cancún, Caribbean, and Bahamas packages — often 50–60% below retail.', cta: 'See Cancún Member Rates →', href: '/destinations/cancun' },
  adventure: { title: 'The Experience Hunter', desc: 'You want stories, not souvenirs. Our adventure packages include stays near national parks, excursion bundles, and hidden-gem destinations at wholesale pricing.', cta: 'Get My Adventure Quote →', href: '/quote' },
  culture: { title: 'The City Explorer', desc: 'You want to live like a local in the world\'s great cities. Members access boutique hotels in Paris, Rome, and NYC at rates that make week-long stays actually affordable.', cta: 'See Paris Member Rates →', href: '/destinations/paris' },
  luxury: { title: 'The Luxury Traveler', desc: 'You know what good looks like — and you\'d rather pay wholesale for it. Members access 5-star properties at 4-star prices. The savings on one luxury trip covers the membership many times over.', cta: 'Get My Luxury Quote →', href: '/quote' },
}

export default function QuizPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ first_name: '', email: '', phone: '', smsConsent: false })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const currentQ = QUESTIONS[step]
  const isLastQuestion = step === QUESTIONS.length - 1

  const handleAnswer = (value: string) => {
    const newAnswers = { ...answers, [currentQ.id]: value }
    setAnswers(newAnswers)
    if (isLastQuestion) {
      const travelerType = newAnswers.traveler_type || 'beach'
      setResult(travelerType)
    } else {
      setStep(s => s + 1)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/webhooks/lead-created', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vortex-Form-Token': process.env.NEXT_PUBLIC_FORM_TOKEN ?? '',
        },
        body: JSON.stringify({
          ...form,
          source: 'quiz',
          utm_medium: 'quiz',
          custom_fields: answers,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        if (data.error === 'Email already registered') {
          router.push('/thank-you?from=lead')
          return
        }
      }
      const dest = answers.top_destination
      if (dest && dest !== 'other') {
        router.push(`/destinations/${dest}`)
      } else {
        router.push('/thank-you?from=lead')
      }
    } finally {
      setLoading(false)
    }
  }

  const resultData = result ? RESULTS[result] : null
  const progress = ((step + 1) / QUESTIONS.length) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1A2E] to-[#0F3460] flex flex-col">
      <nav className="px-6 py-4">
        <a href="/" className="text-2xl font-black text-white">Vortex<span className="text-[#FF6B35]">Trips</span></a>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">

          {!result ? (
            <>
              {/* Progress bar */}
              <div className="mb-8">
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>Question {step + 1} of {QUESTIONS.length}</span>
                  <span>{Math.round(progress)}% complete</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full">
                  <div className="h-full bg-[#FF6B35] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <h2 className="text-2xl font-black text-white mb-8">{currentQ.question}</h2>

              <div className="space-y-3">
                {currentQ.options.map(opt => (
                  <button key={opt.value} onClick={() => handleAnswer(opt.value)}
                    className="w-full text-left bg-white/10 hover:bg-white/20 border border-white/20 hover:border-[#FF6B35] rounded-xl p-4 transition-all group">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{opt.label.split(' ')[0]}</span>
                      <div>
                        <p className="text-white font-semibold">{opt.label.substring(opt.label.indexOf(' ') + 1)}</p>
                        <p className="text-gray-400 text-sm">{opt.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div>
              <div className="text-center mb-8">
                <div className="text-5xl mb-4">🎯</div>
                <h2 className="text-3xl font-black text-white mb-3">{resultData?.title}</h2>
                <p className="text-gray-300 leading-relaxed">{resultData?.desc}</p>
              </div>

              <div className="bg-white rounded-2xl p-8">
                <h3 className="text-xl font-bold text-[#1A1A2E] mb-1">Get Your Personalized Savings</h3>
                <p className="text-gray-500 text-sm mb-5">We'll match deals to your traveler profile.</p>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input type="text" placeholder="First Name" required value={form.first_name}
                    onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
                  <input type="email" placeholder="Email Address" required value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
                  <input type="tel" placeholder="Phone Number" required value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]" />
                  <p className="text-xs text-gray-400">Msg &amp; data rates may apply. Reply STOP to cancel.</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" required checked={form.smsConsent}
                      onChange={e => setForm(f => ({ ...f, smsConsent: e.target.checked }))}
                      className="mt-0.5 accent-[#FF6B35]" />
                    <span className="text-xs text-gray-500">I consent to SMS from VortexTrips. <a href="/privacy" className="text-[#FF6B35] underline">Privacy</a></span>
                  </label>
                  <button type="submit" disabled={loading}
                    className="w-full bg-[#FF6B35] hover:bg-[#e55a25] text-white font-bold py-4 rounded-lg text-lg transition-all disabled:opacity-60">
                    {loading ? 'Finding your deals...' : (resultData?.cta ?? 'See My Deals →')}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
