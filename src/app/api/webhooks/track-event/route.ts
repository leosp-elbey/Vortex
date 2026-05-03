// Lead-scoring + click-attribution webhook.
// Phase 14I addendum: when the inbound event carries `utm_medium=event_campaign`
// (from a tracking URL produced by Phase 14H.1's helper), the route also resolves
// the campaign / asset / calendar_row foreign keys so the attribution view in
// Phase 14H/14I can count clicks deterministically.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

// Point values for lead scoring (existing — unchanged)
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

const CAMPAIGN_UTM_MEDIUM = 'event_campaign'

interface UtmFields {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
}

interface CampaignResolution {
  event_campaign_id: string | null
  campaign_asset_id: string | null
  content_calendar_id: string | null
}

/**
 * Pull UTM values from any of: request body top-level, body.metadata, request
 * query params, or a `referrer` URL when supplied. First non-empty wins per key.
 * Lower-cases utm_source for consistency with the helper that produced the URL.
 */
function extractUtm(body: Record<string, unknown>, request: NextRequest): UtmFields {
  const sources: Array<Record<string, unknown>> = []

  // 1. body top-level
  sources.push(body)
  // 2. body.metadata (existing track-event payload shape)
  if (body && typeof body.metadata === 'object' && body.metadata !== null) {
    sources.push(body.metadata as Record<string, unknown>)
  }
  // 3. request query string (e.g. POST /api/webhooks/track-event?utm_source=...)
  try {
    const params = new URL(request.url).searchParams
    const fromQuery: Record<string, string> = {}
    for (const [k, v] of params.entries()) fromQuery[k] = v
    sources.push(fromQuery)
  } catch {
    // malformed URL — skip
  }
  // 4. referrer URL when supplied
  const referrer = pickFirstString(sources, 'referrer') || pickFirstString(sources, 'referer')
  if (referrer) {
    try {
      const refParams = new URL(referrer).searchParams
      const fromRef: Record<string, string> = {}
      for (const [k, v] of refParams.entries()) fromRef[k] = v
      sources.push(fromRef)
    } catch {
      // malformed referrer — skip
    }
  }

  return {
    utm_source: lowerOrNull(pickFirstString(sources, 'utm_source')),
    utm_medium: pickFirstString(sources, 'utm_medium'),
    utm_campaign: pickFirstString(sources, 'utm_campaign'),
    utm_content: pickFirstString(sources, 'utm_content'),
  }
}

function pickFirstString(sources: Array<Record<string, unknown>>, key: string): string | null {
  for (const src of sources) {
    if (!src) continue
    const v = src[key]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

function lowerOrNull(s: string | null): string | null {
  return s ? s.toLowerCase() : null
}

/**
 * Parse `utm_campaign` per the canonical pattern `<event_slug>_<year>[_<wave>]`.
 * Returns null when the pattern doesn't match — never throws.
 */
function parseUtmCampaign(value: string | null): { slug: string; year: number; wave: string | null } | null {
  if (!value) return null
  // Anchored: full string must match `<slug>_<4-digit year>[_W1..W8]`
  // Slug captures any non-empty char run; year is 4 digits; wave is optional W1-W8.
  const match = /^([a-z0-9-]+)_(\d{4})(?:_(W[1-8]))?$/i.exec(value.trim())
  if (!match) return null
  return {
    slug: match[1].toLowerCase(),
    year: parseInt(match[2], 10),
    wave: match[3] ? match[3].toUpperCase() : null,
  }
}

/**
 * Parse `utm_content` per the canonical pattern `<asset_type>_<8-char-short>`.
 * Returns null when the pattern doesn't match.
 */
function parseUtmContent(value: string | null): { assetType: string; assetIdShort: string } | null {
  if (!value) return null
  const match = /^([a-z][a-z0-9_]*)_([a-z0-9]{8})$/i.exec(value.trim())
  if (!match) return null
  return {
    assetType: match[1].toLowerCase(),
    assetIdShort: match[2].toLowerCase(),
  }
}

/**
 * Resolve UTM tags to (campaign_id, asset_id, content_calendar_id). Returns
 * an all-null shape when the tags don't carry campaign context or when no
 * matches are found. Never throws — DB lookup errors fall back to nulls.
 */
async function resolveCampaignFromUtm(
  supabase: SupabaseAdmin,
  utm: UtmFields,
): Promise<CampaignResolution> {
  const empty: CampaignResolution = { event_campaign_id: null, campaign_asset_id: null, content_calendar_id: null }
  if (utm.utm_medium?.toLowerCase() !== CAMPAIGN_UTM_MEDIUM) return empty

  const parsed = parseUtmCampaign(utm.utm_campaign)
  if (!parsed) return empty

  // Match event_campaign by slug + year. event_slug is persisted (Phase 14H.2)
  // and case-insensitive; ilike is used defensively though we lower-case both.
  let event_campaign_id: string | null = null
  try {
    const { data: campaign } = await supabase
      .from('event_campaigns')
      .select('id')
      .ilike('event_slug', parsed.slug)
      .eq('event_year', parsed.year)
      .limit(1)
      .maybeSingle<{ id: string }>()
    event_campaign_id = campaign?.id ?? null
  } catch {
    return empty
  }
  if (!event_campaign_id) return empty

  // Asset-level resolution via utm_content `<asset_type>_<8-char>`. The 8-char
  // short is the first 8 chars of the asset UUID with dashes stripped — equal
  // to the first 8 chars of the dashed UUID since dashes only appear at fixed
  // positions ≥ 8. We pull all matching (campaign × asset_type) candidates
  // (small set, ~3-10 max per asset_type per campaign) and filter in JS.
  let campaign_asset_id: string | null = null
  let content_calendar_id: string | null = null

  const content = parseUtmContent(utm.utm_content)
  if (content) {
    try {
      const { data: candidates } = await supabase
        .from('campaign_assets')
        .select('id, content_calendar_id')
        .eq('campaign_id', event_campaign_id)
        .eq('asset_type', content.assetType)
        .limit(100)
      const match = (candidates ?? []).find(
        a => a.id.replace(/-/g, '').slice(0, 8).toLowerCase() === content.assetIdShort,
      )
      if (match) {
        campaign_asset_id = match.id
        content_calendar_id = (match.content_calendar_id as string | null) ?? null
      }
    } catch {
      // Asset resolution is best-effort — fall through with campaign-only attribution.
    }
  }

  return { event_campaign_id, campaign_asset_id, content_calendar_id }
}

export async function POST(request: NextRequest) {
  // Per-IP rate limit: 60 events / minute / IP (allows page tracking but blocks abuse)
  const ip = clientIpFrom(request.headers)
  const rl = checkRateLimit(`track-event:${ip}`, 60, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const event = typeof body.event === 'string' ? body.event : null
    if (!event) return NextResponse.json({ error: 'event required' }, { status: 400 })

    const contact_id = typeof body.contact_id === 'string' ? body.contact_id : null
    const email = typeof body.email === 'string' ? body.email : null
    const metadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {}

    const supabase = createAdminClient()

    // Resolve contact by email if no ID provided
    let resolvedId: string | null = contact_id
    if (!resolvedId && email) {
      const { data } = await supabase.from('contacts').select('id').eq('email', email).single()
      resolvedId = (data?.id as string | undefined) ?? null
    }

    // Phase 14I — extract UTM and resolve campaign context. Runs even when there
    // is no contact, so anonymous campaign visits still get logged.
    const utm = extractUtm(body, request)
    const resolution = await resolveCampaignFromUtm(supabase, utm)
    const hasCampaignContext =
      utm.utm_medium?.toLowerCase() === CAMPAIGN_UTM_MEDIUM ||
      !!resolution.event_campaign_id

    // Bail when we have neither a known contact NOR campaign UTM context — the
    // event is genuinely anonymous and uninteresting (matches pre-Phase-14I
    // behavior for organic anonymous traffic).
    if (!resolvedId && !hasCampaignContext) {
      return NextResponse.json({ ok: true, ignored: 'anonymous-no-utm' })
    }

    const points = SCORE_MAP[event] ?? 1
    let newScore: number | null = null
    let intentTag: string | null = null

    if (resolvedId) {
      // Fetch current score + tags
      const { data: contact } = await supabase
        .from('contacts')
        .select('lead_score, tags')
        .eq('id', resolvedId)
        .single()

      const currentScore = (contact?.lead_score ?? 0) as number
      const currentTags = (contact?.tags ?? []) as string[]
      newScore = Math.min(currentScore + points, 200) // cap at 200
      intentTag = getIntentTag(newScore)
      const filteredTags = currentTags.filter((t: string) => !t.startsWith('intent:'))
      const newTags = [...filteredTags, intentTag]

      await supabase.from('contacts').update({
        lead_score: newScore,
        tags: newTags,
        last_ai_action: `Event: ${event} (+${points}pts)`,
      }).eq('id', resolvedId)
    }

    // Log the event — always, even when contact is unresolved but campaign UTM
    // is present. Phase 14I adds the seven UTM/FK columns; legacy callers that
    // never set them keep working (all nullable).
    await supabase.from('contact_events').insert({
      contact_id: resolvedId,
      event,
      metadata,
      score_delta: resolvedId ? points : 0,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      event_campaign_id: resolution.event_campaign_id,
      campaign_asset_id: resolution.campaign_asset_id,
      content_calendar_id: resolution.content_calendar_id,
    })

    return NextResponse.json({
      ok: true,
      score: newScore,
      intent: intentTag,
      campaign_attributed: !!resolution.event_campaign_id,
      asset_attributed: !!resolution.campaign_asset_id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
