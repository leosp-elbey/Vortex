// Phase 22F — admin API for the Vortex invites dashboard.
//
// GET   /api/admin/vortex-invites
//   Returns aggregate counts (not-invited contacts, pending queue, sent today)
//   plus the current pending queue rows.
//
// POST  /api/admin/vortex-invites
//   action='mark-sent' { ids: [queueId, ...] }
//     Marks the listed queue rows as 'sent', sets sent_at=NOW().
//     Operator triggers this after the Claude in Chrome automation has
//     pushed the batch through Surge365.
//
//   action='prepare' (no body needed)
//     Returns the current pending queue formatted as the people-JSON shape
//     that Surge365's SendEmails web method consumes.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

interface QueueRow {
  id: string
  contact_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  status: string
  queued_at: string
  sent_at: string | null
}

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error
  const supabase = auth.admin

  // Count contacts that have never been invited
  const { count: notInvitedCount, error: notInvitedError } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'lead')
    .is('vortex_invited_at', null)
    .not('email', 'is', null)
  if (notInvitedError) {
    return NextResponse.json({ error: notInvitedError.message }, { status: 500 })
  }

  // Pending queue count
  const { count: pendingCount, error: pendingError } = await supabase
    .from('vortex_invite_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 })
  }

  // Sent today
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const { count: sentTodayCount, error: sentTodayError } = await supabase
    .from('vortex_invite_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', dayStart.toISOString())
  if (sentTodayError) {
    return NextResponse.json({ error: sentTodayError.message }, { status: 500 })
  }

  // Current pending rows (full list — bounded by the cron's 50/day)
  const { data: pendingRows, error: pendingRowsError } = await supabase
    .from('vortex_invite_queue')
    .select('id, contact_id, first_name, last_name, email, status, queued_at, sent_at')
    .eq('status', 'pending')
    .order('queued_at', { ascending: true })
    .limit(500)
  if (pendingRowsError) {
    return NextResponse.json({ error: pendingRowsError.message }, { status: 500 })
  }

  return NextResponse.json({
    counts: {
      contactsNotInvited: notInvitedCount ?? 0,
      pendingInQueue: pendingCount ?? 0,
      sentToday: sentTodayCount ?? 0,
    },
    pendingItems: (pendingRows ?? []) as QueueRow[],
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error
  const supabase = auth.admin

  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    ids?: string[]
  }

  if (body.action === 'prepare') {
    // Return the current pending queue formatted for Surge365's SendEmails.
    const { data, error } = await supabase
      .from('vortex_invite_queue')
      .select('id, first_name, last_name, email')
      .eq('status', 'pending')
      .order('queued_at', { ascending: true })
      .limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const people = (data ?? []).map((r) => ({
      EmailAddress: r.email ?? '',
      FirstName: r.first_name ?? '',
      LastName: r.last_name ?? '',
    }))
    const queueIds = (data ?? []).map((r) => r.id)

    return NextResponse.json({
      count: people.length,
      people,
      queueIds,
      // The Surge365 payload field, ready to paste into the automation.
      surge365PayloadHint:
        'POST https://my.surge365.com/WebMethods/Button.aspx — body: methodName=SendEmails&id=<buttonId>&people=<the people JSON above>',
    })
  }

  if (body.action === 'mark-sent') {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : []
    if (!ids.length) {
      return NextResponse.json({ error: 'ids[] required' }, { status: 400 })
    }
    const sentAt = new Date().toISOString()
    const { data, error } = await supabase
      .from('vortex_invite_queue')
      .update({ status: 'sent', sent_at: sentAt })
      .in('id', ids)
      .eq('status', 'pending')
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ marked: data?.length ?? 0, sentAt })
  }

  return NextResponse.json(
    { error: `unknown action: ${body.action ?? '(missing)'}` },
    { status: 400 },
  )
}
