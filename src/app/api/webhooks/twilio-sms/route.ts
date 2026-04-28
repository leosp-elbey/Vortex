import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTwilioSignature } from '@/lib/webhook-auth'

// Twilio sends form-encoded POST when an inbound SMS arrives
export async function POST(request: NextRequest) {
  const formData = await request.formData()

  // Verify Twilio HMAC-SHA1 signature
  const signature = request.headers.get('x-twilio-signature')
  const url = request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https')
    ? request.url
    : request.url.replace(/^http:/, 'https:')
  const params: Record<string, string> = {}
  formData.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value
  })
  if (!verifyTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const from = (formData.get('From') as string)?.trim()
  const body = (formData.get('Body') as string)?.trim().toUpperCase()

  const admin = createAdminClient()

  if (from) {
    const normalized = from.replace(/\D/g, '')

    // Find contact by phone (strip non-digits for flexible match)
    const { data: contacts } = await admin
      .from('contacts')
      .select('id, tags')
      .or(`phone.eq.${from},phone.eq.+${normalized}`)
      .limit(1)

    const contact = contacts?.[0]

    if (contact) {
      const tags: string[] = contact.tags ?? []

      if (body === 'STOP' || body === 'UNSUBSCRIBE' || body === 'CANCEL' || body === 'QUIT') {
        const updated = Array.from(new Set([...tags, 'sms-optout']))
        await admin.from('contacts').update({ tags: updated, last_ai_action: 'SMS opt-out via STOP reply' }).eq('id', contact.id)

        // Cancel all pending SMS in sequence_queue for this contact
        await admin.from('sequence_queue')
          .update({ status: 'skipped' })
          .eq('contact_id', contact.id)
          .eq('channel', 'sms')
          .eq('status', 'pending')

      } else if (body === 'START' || body === 'UNSTOP' || body === 'YES') {
        const updated = tags.filter(t => t !== 'sms-optout')
        await admin.from('contacts').update({ tags: updated, last_ai_action: 'SMS re-opted in' }).eq('id', contact.id)

      } else if (body === 'HELP') {
        // Twilio auto-handles HELP response per carrier rules — just log it
        await admin.from('contacts').update({ last_ai_action: 'SMS HELP reply received' }).eq('id', contact.id)
      }

      // Log the inbound message
      await admin.from('ai_actions_log').insert({
        contact_id: contact.id,
        action_type: 'sms-inbound',
        notes: `Inbound SMS: "${formData.get('Body')}"`,
      })
    }
  }

  // Return empty TwiML — no auto-reply (Twilio handles STOP/HELP carrier responses)
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
