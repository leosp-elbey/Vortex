// Phase 14AB hardening — every Supabase call goes through `bounded()` with
// a 2.5s per-call timeout. Bland.ai retries / blacklists slow webhook
// endpoints, so we'd rather return a fast 200/500 than hang the upstream
// queue. All calls in this route are bookkeeping (call-status updates +
// contact tag rolls); none are on a critical-must-have path, so timeouts
// just degrade silently.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkBlandWebhook } from '@/lib/webhook-auth'
import { bounded, WEBHOOK_BOUND_MS } from '@/lib/bounded-wait'

const LOG_PREFIX = '[bland-webhook]'

export async function POST(request: NextRequest) {
  // Verify Bland-signed Bearer token (set BLAND_WEBHOOK_SECRET to enable enforcement)
  if (!checkBlandWebhook(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { status, duration, metadata } = body
    const supabase = createAdminClient()

    // Bookkeeping: stamp the call's outcome on the matching ai_actions_log row.
    await bounded(
      supabase
        .from('ai_actions_log')
        .update({
          status: status === 'completed' ? 'success' : 'failed',
          response_payload: body,
          duration_ms: duration ? duration * 1000 : undefined,
        })
        .contains('request_payload', { phone_number: metadata?.phone }),
      WEBHOOK_BOUND_MS,
      'ai_actions_log update',
      LOG_PREFIX,
    )

    if (metadata?.email) {
      // Look up the contact by email. If this times out, we skip the
      // tag/stage updates rather than partial-update on stale data.
      const lookupResult = await bounded(
        supabase
          .from('contacts')
          .select('id, tags')
          .eq('email', metadata.email)
          .single(),
        WEBHOOK_BOUND_MS,
        'contacts lookup',
        LOG_PREFIX,
      )
      const contact = lookupResult?.data ?? null

      if (contact) {
        const newTags = Array.from(new Set([...(contact.tags || []), 'bland-call-completed']))

        await bounded(
          supabase
            .from('contacts')
            .update({
              tags: newTags,
              last_ai_action: 'Intro call completed',
            })
            .eq('id', contact.id),
          WEBHOOK_BOUND_MS,
          'contacts tag update',
          LOG_PREFIX,
        )

        await bounded(
          supabase
            .from('opportunities')
            .update({ stage: 'call-completed' })
            .eq('contact_id', contact.id)
            .eq('pipeline', 'main'),
          WEBHOOK_BOUND_MS,
          'opportunities stage update',
          LOG_PREFIX,
        )
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
