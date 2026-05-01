'use client'

import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY = 'vt_exit_intent_dismissed'
const DISMISS_HOURS = 24

interface ExitIntentProps {
  /** What page is this firing on — used in the lead source tag */
  source?: string
  /** Headline shown in the modal */
  headline?: string
  /** Subheadline shown in the modal */
  subheadline?: string
}

export default function ExitIntent({
  source = 'exit-intent',
  headline = 'Wait — before you go',
  subheadline = 'Drop your email and we&apos;ll send you a 60-second video that shows exactly how members save thousands. No credit card. No spam.',
}: ExitIntentProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const armed = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Only show once per DISMISS_HOURS
    const dismissedAt = window.localStorage.getItem(STORAGE_KEY)
    if (dismissedAt) {
      const hoursSince = (Date.now() - parseInt(dismissedAt, 10)) / 1000 / 3600
      if (hoursSince < DISMISS_HOURS) return
    }

    // Wait 8 seconds before arming so we don't catch quick scrollers
    const armTimer = setTimeout(() => { armed.current = true }, 8000)

    const handleMouseOut = (e: MouseEvent) => {
      if (!armed.current) return
      // Triggered when mouse moves toward top of viewport (about to close tab)
      if (e.clientY <= 5 && !e.relatedTarget) {
        setOpen(true)
        armed.current = false
      }
    }

    document.addEventListener('mouseout', handleMouseOut)
    return () => {
      clearTimeout(armTimer)
      document.removeEventListener('mouseout', handleMouseOut)
    }
  }, [])

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, Date.now().toString())
    }
    setOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !firstName) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/webhooks/lead-created', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vortex-Form-Token': process.env.NEXT_PUBLIC_FORM_TOKEN ?? '',
        },
        body: JSON.stringify({
          first_name: firstName,
          email,
          source,
          status: 'lead',
          sms_consent: false,
        }),
      })
      if (!res.ok && res.status !== 409) throw new Error('Server error')
      setSubmitted(true)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, Date.now().toString())
      }
    } catch {
      setError('Something went wrong — try again or close this and contact us directly.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={dismiss}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg flex items-center justify-center"
          aria-label="Close"
        >
          ×
        </button>

        {!submitted ? (
          <>
            <div className="text-4xl mb-3">🎁</div>
            <h2 className="text-2xl font-black text-[#1A1A2E] mb-2">{headline}</h2>
            <p className="text-gray-500 text-sm mb-6">{subheadline}</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="First name"
                required
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              />
              <input
                type="email"
                placeholder="Email address"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#FF6B35] hover:bg-[#e55a25] text-white font-bold py-3 rounded-lg transition disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send Me the Video'}
              </button>
              <p className="text-xs text-gray-400 text-center">No credit card. No spam. Unsubscribe any time.</p>
            </form>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">✅</div>
            <h3 className="text-xl font-black text-[#1A1A2E] mb-2">Check your inbox, {firstName}</h3>
            <p className="text-gray-500 mb-6">Your savings video is on the way. We&apos;ll also drop a few member-only deals in over the coming days.</p>
            <button
              onClick={dismiss}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-6 py-2 rounded-lg"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
