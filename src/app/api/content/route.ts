// Generic content_calendar status mutation endpoint. Used by the dashboard's
// Approve / Reject / Mark Posted / Reset buttons. PATCH-only.
//
// Phase 14K.0.6 closure: this is the LAST server-side path that could mutate
// a row to status='posted' without going through a platform poster route.
// Manual posters (post-to-facebook / post-to-instagram) already require
// `validateManualPostingGate` (Phase 14K.0.5). This route now requires the
// same gate ONLY for the `→ posted` transition; other transitions
// (draft↔approved, *→rejected, *→draft reset) remain unchanged.
//
// Twitter/X was removed as a posting target in Phase 14Q; the post-to-twitter
// route was deleted at that time. Historical rows with platform='twitter'
// remain readable (the migration-004 CHECK still allows the value) but no
// new twitter posts are produced.
//
// Bookkeeping mode skips platform/caption checks since this route doesn't
// call any platform API — it just records that a row was posted (typically
// after the operator posted manually via the platform's own web UI).
//
// Phase 14M.2 — atomic posted_at update: when status flips to 'posted'
// AND the row didn't already carry a posted_at timestamp, set posted_at
// to now() in the SAME UPDATE so the dashboard's Mark Posted bookkeeping
// matches the platform-poster routes (which already set both columns).
// Without this, status='posted' could land while posted_at stayed null,
// breaking the `status='posted' iff posted_at IS NOT NULL` invariant.
// Repeat clicks on an already-posted row preserve the original posted_at.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateManualPostingGate, POSTING_GATE_ROW_SELECT_WITH_MEDIA, flattenPostingGateRow, type PostingGateRow } from '@/lib/posting-gate'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })

  // Phase 14M.2 — when transitioning to 'posted', we need the row's current
  // posted_at value to decide whether to stamp it. The gate fetch below
  // already pulls the row; we capture posted_at from that result rather
  // than issuing a second SELECT.
  let gatedRow: PostingGateRow | null = null

  // Phase 14K.0.6 — gate the bookkeeping `→ posted` transition. Any caller
  // setting status='posted' (whether the dashboard's Mark Posted button or a
  // direct curl) must pass the same posting gate as the platform routes,
  // skipping only platform/caption checks (this route doesn't post anywhere).
  // Other status transitions (approve, reject, reset) are NOT gated.
  if (status === 'posted') {
    // Phase 14L — joined fetch so the gate sees the same shape as the
    // platform-poster routes. Bookkeeping mode skips the media-readiness
    // check anyway, but consistent SELECT keeps the gate input uniform.
    const { data: rawRow, error: fetchErr } = await supabase
      .from('content_calendar')
      .select(POSTING_GATE_ROW_SELECT_WITH_MEDIA)
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) {
      return NextResponse.json({ error: `lookup failed: ${fetchErr.message}` }, { status: 500 })
    }
    if (!rawRow) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 })
    }

    const row = flattenPostingGateRow(rawRow)
    if (!row) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 })
    }
    gatedRow = row

    const gate = validateManualPostingGate(row, { bookkeepingOnly: true })
    if (!gate.allowed) {
      return NextResponse.json(
        { success: false, blocked_by_gate: true, reasons: gate.reasons },
        { status: 403 },
      )
    }
  }

  // Phase 14M.2 — build the UPDATE payload. For `→ posted` transitions on
  // rows that don't already carry a posted_at, stamp posted_at = now() in
  // the same query. Other transitions (approve / reject / reset) keep the
  // legacy single-column update — per spec, we don't auto-clear posted_at
  // when a row is reset out of 'posted' (that historical artifact, if any,
  // is reviewed via scripts/repair-posted-at-invariants.js).
  const updateFields: Record<string, unknown> = { status }
  if (status === 'posted' && gatedRow && !gatedRow.posted_at) {
    updateFields.posted_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('content_calendar')
    .update(updateFields)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
