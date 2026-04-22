import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — fetch approved reviews (public, for social proof wall)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const destination = searchParams.get('destination')
  const limit = parseInt(searchParams.get('limit') ?? '20')

  const admin = createAdminClient()
  let query = admin
    .from('reviews')
    .select('id, first_name, location, destination, rating, review_text, saved_amount, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (destination) query = query.ilike('destination', `%${destination}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — submit a review (public, from review link in SMS/email)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { contact_id, trip_id, rating, review_text, saved_amount } = body

  if (!rating || !review_text) {
    return NextResponse.json({ error: 'rating and review_text are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: contact } = await admin
    .from('contacts')
    .select('first_name, custom_fields')
    .eq('id', contact_id)
    .single()

  const { data: trip } = trip_id
    ? await admin.from('trips').select('destination').eq('id', trip_id).single()
    : { data: null }

  const { data, error } = await admin.from('reviews').insert({
    contact_id,
    trip_id: trip_id ?? null,
    first_name: contact?.first_name ?? 'Member',
    location: (contact?.custom_fields as Record<string, string>)?.location ?? '',
    destination: trip?.destination ?? '',
    rating,
    review_text,
    saved_amount: saved_amount ?? null,
    status: 'pending', // admin approves before showing publicly
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (trip_id) {
    await admin.from('trips').update({ review_requested: true }).eq('id', trip_id)
  }

  return NextResponse.json({ success: true, review: data })
}

// PATCH — approve/reject review (admin)
export async function PATCH(request: NextRequest) {
  const admin = createAdminClient()
  const { id, status } = await request.json()
  const { data, error } = await admin.from('reviews').update({ status }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
