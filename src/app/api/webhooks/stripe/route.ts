import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature } from '@/lib/stripe'
import { sendEmail } from '@/lib/mailgun'
import { generateCompletion } from '@/lib/openai'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event
  try {
    event = verifyWebhookSignature(body, signature)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as {
      customer_email?: string
      customer_details?: { email?: string }
      metadata?: { email?: string }
    }
    const email =
      session.customer_email ||
      session.customer_details?.email ||
      session.metadata?.email

    if (!email) {
      return NextResponse.json({ error: 'No email in session' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: contact } = await supabase
      .from('contacts')
      .update({
        membership_status: 'active',
        joined_date: new Date().toISOString(),
        status: 'member',
        tags: ['ttp-member', 'paid', 'onboarding'],
        last_ai_action: 'Membership activated',
      })
      .eq('email', email)
      .select()
      .single()

    if (contact) {
      await supabase
        .from('opportunities')
        .upsert({
          contact_id: contact.id,
          name: `${contact.first_name} — Onboarding`,
          pipeline: 'onboarding',
          stage: 'onboarding-started',
          status: 'open',
        })

      try {
        const { content: welcomeBody } = await generateCompletion({
          systemPrompt: 'You write warm, personalized welcome emails for VortexTrips travel membership. Be enthusiastic, clear, and helpful.',
          userPrompt: `Write a welcome email for ${contact.first_name} who just became a Travel Team Perks member. Include: 1) A warm welcome 2) What they can expect (40-60% savings, AI-powered deal matching, personal consultant) 3) Next steps to book their first trip 4) A reminder their login is at vortextrips.com. Keep it under 300 words.`,
          temperature: 0.7,
          maxTokens: 500,
        })

        await sendEmail({
          to: email,
          subject: `Welcome to Travel Team Perks, ${contact.first_name}! 🎉`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <img src="${process.env.NEXT_PUBLIC_APP_URL}/logo.png" alt="VortexTrips" style="height:48px;margin-bottom:24px"/>
            ${welcomeBody.replace(/\n/g, '<br/>')}
            <br/><br/>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="background:#FF6B35;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
              Access Your Member Dashboard
            </a>
          </div>`,
        })

        await supabase.from('ai_actions_log').insert({
          contact_id: contact.id,
          action_type: 'onboarding-email',
          service: 'mailgun',
          status: 'success',
        })
      } catch (err) {
        await supabase.from('ai_actions_log').insert({
          contact_id: contact.id,
          action_type: 'onboarding-email',
          service: 'mailgun',
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown',
        })
      }

      try {
        await sendEmail({
          to: process.env.ADMIN_NOTIFICATION_EMAIL!,
          subject: `New TTP Member: ${contact.first_name} ${contact.last_name || ''}`,
          html: `<p>New member signed up:</p>
            <ul>
              <li>Name: ${contact.first_name} ${contact.last_name || ''}</li>
              <li>Email: ${email}</li>
              <li>Phone: ${contact.phone || 'N/A'}</li>
              <li>Joined: ${new Date().toLocaleString()}</li>
            </ul>`,
          from: 'VortexTrips Bot <bot@mg.vortextrips.com>',
        })

        await supabase.from('ai_actions_log').insert({
          contact_id: contact.id,
          action_type: 'admin-notification',
          service: 'mailgun',
          status: 'success',
        })
      } catch {}
    }
  }

  return NextResponse.json({ received: true })
}
