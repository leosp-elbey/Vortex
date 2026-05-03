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

interface ActorContext {
  /** auth.users.id of the admin performing the action. NULL is allowed but discouraged. */
  user_id: string | null
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
}

const ROW_SELECT =
  'id, status, platform, caption, posting_status, posting_gate_approved, posting_gate_approved_at, posting_gate_approved_by, posting_gate_notes, queued_for_posting_at, manual_posting_only, posting_block_reason, posted_at, campaign_asset_id, tracking_url'

async function loadRow(supabase: ReturnType<typeof createAdminClient>, id: string): Promise<PostingGateRow | null> {
  const { data, error } = await supabase
    .from('content_calendar')
    .select(ROW_SELECT)
    .eq('id', id)
    .maybeSingle<PostingGateRow>()
  if (error) throw new Error(`content_calendar lookup failed: ${error.message}`)
  return data ?? null
}

/**
 * Move a row into the posting queue. Validates eligibility against the gate
 * rules and writes the gate columns. Idempotent: re-running on an already-ready
 * row is a no-op (no-op ok=true).
 *
 * Does NOT call any platform API. Does NOT change `content_calendar.status` —
 * only the gate columns flip.
 */
export async function markReadyForPosting(opts: MarkReadyOptions): Promise<GateActionResult> {
  if (!opts.contentCalendarId) {
    return { ok: false, reason: 'contentCalendarId is required.', row: null }
  }
  const supabase = createAdminClient()
  const row = await loadRow(supabase, opts.contentCalendarId)
  if (!row) return { ok: false, reason: 'content_calendar row not found.', row: null }

  // Idempotency — re-mark of an already-ready row is a quiet success.
  if (row.posting_status === 'ready' && row.posting_gate_approved === true) {
    return { ok: true, reason: null, row }
  }

  const eligibility = canEnterPostingQueue(row)
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason, row }

  const payload = buildPostingGatePayload(opts.actor, opts.notes ?? null)
  const { data: updated, error } = await supabase
    .from('content_calendar')
    .update(payload)
    .eq('id', opts.contentCalendarId)
    .select(ROW_SELECT)
    .maybeSingle<PostingGateRow>()
  if (error) return { ok: false, reason: `update failed: ${error.message}`, row }
  return { ok: true, reason: null, row: updated ?? row }
}

/**
 * Remove a row from the posting queue. Always allowed (no eligibility gate
 * for unqueueing — operators must be able to pull a row regardless of status).
 * Idempotent: unqueueing an already-idle row is a no-op success.
 */
export async function removeFromPostingQueue(opts: UnqueueOptions): Promise<GateActionResult> {
  if (!opts.contentCalendarId) {
    return { ok: false, reason: 'contentCalendarId is required.', row: null }
  }
  const supabase = createAdminClient()
  const row = await loadRow(supabase, opts.contentCalendarId)
  if (!row) return { ok: false, reason: 'content_calendar row not found.', row: null }

  if (row.posting_status !== 'ready' && row.posting_gate_approved !== true) {
    return { ok: true, reason: null, row } // already unqueued
  }

  const payload = buildPostingUnqueuePayload(opts.actor, opts.reason ?? null)
  const { data: updated, error } = await supabase
    .from('content_calendar')
    .update(payload)
    .eq('id', opts.contentCalendarId)
    .select(ROW_SELECT)
    .maybeSingle<PostingGateRow>()
  if (error) return { ok: false, reason: `update failed: ${error.message}`, row }
  return { ok: true, reason: null, row: updated ?? row }
}
