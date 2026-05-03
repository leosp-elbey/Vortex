// Phase 14H — Campaign attribution endpoint.
// GET /api/admin/campaigns/attribution
//
// Admin-only. Reads the `event_campaign_attribution_summary` view (migration 023),
// rolls up per-(campaign × asset × calendar_row) rows to per-campaign metrics,
// and returns ranked campaigns + totals. Read-only. Never posts. Never modifies
// any row.
//
// Query params (all optional):
//   campaign_id  uuid           — limit to a single campaign
//   platform     string         — only count rows for this platform (e.g. instagram)
//   wave         W1..W8         — only count rows for this wave
//   min_score    1-100          — exclude campaigns with intrinsic event-fit score below this
//   date_from    ISO8601        — earliest event_start_date inclusive
//   date_to      ISO8601        — latest event_start_date inclusive
//
// Empty-state contract: when the view returns 0 rows (no campaigns exist OR all
// were filtered out), the response shape is unchanged but `empty: true`.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import {
  getEventCampaignAttributionSummary,
  rollupCampaign,
  type AttributionRow,
  type CampaignRollup,
} from '@/lib/event-campaign-attribution'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  campaign_id: z.string().uuid().optional(),
  platform: z.string().trim().min(1).max(40).optional(),
  wave: z.enum(['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']).optional(),
  min_score: z.coerce.number().int().min(1).max(100).optional(),
  date_from: z.string().datetime({ offset: true }).optional(),
  date_to: z.string().datetime({ offset: true }).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(request.url)
  // Strip empty-string params before zod validation so omitted fields don't
  // become "" and trigger min(1) failures.
  const raw: Record<string, string> = {}
  for (const [k, v] of searchParams.entries()) {
    if (v.trim() !== '') raw[k] = v
  }
  const parsed = QuerySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', issues: parsed.error.issues }, { status: 400 })
  }

  let rows: AttributionRow[]
  try {
    rows = await getEventCampaignAttributionSummary(parsed.data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Attribution query failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Group rows by campaign_id for rollup.
  const byCampaign = new Map<string, AttributionRow[]>()
  for (const r of rows) {
    const list = byCampaign.get(r.campaign_id) ?? []
    list.push(r)
    byCampaign.set(r.campaign_id, list)
  }

  const rollups: CampaignRollup[] = []
  for (const list of byCampaign.values()) {
    const rollup = rollupCampaign(list)
    if (rollup) rollups.push(rollup)
  }

  // Rank by composite performance score, descending. Ties broken by lead_count then asset_count.
  const ranked = [...rollups].sort((a, b) => {
    if (b.performance_score !== a.performance_score) return b.performance_score - a.performance_score
    if (b.lead_count !== a.lead_count) return b.lead_count - a.lead_count
    return b.asset_count - a.asset_count
  })

  const totals = {
    campaigns: ranked.length,
    assets: ranked.reduce((s, r) => s + r.asset_count, 0),
    approved_assets: ranked.reduce((s, r) => s + r.approved_asset_count, 0),
    calendar_rows: ranked.reduce((s, r) => s + r.calendar_row_count, 0),
    posted: ranked.reduce((s, r) => s + r.posted_count, 0),
    leads: ranked.reduce((s, r) => s + r.lead_count, 0),
    members: ranked.reduce((s, r) => s + r.member_count, 0),
    /** Always 0 today — surfaced explicitly so the dashboard can label it "deferred". */
    clicks: 0,
  }

  return NextResponse.json({
    ok: true,
    empty: rows.length === 0,
    filters: parsed.data,
    totals,
    ranked,
    notes: {
      click_attribution: 'deferred — track-event webhook does not yet capture UTM at click time',
      lead_attribution:
        'best-effort UTM substring match on contacts.custom_fields.utm_campaign; will be 0 until campaign tracking URLs are materialized in published posts',
    },
  })
}
