// Phase 14E — Dashboard Campaign Planner: list endpoint.
// GET /api/admin/campaigns
// Admin-only. Returns event_campaigns rows for the dashboard list view, with
// latest score and asset counts grouped by status.
//
// Query params (all optional):
//   - status     (string, exact match against event_campaigns.status)
//   - category   (string, must match one entry in event_campaigns.categories)
//   - min_score  (number 1-100)
//   - q          (free-text search across campaign_name, event_name, destination_city)

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = new Set([
  'idea',
  'draft',
  'approved',
  'scheduled',
  'active',
  'archived',
])

interface CampaignRow {
  id: string
  campaign_name: string
  event_name: string
  event_year: number
  destination_city: string
  destination_country: string | null
  destination_region: string | null
  categories: string[] | null
  score: number | null
  score_updated_at: string | null
  status: string
  is_cruise: boolean | null
  event_start_date: string | null
  event_end_date: string | null
  created_at: string
  updated_at: string
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')?.trim() || null
  const category = searchParams.get('category')?.trim() || null
  const minScoreRaw = searchParams.get('min_score')
  const q = searchParams.get('q')?.trim() || null

  let minScore: number | null = null
  if (minScoreRaw !== null && minScoreRaw !== '') {
    const n = Number(minScoreRaw)
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      return NextResponse.json({ error: 'min_score must be a number between 1 and 100' }, { status: 400 })
    }
    minScore = Math.round(n)
  }

  if (status && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: `status must be one of ${[...ALLOWED_STATUSES].join(', ')}` }, { status: 400 })
  }

  let query = auth.admin
    .from('event_campaigns')
    .select(
      'id, campaign_name, event_name, event_year, destination_city, destination_country, destination_region, categories, score, score_updated_at, status, is_cruise, event_start_date, event_end_date, created_at, updated_at',
    )
    .order('event_start_date', { ascending: true, nullsFirst: false })
    .limit(500)

  if (status) query = query.eq('status', status)
  if (category) query = query.contains('categories', [category])
  if (minScore !== null) query = query.gte('score', minScore)
  if (q) {
    const safe = q.replace(/[,()]/g, ' ').slice(0, 200)
    query = query.or(
      `campaign_name.ilike.%${safe}%,event_name.ilike.%${safe}%,destination_city.ilike.%${safe}%`,
    )
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: `event_campaigns query failed: ${error.message}` }, { status: 500 })
  }

  const campaigns = (data ?? []) as CampaignRow[]
  const ids = campaigns.map(c => c.id)

  // Asset counts per campaign × status — single query, aggregate in-memory.
  type AssetRow = { campaign_id: string; status: string }
  let assetRows: AssetRow[] = []
  if (ids.length > 0) {
    const { data: assets, error: assetsErr } = await auth.admin
      .from('campaign_assets')
      .select('campaign_id, status')
      .in('campaign_id', ids)
    if (assetsErr) {
      return NextResponse.json({ error: `campaign_assets count failed: ${assetsErr.message}` }, { status: 500 })
    }
    assetRows = (assets ?? []) as AssetRow[]
  }

  const countsByCampaign = new Map<string, Record<string, number>>()
  for (const row of assetRows) {
    const bucket = countsByCampaign.get(row.campaign_id) ?? {}
    bucket[row.status] = (bucket[row.status] ?? 0) + 1
    bucket.total = (bucket.total ?? 0) + 1
    countsByCampaign.set(row.campaign_id, bucket)
  }

  const enriched = campaigns.map(c => ({
    ...c,
    asset_counts: countsByCampaign.get(c.id) ?? { total: 0 },
  }))

  return NextResponse.json({
    ok: true,
    count: enriched.length,
    campaigns: enriched,
    filters: { status, category, min_score: minScore, q },
  })
}
