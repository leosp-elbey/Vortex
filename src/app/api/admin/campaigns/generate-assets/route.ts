// Phase 14D — Campaign asset generator API.
// POST /api/admin/campaigns/generate-assets
// Admin-only. Loads an event_campaigns row and generates the full asset bundle
// described in VORTEX_EVENT_CAMPAIGN_SKILL.md §5/§6 as drafts in campaign_assets.
//
// Inputs (JSON body):
//   - event_campaign_id (uuid, required)
//   - model_override    (string, optional — defaults to AI_MEDIUM_MODEL via ai-router)
//   - asset_types       (string[], optional — defaults to all 10 types)
//   - force_regenerate  (boolean, optional — archives existing drafts before inserting)
//
// Behavior:
//   - 400 if input invalid.
//   - 404 if event_campaign_id not found.
//   - 200 with already_exists=true when assets already exist and force_regenerate is not set.
//   - 200 with the generated asset bundle on success. Every row inserted as status='draft'
//     with requires_human_approval=true.
//   - Never auto-publishes, never writes to content_calendar, never overwrites posted assets.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import {
  generateCampaignAssets,
  ALL_ASSET_TYPES,
  type AssetType,
} from '@/lib/event-campaign-asset-generator'

// Hobby plan caps function execution at 10s; on Pro this would run for up to 60s.
// Set the upper bound so a model timeout returns a real 5xx instead of a platform 504.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const RequestSchema = z.object({
  event_campaign_id: z.string().uuid(),
  model_override: z.string().trim().min(1).max(200).optional(),
  asset_types: z.array(z.enum(ALL_ASSET_TYPES as readonly [AssetType, ...AssetType[]])).optional(),
  force_regenerate: z.boolean().optional(),
  /** Skip the Claude verifier pass — used by the dashboard's batched generation on Vercel Hobby
   * to keep each call under the 10s function timeout. */
  skip_verifier: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const result = await generateCampaignAssets({
      event_campaign_id: parsed.data.event_campaign_id,
      model_override: parsed.data.model_override,
      asset_types: parsed.data.asset_types,
      force_regenerate: parsed.data.force_regenerate,
      skip_verifier: parsed.data.skip_verifier,
      createdBy: auth.user.id,
    })

    if (!result.ok && result.message === 'event_campaign_id not found') {
      return NextResponse.json(result, { status: 404 })
    }
    if (!result.ok) {
      return NextResponse.json(result, { status: 502 })
    }
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
