// Phase 21B — Kling AI render poller.
//
// GET /api/cron/check-kling-jobs
// Authorization: Bearer <CRON_SECRET>
//
// Polls every 10 minutes (vercel.json: "*/10 * * * *"). For each pending
// row (kling_job_id IS NOT NULL AND video_url IS NULL), calls Kling's
// status endpoint and reacts:
//   - completed → atomic UPDATE video_url + media_status='ready' +
//                 media_generated_at=now
//   - failed    → UPDATE media_status='failed' + media_error
//   - submitted / processing / unknown → leave row untouched; retry next tick
//
// FIFO by created_at ascending; max 10 rows per tick keeps the function
// comfortably under Vercel Pro's 60s ceiling even when every poll roundtrip
// takes ~3s.
//
// Kill switch: site_settings.kling_cron_enabled
//   'true'        → cron actively polls
//   anything else → returns { skipped: true, reason: 'cron_disabled' }
//   missing key   → treated as disabled (safe default; migration 037
//                   seeds value='true' once applied).
//
// Allowed writes (only on Kling response):
//   content_calendar.video_url            (when completed)
//   content_calendar.media_status         ('ready' or 'failed')
//   content_calendar.media_generated_at   (when completed)
//   content_calendar.media_error          (when failed)
//
// Forbidden writes:
//   content_calendar.kling_job_id  (set by the submission step, never overwritten)
//   any campaign_assets column
//   site_settings (this cron has no auto-disable path — failures are
//                  per-row, not pipeline-wide; the operator manages the
//                  kill switch manually if needed).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKlingJobStatus } from '@/lib/kling'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KILL_SWITCH_KEY = 'kling_cron_enabled'
const MAX_ROWS_PER_TICK = 10

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

async function readKillSwitch(supabase: SupabaseAdmin): Promise<'enabled' | 'disabled'> {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', KILL_SWITCH_KEY)
    .maybeSingle()
  const value = (data?.value as string | undefined)?.trim().toLowerCase()
  return value === 'true' ? 'enabled' : 'disabled'
}

interface PendingRow {
  id: string
  kling_job_id: string | null
  video_url: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${envTrim('CRON_SECRET')}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()

  const switchState = await readKillSwitch(supabase)
  if (switchState === 'disabled') {
    console.log('[check-kling-jobs] cron disabled', { startedAt, kill_switch: KILL_SWITCH_KEY })
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'cron_disabled',
      message: `Cron is gated by site_settings.${KILL_SWITCH_KEY}. Set value='true' to enable.`,
      started_at: startedAt,
    })
  }

  const { data: rows, error: queryErr } = await supabase
    .from('content_calendar')
    .select('id, kling_job_id, video_url, created_at')
    .not('kling_job_id', 'is', null)
    .is('video_url', null)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS_PER_TICK)

  if (queryErr) {
    console.error('[check-kling-jobs] eligibility query failed', { error: queryErr.message })
    return NextResponse.json({ success: false, error: queryErr.message }, { status: 500 })
  }

  const candidates = (rows ?? []) as PendingRow[]
  if (candidates.length === 0) {
    return NextResponse.json({
      success: true,
      polled: 0,
      reason: 'no_pending_jobs',
      started_at: startedAt,
    })
  }

  let completed = 0
  let failed = 0
  let stillPending = 0
  const errors: Array<{ row_id: string; error: string }> = []

  for (const row of candidates) {
    if (!row.kling_job_id) {
      stillPending++
      continue
    }
    const status = await getKlingJobStatus(row.kling_job_id)
    if (!status.success) {
      errors.push({ row_id: row.id, error: status.error ?? 'kling status check failed' })
      continue
    }

    if (status.status === 'completed' && status.videoUrl) {
      // Defensive atomic guard: refuse if video_url got populated since the
      // SELECT (another tick / a manual edit). Mirrors the gate-style guards
      // in autoposter-once.
      const { error: upErr, count } = await supabase
        .from('content_calendar')
        .update(
          {
            video_url: status.videoUrl,
            media_status: 'ready',
            media_generated_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('id', row.id)
        .is('video_url', null)

      if (upErr) {
        errors.push({ row_id: row.id, error: `UPDATE failed: ${upErr.message}` })
        continue
      }
      if ((count ?? 0) !== 1) {
        errors.push({ row_id: row.id, error: `UPDATE affected ${count} rows (expected 1)` })
        continue
      }
      completed++
      console.log('[check-kling-jobs] row completed', {
        row_id: row.id,
        kling_job_id: row.kling_job_id,
        video_url: status.videoUrl,
      })
      continue
    }

    if (status.status === 'failed') {
      const errorDetail = `Kling render failed (status=${status.rawStatus ?? 'unknown'})`
      const { error: upErr } = await supabase
        .from('content_calendar')
        .update({ media_status: 'failed', media_error: errorDetail.slice(0, 1000) })
        .eq('id', row.id)
      if (upErr) {
        errors.push({ row_id: row.id, error: `UPDATE (failure path) failed: ${upErr.message}` })
        continue
      }
      failed++
      console.warn('[check-kling-jobs] row failed', {
        row_id: row.id,
        kling_job_id: row.kling_job_id,
        raw_status: status.rawStatus,
      })
      continue
    }

    // submitted / processing / unknown — leave row alone; retry next tick.
    stillPending++
  }

  return NextResponse.json({
    success: true,
    polled: candidates.length,
    completed,
    failed,
    still_pending: stillPending,
    errors,
    started_at: startedAt,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
