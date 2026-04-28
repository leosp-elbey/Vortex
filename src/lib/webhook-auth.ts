// Webhook authentication helpers: form-token check, Twilio signature, Bland bearer.

import crypto from 'crypto'

export function checkFormToken(headers: Headers): boolean {
  const expected = process.env.NEXT_PUBLIC_FORM_TOKEN
  if (!expected) return true // not configured — fail-open during transition; tighten in prod
  const provided = headers.get('x-vortex-form-token')
  return provided === expected
}

export function checkBlandWebhook(headers: Headers): boolean {
  const expected = process.env.BLAND_WEBHOOK_SECRET
  if (!expected) return true // not configured — fail-open during transition
  const auth = headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const provided = auth.slice('Bearer '.length).trim()
  if (provided.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

// Twilio signature verification per their docs.
// Concatenates URL + sorted form params (key+value), HMAC-SHA1 with auth token, base64.
export function verifyTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return true // not configured — fail-open
  if (!signature) return false

  let data = url
  for (const key of Object.keys(params).sort()) {
    data += key + (params[key] ?? '')
  }

  const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64')

  if (signature.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}
