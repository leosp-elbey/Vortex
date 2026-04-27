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

  return NextResponse.json({ success: true, processed: items.length, sent, failed, skipped })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
