// Phase LE-1 — read-only lead-engine metrics for the dashboard.
//
// GET /api/dashboard/lead-metrics  (admin-gated via requireAdminUser)
// Returns today's leads / qualified / booked / joins, a 7-day lead trend,
// and leads-by-channel over 30 days. Pure reads; no mutation.

import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

function startOfUtcDay(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

interface MetricRow {
  id: string
  created_at: string | null
  qualified_at: string | null
  booked_at: string | null
  lead_channel: string | null
  status: string | null
}

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error
  const admin = auth.admin

  const todayStart = startOfUtcDay()
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const { data: rows, error } = await admin
    .from('contacts')
    .select('id, created_at, qualified_at, booked_at, lead_channel, status')
    .gte('created_at', since30)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const contacts = (rows ?? []) as MetricRow[]
  const isToday = (ts: string | null) => !!ts && ts >= todayStart

  const leadsToday = contacts.filter((c) => isToday(c.created_at)).length
  const qualifiedToday = contacts.filter((c) => isToday(c.qualified_at)).length
  const bookedToday = contacts.filter((c) => isToday(c.booked_at)).length
  // NOTE: joins_today is approximate — there is no explicit "joined" event yet,
  // so we count members created today. A dedicated join event is a follow-up.
  const joinsToday = contacts.filter((c) => c.status === 'member' && isToday(c.created_at)).length

  const trend7d: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    trend7d[startOfUtcDay(new Date(Date.now() - i * 86_400_000)).slice(0, 10)] = 0
  }
  for (const c of contacts) {
    const day = (c.created_at ?? '').slice(0, 10)
    if (day in trend7d) trend7d[day]++
  }

  const byChannel: Record<string, number> = {}
  for (const c of contacts) {
    const ch = c.lead_channel || 'unknown'
    byChannel[ch] = (byChannel[ch] ?? 0) + 1
  }

  return NextResponse.json({
    target_daily_qualified: 20,
    leads_today: leadsToday,
    qualified_today: qualifiedToday,
    booked_today: bookedToday,
    joins_today: joinsToday,
    trend_7d: trend7d,
    by_channel: byChannel,
    window_days: 30,
    generated_at: new Date().toISOString(),
  })
}
