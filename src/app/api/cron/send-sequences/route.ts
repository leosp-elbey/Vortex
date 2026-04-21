import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMS, SMS_TEMPLATES } from '@/lib/twilio'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: items, error } = await supabase
    .from('sequence_queue')
    .select('*, contacts(first_name, phone, status)')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const item of items) {
    const contact = item.contacts as { first_name: string; phone: string | null; status: string } | null

    // Skip if contact opted out or has no phone
    if (!contact?.phone || contact.status === 'churned') {
      await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: new Date().toISOString() }).eq('id', item.id)
      skipped++
      continue
    }

    if (item.channel === 'sms') {
      const templateFn = SMS_TEMPLATES[item.template_key as keyof typeof SMS_TEMPLATES]
      if (!templateFn) {
        await supabase.from('sequence_queue').update({ status: 'skipped' }).eq('id', item.id)
        skipped++
        continue
      }

      const body = templateFn(contact.first_name)

      try {
        await sendSMS(contact.phone, body)
        await supabase.from('sequence_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', item.id)
        await supabase.from('contacts').update({ last_ai_action: `SMS sent: ${item.template_key}` }).eq('id', item.contact_id)
        await supabase.from('ai_actions_log').insert({
          contact_id: item.contact_id,
          action_type: 'voice-call',
          service: 'twilio',
          status: 'success',
          request_payload: { template_key: item.template_key, sequence: item.sequence_name, step: item.step } as Record<string, unknown>,
        })
        sent++
      } catch (err) {
        console.error(`SMS send failed for ${item.id}:`, err)
        await supabase.from('sequence_queue').update({ status: 'failed' }).eq('id', item.id)
        failed++
      }
    }
  }

  return NextResponse.json({ success: true, processed: items.length, sent, failed, skipped })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
