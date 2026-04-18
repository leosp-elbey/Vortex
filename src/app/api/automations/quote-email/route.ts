import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCompletion } from '@/lib/openai'
import { sendEmail } from '@/lib/mailgun'
import type { QuoteFormData } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body: QuoteFormData = await request.json()
    const { first_name, email, destination, travel_dates_start, travel_dates_end, travelers, budget, notes } = body

    if (!email || !destination) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: contact } = await supabase
      .from('contacts')
      .update({
        custom_fields: { destination, travel_dates_start, travel_dates_end, travelers, budget, notes },
        status: 'quoted',
        last_ai_action: 'Quote email sent',
      })
      .eq('email', email)
      .select('id')
      .single()

    const { content: emailBody } = await generateCompletion({
      systemPrompt: `You are an expert travel savings email copywriter for VortexTrips (also known as Travel Team Perks).
Write compelling, personalized HTML email body content that shows the traveler exactly how much they can save with our membership.
Include specific savings percentages (40-60%), mention exclusive member rates, and end with a strong CTA to join.
Be enthusiastic but professional. Return only the HTML body content, no subject line.`,
      userPrompt: `Write a personalized travel savings quote email for:
Name: ${first_name}
Destination: ${destination}
Travel Dates: ${travel_dates_start} to ${travel_dates_end}
Travelers: ${travelers}
Budget: ${budget}
Notes: ${notes || 'None'}

Include estimated savings based on their budget range. End with a CTA button linking to ${process.env.NEXT_PUBLIC_APP_URL}/join`,
      temperature: 0.7,
      maxTokens: 800,
    })

    await supabase.from('ai_actions_log').insert({
      contact_id: contact?.id,
      action_type: 'quote-email',
      service: 'openai',
      status: 'success',
      request_payload: { destination, budget, travelers } as Record<string, unknown>,
    })

    await sendEmail({
      to: email,
      subject: `Your ${destination} Trip — Here's How to Save Big, ${first_name}!`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1A1A2E">
        <div style="background:#FF6B35;padding:16px;border-radius:8px;margin-bottom:24px">
          <h1 style="color:white;margin:0;font-size:24px">VortexTrips ✈️</h1>
          <p style="color:rgba(255,255,255,0.9);margin:4px 0 0">Travel Team Perks</p>
        </div>
        ${emailBody}
        <hr style="margin:32px 0;border-color:#eee"/>
        <p style="font-size:12px;color:#888">VortexTrips · Unsubscribe · vortextrips.com</p>
      </div>`,
    })

    await supabase.from('ai_actions_log').insert({
      contact_id: contact?.id,
      action_type: 'quote-email',
      service: 'mailgun',
      status: 'success',
    })

    if (contact?.id) {
      await supabase
        .from('contacts')
        .update({ tags: ['quote-sent', 'ai-email-sent'] })
        .eq('id', contact.id)

      await supabase
        .from('opportunities')
        .update({ stage: 'quote-sent' })
        .eq('contact_id', contact.id)
        .eq('pipeline', 'main')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
