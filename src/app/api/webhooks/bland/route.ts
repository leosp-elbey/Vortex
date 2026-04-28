import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkBlandWebhook } from '@/lib/webhook-auth'

export async function POST(request: NextRequest) {
  // Verify Bland-signed Bearer token (set BLAND_WEBHOOK_SECRET to enable enforcement)
  if (!checkBlandWebhook(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { call_id, status, duration, metadata } = body
    const supabase = createAdminClient()

    await supabase
      .from('ai_actions_log')
      .update({
        status: status === 'completed' ? 'success' : 'failed',
        response_payload: body,
        duration_ms: duration ? duration * 1000 : undefined,
      })
      .contains('request_payload', { phone_number: metadata?.phone })

    if (metadata?.email) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, tags')
        .eq('email', metadata.email)
        .single()

      if (contact) {
        const newTags = Array.from(new Set([...(contact.tags || []), 'bland-call-completed']))

        await supabase
          .from('contacts')
          .update({
            tags: newTags,
            last_ai_action: 'Intro call completed',
          })
          .eq('id', contact.id)

        await supabase
          .from('opportunities')
          .update({ stage: 'call-completed' })
          .eq('contact_id', contact.id)
          .eq('pipeline', 'main')
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
