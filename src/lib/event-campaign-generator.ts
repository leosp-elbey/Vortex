// Event campaign generator — Phase 14C.
// Reads src/lib/event-seeds.json, computes the next-year occurrence of each
// recurring event, scores it via event-campaign-scoring.ts, then upserts a row
// into event_campaigns and writes a fresh campaign_scores row.
//
// Design notes:
//  - This module never publishes content. status defaults to 'idea' and
//    requires_human_approval defaults to TRUE per VORTEX_EVENT_CAMPAIGN_SKILL.md §7.
//  - Duplicate prevention key is (lower(event_name), event_year, lower(destination_city))
//    — the SQL schema does not enforce a unique constraint here, so we look up
//    existing rows in app code and update them instead of inserting twice.
//  - This module is server-only. Do not import from client components.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  scoreEventCampaign,
  type ScoringInputs,
  type ScoringResult,
} from '@/lib/event-campaign-scoring'
import { slugifyEventName } from '@/lib/campaign-tracking-url'
import seedFile from '@/lib/event-seeds.json'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

interface SeedEvent {
  slug: string
  campaign_name: string
  event_name: string
  destination_city: string
  destination_country?: string | null
  destination_region?: string | null
  categories: string[]
  audience: string[]
  event_month: number
  event_day: number
  event_duration_days: number
  lead_window_days: number
  repeats_yearly: boolean
  static_year?: number
  is_cruise: boolean
  departure_city?: string | null
  cruise_line?: string | null
  hotel_angle?: string | null
  cruise_angle?: string | null
  flight_angle?: string | null
  group_travel_angle?: string | null
  lead_magnet_idea?: string | null
  landing_page_headline?: string | null
  cta_text?: string | null
  cta_url?: string | null
  scoring_inputs: ScoringInputs
}

interface SeedFile {
  version: string
  generated_at: string
  notes?: string
  events: SeedEvent[]
}

export interface RunOptions {
  /** Cap how many seeds get processed in one run. Phase 14C default = 8. */
  limit?: number
  /** Override "now" for deterministic testing. Defaults to new Date(). */
  now?: Date
}

export interface RunResult {
  ok: boolean
  processed: number
  inserted: number
  updated: number
  skipped: number
  errors: Array<{ slug: string; message: string }>
  scores: Array<{ slug: string; campaign_id: string; score: number }>
}

const TRACKING_URL_TEMPLATE =
  '?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event_slug}_{year}_{wave}'

// JSON-imported literal types don't structurally match our union types
// (e.g. Tri = 'low'|'medium'|'high'), so widen via unknown.
const seeds = seedFile as unknown as SeedFile

/**
 * Compute the next-future occurrence year for a recurring event.
 * If the event already passed in `now.getUTCFullYear()`, roll to next year.
 * One-off events with `static_year` always return that year.
 */
export function computeNextOccurrence(
  seed: SeedEvent,
  now: Date,
): { startDate: Date; endDate: Date; year: number } {
  if (!seed.repeats_yearly && seed.static_year) {
    const start = new Date(Date.UTC(seed.static_year, seed.event_month - 1, seed.event_day))
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + Math.max(seed.event_duration_days - 1, 0))
    return { startDate: start, endDate: end, year: seed.static_year }
  }

  const thisYear = now.getUTCFullYear()
  let candidate = new Date(Date.UTC(thisYear, seed.event_month - 1, seed.event_day))
  if (candidate.getTime() < now.getTime()) {
    candidate = new Date(Date.UTC(thisYear + 1, seed.event_month - 1, seed.event_day))
  }
  const end = new Date(candidate)
  end.setUTCDate(end.getUTCDate() + Math.max(seed.event_duration_days - 1, 0))
  return { startDate: candidate, endDate: end, year: candidate.getUTCFullYear() }
}

function computeTravelWindow(startDate: Date, leadWindowDays: number): { from: Date; to: Date } {
  const from = new Date(startDate)
  from.setUTCDate(from.getUTCDate() - leadWindowDays)
  const to = new Date(startDate)
  return { from, to }
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function weekOfDate(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayOfWeek = d.getUTCDay() // 0 = Sun
  const offsetToMonday = (dayOfWeek + 6) % 7
  d.setUTCDate(d.getUTCDate() - offsetToMonday)
  return isoDate(d)
}

/**
 * Look up an existing event_campaigns row by (event_name + event_year + destination_city).
 * Comparison is case-insensitive on text fields. Returns the row id if found.
 */
async function findExisting(
  supabase: SupabaseAdmin,
  seed: SeedEvent,
  year: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('event_campaigns')
    .select('id')
    .ilike('event_name', seed.event_name)
    .eq('event_year', year)
    .ilike('destination_city', seed.destination_city)
    .maybeSingle()
  if (error) throw new Error(`event_campaigns lookup failed: ${error.message}`)
  return data?.id ?? null
}

interface UpsertPayload {
  campaign_name: string
  event_name: string
  event_year: number
  event_slug: string
  destination_city: string
  destination_country: string | null
  destination_region: string | null
  categories: string[]
  audience: string[]
  event_start_date: string
  event_end_date: string
  travel_window_start: string
  travel_window_end: string
  score: number
  score_updated_at: string
  status: 'idea'
  is_cruise: boolean
  departure_city: string | null
  cruise_line: string | null
  hotel_angle: string | null
  cruise_angle: string | null
  flight_angle: string | null
  group_travel_angle: string | null
  lead_magnet_idea: string | null
  landing_page_headline: string | null
  cta_text: string | null
  cta_url: string | null
  tracking_url_template: string
  repeats_yearly: boolean
  requires_human_approval: true
  generation_metadata: Record<string, unknown>
}

function buildUpsertPayload(
  seed: SeedEvent,
  occurrence: { startDate: Date; endDate: Date; year: number },
  scoring: ScoringResult,
  now: Date,
): UpsertPayload {
  const window = computeTravelWindow(occurrence.startDate, seed.lead_window_days)
  // Phase 14H.2 — prefer the seed's pre-baked slug when present, otherwise derive
  // it from event_name. Both paths use the same slug rule (`slugifyEventName`),
  // so the result is byte-identical to what the SQL backfill in migration 025
  // produced for legacy rows. The seed file is the canonical source of truth
  // for slugs, so seed.slug wins over the derived fallback.
  const resolvedSlug = (seed.slug && seed.slug.trim()) || slugifyEventName(seed.event_name)
  return {
    campaign_name: `${seed.campaign_name} ${occurrence.year}`,
    event_name: seed.event_name,
    event_year: occurrence.year,
    event_slug: resolvedSlug,
    destination_city: seed.destination_city,
    destination_country: seed.destination_country ?? null,
    destination_region: seed.destination_region ?? null,
    categories: seed.categories,
    audience: seed.audience,
    event_start_date: isoDate(occurrence.startDate),
    event_end_date: isoDate(occurrence.endDate),
    travel_window_start: isoDate(window.from),
    travel_window_end: isoDate(window.to),
    score: scoring.score,
    score_updated_at: now.toISOString(),
    status: 'idea',
    is_cruise: seed.is_cruise,
    departure_city: seed.departure_city ?? null,
    cruise_line: seed.cruise_line ?? null,
    hotel_angle: seed.hotel_angle ?? null,
    cruise_angle: seed.cruise_angle ?? null,
    flight_angle: seed.flight_angle ?? null,
    group_travel_angle: seed.group_travel_angle ?? null,
    lead_magnet_idea: seed.lead_magnet_idea ?? null,
    landing_page_headline: seed.landing_page_headline ?? null,
    cta_text: seed.cta_text ?? null,
    cta_url: seed.cta_url ?? null,
    tracking_url_template: TRACKING_URL_TEMPLATE,
    repeats_yearly: seed.repeats_yearly,
    requires_human_approval: true,
    generation_metadata: {
      source: 'event-seeds.json',
      seed_slug: seed.slug,
      seed_version: seeds.version,
      generated_at: now.toISOString(),
    },
  }
}

/**
 * Process a single seed: compute occurrence, score, upsert event_campaigns,
 * insert a campaign_scores row.
 *
 * Returns the same campaign_id on update or insert paths so callers can chain.
 * Throws on database errors so the outer runner can record the per-seed failure
 * without aborting the whole batch.
 */
async function processSeed(
  supabase: SupabaseAdmin,
  seed: SeedEvent,
  now: Date,
): Promise<{ action: 'inserted' | 'updated'; campaign_id: string; score: number }> {
  const occurrence = computeNextOccurrence(seed, now)
  const daysUntilEvent = Math.max(daysBetween(now, occurrence.startDate), 0)
  const scoring = scoreEventCampaign(seed.scoring_inputs, { daysUntilEvent })
  const payload = buildUpsertPayload(seed, occurrence, scoring, now)

  const existingId = await findExisting(supabase, seed, occurrence.year)

  let campaignId: string
  let action: 'inserted' | 'updated'

  if (existingId) {
    // Phase 14H.2 — never overwrite an existing event_slug on the update path.
    // The slug is the stable anchor for historical UTM attribution; a re-run of
    // the seed cron should re-score and refresh angles, but must leave the slug
    // chosen at insert time untouched. Backfill happens in a separate, narrower
    // update below.
    const { event_slug: _slugFromPayload, ...updatePayloadWithoutSlug } = payload
    void _slugFromPayload
    const { error: updateError } = await supabase
      .from('event_campaigns')
      .update(updatePayloadWithoutSlug)
      .eq('id', existingId)
    if (updateError) throw new Error(`event_campaigns update failed: ${updateError.message}`)

    // Backfill event_slug only when the existing row's slug is currently NULL.
    // .is('event_slug', null) makes this a no-op against rows that already have
    // a slug (whether from the migration-025 backfill, a prior insert, or an
    // operator edit), so re-running the cron is safe.
    if (payload.event_slug) {
      const { error: backfillErr } = await supabase
        .from('event_campaigns')
        .update({ event_slug: payload.event_slug })
        .eq('id', existingId)
        .is('event_slug', null)
      if (backfillErr) {
        // Soft failure — the main update already succeeded, and the missing slug
        // can be repaired on the next cron tick. Log and continue.
        console.error('[event-campaign-generator] event_slug backfill skipped:', backfillErr.message)
      }
    }

    campaignId = existingId
    action = 'updated'
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('event_campaigns')
      .insert(payload)
      .select('id')
      .single()
    if (insertError) throw new Error(`event_campaigns insert failed: ${insertError.message}`)
    if (!inserted?.id) throw new Error('event_campaigns insert returned no id')
    campaignId = inserted.id
    action = 'inserted'
  }

  const { error: scoreError } = await supabase.from('campaign_scores').insert({
    campaign_id: campaignId,
    week_of: weekOfDate(now),
    score: scoring.score,
    breakdown: scoring.breakdown,
    generated_by: 'cron',
    notes: `seed=${seed.slug} days_until_event=${daysUntilEvent}`,
  })
  if (scoreError) throw new Error(`campaign_scores insert failed: ${scoreError.message}`)

  return { action, campaign_id: campaignId, score: scoring.score }
}

/**
 * Run the seed-driven research/scoring pass.
 * Defaults to processing the first 8 seeds per call so a single cron tick
 * stays well inside Vercel Hobby's 10-second function timeout.
 */
export async function runEventCampaignResearch(options: RunOptions = {}): Promise<RunResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 8, seeds.events.length))
  const now = options.now ?? new Date()
  const supabase = createAdminClient()

  const result: RunResult = {
    ok: true,
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    scores: [],
  }

  // Round-robin which seeds run this week so the engine eventually covers all of them.
  // Anchor: ISO week number × limit modulo seed length.
  const weekIndex = Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / (7 * 86_400_000))
  const start = ((weekIndex * limit) % seeds.events.length + seeds.events.length) % seeds.events.length

  for (let i = 0; i < limit; i++) {
    const seed = seeds.events[(start + i) % seeds.events.length]
    result.processed += 1
    try {
      const outcome = await processSeed(supabase, seed, now)
      if (outcome.action === 'inserted') result.inserted += 1
      else result.updated += 1
      result.scores.push({ slug: seed.slug, campaign_id: outcome.campaign_id, score: outcome.score })
    } catch (err) {
      result.errors.push({
        slug: seed.slug,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  result.ok = result.errors.length === 0
  return result
}

export const SEED_COUNT = seeds.events.length
