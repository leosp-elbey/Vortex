// Resend bounce/complaint webhook handler.
//
// POST /api/webhooks/resend
//
// Resend signs webhooks with svix. We verify the signature over the RAW
// request body using the svix-id / svix-timestamp / svix-signature headers
// against RESEND_WEBHOOK_SECRET. No other auth is required.
//
// Handled events:
//   email.bounced    → contacts.status = 'bounced'      (suppresses future sends)
//   email.complained → contacts.status = 'unsubscribed' (suppresses future sends)
//   all other types  → 200, ignored
//
// On a handled event we also cancel that contact's outstanding queue rows and
// log the suppression to ai_actions_log. Contact-not-found returns 200 so
// Resend does not retry (it retries on any non-2xx).

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Resend's webhook envelope. `data` carries the email object; `to` is the
// recipient list and `email_id` is Resend's id for the message.
interface ResendWebhookEvent {
  type: string
  created_at?: string
  data?: {
    email_id?: string
    to?: string[]
    [key: string]: unknown
  }
}

// Map the inbound event type → the contact status + log action_type to apply.
const EVENT_HANDLERS: Record<string, { contactStatus: string; actionType: string }> = {
  'email.bounced': { contactStatus: 'bounced', actionType: 'email_bounce_suppressed' },
  'email.complained': { contactStatus: 'unsubscribed', actionType: 'email_complaint_suppressed' },
}

export async function POST(request: NextRequest) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    console.error('[webhooks/resend] RESEND_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 })
  }

  // svix verifies against the exact raw bytes — read the body as text, never
  // as parsed JSON, or the signature check will fail.
  const rawBody = await request.text()
  const svixHeaders = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }

  let event: ResendWebhookEvent
  try {
    const wh = new Webhook(secret)
    event = wh.verify(rawBody, svixHeaders) as ResendWebhookEvent
  } catch (err) {
    console.warn('[webhooks/resend] signature verification failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const handler = EVENT_HANDLERS[event.type]
  if (!handler) {
    // Unhandled event type — acknowledge so Resend stops delivering it.
    return NextResponse.json({ success: true, ignored: event.type }, { status: 200 })
  }

  const recipients = event.data?.to
  const rawEmail = Array.isArray(recipients) ? recipients[0] : undefined
  const email = (rawEmail ?? '').trim()
  if (!email) {
    console.warn('[webhooks/resend] event missing recipient', { type: event.type })
    return NextResponse.json({ success: true, reason: 'no_recipient' }, { status: 200 })
  }

  const resendEmailId = event.data?.email_id ?? null
  const supabase = createAdminClient()

  // Case-insensitive lookup on the trimmed address.
  const { data: contact, error: lookupError } = await supabase
    .from('contacts')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (lookupError) {
    console.error('[webhooks/resend] contact lookup failed', { email, error: lookupError.message })
    // Treat as transient — let Resend retry.
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }

  if (!contact) {
    // No matching contact — ack with 200 so Resend doesn't retry.
    console.log('[webhooks/resend] no contact for recipient', { email, type: event.type })
    return NextResponse.json({ success: true, reason: 'contact_not_found' }, { status: 200 })
  }

  const contactId = contact.id as string

  // 1. Suppress the contact.
  const { error: statusError } = await supabase
    .from('contacts')
    .update({ status: handler.contactStatus })
    .eq('id', contactId)
  if (statusError) {
    console.error('[webhooks/resend] contact status update failed', { contactId, error: statusError.message })
    return NextResponse.json({ error: 'status_update_failed' }, { status: 500 })
  }

  // 2. Cancel all of this contact's outstanding queued sends.
  const { error: queueError } = await supabase
    .from('sequence_queue')
    .update({ status: 'cancelled' })
    .eq('contact_id', contactId)
    .in('status', ['pending'])
  if (queueError) {
    console.error('[webhooks/resend] sequence_queue cancel failed', { contactId, error: queueError.message })
    // Non-fatal: the contact is already suppressed, which blocks future sends.
  }

  // 3. Audit log.
  const { error: logError } = await supabase.from('ai_actions_log').insert({
    contact_id: contactId,
    action_type: handler.actionType,
    service: 'resend',
    status: 'success',
    request_payload: {
      email,
      event_type: event.type,
      resend_email_id: resendEmailId,
    } as Record<string, unknown>,
  })
  if (logError) {
    console.error('[webhooks/resend] ai_actions_log insert failed', { contactId, error: logError.message })
    // Non-fatal — suppression already applied.
  }

  console.log('[webhooks/resend] suppressed contact', {
    contactId,
    email,
    type: event.type,
    new_status: handler.contactStatus,
  })

  return NextResponse.json({
    success: true,
    contact_id: contactId,
    event_type: event.type,
    new_status: handler.contactStatus,
  }, { status: 200 })
}
