// Phase 14E — Reject a campaign_asset.
// POST /api/admin/campaigns/assets/[assetId]/reject
// Admin-only. Allowed when current status is 'draft', 'idea', or 'approved'.
// Posted, scheduled, archived, rejected assets are never modified.
//
// Optional body: { reason: string }
// When provided, reason is merged into verification_metadata.rejection_reason
// (the campaign_assets table has no dedicated rejection-reason column;
// JSONB metadata is the only safe place without a schema change).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const REJECTABLE_FROM = new Set(['draft', 'idea', 'approved'])

const RejectSchema = z.object({
  reason: z.string().trim().min(1).max(2000).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { assetId } = await params
  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const parsed = RejectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const { data: asset, error: lookupErr } = await auth.admin
    .from('campaign_assets')
    .select('id, status, verification_metadata')
    .eq('id', assetId)
    .maybeSingle()

  if (lookupErr) {
    return NextResponse.json({ error: `lookup failed: ${lookupErr.message}` }, { status: 500 })
  }
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  }
  if (!REJECTABLE_FROM.has(asset.status)) {
    return NextResponse.json(
      { error: `Cannot reject asset in status '${asset.status}'. Only 'draft', 'idea', or 'approved' are rejectable.` },
      { status: 400 },
    )
  }

  const existingMeta =
    asset.verification_metadata && typeof asset.verification_metadata === 'object' && !Array.isArray(asset.verification_metadata)
      ? (asset.verification_metadata as Record<string, unknown>)
      : {}

  const updatePayload: Record<string, unknown> = {
    status: 'rejected',
  }
  if (parsed.data.reason) {
    updatePayload.verification_metadata = {
      ...existingMeta,
      rejection_reason: parsed.data.reason,
      rejected_by: auth.user.id,
      rejected_at: new Date().toISOString(),
    }
  }

  const { data: updated, error: updateErr } = await auth.admin
    .from('campaign_assets')
    .update(updatePayload)
    .eq('id', assetId)
    .eq('status', asset.status) // optimistic guard against concurrent state changes
    .select(
      'id, campaign_id, asset_type, wave, platform, body, hashtags, status, scheduled_for, posted_at, requires_human_approval, approved_at, verification_metadata, updated_at',
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
