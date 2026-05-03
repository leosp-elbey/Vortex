// Phase 14F — Push an approved campaign_asset into the existing content_calendar.
// POST /api/admin/campaigns/assets/[assetId]/push-to-calendar
// Admin-only. Idempotent. Never auto-posts.
//
// Behavior:
//   - Only assets with status='approved' may be pushed.
//   - Asset must be linkable to content_calendar today: asset_type='social_post' AND
//     platform IN ('instagram','facebook','tiktok','twitter') (the four values
//     content_calendar.platform CHECK currently allows — migration 004).
//   - The new content_calendar row lands as status='draft' (never 'posted').
//     Operators flip it to 'approved' on the existing /dashboard/content surface
//     when they're ready for the per-platform poster routes to publish it.
//   - Idempotency:
//       * If campaign_assets.content_calendar_id is already set, look that row up and
//         return it as { ok:true, already_pushed:true }.
//       * Otherwise check for an existing content_calendar row by campaign_asset_id
//         (belt-and-suspenders for the case where a previous push inserted but failed
//         to update campaign_assets.content_calendar_id). If found, return it.
//       * If neither, INSERT a new content_calendar row, then UPDATE
//         campaign_assets.content_calendar_id to link it. The partial unique index
//         from migration 022 backstops a race-window double-insert.
//
// Out of scope for this phase:
//   - email_subject / email_body / dm_reply / hashtag_set / landing_headline /
//     lead_magnet — content_calendar.platform CHECK does not accept the platforms
//     these assets carry ('email','sms','web', or NULL). The route returns a
//     specific 400 with the project-stipulated message rather than fabricating
//     a row that would break existing posters.
//   - image_prompt / video_prompt — handled in a future media-generation phase.
//
// Phase 14H.1 additions (tracking URL materialization):
//   - On every new insert, the route resolves the placeholder tracking template
//     using `buildCampaignTrackingUrl` and writes the result to both
//     `content_calendar.tracking_url` (always) and `campaign_assets.tracking_url`
//     (only when currently NULL — never overwrites an operator-set value).
//   - Every response (new push, partial-success, both idempotency-cached returns)
//     surfaces `tracking_url` at the top level so the dashboard can capture it
//     for the "Tracking URL ready" affordance without re-querying.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import { buildCampaignTrackingUrl } from '@/lib/campaign-tracking-url'

export const dynamic = 'force-dynamic'

const CALENDAR_PLATFORMS = new Set(['instagram', 'facebook', 'tiktok', 'twitter'])

// Asset types the route accepts AT ALL. Anything outside this set returns 400 with
// "asset type not supported" before any further validation runs. Today only
// social_post is push-able because content_calendar can only represent the four
// platform strings above. Expanding this list requires a content_calendar schema
// change first (separate phase).
const SUPPORTED_ASSET_TYPES = new Set(['social_post'])

const RequestSchema = z.object({
  scheduled_for: z.string().datetime({ offset: true }).optional(),
  platform: z.string().trim().min(1).max(40).optional(),
})

interface AssetRow {
  id: string
  asset_type: string
  platform: string | null
  wave: string | null
  body: string | null
  hashtags: string[] | null
  status: string
  scheduled_for: string | null
  content_calendar_id: string | null
  tracking_url: string | null
  campaign_id: string
}

interface CalendarRow {
  id: string
  week_of: string
  platform: string
  caption: string
  hashtags: string[] | null
  image_prompt: string | null
  status: string
  posted_at: string | null
  campaign_asset_id: string | null
  tracking_url: string | null
  created_at: string
}

interface CampaignCtaRow {
  id: string
  event_name: string
  event_year: number
  cta_url: string | null
}

const ASSET_SELECT =
  'id, asset_type, platform, wave, body, hashtags, status, scheduled_for, content_calendar_id, tracking_url, campaign_id'
const CALENDAR_SELECT =
  'id, week_of, platform, caption, hashtags, image_prompt, status, posted_at, campaign_asset_id, tracking_url, created_at'

/** Monday (UTC) of the week containing the given date. content_calendar.week_of is a DATE column. */
function mondayOfWeekUTC(input: Date): string {
  const d = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
  const dow = d.getUTCDay() // 0=Sun, 1=Mon, ... 6=Sat
  const daysBack = (dow + 6) % 7 // distance to previous Monday (Mon=0, Tue=1, ..., Sun=6)
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString().split('T')[0]
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { assetId } = await params
  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 })

  const rawBody = await request.json().catch(() => ({}))
  const parsed = RequestSchema.safeParse(rawBody ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  // 1. Load the asset.
  const { data: asset, error: lookupErr } = await auth.admin
    .from('campaign_assets')
    .select(ASSET_SELECT)
    .eq('id', assetId)
    .maybeSingle<AssetRow>()

  if (lookupErr) {
    return NextResponse.json({ error: `Asset lookup failed: ${lookupErr.message}` }, { status: 500 })
  }
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  }

  // 2. Only approved assets may be pushed.
  if (asset.status !== 'approved') {
    return NextResponse.json(
      { error: `Cannot push asset in status '${asset.status}'. Only 'approved' assets are pushable.` },
      { status: 400 },
    )
  }

  // 3. Asset type must be supported by the current content_calendar shape.
  if (!SUPPORTED_ASSET_TYPES.has(asset.asset_type)) {
    return NextResponse.json(
      {
        error: 'This asset type is not yet supported for calendar push.',
        asset_type: asset.asset_type,
        supported_asset_types: [...SUPPORTED_ASSET_TYPES],
      },
      { status: 400 },
    )
  }

  // 4. Idempotency check #1: forward link already set on the asset.
  if (asset.content_calendar_id) {
    const { data: existing, error: existingErr } = await auth.admin
      .from('content_calendar')
      .select(CALENDAR_SELECT)
      .eq('id', asset.content_calendar_id)
      .maybeSingle<CalendarRow>()
    if (existingErr) {
      return NextResponse.json({ error: `Existing calendar row lookup failed: ${existingErr.message}` }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({
        ok: true,
        already_pushed: true,
        content_calendar: existing,
        tracking_url: existing.tracking_url,
      })
    }
    // Forward link points at a row that no longer exists — fall through and re-create.
    // The asset.content_calendar_id will get overwritten in step 9 below.
  }

  // 5. Idempotency check #2: belt-and-suspenders against a back-link that was inserted
  // but never wrote back to campaign_assets.content_calendar_id.
  const { data: backLink, error: backLinkErr } = await auth.admin
    .from('content_calendar')
    .select(CALENDAR_SELECT)
    .eq('campaign_asset_id', assetId)
    .maybeSingle<CalendarRow>()
  if (backLinkErr) {
    return NextResponse.json({ error: `Back-link lookup failed: ${backLinkErr.message}` }, { status: 500 })
  }
  if (backLink) {
    // Repair the forward link so the next click hits idempotency check #1 cheaply.
    await auth.admin
      .from('campaign_assets')
      .update({ content_calendar_id: backLink.id })
      .eq('id', assetId)
      .eq('status', 'approved')
    return NextResponse.json({
      ok: true,
      already_pushed: true,
      content_calendar: backLink,
      tracking_url: backLink.tracking_url,
    })
  }

  // 6. Validate platform — overrides win, but must still be in the calendar's allowlist.
  const platformOverride = parsed.data.platform?.toLowerCase().trim()
  const targetPlatform = (platformOverride ?? asset.platform ?? '').toLowerCase()
  if (!targetPlatform) {
    return NextResponse.json(
      { error: `Asset has no platform and no override was provided. content_calendar.platform is NOT NULL.` },
      { status: 400 },
    )
  }
  if (!CALENDAR_PLATFORMS.has(targetPlatform)) {
    return NextResponse.json(
      {
        error: `Platform '${targetPlatform}' is not supported by content_calendar.`,
        supported_platforms: [...CALENDAR_PLATFORMS],
      },
      { status: 400 },
    )
  }

  // 7. Validate body — content_calendar.caption is NOT NULL.
  const caption = (asset.body ?? '').trim()
  if (!caption) {
    return NextResponse.json(
      { error: 'Asset has no body to use as caption. Cannot push to calendar.' },
      { status: 400 },
    )
  }

  // 7b. Phase 14H.1 — load parent campaign for tracking-URL resolution. Done after the
  // cheap validations + idempotency checks so we never fetch on a request we'll reject.
  const { data: campaign, error: campaignErr } = await auth.admin
    .from('event_campaigns')
    .select('id, event_name, event_year, cta_url')
    .eq('id', asset.campaign_id)
    .maybeSingle<CampaignCtaRow>()
  if (campaignErr) {
    return NextResponse.json({ error: `Parent campaign lookup failed: ${campaignErr.message}` }, { status: 500 })
  }
  if (!campaign) {
    return NextResponse.json({ error: 'Parent campaign not found' }, { status: 404 })
  }

  const trackingUrl = buildCampaignTrackingUrl({
    baseUrl: campaign.cta_url,
    platform: targetPlatform,
    eventName: campaign.event_name,
    eventYear: campaign.event_year,
    wave: asset.wave,
    assetType: asset.asset_type,
    assetId: asset.id,
  })

  // 8. Build the calendar row.
  const now = new Date()
  const scheduledOverride = parsed.data.scheduled_for ? new Date(parsed.data.scheduled_for) : null
  const assetScheduled = asset.scheduled_for ? new Date(asset.scheduled_for) : null
  const anchor =
    (scheduledOverride && !Number.isNaN(scheduledOverride.getTime()) ? scheduledOverride : null) ??
    (assetScheduled && !Number.isNaN(assetScheduled.getTime()) ? assetScheduled : null) ??
    now
  const weekOf = mondayOfWeekUTC(anchor)

  // content_calendar enum is 'draft' | 'approved' | 'posted' | 'rejected'. We never insert
  // 'posted' — that is the job of the per-platform poster routes after a separate human
  // approval flips status to 'approved' on /dashboard/content. There is no 'scheduled'
  // status on this table; 'draft' is the safest landing slot for Phase 14F.
  const calendarPayload = {
    week_of: weekOf,
    platform: targetPlatform,
    caption,
    hashtags: asset.hashtags ?? [],
    image_prompt: null as string | null,
    status: 'draft' as const,
    campaign_asset_id: assetId,
    tracking_url: trackingUrl,
  }

  // 9. Insert. The partial unique index on campaign_asset_id (migration 022) catches a
  // race-window double-insert and returns Postgres error code 23505. We re-query and
  // return the winning row instead of erroring back to the operator.
  const { data: inserted, error: insertErr } = await auth.admin
    .from('content_calendar')
    .insert(calendarPayload)
    .select(CALENDAR_SELECT)
    .maybeSingle<CalendarRow>()

  if (insertErr) {
    if (insertErr.code === '23505') {
      const { data: winner } = await auth.admin
        .from('content_calendar')
        .select(CALENDAR_SELECT)
        .eq('campaign_asset_id', assetId)
        .maybeSingle<CalendarRow>()
      if (winner) {
        await auth.admin
          .from('campaign_assets')
          .update({ content_calendar_id: winner.id })
          .eq('id', assetId)
          .eq('status', 'approved')
        return NextResponse.json({
          ok: true,
          already_pushed: true,
          content_calendar: winner,
          tracking_url: winner.tracking_url,
        })
      }
    }
    return NextResponse.json({ error: `content_calendar insert failed: ${insertErr.message}` }, { status: 500 })
  }
  if (!inserted) {
    return NextResponse.json({ error: 'content_calendar insert returned no row' }, { status: 500 })
  }

  // 10. Update the forward link on the asset. Optimistic guard so we never flip
  // an asset that was concurrently moved to a non-approved state.
  // Phase 14H.1: also back-fill campaign_assets.tracking_url when it is currently
  // NULL. Operator-set tracking_urls are preserved (the .is(...) clause skips them).
  const linkUpdate: { content_calendar_id: string; tracking_url?: string } = {
    content_calendar_id: inserted.id,
  }
  if (asset.tracking_url === null) linkUpdate.tracking_url = trackingUrl

  const { error: linkErr } = await auth.admin
    .from('campaign_assets')
    .update(linkUpdate)
    .eq('id', assetId)
    .eq('status', 'approved')

  if (linkErr) {
    // The calendar row exists; the forward link failed. Surface the error but do not
    // delete the calendar row — idempotency check #2 will recover the link on the next click.
    return NextResponse.json(
      {
        ok: true,
        partial: true,
        content_calendar: inserted,
        tracking_url: inserted.tracking_url,
        warning: `Calendar row created but forward link failed: ${linkErr.message}. Re-click Push to Calendar to repair the link.`,
      },
      { status: 200 },
    )
  }

  return NextResponse.json({
    ok: true,
    already_pushed: false,
    content_calendar: inserted,
    tracking_url: inserted.tracking_url,
  })
}
