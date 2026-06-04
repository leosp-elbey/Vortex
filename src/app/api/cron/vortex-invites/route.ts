// Phase 22F — daily Vortex invite queue staging.
//
// Runs at 09:30 UTC. Pulls up to 50 contacts that have never been invited
// to the Vortex portal and stages them into vortex_invite_queue with
// status='pending'. The actual outbound send is performed by an
// operator-driven Claude in Chrome automation against Surge365's
// SendEmails web method (session-authed; we don't call it server-side).
//
// Idempotency contract:
//   - contacts.vortex_invited_at is set to NOW() on queue insert, so the
//     same contact is never staged twice.
//   - vortex_invite_queue.status tracks delivery: pending → sent | failed.
//   - If a send fails, the operator can manually clear contacts.vortex_
//     invited_at on the affected rows to re-queue.
//
// Auth: Bearer CRON_SECRET. Cron + manual triggers via the dashboard go
// through the same handler.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH_SIZE = 50

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()

  // 1. Pull next 50 contacts that are leads, have an email, and have never
  //    been invited (vortex_invited_at IS NULL). Order by oldest first so
  //    we work through the back-catalogue before recent signups.
  const { data: contacts, error: selectError } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, created_at')
    .eq('status', 'lead')
    .is('vortex_invited_at', null)
    .not('email', 'is', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (selectError) {
    console.error('[vortex-invites] contacts select failed:', selectError.message)
    return NextResponse.json(
      { success: false, error: selectError.message, startedAt },
      { status: 500 },
    )
  }

  const candidates = (contacts ?? []) as ContactRow[]
  if (!candidates.length) {
    console.log('[vortex-invites] queued { count: 0, reason: \'no_eligible_contacts\', startedAt:', startedAt, '}')
    return NextResponse.json(
      { success: true, queued: 0, startedAt, contacts: [] },
      { status: 200 },
    )
  }

  // 2. Insert into vortex_invite_queue.
  const queueRows = candidates.map((c) => ({
    contact_id: c.id,
    first_name: c.first_name ?? '',
    last_name: c.last_name ?? '',
    email: c.email,
    status: 'pending',
  }))

  const { data: insertedRows, error: insertError } = await supabase
    .from('vortex_invite_queue')
    .insert(queueRows)
    .select('id, contact_id, first_name, email')

  if (insertError) {
    console.error('[vortex-invites] queue insert failed:', insertError.message)
    return NextResponse.json(
      { success: false, error: insertError.message, startedAt },
      { status: 500 },
    )
  }

  // 3. Mark contacts.vortex_invited_at so they're not re-queued tomorrow.
  //    Done AFTER the queue insert so a queue-insert failure doesn't leave
  //    contacts in a permanent "queued but no queue row" state.
  const contactIds = candidates.map((c) => c.id)
  const { error: updateError } = await supabase
    .from('contacts')
    .update({ vortex_invited_at: startedAt })
    .in('id', contactIds)

  if (updateError) {
    console.error('[vortex-invites] contacts.vortex_invited_at update failed:', updateError.message)
    // Non-fatal: the queue rows exist; next run will re-queue these and the
    // queue table will hold duplicates until the operator dedupes. Surface
    // the error in the response so the operator notices.
    return NextResponse.json(
      {
        success: false,
        queued: queueRows.length,
        warning: `queue rows inserted but vortex_invited_at update failed: ${updateError.message}`,
        startedAt,
        contacts: insertedRows ?? [],
      },
      { status: 200 },
    )
  }

  console.log(`[vortex-invites] queued { count: ${queueRows.length}, startedAt: '${startedAt}' }`)

  return NextResponse.json(
    {
      success: true,
      queued: queueRows.length,
      startedAt,
      contacts: (insertedRows ?? []).map((r) => ({
        id: r.id,
        first_name: r.first_name,
        email: r.email,
      })),
    },
    { status: 200 },
  )
}

export async function POST(request: NextRequest) {
  return GET(request)
}
