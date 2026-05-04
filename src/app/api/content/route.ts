// Generic content_calendar status mutation endpoint. Used by the dashboard's
// Approve / Reject / Mark Posted / Reset buttons. PATCH-only.
//
// Phase 14K.0.6 closure: this is the LAST server-side path that could mutate
// a row to status='posted' without going through a platform poster route.
// Manual posters (post-to-twitter / post-to-facebook / post-to-instagram)
// already require `validateManualPostingGate` (Phase 14K.0.5). This route
// now requires the same gate ONLY for the `→ posted` transition; other
// transitions (draft↔approved, *→rejected, *→draft reset) remain unchanged.
//
// Bookkeeping mode skips platform/caption checks since this route doesn't
// call any platform API — it just records that a row was posted (typically
// after the operator posted manually via the platform's own web UI).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateManualPostingGate, POSTING_GATE_ROW_SELECT_WITH_MEDIA, flattenPostingGateRow } from '@/lib/posting-gate'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })

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

    const gate = validateManualPostingGate(row, { bookkeepingOnly: true })
    if (!gate.allowed) {
      return NextResponse.json(
        { success: false, blocked_by_gate: true, reasons: gate.reasons },
        { status: 403 },
      )
    }
  }

  const { data, error } = await supabase
    .from('content_calendar')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
