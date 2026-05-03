// Phase 14K — Autoposter dry-run cron, DRY-RUN ONLY.
//
// GET /api/cron/autoposter-dry-run
// Authorization: Bearer <CRON_SECRET>
//
// Reports content_calendar rows that WOULD be posted by a future autoposter
// (matching the posting-gate eligibility rules from src/lib/autoposter-gate.ts).
// Never calls a platform API. Never mutates rows. Pure read + JSON response.
//
// Hobby plan note: this route is NOT registered in `vercel.json` because we are
// already at the 4-cron limit (check-heygen-jobs / score-and-branch /
// send-sequences / weekly-content). It is invoked manually via curl during
// Phase 14K to verify the gate behavior before any live autoposter ships.
// Adding a fifth cron requires either replacing one of the existing ones or
// upgrading to Pro plan — out of scope for 14K.
//
// CRITICAL: this route must NEVER post. The `LIVE_POSTING_BLOCKED` constant
// from autoposter-gate.ts is included in the response payload as a runtime
// contract; callers can verify the dry-run contract is intact without
// inspecting the source.

import { NextRequest, NextResponse } from 'next/server'
import {
  getAutoposterEligibleRows,
  buildAutoposterDryRunPlan,
  summarizeAutoposterDryRun,
  markAutoposterDryRunInspected,
  LIVE_POSTING_BLOCKED,
} from '@/lib/autoposter-gate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

const SKIPPED_SAMPLE_LIMIT = 25
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export async function GET(request: NextRequest) {
  // Cron auth — same Bearer-token style as the other 4 cron routes.
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${envTrim('CRON_SECRET')}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional query params:
  //   ?limit=50       — cap the candidate scan (default 100, max 500)
  //   ?platform=ig    — narrow to a single platform
  const url = new URL(request.url)
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Math.max(1, Math.min(parseInt(limitRaw, 10) || DEFAULT_LIMIT, MAX_LIMIT)) : DEFAULT_LIMIT
  const platform = url.searchParams.get('platform')?.toLowerCase().trim() || undefined

  try {
    const { eligible, skipped } = await getAutoposterEligibleRows({ limit, platform })
    const plan = buildAutoposterDryRunPlan(eligible)
    const summary = summarizeAutoposterDryRun(eligible, skipped)

    // Phase 14K stub — no-op today; reserved for a future phase that adds
    // a per-run audit row. Returns { ok, written:false, reason } so the
    // response shape is forward-stable.
    const inspected = await markAutoposterDryRunInspected({
      jobId: null,
      rows: eligible,
      summary,
    })

    return NextResponse.json({
      success: true,
      dry_run: true,
      // Runtime contract — callers can assert this is true to confirm the
      // dry-run guard is intact without inspecting the source.
      live_posting_blocked: LIVE_POSTING_BLOCKED,
      eligible_count: summary.eligible_count,
      skipped_count: summary.skipped_count,
      eligible_rows: plan,
      skipped_rows_sample: skipped.slice(0, SKIPPED_SAMPLE_LIMIT),
      summary,
      inspected,
      params: { limit, platform: platform ?? null },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'autoposter dry-run failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
