// Phase 14H — Event campaign attribution helpers.
//
// Reads the `event_campaign_attribution_summary` SQL view (migration 023) and
// rolls per-(campaign × asset × calendar_row) rows up to per-campaign metrics
// for the dashboard and admin API. Pure — no external service calls, no writes.
//
// Server-only: uses createAdminClient. Do not import from client components.

import { createAdminClient } from '@/lib/supabase/admin'

export interface AttributionFilters {
  campaign_id?: string
  platform?: string
  wave?: string
  min_score?: number
  /** ISO datetime — earliest event_start_date to include (inclusive). */
  date_from?: string
  /** ISO datetime — latest event_start_date to include (inclusive). */
  date_to?: string
}

export interface AttributionRow {
  campaign_id: string
  campaign_name: string
  event_name: string
  event_year: number
  destination_city: string
  destination_country: string | null
  destination_region: string | null
  categories: string[] | null
  event_start_date: string | null
  campaign_score: number | null
  campaign_status: string

  campaign_asset_id: string | null
  asset_type: string | null
  platform: string | null
  wave: string | null
  asset_status: string | null
  asset_scheduled_for: string | null

  content_calendar_id: string | null
  calendar_status: string | null
  calendar_posted_at: string | null
  calendar_week_of: string | null

  campaign_lead_count: number
  campaign_member_count: number
  campaign_first_lead_at: string | null
  campaign_latest_lead_at: string | null

  // Phase 14I — real click attribution from contact_events (migration 028).
  campaign_click_count: number
  campaign_page_view_count: number
  campaign_first_click_at: string | null
  campaign_latest_click_at: string | null
}

export interface CampaignBreakdownEntry {
  asset_count: number
  approved_count: number
  posted_count: number
}

export interface CampaignRollup {
  campaign_id: string
  campaign_name: string
  event_name: string
  event_year: number
  destination_city: string
  destination_country: string | null
  categories: string[] | null
  event_start_date: string | null
  campaign_score: number | null
  campaign_status: string

  asset_count: number
  approved_asset_count: number
  calendar_row_count: number
  posted_count: number
  latest_posted_at: string | null

  /** Distinct contacts attributed by UTM. */
  lead_count: number
  /** Distinct attributed contacts who became members. */
  member_count: number
  /** Phase 14I — count of campaign-attributed contact_events (clicks). 0 until traffic flows. */
  click_count: number
  /** Subset of click_count where event = 'page_view'. */
  page_view_count: number

  /** Null when click_count = 0. Otherwise leads / clicks in [0, 1]. */
  click_to_lead_rate: number | null
  /** Null when lead_count = 0. Otherwise members / leads in [0, 1]. */
  lead_to_conversion_rate: number | null

  /** Latest signal of activity — most recent of latest_posted_at, latest_lead_at, latest_click_at. */
  latest_activity_at: string | null
  first_lead_at: string | null
  first_click_at: string | null
  latest_click_at: string | null

  /** Composite 0-100 score. See calculateCampaignPerformanceScore for weights. */
  performance_score: number

  by_platform: Record<string, CampaignBreakdownEntry>
  by_wave: Record<string, CampaignBreakdownEntry>
}

const VIEW_COLUMNS =
  'campaign_id, campaign_name, event_name, event_year, destination_city, destination_country, destination_region, categories, event_start_date, campaign_score, campaign_status, campaign_asset_id, asset_type, platform, wave, asset_status, asset_scheduled_for, content_calendar_id, calendar_status, calendar_posted_at, calendar_week_of, campaign_lead_count, campaign_member_count, campaign_first_lead_at, campaign_latest_lead_at, campaign_click_count, campaign_page_view_count, campaign_first_click_at, campaign_latest_click_at'

/**
 * Read raw rows from `event_campaign_attribution_summary`. One row per
 * (campaign × asset × calendar_row). Filters are applied at query time.
 */
export async function getEventCampaignAttributionSummary(
  filters: AttributionFilters = {},
): Promise<AttributionRow[]> {
  const supabase = createAdminClient()
  let query = supabase.from('event_campaign_attribution_summary').select(VIEW_COLUMNS)

  if (filters.campaign_id) query = query.eq('campaign_id', filters.campaign_id)
  if (filters.platform) query = query.eq('platform', filters.platform)
  if (filters.wave) query = query.eq('wave', filters.wave)
  if (filters.min_score !== undefined) query = query.gte('campaign_score', filters.min_score)
  if (filters.date_from) query = query.gte('event_start_date', filters.date_from)
  if (filters.date_to) query = query.lte('event_start_date', filters.date_to)

  const { data, error } = await query
  if (error) {
    throw new Error(`event_campaign_attribution_summary query failed: ${error.message}`)
  }
  return (data ?? []) as AttributionRow[]
}

/**
 * Convenience for the dashboard — fetch and roll up a single campaign in one call.
 */
export async function getEventCampaignAttributionByCampaign(
  campaignId: string,
): Promise<CampaignRollup | null> {
  const rows = await getEventCampaignAttributionSummary({ campaign_id: campaignId })
  if (rows.length === 0) return null
  return rollupCampaign(rows)
}

interface PerformanceScoreInputs {
  asset_count: number
  approved_asset_count: number
  posted_count: number
  lead_count: number
  member_count: number
  campaign_score: number | null
}

/**
 * Composite 0-100 performance score for a campaign:
 *   30% — intrinsic event-fit score (Phase 14C scoring rubric, 0-100)
 *   20% — production: approved_asset_count / asset_count
 *   20% — distribution: posted / approved
 *   30% — revenue: 5 pts per lead + 25 pts per member, capped at 100
 *
 * Weights are intentionally loose — the goal is a single rough number to sort by,
 * not a forecasting model. When real lead/conversion data accumulates and we
 * understand which dimension actually correlates with revenue, retune here.
 */
export function calculateCampaignPerformanceScore(input: PerformanceScoreInputs): number {
  const fitScore = Math.max(0, Math.min(100, input.campaign_score ?? 0))
  const productionRatio =
    input.asset_count > 0 ? input.approved_asset_count / input.asset_count : 0
  const distributionRatio =
    input.approved_asset_count > 0 ? input.posted_count / input.approved_asset_count : 0
  const revenueScore = Math.min(100, input.lead_count * 5 + input.member_count * 25)

  const composite =
    0.30 * fitScore +
    0.20 * productionRatio * 100 +
    0.20 * distributionRatio * 100 +
    0.30 * revenueScore

  return Math.round(Math.max(0, Math.min(100, composite)))
}

function pickLatestIso(...candidates: Array<string | null | undefined>): string | null {
  let best: string | null = null
  for (const c of candidates) {
    if (!c) continue
    if (best === null || c > best) best = c
  }
  return best
}

interface BreakdownAccumulator {
  assets: Set<string>
  approved: Set<string>
  posted: Set<string>
}

function emptyAccumulator(): BreakdownAccumulator {
  return { assets: new Set(), approved: new Set(), posted: new Set() }
}

function freezeBreakdown(buckets: Map<string, BreakdownAccumulator>): Record<string, CampaignBreakdownEntry> {
  const out: Record<string, CampaignBreakdownEntry> = {}
  for (const [key, acc] of buckets) {
    out[key] = {
      asset_count: acc.assets.size,
      approved_count: acc.approved.size,
      posted_count: acc.posted.size,
    }
  }
  return out
}

/**
 * Aggregate the per-(asset × calendar_row) rows for a single campaign into one
 * rollup. Lead/member counts come from the row-level UTM attribution which is
 * already campaign-grain (duplicated across rows) — we read the first row and
 * trust the view's invariant.
 *
 * Distinct counting: the same campaign_asset_id can appear on multiple rows
 * (e.g. when an asset has been pushed to the calendar AND also has a sibling
 * row with content_calendar_id NULL — though our view's left-join shape makes
 * this rare). Sets de-dupe defensively.
 */
export function rollupCampaign(rows: AttributionRow[]): CampaignRollup | null {
  if (rows.length === 0) return null

  // All rows share campaign-grain columns by construction; read once.
  const head = rows[0]

  const assetIds = new Set<string>()
  const approvedAssetIds = new Set<string>()
  const calendarIds = new Set<string>()
  const postedCalendarIds = new Set<string>()
  const byPlatform = new Map<string, BreakdownAccumulator>()
  const byWave = new Map<string, BreakdownAccumulator>()
  let latestPostedAt: string | null = null

  for (const r of rows) {
    if (r.campaign_asset_id) {
      assetIds.add(r.campaign_asset_id)
      if (r.asset_status === 'approved') approvedAssetIds.add(r.campaign_asset_id)
    }
    if (r.content_calendar_id) {
      calendarIds.add(r.content_calendar_id)
      if (r.calendar_status === 'posted') postedCalendarIds.add(r.content_calendar_id)
    }
    if (r.calendar_posted_at) latestPostedAt = pickLatestIso(latestPostedAt, r.calendar_posted_at)

    if (r.platform && r.campaign_asset_id) {
      let acc = byPlatform.get(r.platform)
      if (!acc) { acc = emptyAccumulator(); byPlatform.set(r.platform, acc) }
      acc.assets.add(r.campaign_asset_id)
      if (r.asset_status === 'approved') acc.approved.add(r.campaign_asset_id)
      if (r.calendar_status === 'posted' && r.content_calendar_id) acc.posted.add(r.content_calendar_id)
    }
    if (r.wave && r.campaign_asset_id) {
      let acc = byWave.get(r.wave)
      if (!acc) { acc = emptyAccumulator(); byWave.set(r.wave, acc) }
      acc.assets.add(r.campaign_asset_id)
      if (r.asset_status === 'approved') acc.approved.add(r.campaign_asset_id)
      if (r.calendar_status === 'posted' && r.content_calendar_id) acc.posted.add(r.content_calendar_id)
    }
  }

  const lead_count = head.campaign_lead_count
  const member_count = head.campaign_member_count
  const click_count = head.campaign_click_count            // Phase 14I — real clicks now
  const page_view_count = head.campaign_page_view_count
  const click_to_lead_rate = click_count > 0 ? lead_count / click_count : null
  const lead_to_conversion_rate = lead_count > 0 ? member_count / lead_count : null
  const latest_activity_at = pickLatestIso(
    latestPostedAt,
    head.campaign_latest_lead_at,
    head.campaign_latest_click_at,
  )

  return {
    campaign_id: head.campaign_id,
    campaign_name: head.campaign_name,
    event_name: head.event_name,
    event_year: head.event_year,
    destination_city: head.destination_city,
    destination_country: head.destination_country,
    categories: head.categories,
    event_start_date: head.event_start_date,
    campaign_score: head.campaign_score,
    campaign_status: head.campaign_status,

    asset_count: assetIds.size,
    approved_asset_count: approvedAssetIds.size,
    calendar_row_count: calendarIds.size,
    posted_count: postedCalendarIds.size,
    latest_posted_at: latestPostedAt,

    lead_count,
    member_count,
    click_count,
    page_view_count,
    click_to_lead_rate,
    lead_to_conversion_rate,

    latest_activity_at,
    first_lead_at: head.campaign_first_lead_at,
    first_click_at: head.campaign_first_click_at,
    latest_click_at: head.campaign_latest_click_at,

    performance_score: calculateCampaignPerformanceScore({
      asset_count: assetIds.size,
      approved_asset_count: approvedAssetIds.size,
      posted_count: postedCalendarIds.size,
      lead_count,
      member_count,
      campaign_score: head.campaign_score,
    }),

    by_platform: freezeBreakdown(byPlatform),
    by_wave: freezeBreakdown(byWave),
  }
}
