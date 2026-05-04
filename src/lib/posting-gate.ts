// Phase 14J — Safe posting gate / manual publish controls.
//
// Pure eligibility helpers + DB action wrappers around `content_calendar`'s
// posting-gate columns (migration 029). The gate is a separate signal from
// `content_calendar.status`; future autoposters MUST require both:
//   (a) posting_status = 'ready'
//   (b) posting_gate_approved = TRUE
// before calling any platform API. This phase does NOT itself post; the gate
// is groundwork.
//
// Server-side only (uses createAdminClient).

import { createAdminClient } from '@/lib/supabase/admin'
import { validateMediaReadiness } from '@/lib/media-readiness'

export type PostingStatus = 'idle' | 'ready' | 'blocked'

export const POSTING_STATUS_VALUES: readonly PostingStatus[] = ['idle', 'ready', 'blocked'] as const

/**
 * Minimum shape needed to evaluate gate eligibility. Real `content_calendar`
 * rows carry far more — we only require what the rules actually inspect.
 */
export interface PostingGateRow {
  id: string
  status: string
  platform: string | null
  caption: string | null
  posting_status: string | null
  posting_gate_approved: boolean | null
  posting_gate_approved_at?: string | null
  posting_gate_approved_by?: string | null
  posting_gate_notes?: string | null
  queued_for_posting_at?: string | null
  posting_block_reason?: string | null
  posted_at: string | null
  campaign_asset_id?: string | null
  tracking_url?: string | null
  manual_posting_only?: boolean | null

  // Phase 14L — media readiness inputs. Optional because legacy callers may
  // not have plumbed them through yet; when absent, the media-readiness
  // sub-check treats the row as "no media available" (which blocks platforms
  // that require media). Campaign rows get these from a JOIN against
  // campaign_assets via content_calendar.campaign_asset_id; organic rows
  // pull image_url / video_url straight from content_calendar (Phase 14L.2 —
  // migration 032 added video_url + media_status to content_calendar so
  // organic rows have a parallel media surface).
  image_url?: string | null
  video_url?: string | null
  image_prompt?: string | null
  video_prompt?: string | null
  // Phase 14L.2 — media generation state from migration 032. NULL on rows
  // that predate the migration; treated as "no opinion" (platform rules
  // apply). 'failed' / 'skipped' / 'ready' have explicit refusal logic in
  // validateMediaReadiness.
  media_status?: string | null
  media_error?: string | null
}

export interface EligibilityResult {
  ok: boolean
  reason: string | null
}

/**
 * Coerce arbitrary input to a known posting_status value. Anything outside the
 * three-value enum collapses to 'idle' — the safe default. Used by the API
 * route's body parser AND by the helper-side defensive default when reading
 * untyped data.
 */
export function normalizePostingStatus(input: string | null | undefined): PostingStatus {
  if (!input || typeof input !== 'string') return 'idle'
  const v = input.trim().toLowerCase()
  return (POSTING_STATUS_VALUES as readonly string[]).includes(v) ? (v as PostingStatus) : 'idle'
}

/**
 * Returns the first reason this row cannot enter the posting queue, or null
 * when it is fully eligible. Reasons are user-facing strings; the dashboard
 * surfaces them as muted text on ineligible rows.
 *
 * Eligibility (all must hold):
 *   - content_calendar.status === 'approved' (the existing lifecycle gate)
 *   - platform is non-empty
 *   - caption is non-empty
 *   - row is not already in 'posted' or 'rejected' status
 *   - manual_posting_only is TRUE (defense — auto-bypassing routes never
 *     mark rows ready)
 *   - if the row originated from a campaign_asset_id, tracking_url must be
 *     populated (otherwise click attribution would be lost on post)
 */
export function getPostingGateBlockReason(row: PostingGateRow): string | null {
  if (row.status === 'rejected') return 'Row is rejected — cannot be queued for posting.'
  if (row.status === 'posted') return 'Row is already posted — gate has nothing to do.'
  if (row.status !== 'approved') return `Row status must be 'approved' to enter the posting queue (currently '${row.status}').`
  if (!row.platform || !row.platform.trim()) return 'Row has no platform set.'
  if (!row.caption || !row.caption.trim()) return 'Row has no caption / body content.'
  if (row.manual_posting_only === false) {
    return 'Row is flagged manual_posting_only=false. Restore that flag before queuing.'
  }
  if (row.campaign_asset_id && !row.tracking_url) {
    return 'Campaign-originated row is missing a tracking_url. Re-push from the campaign dashboard to materialize it.'
  }

  // Phase 14L — media readiness gate. Run only when media inputs were plumbed
  // through (image_url / video_url / *_prompt / media_status fields present
  // on the row). When ALL media inputs are undefined, assume the caller
  // didn't fetch them and skip — the manual posting validator below will
  // catch it on the post path. When at least one is defined (or the platform
  // has hard requirements), let validateMediaReadiness decide.
  const mediaInputsPresent =
    row.image_url !== undefined ||
    row.video_url !== undefined ||
    row.image_prompt !== undefined ||
    row.video_prompt !== undefined ||
    row.media_status !== undefined
  if (mediaInputsPresent) {
    const media = validateMediaReadiness({
      platform: row.platform,
      image_url: row.image_url ?? null,
      video_url: row.video_url ?? null,
      image_prompt: row.image_prompt ?? null,
      video_prompt: row.video_prompt ?? null,
      campaign_asset_id: row.campaign_asset_id ?? null,
      media_status: row.media_status ?? null,
      media_error: row.media_error ?? null,
    })
    if (media.blocked && media.reasons.length > 0) {
      return media.reasons[0]
    }
  }
  return null
}

/**
 * Convenience wrapper around `getPostingGateBlockReason` returning the
 * `{ ok, reason }` shape used by the API route.
 */
export function canEnterPostingQueue(row: PostingGateRow): EligibilityResult {
  const reason = getPostingGateBlockReason(row)
  return { ok: reason === null, reason }
}

// ============================================================================
// Phase 14K.0.5 — Manual posting gate validator.
//
// This is the gate the manual platform-post routes (post-to-facebook,
// post-to-instagram, post-to-twitter) must run BEFORE calling any platform
// API. It is intentionally STRICTER than `getPostingGateBlockReason` (which
// covers the queue-entry rules in Phase 14J) — it ALSO requires:
//   - posting_status = 'ready'
//   - posting_gate_approved = true
//   - queued_for_posting_at non-null
//   - posted_at is null
//   - tracking_url starts with https://www.vortextrips.com/t/  (campaign rows)
//
// This matches the autoposter dry-run's eligibility rules from Phase 14K so
// manual and automated paths share one source of truth. Phase 14K.0.5 closes
// the backdoor where /api/automations/post-to-* routes only checked
// `status='approved'` without verifying the gate.
// ============================================================================

export interface ManualPostingGateOptions {
  /**
   * When true, skip platform/caption checks. Used by routes that ONLY mark
   * a row as posted (bookkeeping) without calling a platform API. The gate
   * still requires status='approved' + posting_status='ready' +
   * posting_gate_approved=true + queued_for_posting_at; only the platform-
   * payload checks are skipped.
   */
  bookkeepingOnly?: boolean
  /**
   * Restrict supported platforms. When provided, the row's platform must be
   * in this list. Used by per-platform routes (e.g. post-to-twitter passes
   * `['twitter']`) to defend against operators sending a Facebook row to
   * the Twitter route. Defaults to undefined (no restriction beyond non-empty).
   */
  supportedPlatforms?: readonly string[]
}

export interface ManualPostingGateResult {
  /** True ONLY when reasons[] is empty. False otherwise. */
  allowed: boolean
  /** Human-readable strings explaining why the gate refused. Empty when allowed. */
  reasons: string[]
  /** Soft warnings — surfaced to the operator but don't block. Reserved for future use. */
  warnings: string[]
  /** Always 'manual' for this validator. The autoposter has its own helper. */
  mode: 'manual'
}

/**
 * Phase 14K.0.5 — gate enforcer for manual platform-posting routes.
 *
 * Returns `{ allowed: false, reasons: [...] }` when ANY rule fails. Routes MUST
 * check `result.allowed` and return 403 with the result before calling a
 * platform API or mutating the row.
 *
 * Pure: no DB calls, no platform calls, no side effects. Just rule evaluation.
 */
export function validateManualPostingGate(
  row: PostingGateRow | null,
  options: ManualPostingGateOptions = {},
): ManualPostingGateResult {
  const reasons: string[] = []
  const warnings: string[] = []
  const mode = 'manual' as const

  if (!row) {
    reasons.push('content_calendar row not found')
    return { allowed: false, reasons, warnings, mode }
  }

  // Lifecycle gates — short-circuit with explicit messages.
  if (row.status === 'rejected') {
    reasons.push('row status is rejected')
  } else if (row.status === 'posted' || row.posted_at) {
    reasons.push('row is already posted — refusing duplicate post')
  } else if (row.status !== 'approved') {
    reasons.push(`row status is '${row.status}', need 'approved'`)
  }

  // Posting-gate state.
  if (row.posting_status === 'blocked') {
    const detail = row.posting_block_reason ? `: ${row.posting_block_reason}` : ''
    reasons.push(`gate is blocked${detail}`)
  } else if (row.posting_status !== 'ready') {
    reasons.push(`posting_status is '${row.posting_status ?? 'null'}', need 'ready' (Mark Ready first)`)
  }
  if (row.posting_gate_approved !== true) {
    reasons.push('posting_gate_approved is not true — Mark Ready first')
  }
  if (!row.queued_for_posting_at) {
    reasons.push('queued_for_posting_at is null')
  }
  if (row.manual_posting_only !== true) {
    reasons.push('manual_posting_only is not true — gate refuses non-manual paths in this phase')
  }

  // Platform / caption checks (skip for pure bookkeeping mode).
  if (!options.bookkeepingOnly) {
    if (!row.platform || !row.platform.trim()) {
      reasons.push('platform is missing')
    } else if (
      options.supportedPlatforms &&
      !options.supportedPlatforms.includes(row.platform)
    ) {
      reasons.push(
        `platform '${row.platform}' is not supported by this route (expected one of: ${options.supportedPlatforms.join(', ')})`,
      )
    }
    if (!row.caption || !row.caption.trim()) {
      reasons.push('caption/body is empty')
    }
  }

  // Tracking URL — campaign-originated rows must use the branded domain
  // (Phase 14J.2). Legacy myvortex365.com URLs are explicitly blocked here so
  // a misconfigured row can't post a non-branded link.
  if (row.campaign_asset_id) {
    if (!row.tracking_url || !row.tracking_url.trim()) {
      reasons.push('campaign-originated row missing tracking_url — re-push from campaign dashboard')
    } else if (!row.tracking_url.startsWith('https://www.vortextrips.com/t/')) {
      reasons.push('tracking_url must start with https://www.vortextrips.com/t/ (legacy URLs blocked)')
    }
  }

  // Phase 14L — media readiness. Skipped in bookkeeping-only mode because
  // the route doesn't actually call a platform API; the operator already
  // posted via the platform's own UI and is just recording the result.
  // For real platform-poster routes, missing required media (e.g. an
  // Instagram row without image_url) blocks here so the route never tries
  // to publish a "naked" post.
  // Phase 14L.2 — also consults media_status / media_error.
  if (!options.bookkeepingOnly) {
    const media = validateMediaReadiness({
      platform: row.platform,
      image_url: row.image_url ?? null,
      video_url: row.video_url ?? null,
      image_prompt: row.image_prompt ?? null,
      video_prompt: row.video_prompt ?? null,
      campaign_asset_id: row.campaign_asset_id ?? null,
      media_status: row.media_status ?? null,
      media_error: row.media_error ?? null,
    })
    if (media.blocked) {
      for (const r of media.reasons) reasons.push(r)
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    warnings,
    mode,
  }
}

interface ActorContext {
  /** auth.users.id of the admin performing the action. NULL is allowed but discouraged. */
  user_id: string | null
  /** Phase 14J.1 — denormalized into the audit row so it survives user deletion. */
  user_email?: string | null
}

/**
 * Build the partial UPDATE payload that flips a row to the gate-approved
 * (queued) state. Pure — no DB write. The route uses this so the SQL UPDATE
 * stays small and the rule lives in one place.
 */
export function buildPostingGatePayload(actor: ActorContext, notes: string | null = null): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    posting_status: 'ready' as PostingStatus,
    posting_gate_approved: true,
    posting_gate_approved_at: now,
    posting_gate_approved_by: actor.user_id,
    posting_gate_notes: notes && notes.trim() ? notes.trim() : null,
    queued_for_posting_at: now,
    posting_block_reason: null,
  }
}

/**
 * Build the partial UPDATE payload for the unqueue path. Preserves
 * posting_gate_approved_by as a historical record (operators who queued the
 * row keep their attribution); resets the boolean + timestamps + status.
 */
export function buildPostingUnqueuePayload(actor: ActorContext, reason: string | null = null): Record<string, unknown> {
  return {
    posting_status: 'idle' as PostingStatus,
    posting_gate_approved: false,
    posting_gate_approved_at: null,
    queued_for_posting_at: null,
    posting_block_reason: reason && reason.trim() ? reason.trim() : null,
    // Append actor/note to history? Could grow generation_metadata-style.
    // For 14J we keep it simple — the column is overwritten on next queue/unqueue.
    posting_gate_notes: reason && reason.trim() ? `unqueued by ${actor.user_id ?? 'unknown'}: ${reason.trim()}` : null,
  }
}

interface MarkReadyOptions {
  contentCalendarId: string
  actor: ActorContext
  notes?: string | null
}

interface UnqueueOptions {
  contentCalendarId: string
  actor: ActorContext
  reason?: string | null
}

export interface GateActionResult {
  ok: boolean
  reason: string | null
  row: PostingGateRow | null
  /** Phase 14J.1 — TRUE when an audit row was written; FALSE when the action
   *  was an idempotent no-op or the audit insert failed. */
  audit_written: boolean
  /** Phase 14J.1 — non-null when the gate action succeeded but the audit
   *  insert raised an error. The dashboard surfaces this as a non-blocking
   *  warning so the operator knows attribution may be missing for this row. */
  audit_warning: string | null
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>

interface AuditWriteOpts {
  supabase: SupabaseAdmin
  contentCalendarId: string
  action: 'queue' | 'unqueue' | 'blocked'
  previousStatus: string | null
  newStatus: string | null
  previousApproved: boolean | null
  newApproved: boolean | null
  actor: ActorContext
  notes?: string | null
  blockReason?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Phase 14J.1 — append a row to posting_gate_audit. Best-effort: a failure here
 * never breaks the gate action. The caller surfaces the failure as
 * `audit_warning` on the GateActionResult so the operator sees a small toast
 * but the underlying state change still stands.
 */
async function writeAudit(opts: AuditWriteOpts): Promise<{ ok: boolean; reason: string | null }> {
  try {
    const { error } = await opts.supabase.from('posting_gate_audit').insert({
      content_calendar_id: opts.contentCalendarId,
      action: opts.action,
      previous_posting_status: opts.previousStatus,
      new_posting_status: opts.newStatus,
      previous_gate_approved: opts.previousApproved,
      new_gate_approved: opts.newApproved,
      actor_id: opts.actor.user_id,
      actor_email: opts.actor.user_email ?? null,
      notes: opts.notes && opts.notes.trim() ? opts.notes.trim() : null,
      block_reason: opts.blockReason && opts.blockReason.trim() ? opts.blockReason.trim() : null,
      metadata: opts.metadata ?? {},
    })
    if (error) {
      console.error('[posting-gate] audit insert failed:', error.message)
      return { ok: false, reason: `audit insert failed: ${error.message}` }
    }
    return { ok: true, reason: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'audit insert failed'
    console.error('[posting-gate] audit insert threw:', message)
    return { ok: false, reason: message }
  }
}

// Phase 14L — joined select. `campaign_asset` is a 1:1 relation through
// content_calendar.campaign_asset_id; we pull image_url / video_url from
// the linked asset so the gate can run media-readiness checks. The
// `image_prompt` column lives directly on content_calendar (legacy organic
// generation flow). `video_prompt` has no source today; it stays absent
// from the SELECT and the validator treats it as null.
//
// Phase 14L.2 — adds row-level image_url / video_url / media_status /
// media_error from content_calendar (migration 032). Organic rows have no
// campaign_asset row to JOIN against, so the row-level columns are the
// only source of media for them. Campaign rows still prefer the linked
// asset's URLs (it carries `asset_type` + provenance metadata) and fall
// back to the row-level columns when the asset has not been generated yet.
//
// EXPORTED so manual-poster routes can use the same SELECT and pass a
// consistent shape to validateManualPostingGate.
export const POSTING_GATE_ROW_SELECT_WITH_MEDIA =
  'id, status, platform, caption, posting_status, posting_gate_approved, posting_gate_approved_at, posting_gate_approved_by, posting_gate_notes, queued_for_posting_at, manual_posting_only, posting_block_reason, posted_at, campaign_asset_id, tracking_url, image_prompt, image_url, video_url, media_status, media_error, campaign_asset:campaign_assets!campaign_asset_id(image_url, video_url, asset_type)'

const ROW_SELECT = POSTING_GATE_ROW_SELECT_WITH_MEDIA

type CampaignAssetJoin = { image_url: string | null; video_url: string | null; asset_type: string | null }

interface RawJoinedRow extends Omit<PostingGateRow, 'image_url' | 'video_url'> {
  image_prompt?: string | null
  // Row-level media columns from migration 032. Captured separately from the
  // flattened image_url/video_url so the merge below can prefer the joined
  // campaign_asset values while still falling back to row-level columns.
  image_url?: string | null
  video_url?: string | null
  campaign_asset?: CampaignAssetJoin | CampaignAssetJoin[] | null
}

/**
 * Phase 14L — flatten the joined campaign_asset into top-level image_url /
 * video_url so downstream validators see a single shape. Returning a
 * PostingGateRow keeps the interface stable across the codebase.
 *
 * Supabase-js types the joined relation as an array (it can't statically
 * tell that `campaign_asset_id` is unique). At runtime a 1:1 FK returns a
 * single object. Handle both shapes defensively.
 *
 * Phase 14L.2 — when the campaign_asset row has no media yet, fall back to
 * the row-level image_url/video_url (migration 032). Organic rows always
 * read from the row-level columns because they have no campaign_asset.
 */
function flattenJoined(raw: RawJoinedRow | null): PostingGateRow | null {
  if (!raw) return null
  const { campaign_asset, image_url: rowImage, video_url: rowVideo, ...rest } = raw
  const asset: CampaignAssetJoin | null = Array.isArray(campaign_asset)
    ? (campaign_asset[0] ?? null)
    : (campaign_asset ?? null)
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
 * EXPORTED helper for manual-poster routes. Takes the raw `*, campaign_asset:campaign_assets(...)`
 * shape supabase returned and flattens it into a PostingGateRow that
 * `validateManualPostingGate` will accept.
 */
export function flattenPostingGateRow(raw: unknown): PostingGateRow | null {
  if (!raw || typeof raw !== 'object') return null
  return flattenJoined(raw as RawJoinedRow)
}

async function loadRow(supabase: ReturnType<typeof createAdminClient>, id: string): Promise<PostingGateRow | null> {
  const { data, error } = await supabase
    .from('content_calendar')
    .select(ROW_SELECT)
    .eq('id', id)
    .maybeSingle<RawJoinedRow>()
  if (error) throw new Error(`content_calendar lookup failed: ${error.message}`)
  return flattenJoined(data)
}

/**
 * Phase 14J.1 — convenience: build a GateActionResult with audit fields zeroed
 * out. Used on early-error paths where no audit row was even attempted.
 */
function bareResult(ok: boolean, reason: string | null, row: PostingGateRow | null): GateActionResult {
  return { ok, reason, row, audit_written: false, audit_warning: null }
}

/**
 * Move a row into the posting queue. Validates eligibility against the gate
 * rules and writes the gate columns. Idempotent: re-running on an already-ready
 * row is a no-op (no-op ok=true, audit_written=false).
 *
 * Does NOT call any platform API. Does NOT change `content_calendar.status` —
 * only the gate columns flip.
 *
 * Phase 14J.1 audit behavior:
 *   - Successful queue → writes audit row with action='queue'.
 *   - Eligibility failure → writes audit row with action='blocked' (best-effort;
 *     blocked-audit failures don't change the 400 response).
 *   - Idempotent no-op → no audit row (state didn't change).
 *   - Audit insert failure on a successful queue → ok=true, audit_warning set,
 *     audit_written=false. The gate state still stands.
 */
export async function markReadyForPosting(opts: MarkReadyOptions): Promise<GateActionResult> {
  if (!opts.contentCalendarId) {
    return bareResult(false, 'contentCalendarId is required.', null)
  }
  const supabase = createAdminClient()
  const row = await loadRow(supabase, opts.contentCalendarId)
  if (!row) return bareResult(false, 'content_calendar row not found.', null)

  // Idempotency — re-mark of an already-ready row is a quiet success.
  // No audit row written: the state didn't change, so logging would be noise.
  if (row.posting_status === 'ready' && row.posting_gate_approved === true) {
    return bareResult(true, null, row)
  }

  const eligibility = canEnterPostingQueue(row)
  if (!eligibility.ok) {
    // Best-effort blocked-attempt audit. Failure of the audit insert does not
    // change the 400 response — operator still sees the eligibility reason.
    const auditRes = await writeAudit({
      supabase,
      contentCalendarId: opts.contentCalendarId,
      action: 'blocked',
      previousStatus: row.posting_status,
      newStatus: row.posting_status,
      previousApproved: row.posting_gate_approved,
      newApproved: row.posting_gate_approved,
      actor: opts.actor,
      notes: opts.notes ?? null,
      blockReason: eligibility.reason,
    })
    return {
      ok: false,
      reason: eligibility.reason,
      row,
      audit_written: auditRes.ok,
      audit_warning: auditRes.ok ? null : auditRes.reason,
    }
  }

  const payload = buildPostingGatePayload(opts.actor, opts.notes ?? null)
  const { data: updated, error } = await supabase
    .from('content_calendar')
    .update(payload)
    .eq('id', opts.contentCalendarId)
    .select(ROW_SELECT)
    .maybeSingle<RawJoinedRow>()
  if (error) return bareResult(false, `update failed: ${error.message}`, row)

  const finalRow = flattenJoined(updated) ?? row
  const auditRes = await writeAudit({
    supabase,
    contentCalendarId: opts.contentCalendarId,
    action: 'queue',
    previousStatus: row.posting_status,
    newStatus: finalRow.posting_status,
    previousApproved: row.posting_gate_approved,
    newApproved: finalRow.posting_gate_approved,
    actor: opts.actor,
    notes: opts.notes ?? null,
  })
  return {
    ok: true,
    reason: null,
    row: finalRow,
    audit_written: auditRes.ok,
    audit_warning: auditRes.ok ? null : auditRes.reason,
  }
}

/**
 * Remove a row from the posting queue. Always allowed (no eligibility gate
 * for unqueueing — operators must be able to pull a row regardless of status).
 * Idempotent: unqueueing an already-idle row is a no-op success.
 *
 * Phase 14J.1 audit behavior:
 *   - Successful unqueue → writes audit row with action='unqueue'.
 *   - Idempotent no-op → no audit row.
 *   - Audit insert failure on a successful unqueue → ok=true, audit_warning set.
 */
export async function removeFromPostingQueue(opts: UnqueueOptions): Promise<GateActionResult> {
  if (!opts.contentCalendarId) {
    return bareResult(false, 'contentCalendarId is required.', null)
  }
  const supabase = createAdminClient()
  const row = await loadRow(supabase, opts.contentCalendarId)
  if (!row) return bareResult(false, 'content_calendar row not found.', null)

  if (row.posting_status !== 'ready' && row.posting_gate_approved !== true) {
    return bareResult(true, null, row) // already unqueued
  }

  const payload = buildPostingUnqueuePayload(opts.actor, opts.reason ?? null)
  const { data: updated, error } = await supabase
    .from('content_calendar')
    .update(payload)
    .eq('id', opts.contentCalendarId)
    .select(ROW_SELECT)
    .maybeSingle<RawJoinedRow>()
  if (error) return bareResult(false, `update failed: ${error.message}`, row)

  const finalRow = flattenJoined(updated) ?? row
  const auditRes = await writeAudit({
    supabase,
    contentCalendarId: opts.contentCalendarId,
    action: 'unqueue',
    previousStatus: row.posting_status,
    newStatus: finalRow.posting_status,
    previousApproved: row.posting_gate_approved,
    newApproved: finalRow.posting_gate_approved,
    actor: opts.actor,
    notes: opts.reason ?? null,
    blockReason: opts.reason ?? null,
  })
  return {
    ok: true,
    reason: null,
    row: finalRow,
    audit_written: auditRes.ok,
    audit_warning: auditRes.ok ? null : auditRes.reason,
  }
}
