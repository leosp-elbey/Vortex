import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
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
    .select('id, first_name, phone')
    .eq('id', contact_id)
    .single()

  if (contactErr || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Remove any existing pending SBA sequences for this contact
  await admin.from('sequence_queue')
    .delete()
    .eq('contact_id', contact_id)
    .eq('sequence_name', 'sba-onboarding')
    .eq('status', 'pending')

  await admin.from('sequence_queue').insert([
    { contact_id, sequence_name: 'sba-onboarding', step: 1, channel: 'sms', template_key: 'sbaDay0', scheduled_at: new Date().toISOString() },
    { contact_id, sequence_name: 'sba-onboarding', step: 2, channel: 'sms', template_key: 'sbaDay7', scheduled_at: daysFromNow(7) },
  ])

  await admin.from('contacts').update({
    membership_status: 'active',
    status: 'member',
    last_ai_action: 'SBA onboarding triggered',
  }).eq('id', contact_id)

  return NextResponse.json({ success: true })
}
