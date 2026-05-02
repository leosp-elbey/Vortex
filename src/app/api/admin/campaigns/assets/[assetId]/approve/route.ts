// Phase 14E — Approve a campaign_asset draft.
// POST /api/admin/campaigns/assets/[assetId]/approve
// Admin-only. Only allowed when current status is 'draft' or 'idea'.
// Posted, scheduled, approved, archived, rejected assets are never modified.
//
// Behavior:
//   - Sets status='approved'
//   - Stamps approved_at = now() and approved_by = current admin user id
//   - Does NOT auto-post or push to content_calendar — that is Phase 14F.

import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const APPROVABLE_FROM = new Set(['draft', 'idea'])

export async function POST(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { assetId } = await params
  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 })

  const { data: asset, error: lookupErr } = await auth.admin
    .from('campaign_assets')
    .select('id, status')
    .eq('id', assetId)
    .maybeSingle()

  if (lookupErr) {
    return NextResponse.json({ error: `lookup failed: ${lookupErr.message}` }, { status: 500 })
  }
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  }
  if (!APPROVABLE_FROM.has(asset.status)) {
    return NextResponse.json(
      { error: `Cannot approve asset in status '${asset.status}'. Only 'draft' or 'idea' are approvable.` },
      { status: 400 },
    )
  }

  const { data: updated, error: updateErr } = await auth.admin
    .from('campaign_assets')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: auth.user.id,
    })
    .eq('id', assetId)
    .eq('status', asset.status) // optimistic guard against concurrent state changes
    .select(
      'id, campaign_id, asset_type, wave, platform, body, hashtags, status, scheduled_for, posted_at, requires_human_approval, approved_at, approved_by, verification_metadata, updated_at',
    )
    .maybeSingle()

  if (updateErr) {
    return NextResponse.json({ error: `update failed: ${updateErr.message}` }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json({ error: 'Asset state changed before update could complete' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, asset: updated })
}
