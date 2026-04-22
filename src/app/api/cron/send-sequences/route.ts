import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMS, SMS_TEMPLATES } from '@/lib/twilio'
import { sendEmail } from '@/lib/resend'
import { EMAIL_TEMPLATES, type EmailTemplateKey } from '@/lib/email-templates'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: items, error } = await supabase
    .from('sequence_queue')
    .select('*, contacts(first_name, email, phone, status, tags)')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length === 0) return NextResponse.json({ success: true, processed: 0 })

  let sent = 0, failed = 0, skipped = 0
  const now = new Date().toISOString()

  for (const item of items) {
    const contact = item.contacts as {
      first_name: string
      email: string
      phone: string | null
      status: string
      tags: string[]
    } | null

    if (!contact || contact.status === 'churned') {
      await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: now }).eq('id', item.id)
      skipped++
      continue
    }

    // Check if contact opted out of SMS
    const smsOptedOut = contact.tags?.includes('sms-optout')

    try {
      if (item.channel === 'sms') {
        if (!contact.phone || smsOptedOut) {
          await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: now }).eq('id', item.id)
          skipped++
          continue
        }

        const templateFn = SMS_TEMPLATES[item.template_key as keyof typeof SMS_TEMPLATES]
        if (!templateFn) {
          await supabase.from('sequence_queue').update({ status: 'skipped' }).eq('id', item.id)
          skipped++
          continue
        }

        await sendSMS(contact.phone, templateFn(contact.first_name))
        await supabase.from('ai_actions_log').insert({
          contact_id: item.contact_id,
          action_type: 'sms',
          service: 'twilio',
          status: 'success',
          request_payload: { template_key: item.template_key, sequence: item.sequence_name, step: item.step } as Record<string, unknown>,
        })

      } else if (item.channel === 'email') {
        if (!contact.email) {
          await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: now }).eq('id', item.id)
          skipped++
          continue
        }

        const templateFn = EMAIL_TEMPLATES[item.template_key as EmailTemplateKey]
        if (!templateFn) {
          await supabase.from('sequence_queue').update({ status: 'skipped' }).eq('id', item.id)
          skipped++
          continue
        }

        const { subject, html } = templateFn(contact.first_name)
        await sendEmail({ to: contact.email, subject, html })
        await supabase.from('ai_actions_log').insert({
          contact_id: item.contact_id,
          action_type: 'onboarding-email',
          service: 'resend',
          status: 'success',
          request_payload: { template_key: item.template_key, sequence: item.sequence_name, step: item.step } as Record<string, unknown>,
        })
      }

      await supabase.from('sequence_queue').update({ status: 'sent', sent_at: now }).eq('id', item.id)
      await supabase.from('contacts').update({ last_ai_action: `${item.channel.toUpperCase()} sent: ${item.template_key}` }).eq('id', item.contact_id)
      sent++

    } catch (err) {
      console.error(`Sequence send failed [${item.channel}/${item.template_key}]:`, err)
      await supabase.from('sequence_queue').update({ status: 'failed' }).eq('id', item.id)
      failed++
    }
  }

  // Hot-lead branching: find high-intent leads and send direct outreach
  const { data: hotLeads } = await supabase
    .from('contacts')
    .select('id, first_name, email, phone, tags, lead_score')
    .contains('tags', ['intent:hot'])
    .not('tags', 'cs', '["hot-lead-contacted"]')
    .eq('status', 'lead')
    .gte('lead_score', 80)
    .limit(20)

  let hotContacted = 0
  for (const contact of hotLeads ?? []) {
    await supabase.from('sequence_queue')
      .update({ status: 'skipped' })
      .eq('contact_id', contact.id)
      .eq('sequence_name', 'lead-nurture')
      .eq('status', 'pending')

    if (contact.phone) {
      try {
        await sendSMS(contact.phone, `${contact.first_name}, you've been checking out VortexTrips — I'd love to get you set up personally. Reply back and I'll walk you through your first booking. Reply STOP to opt out.`)
      } catch (e) { console.error('Hot lead SMS error:', e) }
    }

    if (contact.email) {
      try {
        await sendEmail({
          to: contact.email,
          subject: `${contact.first_name} — let's get you booked`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#1A1A2E"><h2>Hey ${contact.first_name} — I noticed you've been looking.</h2><p>You've visited VortexTrips a few times. I'd like to personally walk you through your first booking — no pressure, just a real look at what you'd save.</p><div style="text-align:center;margin:28px 0"><a href="${process.env.NEXT_PUBLIC_APP_URL}/quote" style="background:#FF6B35;color:white;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;display:inline-block">Get My Personal Quote →</a></div><p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p></div>`,
        })
      } catch (e) { console.error('Hot lead email error:', e) }
    }

    const updatedTags = [...(contact.tags ?? []), 'hot-lead-contacted']
    await supabase.from('contacts').update({ tags: updatedTags, last_ai_action: 'Hot-lead direct outreach sent' }).eq('id', contact.id)
    hotContacted++
  }

  return NextResponse.json({ success: true, processed: items.length, sent, failed, skipped, hotContacted })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
