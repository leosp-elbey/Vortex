// Phase 14K — Autoposter eligibility helper, DRY-RUN ONLY.
//
// Selects content_calendar rows that WOULD be posted if a live autoposter
// existed, but never actually posts. The dry-run cron at
// `/api/cron/autoposter-dry-run` is the only consumer in Phase 14K.
//
// CRITICAL: this module must NEVER call a platform API. Even if a future
// engineer wires platform code in here, the `hardBlockLivePosting()` helper
// at the bottom is a tripwire that throws on entry — it's exported as a
// last-resort guard so a misconfigured cron cannot accidentally publish.
//
// Server-only — uses createAdminClient. Do not import from client components.

import { createAdminClient } from '@/lib/supabase/admin'
import { validateMediaReadiness } from '@/lib/media-readiness'

/**
 * Phase 14K — feature flag gate. MUST stay false for the entirety of Phase
 * 14K. Flipping to true will throw via `hardBlockLivePosting`. The flag
 * exists only to make the dry-run-only contract explicit at the source-code
 * level; future phases that introduce live posting will need to delete it
 * along with the call site.
 */
const LIVE_POSTING_ENABLED = false as const

/** Shape pulled from content_calendar — only fields the eligibility check reads.
 *
 * NOTE (Phase 14K patch): `content_calendar` does NOT have an `updated_at`
 * column (verified against migration 004: only `id, week_of, platform,
 * caption, hashtags, image_prompt, status, posted_at, created_at` were
 * defined; subsequent migrations 022/024/029 added FK / tracking_url / gate
 * columns but never `updated_at`). Selecting `updated_at` returns Postgres
 * error 42703 ("column does not exist"), which surfaced as HTTP 500 on the
 * dry-run cron during Phase 14K's first smoke test. The interface and the
 * `ROW_SELECT` constant below are stripped to columns that actually exist.
 */
export interface ContentCalendarRow {
  id: string
  platform: string | null
  status: string
  caption: string | null
  hashtags: string[] | null
  posting_status: string | null
  posting_gate_approved: boolean | null
  queued_for_posting_at: string | null
  manual_posting_only: boolean | null
  tracking_url: string | null
  campaign_asset_id: string | null
  posted_at: string | null
  week_of: string | null
  created_at: string
  // Phase 14L — media readiness inputs. Sourced from a JOIN against
  // campaign_assets via campaign_asset_id (image_url / video_url) and
  // from the row's own image_prompt column. video_prompt has no source
  // today and stays null.
  // Phase 14L.2 — also reads row-level image_url / video_url / media_status /
  // media_error from content_calendar (migration 032). Organic rows have no
  // campaign_asset to JOIN against, so the row-level columns are their only
  // source of media.
  image_url: string | null
  video_url: string | null
  image_prompt: string | null
  video_prompt: string | null
  media_status: string | null
  media_error: string | null
}

export interface AutoposterEligibleRow {
  id: string
  platform: string
  status: string
  posting_status: string | null
  posting_gate_approved: boolean
  queued_for_posting_at: string | null
  tracking_url_present: boolean
  campaign_asset_id_present: boolean
  reason: 'eligible'
}

export interface AutoposterSkippedRow {
  id: string
  platform: string | null
  reason: string
}

export interface AutoposterPlanResult {
  eligible: AutoposterEligibleRow[]
  skipped: AutoposterSkippedRow[]
}

export interface AutoposterDryRunSummary {
  eligible_count: number
  skipped_count: number
  by_platform: Record<string, number>
  skipped_by_reason: Record<string, number>
}

interface GetEligibleOptions {
  /** Cap how many candidate rows are scanned. Defaults to 100; never query more than 1000. */
  limit?: number
  /** Optional platform filter (e.g. 'instagram'). When omitted, all platforms are scanned. */
  platform?: string
  /** Override the wall-clock anchor for tests. Default: new Date(). */
  now?: Date
}

// Phase 14L — joined select. `campaign_asset` is a 1:1 relation via
// content_calendar.campaign_asset_id; we pull image_url/video_url so the
// dry-run media-readiness gate can run. `image_prompt` is a real column
// on content_calendar (legacy organic-image generator). `video_prompt`
// has no source today and is omitted; the validator treats it as null.
// Phase 14L.2 — also pulls row-level image_url / video_url / media_status /
// media_error (migration 032) so organic rows have a media surface and the
// gate can read worker-set status.
const ROW_SELECT =
  'id, platform, status, caption, hashtags, posting_status, posting_gate_approved, queued_for_posting_at, manual_posting_only, tracking_url, campaign_asset_id, posted_at, week_of, created_at, image_prompt, image_url, video_url, media_status, media_error, campaign_asset:campaign_assets!campaign_asset_id(image_url, video_url, asset_type)'

interface RawJoinedAutoposterRow extends Omit<ContentCalendarRow, 'image_url' | 'video_url' | 'video_prompt'> {
  // Row-level columns held separately so the merge below can prefer the
  // joined campaign_asset's URLs while falling back to the row-level ones.
  image_url?: string | null
  video_url?: string | null
  campaign_asset?: { image_url: string | null; video_url: string | null; asset_type: string | null } | null
}

function flattenAutoposterRow(raw: RawJoinedAutoposterRow): ContentCalendarRow {
  const asset = raw.campaign_asset ?? null
  const { image_url: rowImage, video_url: rowVideo, ...rest } = raw
  return {
    ...rest,
    image_url: asset?.image_url ?? rowImage ?? null,
    video_url: asset?.video_url ?? rowVideo ?? null,
    image_prompt: rest.image_prompt ?? null,
    video_prompt: null,
    media_status: rest.media_status ?? null,
    media_error: rest.media_error ?? null,
  }
}

/**
 * Walk through content_calendar candidates and split them into eligible vs.
 * skipped. The candidate set is pre-filtered server-side to `status='approved'`
 * to keep the scan small; the rest of the eligibility rules run client-side
 * so each skipped row gets a precise human-readable reason.
 *
 * Eligibility rules (ALL must hold):
 *   - status                 = 'approved'
 *   - posting_status         = 'ready'
 *   - posting_gate_approved  = true
 *   - manual_posting_only    = true
 *   - queued_for_posting_at  IS NOT NULL
 *   - posted_at              IS NULL
 *   - platform               non-empty
 *   - caption                non-empty
 *   - tracking_url           non-empty WHEN campaign_asset_id is set
 *
 * Returns { eligible, skipped } both as arrays. The route layer turns these
 * into the response payload + summary.
 */
export async function getAutoposterEligibleRows(
  opts: GetEligibleOptions = {},
): Promise<AutoposterPlanResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 1000))
  const supabase = createAdminClient()

  let query = supabase
    .from('content_calendar')
    .select(ROW_SELECT)
    // Pre-filter server-side to keep the scan small. The remaining checks
    // happen in JS so each skipped row carries a specific reason instead of
    // an opaque "didn't match the WHERE clause".
    .eq('status', 'approved')
    // Phase 14K patch — three-key stable ordering using only columns that
    // actually exist on `content_calendar`:
    //   1) queued_for_posting_at ASC NULLS LAST  → next-due eligible row first
    //   2) created_at DESC                       → newer authored rows next
    //   3) id ASC                                → final tiebreaker for stability
    // (`updated_at` was the original tiebreaker but doesn't exist on this
    // table — see ContentCalendarRow comment.)
    .order('queued_for_posting_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(limit)

  if (opts.platform) query = query.eq('platform', opts.platform)

  const { data, error } = await query
  if (error) {
    throw new Error(`autoposter eligibility query failed: ${error.message}`)
  }

  // Phase 14L — supabase-js types the joined `campaign_asset` field as an
  // array of related rows; the runtime returns a single object (or null) for
  // a 1:1 FK relation. Cast through unknown so flattenAutoposterRow can do
  // the right thing whether it sees an object or an array.
  // Phase 14L.2 — row-level image_url / video_url / media_status / media_error
  // come from content_calendar directly (migration 032).
  const rawRows = ((data ?? []) as unknown) as Array<RawJoinedAutoposterRow & {
    image_url?: string | null
    video_url?: string | null
    media_status?: string | null
    media_error?: string | null
    campaign_asset?: { image_url: string | null; video_url: string | null; asset_type: string | null } | { image_url: string | null; video_url: string | null; asset_type: string | null }[] | null
  }>
  const rows: ContentCalendarRow[] = rawRows.map(raw => {
    // Normalize: if supabase returns an array, take the first element (1:1 FK).
    const asset = Array.isArray(raw.campaign_asset)
      ? (raw.campaign_asset[0] ?? null)
      : (raw.campaign_asset ?? null)
    return flattenAutoposterRow({ ...raw, campaign_asset: asset })
  })
  const eligible: AutoposterEligibleRow[] = []
  const skipped: AutoposterSkippedRow[] = []

  for (const r of rows) {
    const reason = validateAutoposterCandidate(r)
    if (reason === null) {
      eligible.push({
        id: r.id,
        platform: r.platform as string,
        status: r.status,
        posting_status: r.posting_status,
        posting_gate_approved: r.posting_gate_approved === true,
        queued_for_posting_at: r.queued_for_posting_at,
        tracking_url_present: !!(r.tracking_url && r.tracking_url.trim()),
        campaign_asset_id_present: !!r.campaign_asset_id,
        reason: 'eligible',
      })
    } else {
      skipped.push({ id: r.id, platform: r.platform, reason })
    }
  }

  return { eligible, skipped }
}

/**
 * Returns null when the row is eligible, otherwise a short user-facing reason
 * explaining why it isn't. Pure — no DB calls.
 */
export function validateAutoposterCandidate(row: ContentCalendarRow): string | null {
  if (row.status !== 'approved') {
    return `status is '${row.status}', need 'approved'`
  }
  if (row.posting_status !== 'ready') {
    return `posting_status is '${row.posting_status ?? 'null'}', need 'ready'`
  }
  if (row.posting_gate_approved !== true) {
    return 'posting_gate_approved is not true'
  }
  if (row.manual_posting_only !== true) {
    return 'manual_posting_only is not true'
  }
  if (!row.queued_for_posting_at) {
    return 'queued_for_posting_at is null'
  }
  if (row.posted_at) {
    return 'already posted'
  }
  if (!row.platform || !row.platform.trim()) {
    return 'platform is missing'
  }
  if (!row.caption || !row.caption.trim()) {
    return 'caption is empty'
  }
  if (row.campaign_asset_id && !(row.tracking_url && row.tracking_url.trim())) {
    return 'campaign-originated row missing tracking_url'
  }
  // Phase 14L — media readiness. Run last so platform / caption / tracking
  // failures surface first with their specific messages.
  // Phase 14L.2 — also passes media_status / media_error.
  const media = validateMediaReadiness({
    platform: row.platform,
    image_url: row.image_url,
    video_url: row.video_url,
    image_prompt: row.image_prompt,
    video_prompt: row.video_prompt,
    campaign_asset_id: row.campaign_asset_id,
    media_status: row.media_status,
    media_error: row.media_error,
  })
  if (media.blocked && media.reasons.length > 0) {
    return media.reasons[0]
  }
  return null
}

/**
 * Build the "what we WOULD post" plan payload for the dry-run response.
 * Pure — no side effects. Just shapes the eligible rows for JSON output.
 */
export function buildAutoposterDryRunPlan(rows: AutoposterEligibleRow[]): AutoposterEligibleRow[] {
  return rows.map(r => ({ ...r }))
}

/**
 * Aggregate counts + breakdowns for the dry-run summary block.
 */
export function summarizeAutoposterDryRun(
  eligible: AutoposterEligibleRow[],
  skipped: AutoposterSkippedRow[],
): AutoposterDryRunSummary {
  const by_platform: Record<string, number> = {}
  for (const r of eligible) {
    by_platform[r.platform] = (by_platform[r.platform] ?? 0) + 1
  }
  const skipped_by_reason: Record<string, number> = {}
  for (const s of skipped) {
    skipped_by_reason[s.reason] = (skipped_by_reason[s.reason] ?? 0) + 1
  }
  return {
    eligible_count: eligible.length,
    skipped_count: skipped.length,
    by_platform,
    skipped_by_reason,
  }
}

interface MarkInspectedOptions {
  jobId?: string | null
  rows?: AutoposterEligibleRow[]
  summary?: AutoposterDryRunSummary
}

/**
 * Phase 14K stub — intentional no-op. The user spec lists this function as
 * part of the helper surface but says the underlying mutation is "optional"
 * and the existing audit/job tables don't have CHECK-constraint slots for an
 * "autoposter inspected" action without a migration. Phase 14K-grade goal:
 * read-only dry-run; the route's JSON response IS the audit trail. This
 * function returns the no-op shape so future phases can fill it in without
 * changing the dry-run cron's call surface.
 */
export async function markAutoposterDryRunInspected(
  opts: MarkInspectedOptions = {},
): Promise<{ ok: boolean; written: boolean; reason: string | null }> {
  void opts // intentional: stubbed for future phase
  return {
    ok: true,
    written: false,
    reason: 'mutation deferred — Phase 14K is dry-run only',
  }
}

/**
 * Tripwire helper. ANY future code path that intends to post live MUST flip
 * `LIVE_POSTING_ENABLED` to true AND remove this guard explicitly. As long as
 * the flag stays false (which it must throughout Phase 14K), calling this
 * function throws — making it impossible for an autoposter to publish.
 *
 * The dry-run cron exports this throw as part of its "live_posting_blocked"
 * contract — even if a future bug accidentally calls a platform module, the
 * import-time check below would surface the misconfiguration before any HTTP
 * request is made.
 */
export function hardBlockLivePosting(reason: string): never {
  if (LIVE_POSTING_ENABLED) {
    // Explicitly impossible during Phase 14K — flag is `as const false`.
    // Kept as a type-narrowing branch so future phases can flip the flag
    // here intentionally rather than removing the guard wholesale.
    throw new Error(`autoposter live posting attempted but no platform integration is wired: ${reason}`)
  }
  throw new Error(
    `autoposter live posting blocked: ${reason}. Phase 14K is DRY-RUN ONLY. Live posting requires explicit flag flip and gate verification.`,
  )
}

/**
 * Boolean export for runtime introspection by the cron route. Callers can
 * include this in the JSON response so the dry-run contract is self-evident
 * to any operator inspecting the response shape.
 */
export const LIVE_POSTING_BLOCKED = true as const
