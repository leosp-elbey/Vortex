// Phase 14J.2 — Branded campaign tracking redirect.
//
// GET /t/<slug>?utm_source=…&utm_medium=event_campaign&utm_campaign=…&utm_content=…
//
// This is the visible URL on every campaign-attributed social post. The route:
//   1. Looks up the campaign by `event_slug = <slug>` (case-insensitive, latest year first)
//   2. Resolves the asset/calendar FKs from utm_content where possible
//   3. Logs a `page_view` row to contact_events with full UTM + FK attribution
//      (anonymous: contact_id is NULL — same shape as Phase 14I anonymous clicks)
//   4. 302-redirects to `event_campaigns.cta_url` (or DEFAULT_REDIRECT when null)
//
// Logging is best-effort: a failure NEVER blocks the redirect. The visitor
// always reaches the destination even if attribution fails.
//
// Public route (no admin auth required) — anyone with the link can click it.
// Rate limiting is the same as the rest of the public surface (Vercel-level).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Final destination when the looked-up campaign has no cta_url set. */
const DEFAULT_REDIRECT = 'https://myvortex365.com/leosp'

const CAMPAIGN_UTM_MEDIUM = 'event_campaign'

interface CampaignLookupRow {
  id: string
  cta_url: string | null
  event_year: number
}

interface AssetMatchRow {
  id: string
  content_calendar_id: string | null
}

/** Parse `utm_content` per the canonical `<asset_type>_<8-char-short>` pattern. */
function parseUtmContent(value: string | null): { assetType: string; assetIdShort: string } | null {
  if (!value) return null
  const m = /^([a-z][a-z0-9_]*)_([a-z0-9]{8})$/i.exec(value.trim())
  if (!m) return null
  return { assetType: m[1].toLowerCase(), assetIdShort: m[2].toLowerCase() }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cleanedSlug = (slug ?? '').toLowerCase().trim()
  const url = new URL(request.url)
  const supabase = createAdminClient()

  // 1. Look up the campaign. When multiple years share a slug (e.g. an annual
  // event keeps the same `event_slug` but `event_year` changes), prefer the
  // latest year so this year's campaign wins by default. The Phase 14I
  // attribution view still matches by year-from-utm_campaign, so we don't
  // lose attribution accuracy.
  let campaign: CampaignLookupRow | null = null
  if (cleanedSlug) {
    const { data } = await supabase
      .from('event_campaigns')
      .select('id, cta_url, event_year')
      .ilike('event_slug', cleanedSlug)
      .order('event_year', { ascending: false })
      .limit(1)
      .maybeSingle<CampaignLookupRow>()
    campaign = data ?? null
  }

  // 2. Capture UTM tags from the request query string. These were added by
  // `buildCampaignTrackingUrl` when the post was generated, so they describe
  // the asset that produced this click.
  const utm_source = url.searchParams.get('utm_source')?.toLowerCase() || null
  const utm_medium = url.searchParams.get('utm_medium') || null
  const utm_campaign = url.searchParams.get('utm_campaign') || null
  const utm_content = url.searchParams.get('utm_content') || null

  // 3. Resolve campaign_asset_id + content_calendar_id from utm_content when
  // possible. Same logic as the Phase 14I track-event resolver — pull all
  // (campaign × asset_type) candidates and find one whose UUID short matches.
  let campaign_asset_id: string | null = null
  let content_calendar_id: string | null = null
  const parsedContent = parseUtmContent(utm_content)
  if (campaign?.id && parsedContent) {
    try {
      const { data: candidates } = await supabase
        .from('campaign_assets')
        .select('id, content_calendar_id')
        .eq('campaign_id', campaign.id)
        .eq('asset_type', parsedContent.assetType)
        .limit(100)
      const match = (candidates ?? []).find(
        (a: AssetMatchRow) =>
          a.id.replace(/-/g, '').slice(0, 8).toLowerCase() === parsedContent.assetIdShort,
      )
      if (match) {
        campaign_asset_id = match.id
        content_calendar_id = match.content_calendar_id
      }
    } catch {
      // best-effort — fall through with campaign-only attribution
    }
  }

  // 4. Best-effort log to contact_events. Never blocks the redirect.
  try {
    await supabase.from('contact_events').insert({
      event: 'page_view',
      contact_id: null,
      metadata: {
        source: 'branded_redirect',
        slug: cleanedSlug,
        full_url: url.toString(),
      },
      score_delta: 0,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      event_campaign_id: campaign?.id ?? null,
      campaign_asset_id,
      content_calendar_id,
    })
  } catch (err) {
    console.error('[branded-redirect] click log failed:', err)
  }

  // 5. 302 to the final destination. UTM params are stripped from the redirect
  // so the destination URL stays clean (we already captured them above; the
  // final landing page doesn't need them for attribution).
  const destination =
    (campaign?.cta_url && campaign.cta_url.trim()) || DEFAULT_REDIRECT

  // Defensive: if the looked-up cta_url is malformed, fall back to default
  // rather than 500-ing on a public route.
  let safeDestination: string
  try {
    safeDestination = new URL(destination).toString()
  } catch {
    safeDestination = DEFAULT_REDIRECT
  }

  // Verify the medium matches the convention. If a non-event_campaign hit ever
  // lands here, log it but still redirect (the slug is what determines the
  // destination, not the UTM tag).
  if (utm_medium && utm_medium !== CAMPAIGN_UTM_MEDIUM) {
    console.warn(`[branded-redirect] unexpected utm_medium=${utm_medium} on /t/${cleanedSlug}`)
  }

  return NextResponse.redirect(safeDestination, { status: 302 })
}
