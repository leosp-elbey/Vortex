import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — manually add a lead from the dashboard
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    first_name, last_name, email, phone, source = 'manual',
    status = 'lead', destination, notes, enroll_sequence = false,
  } = body

  if (!first_name || !email) {
    return NextResponse.json({ error: 'first_name and email are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: contact, error } = await admin.from('contacts').insert({
    first_name,
    last_name: last_name || null,
    email,
    phone: phone || null,
    source,
    status,
    lead_score: 20,
    custom_fields: {
      ...(destination ? { destination } : {}),
      ...(notes ? { notes } : {}),
      manually_added: 'true',
    },
    last_ai_action: 'Manually added via dashboard',
  }).select().single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Always create an opportunity
  await admin.from('opportunities').insert({
    contact_id: contact.id,
    name: `${first_name} — Main Pipeline`,
    pipeline: 'main',
    stage: 'new-lead',
  })

  // Optionally enroll in nurture sequence
  if (enroll_sequence) {
    const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600000).toISOString()
    const daysFromNow = (d: number) => hoursFromNow(d * 24)
    await admin.from('sequence_queue').insert([
      { contact_id: contact.id, sequence_name: 'lead-nurture', step: 2, channel: 'email', template_key: 'leadDay1', scheduled_at: daysFromNow(1) },
      { contact_id: contact.id, sequence_name: 'lead-nurture', step: 3, channel: 'sms', template_key: 'leadDay2', scheduled_at: daysFromNow(2) },
      { contact_id: contact.id, sequence_name: 'lead-nurture', step: 4, channel: 'email', template_key: 'leadDay3', scheduled_at: daysFromNow(3) },
      { contact_id: contact.id, sequence_name: 'lead-nurture', step: 5, channel: 'email', template_key: 'leadDay5', scheduled_at: daysFromNow(5) },
      { contact_id: contact.id, sequence_name: 'lead-nurture', step: 6, channel: 'sms', template_key: 'leadDay7', scheduled_at: daysFromNow(7) },
      { contact_id: contact.id, sequence_name: 'lead-nurture', step: 7, channel: 'email', template_key: 'leadDay7', scheduled_at: hoursFromNow(7 * 24 + 4) },
      { contact_id: contact.id, sequence_name: 'lead-nurture', step: 8, channel: 'email', template_key: 'leadDay10', scheduled_at: daysFromNow(10) },
      { contact_id: contact.id, sequence_name: 'lead-nurture', step: 9, channel: 'sms', template_key: 'leadDay12', scheduled_at: daysFromNow(12) },
      { contact_id: contact.id, sequence_name: 'lead-nurture', step: 10, channel: 'email', template_key: 'leadDay14', scheduled_at: daysFromNow(14) },
    ])
  }

  return NextResponse.json(contact, { status: 201 })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const membership = searchParams.get('membership')

  let query = supabase.from('contacts').select('*').order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (membership) query = query.eq('status', membership)
  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
