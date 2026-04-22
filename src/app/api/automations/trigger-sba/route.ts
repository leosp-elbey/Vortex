import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contact_id } = await request.json()
  if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: contact, error: contactErr } = await admin
    .from('contacts')
    .select('id, first_name, email, phone')
    .eq('id', contact_id)
    .single()

  if (contactErr || !contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  // Remove any existing pending SBA sequences
  await admin.from('sequence_queue')
    .delete()
    .eq('contact_id', contact_id)
    .eq('sequence_name', 'sba-onboarding')
    .eq('status', 'pending')

  // Send Day 0 SMS + email immediately
  if (contact.phone) {
    try {
      await sendSMS(contact.phone, SMS_TEMPLATES.sbaDay0(contact.first_name))
    } catch (e) { console.error('SBA Day0 SMS error:', e) }
  }

  if (contact.email) {
    try {
      const { subject, html } = EMAIL_TEMPLATES.sbaDay1Email(contact.first_name)
      await sendEmail({ to: contact.email, subject, html })
    } catch (e) { console.error('SBA Day1 email error:', e) }
  }

  // Queue remaining sequence
  await admin.from('sequence_queue').insert([
    { contact_id, sequence_name: 'sba-onboarding', step: 1, channel: 'sms', template_key: 'sbaDay0', scheduled_at: new Date().toISOString(), status: 'sent', sent_at: new Date().toISOString() },
    { contact_id, sequence_name: 'sba-onboarding', step: 2, channel: 'email', template_key: 'sbaDay1Email', scheduled_at: new Date().toISOString(), status: 'sent', sent_at: new Date().toISOString() },
    { contact_id, sequence_name: 'sba-onboarding', step: 3, channel: 'email', template_key: 'sbaDay3Email', scheduled_at: daysFromNow(3) },
    { contact_id, sequence_name: 'sba-onboarding', step: 4, channel: 'sms', template_key: 'sbaDay7', scheduled_at: daysFromNow(7) },
    { contact_id, sequence_name: 'sba-onboarding', step: 5, channel: 'email', template_key: 'sbaDay7Email', scheduled_at: hoursFromNow(7 * 24 + 2) },
  ])

  await admin.from('contacts').update({
    membership_status: 'active',
    status: 'member',
    lead_score: 100,
    last_ai_action: 'SBA onboarding triggered',
  }).eq('id', contact_id)

  await admin.from('opportunities')
    .update({ stage: 'member' })
    .eq('contact_id', contact_id)
    .eq('pipeline', 'main')

  return NextResponse.json({ success: true })
}
