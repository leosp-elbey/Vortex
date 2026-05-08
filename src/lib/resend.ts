// Phase 14T — Lazy-init the Resend client.
//
// Pre-14T: `const resend = new Resend(process.env.RESEND_API_KEY)` ran at
// module-eval time. When `vercel env pull` strips RESEND_API_KEY to '' for
// local development, Resend's constructor throws during page-data
// collection, breaking `npm run build` on routes that import this module
// (quote-email, trigger-sba, send-sequences, score-and-branch, partners,
// lead-created webhook). Production was unaffected (Vercel injects the
// real value at deploy time), but the local developer experience suffered.
//
// Phase 14T: instantiate inside `getResend()`, called lazily by sendEmail.
// Module-eval no longer touches `process.env.RESEND_API_KEY`. Builds and
// imports succeed even when the var is empty; the missing-key error only
// surfaces at the moment a route actually tries to send.
//
// The cached `resendClient` ensures we don't re-instantiate on every send.

import { Resend } from 'resend'

let resendClient: Resend | null = null

function getResend(): Resend {
  if (resendClient) return resendClient
  const key = (process.env.RESEND_API_KEY ?? '').trim()
  if (!key) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  resendClient = new Resend(key)
  return resendClient
}

interface SendEmailParams {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail({
  to,
  subject,
  html,
  from = 'VortexTrips Travel Team <bookings@vortextrips.com>',
}: SendEmailParams) {
  const { data, error } = await getResend().emails.send({ from, to, subject, html })

  if (error) throw new Error(error.message)
  return data
}
