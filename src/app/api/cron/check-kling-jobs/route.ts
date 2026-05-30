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
//   content_calendar.video_url            (single-clip path only — when completed)
//   content_calendar.media_status         ('ready' for single-clip; 'failed' for either)
//   content_calendar.media_generated_at   (single-clip path only — when completed)
//   content_calendar.media_error          (when failed)
//   content_calendar.media_metadata       (multi-clip path only — Phase 21C kling_clip_jobs[]
//                                          status / video_url back-fill + completion timestamps)
//
// Forbidden writes:
//   content_calendar.kling_job_id  (set by the submission step, never overwritten)
//   content_calendar.video_url     (multi-clip path — assembler/Phase 21D writes it)
//   any campaign_assets column
//   site_settings (this cron has no auto-disable path — failures are
//                  per-row, not pipeline-wide; the operator manages the
//                  kill switch manually if needed).
//
// Phase 21C (multi-clip) addendum:
//   YouTube orchestrator rows store 4 Kling job ids inside
//   media_metadata.kling_clip_jobs[] instead of the scalar kling_job_id
//   column. This route walks BOTH shapes per tick:
//     - scalar path: legacy single-clip rows (Phase 21B)
//     - JSONB path:  Phase 21C youtube rows with media_metadata.kling_clip_jobs[]
//   The two paths share MAX_ROWS_PER_TICK so a busy week of YouTube
//   orchestration can't starve the legacy single-clip queue.

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

  // No early return when the scalar queue is empty — the multi-clip walk
  // for Phase 21C YouTube rows runs unconditionally below. Pre-fix, an
  // empty scalar queue (the steady state — FB/IG/TikTok don't use Kling)
  // short-circuited the function and starved the YouTube poller.
  const candidates = (rows ?? []) as PendingRow[]

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

  // ============================================================
  // Phase 21C — multi-clip walk for YouTube orchestrator rows.
  //
  // The remaining MAX_ROWS_PER_TICK budget (after the scalar walk above)
  // is what's left for multi-clip rows. In practice multi-clip rows are
  // 1/week so the cap rarely matters; the budgeting just guarantees the
  // scalar legacy queue can never be starved.
  // ============================================================
  const remainingBudget = Math.max(0, MAX_ROWS_PER_TICK - candidates.length)
  let multiCompletedClips = 0
  let multiFailedClips = 0
  let multiRowsReadyForAssembly = 0
  let multiRowsFailed = 0
  let multiRowsStillPending = 0

  if (remainingBudget > 0) {
    const { data: multiRows, error: multiErr } = await supabase
      .from('content_calendar')
      .select('id, media_metadata, video_url, created_at')
      .eq('platform', 'youtube')
      .is('video_url', null)
      .order('created_at', { ascending: true })
      .limit(remainingBudget)

    if (multiErr) {
      // Don't fail the whole tick — scalar path already ran. Log + continue.
      console.error('[check-kling-jobs] multi-clip query failed', { error: multiErr.message })
    } else {
      for (const row of multiRows ?? []) {
        const meta = (row.media_metadata && typeof row.media_metadata === 'object')
          ? (row.media_metadata as Record<string, unknown>)
          : {}
        const rawClips = meta.kling_clip_jobs
        if (!Array.isArray(rawClips) || rawClips.length === 0) continue
        const clips = rawClips as Array<Record<string, unknown>>

        let rowMutated = false
        const updatedClips: Array<Record<string, unknown>> = []

        for (const clip of clips) {
          const status = String(clip.status ?? 'unknown').toLowerCase()
          // Terminal states — don't re-poll.
          if (status === 'completed' || status === 'failed') {
            updatedClips.push(clip)
            continue
          }
          const jobId = typeof clip.job_id === 'string' ? clip.job_id : null
          if (!jobId) {
            // Submission failed at orchestrator step — leave as-is.
            updatedClips.push(clip)
            continue
          }

          const poll = await getKlingJobStatus(jobId)
          if (!poll.success) {
            // Transient poll failure — keep clip as-is, retry next tick.
            errors.push({ row_id: row.id, error: `clip ${clip.scene_index ?? '?'} poll: ${poll.error ?? 'unknown'}` })
            updatedClips.push(clip)
            continue
          }

          if (poll.status === 'completed' && poll.videoUrl) {
            updatedClips.push({
              ...clip,
              status: 'completed',
              video_url: poll.videoUrl,
              duration: poll.duration ?? null,
            })
            multiCompletedClips++
            rowMutated = true
          } else if (poll.status === 'failed') {
            updatedClips.push({
              ...clip,
              status: 'failed',
              raw_status: poll.rawStatus ?? null,
            })
            multiFailedClips++
            rowMutated = true
          } else {
            // Still submitted / processing / unknown — write back the
            // normalized status only if it changed.
            const normalized = poll.status ?? 'unknown'
            if (normalized !== status) rowMutated = true
            updatedClips.push({ ...clip, status: normalized })
          }
        }

        if (!rowMutated) {
          multiRowsStillPending++
          continue
        }

        const allCompleted = updatedClips.every(
          c => String(c.status).toLowerCase() === 'completed' && typeof c.video_url === 'string',
        )
        const anyFailed = updatedClips.some(c => String(c.status).toLowerCase() === 'failed')

        const newMeta: Record<string, unknown> = { ...meta, kling_clip_jobs: updatedClips }
        if (allCompleted) newMeta.kling_clips_completed_at = new Date().toISOString()
        if (anyFailed) newMeta.kling_clips_failed_at = new Date().toISOString()

        const updatePayload: Record<string, unknown> = { media_metadata: newMeta }
        if (anyFailed) {
          const failedCount = updatedClips.filter(c => String(c.status).toLowerCase() === 'failed').length
          updatePayload.media_status = 'failed'
          updatePayload.media_error = `Kling render failed for ${failedCount}/${updatedClips.length} clip(s)`.slice(0, 1000)
          multiRowsFailed++
        } else if (allCompleted) {
          // All 4 clips done — row is ready for Phase 21D assembly. Don't set
          // media_status='ready' yet (that's gated on the assembled MP4
          // landing in video_url); the kling_clips_completed_at timestamp is
          // the signal the assembler watches for.
          multiRowsReadyForAssembly++
        } else {
          multiRowsStillPending++
        }

        const { error: upErr } = await supabase
          .from('content_calendar')
          .update(updatePayload)
          .eq('id', row.id)
        if (upErr) {
          errors.push({ row_id: row.id, error: `multi-clip UPDATE failed: ${upErr.message}` })
        } else {
          console.log('[check-kling-jobs] multi-clip row updated', {
            row_id: row.id,
            all_completed: allCompleted,
            any_failed: anyFailed,
          })
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    polled: candidates.length,
    completed,
    failed,
    still_pending: stillPending,
    multi_clip_completed_clips: multiCompletedClips,
    multi_clip_failed_clips: multiFailedClips,
    multi_clip_rows_ready_for_assembly: multiRowsReadyForAssembly,
    multi_clip_rows_failed: multiRowsFailed,
    multi_clip_rows_still_pending: multiRowsStillPending,
    errors,
    started_at: startedAt,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
