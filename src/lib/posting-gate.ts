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
    .maybeSingle<PostingGateRow>()
  if (error) return bareResult(false, `update failed: ${error.message}`, row)

  const finalRow = updated ?? row
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
    .maybeSingle<PostingGateRow>()
  if (error) return bareResult(false, `update failed: ${error.message}`, row)

  const finalRow = updated ?? row
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
