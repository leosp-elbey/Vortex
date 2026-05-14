// Phase 14AB hardening — every Supabase call goes through `bounded()` with
// a 2.5s per-call timeout. Webhook senders (GoHighLevel, etc.) expect fast
// responses and will retry / blacklist a slow endpoint. The CRITICAL path
// (the contacts insert that produces contact.id) returns 503 on timeout
// rather than hanging; bookkeeping calls degrade silently.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triggerCall } from '@/lib/bland'
import { sendSMS, SMS_TEMPLATES } from '@/lib/twilio'
import { sendEmail } from '@/lib/resend'
import { EMAIL_TEMPLATES } from '@/lib/email-templates'
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit'
import { checkFormToken } from '@/lib/webhook-auth'
import { bounded, WEBHOOK_BOUND_MS } from '@/lib/bounded-wait'
import { isSuppressedContactStatus } from '@/lib/sequence-suppression'

const LOG_PREFIX = '[lead-created]'

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function daysFromNow(days: number): string {
  return hoursFromNow(days * 24)
}

export async function POST(request: NextRequest) {
  // Anti-spam: require the public form token (deters basic bots, not motivated attackers)
  if (!checkFormToken(request.headers)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 401 })
  }

  // Per-IP rate limit: 10 submissions / minute / IP
  const ip = clientIpFrom(request.headers)
  const rl = checkRateLimit(`lead-created:${ip}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const {
      first_name, last_name, email, phone, source = 'landing-page',
      utm_source, utm_medium, utm_campaign,
      status = 'lead', sms_consent = false, enroll_sba = false,
    } = body

    if (!first_name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // CRITICAL — we need contact.id to proceed. If Supabase hangs here,
    // return 503 fast so the webhook caller (GoHighLevel, etc.) can retry
    // rather than waiting on a hung connection.
    const insertResult = await bounded(
      supabase
        .from('contacts')
        .insert({
          first_name,
          last_name: last_name || null,
          email,
          phone: phone || null,
          source,
          status,
          lead_score: 20,
          custom_fields: {
            utm_source, utm_medium, utm_campaign,
            ...(sms_consent ? { sms_consent: 'true' } : {}),
          },
        })
        .select()
        .single(),
      WEBHOOK_BOUND_MS,
      'contacts insert (critical)',
      LOG_PREFIX,
    )
    if (!insertResult) {
      // Either timed out OR Supabase rejected. Either way, fast 503 so the
      // upstream webhook queue can retry. (bounded() already logged the cause.)
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 })
    }
    const { data: contact, error: contactError } = insertResult

    if (contactError) {
      if (contactError.code === '23505') {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
      }
      return NextResponse.json({ error: contactError.message || 'Database error saving contact' }, { status: 500 })
    }

    // Bookkeeping — opportunities insert is non-critical. Log a warning
    // on failure but keep going; the lead is already captured.
    await bounded(
      supabase.from('opportunities').insert({
        contact_id: contact.id,
        name: `${first_name} — ${enroll_sba ? 'SBA' : 'Main'} Pipeline`,
        pipeline: enroll_sba ? 'sba' : 'main',
        stage: 'new-lead',
      }),
      WEBHOOK_BOUND_MS,
      'opportunities insert',
      LOG_PREFIX,
    )

    // Day 0 — SMS immediately. Bookkeeping bound for the sequence_queue
    // insert; the SMS send itself has its own internal client.
    if (phone) {
      try {
        await sendSMS(phone, SMS_TEMPLATES.leadDay0(first_name))
        await bounded(
          supabase.from('sequence_queue').insert({
            contact_id: contact.id, sequence_name: 'lead-nurture', step: 1,
            channel: 'sms', template_key: 'leadDay0',
            scheduled_at: new Date().toISOString(), status: 'sent', sent_at: new Date().toISOString(),
          }),
          WEBHOOK_BOUND_MS,
          'sms day0 sequence_queue insert',
          LOG_PREFIX,
        )
      } catch (smsErr) {
        console.error('Day 0 SMS error:', smsErr)
      }
    }

    // Day 0 — send welcome email immediately (not via queue — cron runs once daily)
    try {
      const { subject, html } = EMAIL_TEMPLATES.leadDay1(first_name)
      await sendEmail({ to: email, subject, html })
      await bounded(
        supabase.from('sequence_queue').insert({
          contact_id: contact.id, sequence_name: 'lead-nurture', step: 2,
          channel: 'email', template_key: 'leadDay1',
          scheduled_at: new Date().toISOString(), status: 'sent', sent_at: new Date().toISOString(),
        }),
        WEBHOOK_BOUND_MS,
        'email day1 sequence_queue insert',
        LOG_PREFIX,
      )
      await bounded(
        supabase.from('ai_actions_log').insert({
          contact_id: contact.id, action_type: 'onboarding-email', service: 'resend',
          status: 'success', request_payload: { template_key: 'leadDay1', sequence: 'lead-nurture', step: 2 } as Record<string, unknown>,
        }),
        WEBHOOK_BOUND_MS,
        'email day1 ai_actions_log insert',
        LOG_PREFIX,
      )
    } catch (emailErr) {
      console.error('Day 0 welcome email error:', emailErr)
    }

    // Phase 14AQ — queue-time suppression. The contact was just inserted
    // above with status='lead' so this guard is effectively defensive
    // (will only fire if the contact's status was set to a suppressed
    // value during the same request — e.g., upstream caller passed
    // status: 'churned' to re-enroll a known-bad lead). The cron at
    // /api/cron/send-sequences also checks at send-time; this is the
    // companion check at queue-time.
    const nurtureSuppressed = isSuppressedContactStatus(contact.status)

    // Remaining nurture sequence (Day 1 welcome email sent directly above)
    if (nurtureSuppressed) {
      console.warn('[lead-created] queue-time suppression — skipping nurture sequence', { contact_id: contact.id, status: contact.status })
    } else {
      await bounded(
        supabase.from('sequence_queue').insert([
          // Day 2 — SMS follow-up
          { contact_id: contact.id, sequence_name: 'lead-nurture', step: 3, channel: 'sms', template_key: 'leadDay2', scheduled_at: daysFromNow(2) },
          // Day 3 — email social proof
          { contact_id: contact.id, sequence_name: 'lead-nurture', step: 4, channel: 'email', template_key: 'leadDay3', scheduled_at: daysFromNow(3) },
          // Day 5 — email savings calculator
          { contact_id: contact.id, sequence_name: 'lead-nurture', step: 5, channel: 'email', template_key: 'leadDay5', scheduled_at: daysFromNow(5) },
          // Day 7 — SMS + email urgency
          { contact_id: contact.id, sequence_name: 'lead-nurture', step: 6, channel: 'sms', template_key: 'leadDay7', scheduled_at: daysFromNow(7) },
          { contact_id: contact.id, sequence_name: 'lead-nurture', step: 7, channel: 'email', template_key: 'leadDay7', scheduled_at: hoursFromNow(7 * 24 + 4) },
          // Day 10 — email FAQ
          { contact_id: contact.id, sequence_name: 'lead-nurture', step: 8, channel: 'email', template_key: 'leadDay10', scheduled_at: daysFromNow(10) },
          // Day 12 — SMS last chance
          { contact_id: contact.id, sequence_name: 'lead-nurture', step: 9, channel: 'sms', template_key: 'leadDay12', scheduled_at: daysFromNow(12) },
          // Day 14 — email breakup
          { contact_id: contact.id, sequence_name: 'lead-nurture', step: 10, channel: 'email', template_key: 'leadDay14', scheduled_at: daysFromNow(14) },
        ]),
        WEBHOOK_BOUND_MS,
        'nurture sequence_queue batch insert',
        LOG_PREFIX,
      )
    }

    // SBA sequence — send Day 1 welcome email immediately, queue the rest.
    // Phase 14AQ — same queue-time suppression guard as the nurture branch.
    if (enroll_sba && !nurtureSuppressed) {
      try {
        const { subject, html } = EMAIL_TEMPLATES.sbaDay1Email(first_name)
        await sendEmail({ to: email, subject, html })
        await bounded(
          supabase.from('ai_actions_log').insert({
            contact_id: contact.id, action_type: 'onboarding-email', service: 'resend',
            status: 'success', request_payload: { template_key: 'sbaDay1Email', sequence: 'sba-onboarding', step: 1 } as Record<string, unknown>,
          }),
          WEBHOOK_BOUND_MS,
          'sba day1 ai_actions_log insert',
          LOG_PREFIX,
        )
      } catch (sbaEmailErr) {
        console.error('SBA Day 1 email error:', sbaEmailErr)
      }

      await bounded(
        supabase.from('sequence_queue').insert([
          { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 1, channel: 'email', template_key: 'sbaDay1Email', scheduled_at: new Date().toISOString(), status: 'sent', sent_at: new Date().toISOString() },
          { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 2, channel: 'email', template_key: 'sbaDay3Email', scheduled_at: daysFromNow(3) },
          { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 3, channel: 'email', template_key: 'sbaDay7Email', scheduled_at: daysFromNow(7) },
          ...(phone && sms_consent ? [
            { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 4, channel: 'sms', template_key: 'sbaDay0', scheduled_at: new Date().toISOString() },
            { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 5, channel: 'sms', template_key: 'sbaDay7', scheduled_at: daysFromNow(7) },
          ] : []),
        ]),
        WEBHOOK_BOUND_MS,
        'sba sequence_queue batch insert',
        LOG_PREFIX,
      )
      await bounded(
        supabase.from('contacts').update({ last_ai_action: 'SBA application received — welcome email sent' }).eq('id', contact.id),
        WEBHOOK_BOUND_MS,
        'contacts update (sba note)',
        LOG_PREFIX,
      )
    }

    // Bland.ai voice call (only if phone provided)
    try {
      if (!phone) throw new Error('No phone — skipping call')
      await triggerCall(phone, first_name, email, undefined, contact.id)
      await bounded(
        supabase.from('contacts')
          .update({ tags: ['bland-call-sent'], last_ai_action: 'Intro call triggered' })
          .eq('id', contact.id),
        WEBHOOK_BOUND_MS,
        'contacts update (bland-call-sent)',
        LOG_PREFIX,
      )
    } catch (callError) {
      console.error('Bland call error:', callError)
      await bounded(
        supabase.from('contacts').update({ tags: ['call-failed'] }).eq('id', contact.id),
        WEBHOOK_BOUND_MS,
        'contacts update (call-failed)',
        LOG_PREFIX,
      )
    }

    return NextResponse.json({ success: true, contactId: contact.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    console.error('lead-created error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
