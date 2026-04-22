import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — list trips for a contact (admin)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const contact_id = searchParams.get('contact_id')

  const admin = createAdminClient()
  const query = admin.from('trips').select('*, contacts(first_name, email)').order('return_date', { ascending: false })
  if (contact_id) query.eq('contact_id', contact_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — log a trip (triggers review sequence after return_date)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { contact_id, destination, departure_date, return_date, travelers, booking_value } = body

  if (!contact_id || !destination || !return_date) {
    return NextResponse.json({ error: 'contact_id, destination, return_date required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: trip, error } = await admin.from('trips').insert({
    contact_id,
    destination,
    departure_date,
    return_date,
    travelers: travelers ?? 1,
    booking_value: booking_value ?? 0,
    review_requested: false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Schedule review request SMS + email for 2 days after return
  const reviewDate = new Date(return_date)
  reviewDate.setDate(reviewDate.getDate() + 2)

  await admin.from('sequence_queue').insert([
    {
      contact_id,
      sequence_name: 'post-trip-review',
      step: 1,
      channel: 'sms',
      template_key: 'reviewRequestSms',
      scheduled_at: reviewDate.toISOString(),
      metadata: { trip_id: trip.id, destination },
    },
    {
      contact_id,
      sequence_name: 'post-trip-review',
      step: 2,
      channel: 'email',
      template_key: 'reviewRequestEmail',
      scheduled_at: new Date(reviewDate.getTime() + 2 * 60 * 60 * 1000).toISOString(), // +2hrs
      metadata: { trip_id: trip.id, destination },
    },
  ])

  return NextResponse.json({ success: true, trip })
}
