// Phase 14E — Dashboard Campaign Planner: campaign detail endpoint.
// GET /api/admin/campaigns/[id]
// Admin-only. Returns the full event_campaigns row, all related campaign_assets,
// and the latest campaign_scores row (with breakdown).

import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: campaign, error: campaignErr } = await auth.admin
    .from('event_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (campaignErr) {
    return NextResponse.json({ error: `event_campaigns lookup failed: ${campaignErr.message}` }, { status: 500 })
  }
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const { data: assets, error: assetsErr } = await auth.admin
    .from('campaign_assets')
    .select(
      'id, campaign_id, asset_type, wave, platform, body, hashtags, status, scheduled_for, posted_at, post_url, requires_human_approval, approved_at, approved_by, generation_metadata, verification_metadata, created_at, updated_at',
    )
    .eq('campaign_id', id)
    .order('created_at', { ascending: false })

  if (assetsErr) {
    return NextResponse.json({ error: `campaign_assets query failed: ${assetsErr.message}` }, { status: 500 })
  }

  const { data: latestScoreRows, error: scoreErr } = await auth.admin
    .from('campaign_scores')
    .select('id, scored_at, week_of, score, breakdown, generated_by, model_used, notes')
    .eq('campaign_id', id)
    .order('scored_at', { ascending: false })
    .limit(1)

  if (scoreErr) {
    return NextResponse.json({ error: `campaign_scores query failed: ${scoreErr.message}` }, { status: 500 })
  }

  const assetRows = assets ?? []
  const breakdown: Record<string, number> = {}
  for (const a of assetRows) {
    breakdown[a.status] = (breakdown[a.status] ?? 0) + 1
  }

  return NextResponse.json({
    ok: true,
    campaign,
    assets: assetRows,
    asset_counts: { total: assetRows.length, ...breakdown },
    latest_score: latestScoreRows?.[0] ?? null,
  })
}
