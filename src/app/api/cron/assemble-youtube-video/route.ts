// Phase 21D — Cinematic YouTube video assembler.
//
// GET /api/cron/assemble-youtube-video
// Authorization: Bearer <CRON_SECRET>
//
// Runs every 15 minutes (vercel.json: "*/15 * * * *"). Two-state machine
// per eligible row:
//
//   Eligible row: platform='youtube' AND video_url IS NULL AND
//                 media_metadata.kling_clips_completed_at IS NOT NULL
//                 (the signal Phase 21C's check-kling-jobs writes when all
//                 4 Kling clips finish — see commit d0d53a7).
//
//   State A — media_metadata.shotstack_render_id IS NULL:
//     Submit a Shotstack render with the 4 Kling clip URLs + the
//     elevenlabs_audio_url. Persist render_id into media_metadata.
//
//   State B — media_metadata.shotstack_render_id IS SET:
//     Poll Shotstack. On 'done':
//       1. Download MP4 from Shotstack's CDN
//       2. Re-host to Supabase Storage at content/youtube/<row_id>.mp4
//       3. Atomic UPDATE flipping all the youtube-once gate fields so
//          the existing daily YouTube upload cron picks the row up at
//          12:00 UTC: video_url, media_status='ready', status='approved',
//          posting_status='ready', posting_gate_approved=true,
//          queued_for_posting_at=now()
//     On 'failed': media_status='failed' + media_error.
//     On any other status: leave row alone, retry next tick.
//
// Why re-host to Supabase: Shotstack CDN URLs have a TTL (24h for free
// tier; longer for paid). If the assembler finishes a render late Sunday
// and youtube-once runs Monday 12:00 UTC, that's ~36h gap — re-hosting
// guarantees the URL is live when YouTube needs it.
//
// Why MAX_ROWS_PER_TICK=1: download (5-10s) + Supabase upload (5-15s) per
// row is the slowest part. One row per tick × 4 ticks/hour is comfortable
// for a weekly cadence; the 60s function ceiling stays well clear.
//
// Kill switch: site_settings.youtube_video_assembly_cron_enabled
//   'true'        → cron actively submits / polls
//   anything else → returns { skipped: true, reason: 'cron_disabled' }
//   missing key   → treated as disabled (safe default; migration 039 seeds 'true').

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  submitShotstackRender,
  getShotstackRenderStatus,
  type ShotstackClip,
} from '@/lib/shotstack'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// 120s — accommodates the slowest path: poll (3s) + download 100MB MP4
// from Shotstack (10s) + upload to Supabase (15s) + DB writes (1s) +
// network buffer. The 60s default is too tight for a 1080p assembly.
export const maxDuration = 120

const KILL_SWITCH_KEY = 'youtube_video_assembly_cron_enabled'
const MAX_ROWS_PER_TICK = 1
const STORAGE_BUCKET = 'media'
const STORAGE_PATH_PREFIX = 'content/youtube/'

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

interface RowSnapshot {
  id: string
  media_metadata: Record<string, unknown> | null
  elevenlabs_audio_url: string | null
  video_url: string | null
  created_at: string
}

interface ClipJobEntry {
  scene_index?: number
  job_id?: string | null
  status?: string
  video_url?: string | null
  duration?: number | null
}

interface ProcessOutcome {
  row_id: string
  action: 'submitted' | 'rendered' | 'failed' | 'still_pending' | 'skipped'
  shotstack_render_id?: string
  video_url?: string
  error?: string
}

// ============================================================
// State A — submit a fresh Shotstack render.
// ============================================================

async function submitNewRender(
  supabase: SupabaseAdmin,
  row: RowSnapshot,
): Promise<ProcessOutcome> {
  const meta = (row.media_metadata && typeof row.media_metadata === 'object')
    ? row.media_metadata as Record<string, unknown>
    : {}
  const rawClips = meta.kling_clip_jobs
  if (!Array.isArray(rawClips) || rawClips.length === 0) {
    return { row_id: row.id, action: 'skipped', error: 'no kling_clip_jobs[] in media_metadata' }
  }
  const clips = rawClips as ClipJobEntry[]
  const videoClips: ShotstackClip[] = []
  for (const c of clips) {
    if (typeof c.video_url !== 'string' || c.video_url.length === 0) {
      return {
        row_id: row.id,
        action: 'skipped',
        error: `clip scene_index=${c.scene_index ?? '?'} missing video_url — should not happen when kling_clips_completed_at is set`,
      }
    }
    const dur = typeof c.duration === 'number' && c.duration > 0 ? c.duration : 5
    videoClips.push({ src: c.video_url, duration_seconds: dur })
  }
  if (!row.elevenlabs_audio_url) {
    return { row_id: row.id, action: 'skipped', error: 'missing elevenlabs_audio_url' }
  }

  console.log('[assemble-youtube-video] submitting shotstack render', {
    row_id: row.id,
    clip_count: videoClips.length,
    clip_durations: videoClips.map(c => c.duration_seconds),
    audio_url_host: (() => { try { return new URL(row.elevenlabs_audio_url).host } catch { return 'unparseable' } })(),
    clip_url_hosts: videoClips.map(c => { try { return new URL(c.src).host } catch { return 'unparseable' } }),
  })

  const submit = await submitShotstackRender({
    videoClips,
    audioUrl: row.elevenlabs_audio_url,
    resolution: 'hd',
  })
  if (!submit.success || !submit.shotstackRenderId) {
    return { row_id: row.id, action: 'failed', error: submit.error ?? 'Shotstack submit returned no id' }
  }

  // Persist the render id so the next tick polls instead of double-submitting.
  const newMeta = {
    ...meta,
    shotstack_render_id: submit.shotstackRenderId,
    shotstack_submitted_at: new Date().toISOString(),
  }
  const { error: upErr } = await supabase
    .from('content_calendar')
    .update({ media_metadata: newMeta })
    .eq('id', row.id)
    .is('video_url', null)
  if (upErr) {
    // Render is in flight but DB write failed — log loudly; the next tick
    // will resubmit (Shotstack accepts the duplicate; cost is one extra
    // render). Better than silently dropping the id.
    console.error('[assemble-youtube-video] failed to persist render id', {
      row_id: row.id,
      shotstack_render_id: submit.shotstackRenderId,
      error: upErr.message,
    })
    return {
      row_id: row.id,
      action: 'failed',
      shotstack_render_id: submit.shotstackRenderId,
      error: `persist render id failed: ${upErr.message}`,
    }
  }
  console.log('[assemble-youtube-video] submitted', {
    row_id: row.id,
    shotstack_render_id: submit.shotstackRenderId,
  })
  return { row_id: row.id, action: 'submitted', shotstack_render_id: submit.shotstackRenderId }
}

// ============================================================
// State B — poll an in-flight render.
// ============================================================

async function pollExistingRender(
  supabase: SupabaseAdmin,
  row: RowSnapshot,
  renderId: string,
): Promise<ProcessOutcome> {
  const status = await getShotstackRenderStatus(renderId)
  if (!status.success) {
    // Transient — try again next tick.
    return { row_id: row.id, action: 'still_pending', error: `poll failed: ${status.error ?? 'unknown'}` }
  }

  if (status.status === 'done' && status.videoUrl) {
    // Download → re-host → atomic flip of all the gate fields.
    let buffer: ArrayBuffer
    try {
      const dlRes = await fetch(status.videoUrl)
      if (!dlRes.ok) {
        return { row_id: row.id, action: 'failed', error: `Shotstack MP4 download HTTP ${dlRes.status}` }
      }
      buffer = await dlRes.arrayBuffer()
      if (buffer.byteLength === 0) {
        return { row_id: row.id, action: 'failed', error: 'Shotstack MP4 download returned empty body' }
      }
    } catch (err) {
      return { row_id: row.id, action: 'failed', error: err instanceof Error ? err.message : 'download threw' }
    }

    const storagePath = `${STORAGE_PATH_PREFIX}${row.id}.mp4`
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: 'video/mp4', upsert: true })
    if (upErr) {
      return { row_id: row.id, action: 'failed', error: `Supabase upload failed: ${upErr.message}` }
    }
    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
    const finalUrl = pub?.publicUrl
    if (!finalUrl) {
      return { row_id: row.id, action: 'failed', error: 'Supabase returned no public URL' }
    }

    // Atomic write. The .is('video_url', null) guard prevents double-writes
    // if a concurrent tick / manual edit landed something first.
    const meta = (row.media_metadata && typeof row.media_metadata === 'object')
      ? row.media_metadata as Record<string, unknown>
      : {}
    const newMeta = {
      ...meta,
      shotstack_video_url: status.videoUrl,
      shotstack_completed_at: new Date().toISOString(),
      assembled_duration_seconds: status.durationSeconds ?? null,
      assembled_byte_length: buffer.byteLength,
    }
    const nowIso = new Date().toISOString()
    const { error: updErr, count } = await supabase
      .from('content_calendar')
      .update(
        {
          video_url: finalUrl,
          media_status: 'ready',
          media_generated_at: nowIso,
          media_source: 'shotstack',
          // Flip the youtube-once gate fields so the next 12:00 UTC tick
          // picks this row up. Mirrors the gate contract from autoposter
          // (see post-to-instagram / youtube-once routes).
          status: 'approved',
          posting_status: 'ready',
          posting_gate_approved: true,
          queued_for_posting_at: nowIso,
          media_metadata: newMeta,
        },
        { count: 'exact' },
      )
      .eq('id', row.id)
      .is('video_url', null)
    if (updErr) {
      return { row_id: row.id, action: 'failed', error: `DB update failed after upload: ${updErr.message}` }
    }
    if ((count ?? 0) !== 1) {
      return { row_id: row.id, action: 'failed', error: `DB update affected ${count} rows (expected 1)` }
    }
    console.log('[assemble-youtube-video] rendered', {
      row_id: row.id,
      shotstack_render_id: renderId,
      bytes: buffer.byteLength,
      video_url: finalUrl,
    })
    return { row_id: row.id, action: 'rendered', shotstack_render_id: renderId, video_url: finalUrl }
  }

  if (status.status === 'failed') {
    const meta = (row.media_metadata && typeof row.media_metadata === 'object')
      ? row.media_metadata as Record<string, unknown>
      : {}
    const newMeta = {
      ...meta,
      shotstack_failed_at: new Date().toISOString(),
      shotstack_raw_status: status.rawStatus ?? null,
      shotstack_error_detail: status.errorDetail ?? null,
    }
    const errorDetail = `Shotstack render failed: ${status.errorDetail ?? status.rawStatus ?? 'unknown'}`.slice(0, 1000)
    const { error: upErr } = await supabase
      .from('content_calendar')
      .update({
        media_status: 'failed',
        media_error: errorDetail,
        media_metadata: newMeta,
      })
      .eq('id', row.id)
    if (upErr) {
      console.error('[assemble-youtube-video] failed to record Shotstack failure', {
        row_id: row.id,
        shotstack_render_id: renderId,
        error: upErr.message,
      })
    }
    console.warn('[assemble-youtube-video] render failed', {
      row_id: row.id,
      shotstack_render_id: renderId,
      raw_status: status.rawStatus,
      detail: status.errorDetail,
    })
    return { row_id: row.id, action: 'failed', shotstack_render_id: renderId, error: errorDetail }
  }

  // queued / fetching / rendering / saving / unknown — leave alone.
  return { row_id: row.id, action: 'still_pending', shotstack_render_id: renderId }
}

// ============================================================
// Main
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${envTrim('CRON_SECRET')}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()

  const switchState = await readKillSwitch(supabase)
  if (switchState === 'disabled') {
    console.log('[assemble-youtube-video] cron disabled', { startedAt, kill_switch: KILL_SWITCH_KEY })
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'cron_disabled',
      message: `Cron is gated by site_settings.${KILL_SWITCH_KEY}. Set value='true' to enable.`,
      started_at: startedAt,
    })
  }

  // Eligibility: YouTube row with all Kling clips ready, no assembled video yet.
  const { data: rows, error: queryErr } = await supabase
    .from('content_calendar')
    .select('id, media_metadata, elevenlabs_audio_url, video_url, created_at')
    .eq('platform', 'youtube')
    .is('video_url', null)
    .not('media_metadata->kling_clips_completed_at', 'is', null)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS_PER_TICK)

  if (queryErr) {
    console.error('[assemble-youtube-video] eligibility query failed', { error: queryErr.message })
    return NextResponse.json({ success: false, error: queryErr.message }, { status: 500 })
  }

  const candidates = (rows ?? []) as RowSnapshot[]
  if (candidates.length === 0) {
    return NextResponse.json({
      success: true,
      considered: 0,
      reason: 'no_rows_ready_for_assembly',
      started_at: startedAt,
    })
  }

  const outcomes: ProcessOutcome[] = []
  for (const row of candidates) {
    const meta = (row.media_metadata && typeof row.media_metadata === 'object')
      ? row.media_metadata as Record<string, unknown>
      : {}
    const renderId = typeof meta.shotstack_render_id === 'string' && meta.shotstack_render_id.length > 0
      ? meta.shotstack_render_id
      : null

    if (renderId) {
      outcomes.push(await pollExistingRender(supabase, row, renderId))
    } else {
      outcomes.push(await submitNewRender(supabase, row))
    }
  }

  return NextResponse.json({
    success: true,
    considered: candidates.length,
    outcomes,
    started_at: startedAt,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
