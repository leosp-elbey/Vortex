import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCompletion } from '@/lib/openai'
import { sendEmail } from '@/lib/resend'
import { triggerCall } from '@/lib/bland'
import type { QuoteFormData } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body: QuoteFormData = await request.json()
    const { first_name, email, phone, destination, travel_dates_start, travel_dates_end, travelers, budget, notes } = body

    if (!email || !destination || !first_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Find existing contact or create new one
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, phone, tags')
      .eq('email', email)
      .single()

    let contactId: string | undefined

    if (existingContact) {
      await supabase.from('contacts').update({
        custom_fields: { destination, travel_dates_start, travel_dates_end, travelers, budget, notes },
        status: 'quoted',
        last_ai_action: 'Quote email sent',
      }).eq('id', existingContact.id)
      contactId = existingContact.id
    } else {
      // New visitor — create contact and opportunity
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          first_name,
          email,
          phone: phone || null,
          source: 'quote-form',
          status: 'quoted',
          custom_fields: { destination, travel_dates_start, travel_dates_end, travelers, budget, notes },
          last_ai_action: 'Quote email sent',
        })
        .select('id')
        .single()

      contactId = newContact?.id

      if (contactId) {
        await supabase.from('opportunities').insert({
          contact_id: contactId,
          name: `${first_name} — Main Pipeline`,
          pipeline: 'main',
          stage: 'quote-sent',
        })

        // Trigger a call if they provided a phone number
        if (phone) {
          try {
            await triggerCall(phone, first_name, email, undefined, contactId)
            await supabase.from('contacts').update({ tags: ['bland-call-sent'], last_ai_action: 'Intro call triggered' }).eq('id', contactId)
          } catch (callError) {
            console.error('Quote form call error:', callError)
            await supabase.from('contacts').update({ tags: ['call-failed'] }).eq('id', contactId)
          }
        }
      }
    }

    // Generate AI email content
    const { content: rawEmailBody } = await generateCompletion({
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

    const emailBody = rawEmailBody.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim()

    await supabase.from('ai_actions_log').insert({
      contact_id: contactId,
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
        <p style="font-size:12px;color:#888">VortexTrips · <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="color:#888">vortextrips.com</a></p>
      </div>`,
    })

    await supabase.from('ai_actions_log').insert({
      contact_id: contactId,
      action_type: 'quote-email',
      service: 'mailgun' as const,
      status: 'success',
    })

    if (contactId && existingContact) {
      await supabase.from('contacts').update({ tags: ['quote-sent', 'ai-email-sent'] }).eq('id', contactId)
      await supabase.from('opportunities').update({ stage: 'quote-sent' }).eq('contact_id', contactId).eq('pipeline', 'main')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
