import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triggerCall } from '@/lib/bland'
import { sendSMS, SMS_TEMPLATES } from '@/lib/twilio'
import { sendEmail } from '@/lib/resend'
import { EMAIL_TEMPLATES } from '@/lib/email-templates'

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function daysFromNow(days: number): string {
  return hoursFromNow(days * 24)
}

export async function POST(request: NextRequest) {
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

    const { data: contact, error: contactError } = await supabase
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
      .single()

    if (contactError) {
      if (contactError.code === '23505') {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
      }
      return NextResponse.json({ error: contactError.message || 'Database error saving contact' }, { status: 500 })
    }

    await supabase.from('opportunities').insert({
      contact_id: contact.id,
      name: `${first_name} — ${enroll_sba ? 'SBA' : 'Main'} Pipeline`,
      pipeline: enroll_sba ? 'sba' : 'main',
      stage: 'new-lead',
    })

    // Day 0 — SMS immediately
    if (phone) {
      try {
        await sendSMS(phone, SMS_TEMPLATES.leadDay0(first_name))
        await supabase.from('sequence_queue').insert({
          contact_id: contact.id, sequence_name: 'lead-nurture', step: 1,
          channel: 'sms', template_key: 'leadDay0',
          scheduled_at: new Date().toISOString(), status: 'sent', sent_at: new Date().toISOString(),
        })
      } catch (smsErr) {
        console.error('Day 0 SMS error:', smsErr)
      }
    }

    // Day 0 — send welcome email immediately (not via queue — cron runs once daily)
    try {
      const { subject, html } = EMAIL_TEMPLATES.leadDay1(first_name)
      await sendEmail({ to: email, subject, html })
      await supabase.from('sequence_queue').insert({
        contact_id: contact.id, sequence_name: 'lead-nurture', step: 2,
        channel: 'email', template_key: 'leadDay1',
        scheduled_at: new Date().toISOString(), status: 'sent', sent_at: new Date().toISOString(),
      })
      await supabase.from('ai_actions_log').insert({
        contact_id: contact.id, action_type: 'onboarding-email', service: 'resend',
        status: 'success', request_payload: { template_key: 'leadDay1', sequence: 'lead-nurture', step: 2 } as Record<string, unknown>,
      })
    } catch (emailErr) {
      console.error('Day 0 welcome email error:', emailErr)
    }

    // Remaining nurture sequence (Day 1 welcome email sent directly above)
    await supabase.from('sequence_queue').insert([
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
    ])

    // SBA sequence — send Day 1 welcome email immediately, queue the rest
    if (enroll_sba) {
      try {
        const { subject, html } = EMAIL_TEMPLATES.sbaDay1Email(first_name)
        await sendEmail({ to: email, subject, html })
        await supabase.from('ai_actions_log').insert({
          contact_id: contact.id, action_type: 'onboarding-email', service: 'resend',
          status: 'success', request_payload: { template_key: 'sbaDay1Email', sequence: 'sba-onboarding', step: 1 } as Record<string, unknown>,
        })
      } catch (sbaEmailErr) {
        console.error('SBA Day 1 email error:', sbaEmailErr)
      }

      await supabase.from('sequence_queue').insert([
        { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 1, channel: 'email', template_key: 'sbaDay1Email', scheduled_at: new Date().toISOString(), status: 'sent', sent_at: new Date().toISOString() },
        { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 2, channel: 'email', template_key: 'sbaDay3Email', scheduled_at: daysFromNow(3) },
        { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 3, channel: 'email', template_key: 'sbaDay7Email', scheduled_at: daysFromNow(7) },
        ...(phone && sms_consent ? [
          { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 4, channel: 'sms', template_key: 'sbaDay0', scheduled_at: new Date().toISOString() },
          { contact_id: contact.id, sequence_name: 'sba-onboarding', step: 5, channel: 'sms', template_key: 'sbaDay7', scheduled_at: daysFromNow(7) },
        ] : []),
      ])
      await supabase.from('contacts').update({ last_ai_action: 'SBA application received — welcome email sent' }).eq('id', contact.id)
    }

    // Bland.ai voice call (only if phone provided)
    try {
      if (!phone) throw new Error('No phone — skipping call')
      await triggerCall(phone, first_name, email, undefined, contact.id)
      await supabase.from('contacts')
        .update({ tags: ['bland-call-sent'], last_ai_action: 'Intro call triggered' })
        .eq('id', contact.id)
    } catch (callError) {
      console.error('Bland call error:', callError)
      await supabase.from('contacts').update({ tags: ['call-failed'] }).eq('id', contact.id)
    }

    return NextResponse.json({ success: true, contactId: contact.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    console.error('lead-created error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
