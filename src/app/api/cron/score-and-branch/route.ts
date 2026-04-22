import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMS } from '@/lib/twilio'
import { sendEmail } from '@/lib/resend'

// For hot leads: cancel remaining generic nurture, send direct close message
const HOT_LEAD_SMS = (name: string) =>
  `${name}, you've been checking out VortexTrips — I'd love to get you set up personally. Call or text me back and I'll walk you through your first booking. Reply STOP to opt out.`

const HOT_LEAD_EMAIL = (name: string) => ({
  subject: `${name} — let's get you booked`,
  html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#1A1A2E">
  <h2 style="margin:0 0 16px">Hey ${name} — I noticed you've been looking.</h2>
  <p>You've visited VortexTrips a few times and checked out some of our deals. I don't want you to miss out on the current rates while you're deciding.</p>
  <p>I'd like to personally walk you through your first booking — no pressure, just a real look at what you'd save on your specific trip.</p>
  <div style="text-align:center;margin:28px 0">
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/quote" style="background:#FF6B35;color:white;font-weight:700;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;display:inline-block">Get My Personal Quote →</a>
  </div>
  <p style="color:#888;font-size:14px"><strong>— Leo, VortexTrips</strong></p>
</div>`,
})

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Find hot leads who haven't been contacted with hot-lead messaging yet
  // and still have pending generic nurture steps
  const { data: hotLeads } = await supabase
    .from('contacts')
    .select('id, first_name, email, phone, tags, lead_score')
    .contains('tags', ['intent:hot'])
    .not('tags', 'cs', '["hot-lead-contacted"]')
    .eq('status', 'lead')
    .gte('lead_score', 80)
    .limit(20)

  if (!hotLeads || hotLeads.length === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  let processed = 0

  for (const contact of hotLeads) {
    // Cancel remaining generic nurture steps for this contact
    await supabase.from('sequence_queue')
      .update({ status: 'skipped' })
      .eq('contact_id', contact.id)
      .eq('sequence_name', 'lead-nurture')
      .eq('status', 'pending')

    // Send hot-lead direct outreach
    if (contact.phone) {
      try { await sendSMS(contact.phone, HOT_LEAD_SMS(contact.first_name)) } catch (e) { console.error(e) }
    }

    if (contact.email) {
      try {
        const { subject, html } = HOT_LEAD_EMAIL(contact.first_name)
        await sendEmail({ to: contact.email, subject, html })
      } catch (e) { console.error(e) }
    }

    // Tag as contacted so we don't repeat
    const updatedTags = [...(contact.tags ?? []), 'hot-lead-contacted']
    await supabase.from('contacts').update({
      tags: updatedTags,
      last_ai_action: 'Hot-lead direct outreach sent',
    }).eq('id', contact.id)

    processed++
  }

  return NextResponse.json({ success: true, processed })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
