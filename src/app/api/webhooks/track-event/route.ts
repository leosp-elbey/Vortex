import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit'

// Point values for lead scoring
const SCORE_MAP: Record<string, number> = {
  page_view: 2,
  quote_page_view: 8,
  destination_page_view: 5,
  quote_form_start: 10,
  quote_form_abandon: 5,
  email_open: 10,
  email_click: 15,
  sms_reply: 12,
  book_link_click: 20,
  join_link_click: 25,
  pricing_page_view: 15,
  return_visit: 8,
}

// Intent tags based on score thresholds
function getIntentTag(score: number): string {
  if (score >= 80) return 'intent:hot'
  if (score >= 40) return 'intent:warm'
  return 'intent:browsing'
}

export async function POST(request: NextRequest) {
  // Per-IP rate limit: 60 events / minute / IP (allows page tracking but blocks abuse)
  const ip = clientIpFrom(request.headers)
  const rl = checkRateLimit(`track-event:${ip}`, 60, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const { contact_id, email, event, metadata } = await request.json()

    if (!event) return NextResponse.json({ error: 'event required' }, { status: 400 })

    const supabase = createAdminClient()

    // Resolve contact by email if no ID provided
    let resolvedId = contact_id
    if (!resolvedId && email) {
      const { data } = await supabase.from('contacts').select('id').eq('email', email).single()
      resolvedId = data?.id
    }

    if (!resolvedId) return NextResponse.json({ ok: true }) // unknown visitor, ignore

    const points = SCORE_MAP[event] ?? 1

    // Fetch current score + tags
    const { data: contact } = await supabase
      .from('contacts')
      .select('lead_score, tags')
      .eq('id', resolvedId)
      .single()

    const currentScore = (contact?.lead_score ?? 0) as number
    const currentTags = (contact?.tags ?? []) as string[]
    const newScore = Math.min(currentScore + points, 200) // cap at 200

    // Update intent tag
    const intentTag = getIntentTag(newScore)
    const filteredTags = currentTags.filter((t: string) => !t.startsWith('intent:'))
    const newTags = [...filteredTags, intentTag]

    await supabase.from('contacts').update({
      lead_score: newScore,
      tags: newTags,
      last_ai_action: `Event: ${event} (+${points}pts)`,
    }).eq('id', resolvedId)

    // Log the event
    await supabase.from('contact_events').insert({
      contact_id: resolvedId,
      event,
      metadata: metadata ?? {},
      score_delta: points,
    })

    return NextResponse.json({ ok: true, score: newScore, intent: intentTag })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
