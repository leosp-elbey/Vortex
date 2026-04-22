import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/resend'
import { sendSMS } from '@/lib/twilio'

interface Partner {
  id: string
  name: string
  email: string | null
  phone: string | null
  destinations: string[] | null
  budgets: string[] | null
  active: boolean
  [key: string]: unknown
}

// GET — list partners
export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('partners').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — distribute a lead to matching partners based on rules
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contact_id } = await request.json()
  const admin = createAdminClient()

  const { data: contact } = await admin
    .from('contacts')
    .select('id, first_name, email, phone, custom_fields')
    .eq('id', contact_id)
    .single()

  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const fields = contact.custom_fields as Record<string, string>
  const destination = fields?.destination ?? ''
  const budget = fields?.budget ?? ''

  // Find matching partners by destination and budget rules
  const { data: partners } = await admin
    .from('partners')
    .select('*')
    .eq('active', true)
    .limit(10)

  if (!partners || partners.length === 0) {
    return NextResponse.json({ success: true, routed: 0 })
  }

  // Score partners by match quality
  const scored = (partners as Partner[]).map((p) => {
    let score = 0
    const destinations = p.destinations ?? []
    const budgets = p.budgets ?? []
    if (destinations.length === 0 || destinations.some(d => destination.toLowerCase().includes(d.toLowerCase()))) score += 10
    if (budgets.length === 0 || budgets.includes(budget)) score += 5
    return { ...p, score }
  }).sort((a, b) => b.score - a.score)

  const bestPartner = scored[0]
  if (!bestPartner) return NextResponse.json({ success: true, routed: 0 })

  // Notify partner
  if (bestPartner.email) {
    await sendEmail({
      to: bestPartner.email,
      subject: `New lead for you — ${contact.first_name} (${destination || 'any destination'})`,
      html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#1A1A2E">
  <h2>New Lead Assignment</h2>
  <p>A new travel lead has been routed to you from VortexTrips.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px;font-weight:700;color:#666;width:140px">Name</td><td style="padding:8px">${contact.first_name}</td></tr>
    <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:700;color:#666">Email</td><td style="padding:8px">${contact.email}</td></tr>
    <tr><td style="padding:8px;font-weight:700;color:#666">Phone</td><td style="padding:8px">${contact.phone ?? 'Not provided'}</td></tr>
    <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:700;color:#666">Destination</td><td style="padding:8px">${destination || 'Open'}</td></tr>
    <tr><td style="padding:8px;font-weight:700;color:#666">Budget</td><td style="padding:8px">${budget || 'Not specified'}</td></tr>
  </table>
  <p style="color:#888;font-size:14px">Please follow up within 24 hours. — VortexTrips</p>
</div>`,
    })
  }

  if (bestPartner.phone) {
    await sendSMS(
      bestPartner.phone,
      `VortexTrips: New lead — ${contact.first_name}, ${destination || 'open destination'}, budget: ${budget || 'unknown'}. Email: ${contact.email}. Follow up ASAP.`
    )
  }

  // Log the routing
  await admin.from('contacts').update({
    last_ai_action: `Lead routed to partner: ${bestPartner.name}`,
    tags: ['partner-routed'],
  }).eq('id', contact_id)

  return NextResponse.json({ success: true, routed: 1, partner: bestPartner.name })
}
