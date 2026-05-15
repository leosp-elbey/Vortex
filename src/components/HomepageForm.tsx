'use client'

// Phase 14AT — Homepage opt-in form.
//
// Replaces the inline LeadForm component that used to live in src/app/page.tsx.
// Two instances are rendered on the homepage (hero + final CTA section); each
// holds its own state. Same `formId` prop pattern as the old inline component.
//
// Form fields (all 4 required to submit):
//   - first_name
//   - email
//   - phone (always required — the old "required only if SMS consent checked"
//           pattern is gone; phone is the primary contact channel)
//   - interest (dropdown: save / earn / both)
//
// SMS consent (two separate UNCHECKED checkboxes per Twilio A2P 10DLC rules):
//   - sms_transactional_consent (booking confirmations, account updates)
//   - sms_marketing_consent     (travel deals, member rates, promotions)
//
// Neither consent is required to submit. Form posts to
// /api/webhooks/lead-created with the X-Vortex-Form-Token header; on success
// the user is sent to /thank-you (which auto-redirects to /free after 3s).

import { useId, useState } from 'react'

interface Props {
  /** When passed, used as the form element's HTML id. Otherwise React generates one. */
  formId?: string
}

interface FormState {
  first_name: string
  email: string
  phone: string
  interest: '' | 'save' | 'earn' | 'both'
  sms_transactional_consent: boolean
  sms_marketing_consent: boolean
}

const INITIAL_STATE: FormState = {
  first_name: '',
  email: '',
  phone: '',
  interest: '',
  sms_transactional_consent: false,
  sms_marketing_consent: false,
}

/** Loose phone validity check — accepts anything with at least 7 digits after
 *  stripping non-digit characters. Strict E.164 validation would block too many
 *  legitimate user-entered formats (with dashes, parens, +1, etc). */
function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= 7
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function HomepageForm({ formId }: Props) {
  const generatedId = useId()
  const id = formId ?? generatedId

  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    // Client-side validation — all four required fields must be present.
    if (!form.first_name.trim()) { setError('Please enter your first name.'); return }
    if (!form.email.trim() || !isValidEmail(form.email)) { setError('Please enter a valid email address.'); return }
    if (!form.phone.trim() || !isValidPhone(form.phone)) { setError('Please enter a valid phone number.'); return }
    if (!form.interest) { setError('Please tell us what you’re most interested in.'); return }

    setLoading(true)

    try {
      const res = await fetch('/api/webhooks/lead-created', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vortex-Form-Token': process.env.NEXT_PUBLIC_FORM_TOKEN ?? '',
        },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          interest: form.interest,
          sms_transactional_consent: form.sms_transactional_consent,
          sms_marketing_consent: form.sms_marketing_consent,
          source: 'homepage',
        }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        const friendly = data.error === 'Email already registered'
          ? "You're already in our system! Check your inbox or email support@vortextrips.com."
          : data.error || 'Something went wrong. Please try again.'
        throw new Error(friendly)
      }

      // Hard navigation so the /thank-you page auto-redirect kicks in cleanly
      // (vs a soft Next.js navigation that might preserve component state).
      window.location.href = '/thank-you'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-[#FF6B35]'

  return (
    <form onSubmit={handleSubmit} id={id} className="space-y-4" noValidate>
      <input
        type="text"
        placeholder="First Name"
        required
        autoComplete="given-name"
        value={form.first_name}
        onChange={e => update('first_name', e.target.value)}
        className={inputClass}
        aria-label="First Name"
      />

      <input
        type="email"
        placeholder="Email Address"
        required
        autoComplete="email"
        value={form.email}
        onChange={e => update('email', e.target.value)}
        className={inputClass}
        aria-label="Email Address"
      />

      <input
        type="tel"
        placeholder="Mobile Number — For your free savings call"
        required
        autoComplete="tel"
        value={form.phone}
        onChange={e => update('phone', e.target.value)}
        className={inputClass}
        aria-label="Mobile Number for your free savings call"
      />

      <select
        required
        value={form.interest}
        onChange={e => update('interest', e.target.value as FormState['interest'])}
        className={`${inputClass} appearance-none bg-white pr-10`}
        aria-label="What are you most interested in?"
      >
        <option value="" disabled>What are you most interested in?</option>
        <option value="save">Save on Travel</option>
        <option value="earn">Earn Extra Income</option>
        <option value="both">Both</option>
      </select>

      {/* A2P compliance disclosure — must appear ABOVE the consent checkboxes. */}
      <p className="text-xs text-gray-500 leading-relaxed">
        Msg &amp; data rates may apply. Reply HELP for help, STOP to cancel. Message frequency varies.
      </p>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.sms_transactional_consent}
          onChange={e => update('sms_transactional_consent', e.target.checked)}
          className="mt-0.5 flex-shrink-0 accent-[#FF6B35]"
        />
        <span className="text-xs text-gray-600 leading-relaxed">
          I agree to receive transactional SMS from VortexTrips (booking confirmations, account updates, support).
        </span>
      </label>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.sms_marketing_consent}
          onChange={e => update('sms_marketing_consent', e.target.checked)}
          className="mt-0.5 flex-shrink-0 accent-[#FF6B35]"
        />
        <span className="text-xs text-gray-600 leading-relaxed">
          I agree to receive marketing SMS from VortexTrips (travel deals, member rates, promotions).
        </span>
      </label>

      {error && (
        <p role="alert" className="text-red-500 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#FF6B35] hover:bg-[#e55a25] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg text-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span>Getting you in…</span>
          </>
        ) : (
          <span>Get Free Access Now →</span>
        )}
      </button>

      <p className="text-xs text-center text-gray-500 leading-relaxed">
        Start free today — upgrade anytime to unlock wholesale pricing forever.
      </p>

      <p className="text-xs text-center text-gray-400">
        By submitting, you agree to our{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#FF6B35] underline">Privacy Policy</a>
        {' '}and{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#FF6B35] underline">Terms</a>.
      </p>
    </form>
  )
}
