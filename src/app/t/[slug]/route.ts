// Phase 14J.2 — Branded campaign tracking redirect (hardened in Phase 14J.2.1
// and 14Y).
//
// GET /t/<slug>?utm_source=…&utm_medium=event_campaign&utm_campaign=…&utm_content=…
//
// This is the visible URL on every campaign-attributed social post. The route:
//   1. Looks up the campaign by `event_slug = <slug>` (case-insensitive, latest year first)
//   2. Resolves the asset/calendar FKs from utm_content where possible
//   3. Logs a `page_view` row to contact_events with full UTM + FK attribution AND
//      debug fields (`route_slug`, `redirect_target`, `redirect_reason`) so the
//      diagnostic script can post-mortem every redirect from the table alone.
//   4. 302-redirects through a three-tier fallback chain so the visitor NEVER
//      sees a vortextrips.com 404 from this route, even when the slug is unknown
//      or the campaign's cta_url is blank/malformed.
//
// Logging is best-effort: a failure NEVER blocks the redirect. The visitor
// always reaches a destination even if attribution fails.
//
// Phase 14Y hardening — bounded waits.
//   Pre-14Y: try/catch around each Supabase await. If Supabase was 522'd
//   (Cloudflare origin timeout — common on free-tier projects), the
//   underlying TCP request would hang for 30+ seconds before the client
//   gave up. try/catch doesn't bound await time, so the function ate
//   Vercel Hobby's 10s function-execution budget and the visitor saw a
//   504 / connection hang. Phase 14X's audit surfaced this as a real bug.
//   Phase 14Y fix: every Supabase call goes through `bounded()`, which
//   races the work against a 2.5s timeout. Timeout / throw / success all
//   converge to a normalized `null | T` return, so callers never wait
//   longer than the budget. Worst case: 3 × 2.5s = 7.5s, well under the
//   10s function timeout. The redirect still happens with the correct
//   Tier-2/Tier-3 fallback even when every Supabase call times out.
//
// Public route (no admin auth required).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Tier 2 fallback: vortextrips.com/free. Phase 14Y changed this from
 * myvortex365.com/leosp to keep the visitor on the brand domain — `/free`
 * is itself a 307 redirect (configured in next.config.js) to the same
 * myvortex365.com portal, so the operational destination is unchanged.
 * The visitor briefly sees vortextrips.com/free in the URL bar before
 * the second redirect, which is a UX win for branded campaign clicks.
 */
const PORTAL_FALLBACK = 'https://www.vortextrips.com/free'

/**
 * Tier 3 fallback (last resort): the VortexTrips homepage. Used when both
 * the campaign-specific cta_url AND the configured portal URL are missing or
 * malformed. Guaranteed valid since it's our own domain root.
 */
const FINAL_FALLBACK = 'https://www.vortextrips.com'

const CAMPAIGN_UTM_MEDIUM = 'event_campaign'

/**
 * Phase 14Y — Per-Supabase-call hard timeout. Default 2.5 seconds.
 *
 * Vercel Hobby caps function execution at 10s. Three Supabase awaits in this
 * route × 2.5s each = 7.5s worst case + a small budget for sync work and the
 * redirect itself. Tuned to keep the route under 10s even when EVERY supabase
 * call hangs (e.g. project paused, Cloudflare 522, network blip).
 */
const SUPABASE_CALL_TIMEOUT_MS = 2500

/**
 * Race a Supabase (or any thenable) call against a fixed timeout. Returns
 * `null` on timeout, on rejection, or on a non-thrown error path. NEVER
 * throws to the caller — this is the central guardrail that prevents the
 * route from hanging on a slow Supabase response.
 *
 * Cleans up the timer in `finally` so we don't leak a setTimeout handle
 * when the work resolves before the timeout.
 */
async function bounded<T>(work: PromiseLike<T>, ms: number, label: string): Promise<T | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    const timeoutPromise = new Promise<null>(resolve => {
      timeoutHandle = setTimeout(() => {
        console.warn(`[branded-redirect] ${label} timed out after ${ms}ms — falling through`)
        resolve(null)
      }, ms)
    })
    // Wrap the thenable so a rejection becomes a `null` result rather than
    // a Promise.race rejection. This lets the route degrade gracefully on
    // ANY Supabase failure mode (timeout, 5xx, malformed response, etc.).
    const safeWork = Promise.resolve(work).catch(err => {
      console.error(`[branded-redirect] ${label} threw:`, err)
      return null as T | null
    })
    return await Promise.race([safeWork, timeoutPromise])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

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

/**
 * Attempt to parse + canonicalize a URL string. Returns null if the input is
 * empty, only-whitespace, or malformed. Used by the fallback chain so each
 * tier can be objectively tested before we commit to it.
 */
function safeUrl(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).toString()
  } catch {
    return null
  }
}

/**
 * Build the redirect target plus a one-word reason describing why that tier
 * was chosen. The reason flows into contact_events.metadata so the diagnostic
 * script can answer "why did this click land at <X>?" without re-running the
 * route.
 */
function chooseRedirect(args: {
  cleanedSlug: string
  campaign: CampaignLookupRow | null
}): { target: string; reason: string } {
  if (!args.cleanedSlug) {
    return { target: FINAL_FALLBACK, reason: 'empty_slug' }
  }
  if (!args.campaign) {
    // Slug didn't match any campaign — still send the visitor to the portal
    // rather than 404. Admins can spot these via the diagnostic.
    return { target: PORTAL_FALLBACK, reason: 'slug_unmatched' }
  }
  const ctaUrl = safeUrl(args.campaign.cta_url)
  if (ctaUrl) {
    return { target: ctaUrl, reason: 'campaign_cta_url' }
  }
  // Campaign exists but cta_url was missing or malformed.
  const portal = safeUrl(PORTAL_FALLBACK)
  if (portal) {
    return { target: portal, reason: 'portal_fallback' }
  }
  // Should never reach here unless someone literally rewrote PORTAL_FALLBACK
  // to something unparseable — defensive belt-and-suspenders.
  return { target: FINAL_FALLBACK, reason: 'final_fallback' }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cleanedSlug = (slug ?? '').toLowerCase().trim()
  const url = new URL(request.url)
  const supabase = createAdminClient()

  // 1. Look up the campaign. When multiple years share a slug (annual events
  // keep the same `event_slug` but `event_year` rolls), prefer the latest
  // year. The Phase 14I attribution view still matches by year-from-utm_campaign,
  // so attribution accuracy survives even when this route picks the wrong year.
  //
  // Phase 14Y — wrapped with bounded() so a Supabase 522 / network hang
  // can't tie up the function past SUPABASE_CALL_TIMEOUT_MS. On timeout,
  // we treat the slug as unknown and fall through to Tier 2.
  let campaign: CampaignLookupRow | null = null
  if (cleanedSlug) {
    const result = await bounded(
      supabase
        .from('event_campaigns')
        .select('id, cta_url, event_year')
        .ilike('event_slug', cleanedSlug)
        .order('event_year', { ascending: false })
        .limit(1)
        .maybeSingle<CampaignLookupRow>(),
      SUPABASE_CALL_TIMEOUT_MS,
      'campaign lookup',
    )
    campaign = result?.data ?? null
  }

  // 2. Capture UTM tags from the request query string.
  const utm_source = url.searchParams.get('utm_source')?.toLowerCase() || null
  const utm_medium = url.searchParams.get('utm_medium') || null
  const utm_campaign = url.searchParams.get('utm_campaign') || null
  const utm_content = url.searchParams.get('utm_content') || null

  // 3. Resolve campaign_asset_id + content_calendar_id from utm_content.
  // Phase 14Y — bounded() guards this lookup the same way as the campaign
  // lookup. On timeout/failure, we keep campaign-only attribution.
  let campaign_asset_id: string | null = null
  let content_calendar_id: string | null = null
  const parsedContent = parseUtmContent(utm_content)
  if (campaign?.id && parsedContent) {
    const result = await bounded(
      supabase
        .from('campaign_assets')
        .select('id, content_calendar_id')
        .eq('campaign_id', campaign.id)
        .eq('asset_type', parsedContent.assetType)
        .limit(100),
      SUPABASE_CALL_TIMEOUT_MS,
      'asset lookup',
    )
    const candidates = result?.data ?? []
    const match = candidates.find(
      (a: AssetMatchRow) =>
        a.id.replace(/-/g, '').slice(0, 8).toLowerCase() === parsedContent.assetIdShort,
    )
    if (match) {
      campaign_asset_id = match.id
      content_calendar_id = match.content_calendar_id
    }
  }

  // 4. Decide where we're going BEFORE we log, so the audit row carries the
  // exact target+reason the visitor saw. This is the Phase 14J.2.1 hardening:
  // always producing a known-valid target even on slug_unmatched / empty_slug.
  const { target: redirect_target, reason: redirect_reason } = chooseRedirect({ cleanedSlug, campaign })

  // 5. Best-effort log to contact_events. Never blocks the redirect.
  // Phase 14Y — bounded() so a hung INSERT (e.g. Supabase paused / 522)
  // can't eat the function timeout. If the log times out, attribution
  // misses this one click but the visitor still reaches the destination.
  await bounded(
    supabase.from('contact_events').insert({
      event: 'page_view',
      contact_id: null,
      metadata: {
        source: 'branded_redirect',
        // Phase 14J.2.1 — debug fields. Routinely surfaced by the
        // diagnose-branded-redirect.js script.
        route_slug: cleanedSlug,
        redirect_target,
        redirect_reason,
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
    }),
    SUPABASE_CALL_TIMEOUT_MS,
    'click log insert',
  )

  // Verify the medium matches the convention. If a non-event_campaign hit ever
  // lands here, log it but still redirect (the slug is what determines the
  // destination, not the UTM tag).
  if (utm_medium && utm_medium !== CAMPAIGN_UTM_MEDIUM) {
    console.warn(`[branded-redirect] unexpected utm_medium=${utm_medium} on /t/${cleanedSlug}`)
  }

  // 6. Issue the redirect. Pass status as a plain number rather than a
  // ResponseInit object — `NextResponse.redirect(url, 302)` is the most
  // broadly-compatible call shape. We've already verified `redirect_target`
  // parses cleanly via `safeUrl`, so this should never throw.
  try {
    return NextResponse.redirect(new URL(redirect_target), 302)
  } catch (err) {
    // Defensive — if NextResponse.redirect somehow rejects the URL, fall back
    // to a manual Response with Location header. Final safety net so this
    // route NEVER 404s.
    console.error('[branded-redirect] NextResponse.redirect threw:', err)
    return new Response(null, {
      status: 302,
      headers: { Location: FINAL_FALLBACK },
    })
  }
}
