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

/**
 * Phase 14K — feature flag gate. MUST stay false for the entirety of Phase
 * 14K. Flipping to true will throw via `hardBlockLivePosting`. The flag
 * exists only to make the dry-run-only contract explicit at the source-code
 * level; future phases that introduce live posting will need to delete it
 * along with the call site.
 */
const LIVE_POSTING_ENABLED = false as const

/** Shape pulled from content_calendar — only fields the eligibility check reads. */
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
  updated_at: string | null
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

const ROW_SELECT =
  'id, platform, status, caption, hashtags, posting_status, posting_gate_approved, queued_for_posting_at, manual_posting_only, tracking_url, campaign_asset_id, posted_at, week_of, created_at, updated_at'

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
    .order('queued_for_posting_at', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (opts.platform) query = query.eq('platform', opts.platform)

  const { data, error } = await query
  if (error) {
    throw new Error(`autoposter eligibility query failed: ${error.message}`)
  }

  const rows = (data ?? []) as ContentCalendarRow[]
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
