// Phase 14AS — YouTube auto-post cron.
//
// GET /api/cron/youtube-once
// Authorization: Bearer <CRON_SECRET>
//
// Mirrors the gate / atomic-UPDATE / kill-switch contract from
// /api/cron/autoposter-once but is YouTube-only:
//   - Selects content_calendar rows where platform='youtube'
//   - Uses a SEPARATE kill switch: site_settings.youtube_cron_enabled
//     (operator wanted FB/IG/TikTok and YouTube cron failures to fail
//      independently — a YouTube quota blow-up shouldn't halt the rest)
//   - Uses YouTube's resumable upload flow (2-step: init session → PUT bytes)
//   - Derives title + description from content_calendar.caption + hashtags;
//     falls back to the SBA-boilerplate copy from the manual upload route
//     only when both fields are empty.
//
// Content source: the operator duplicates a TikTok row in the dashboard,
// flips platform to 'youtube', and Marks Ready. The cron then picks it
// up. No new content-generation path; the row's video_url is reused.
//
// Kill switch (defense-in-depth):
//   site_settings.youtube_cron_enabled
//     'true'         → cron actively uploads
//     anything else  → cron returns { skipped: true, reason: 'cron_disabled' }
//     missing key    → treated as disabled (safe default for first deploy)
//
//   On the first non-2xx YouTube response OR a post-flight invariant slip,
//   the cron flips this key to 'false' and returns 500 so the operator
//   gets a loud signal via the kill-switch alert email.
//
// Vercel function timeout — YouTube's resumable PUT streams the entire
// video through this function. Typical Pexels MP4s are 5-30 MB; with
// Vercel's bandwidth the full upload should finish under 30s. Vercel Pro's
// 60s ceiling provides comfortable headroom.
//
// Allowed writes (only on YouTube success):
//   content_calendar.status                            → 'posted'  (atomic)
//   content_calendar.posted_at                         → now()     (atomic)
//   content_calendar.media_metadata                    → merged with youtube_*
//   site_settings.youtube_cron_enabled                 → 'false'   (only on failure auto-disable)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  validateManualPostingGate,
  POSTING_GATE_ROW_SELECT_WITH_MEDIA,
  flattenPostingGateRow,
  type PostingGateRow,
} from '@/lib/posting-gate'
import { getAutoposterEligibleRows } from '@/lib/autoposter-gate'
import { getValidYouTubeAccessToken } from '@/lib/youtube-oauth'
import { sendEmail } from '@/lib/resend'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const YOUTUBE_UPLOAD_INIT_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'

const KILL_SWITCH_KEY = 'youtube_cron_enabled'

/** YouTube hard limits per the Data API docs. */
const YOUTUBE_TITLE_MAX = 100
const YOUTUBE_DESCRIPTION_MAX = 5000

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

function nonEmpty(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

interface YouTubeUploadResult {
  ok: boolean
  youtube_video_id?: string | null
  youtube_url?: string | null
  error?: string
}

/**
 * Build { title, description, tags } from caption + hashtags. Falls back to
 * the SBA boilerplate from upload-to-youtube/route.ts only when the row
 * carries no caption AND no hashtags.
 */
function buildYouTubeMetadata(
  post: PostingGateRow,
  hashtags: string[] | null,
): { title: string; description: string; tags: string[] } {
  const baseCaption = (post.caption ?? '').trim()
  const cleanHashtags = (hashtags ?? [])
    .map(h => h.replace(/^#/, '').trim())
    .filter(h => h.length > 0)
  const tagStr = cleanHashtags.map(h => `#${h}`).join(' ')

  // Title — first sentence (or first 90 chars) of the caption, capped at 100.
  let title: string
  if (baseCaption) {
    const firstSentence = baseCaption.match(/^[^.!?\n]{1,90}[.!?]?/)?.[0] ?? baseCaption.slice(0, 90)
    title = firstSentence.trim().slice(0, YOUTUBE_TITLE_MAX)
  } else {
    title = 'Get Paid to Share Travel Deals | VortexTrips Opportunity'
  }

  // Description — full caption + hashtags. SBA fallback only when both empty.
  let description: string
  if (baseCaption || tagStr) {
    description = `${baseCaption}${tagStr ? '\n\n' + tagStr : ''}`.trim().slice(0, YOUTUBE_DESCRIPTION_MAX)
  } else {
    description =
      'Want to earn money while other people go on vacation?\n\nVortexTrips affiliates earn commissions sharing wholesale travel deals — 40-60% off 500,000+ hotels worldwide.\n\nLearn more: https://www.vortextrips.com/sba'
  }

  // Tags — hashtags without '#' prefix. Fall back to SBA defaults when empty.
  const tags = cleanHashtags.length > 0
    ? cleanHashtags
    : ['travel affiliate', 'make money online', 'travel deals', 'vortextrips', 'work from home']

  return { title, description, tags }
}

/**
 * 2-step resumable upload. Mirrors the admin manual route's flow exactly
 * (snippet+status init → PUT video bytes with duplex streaming).
 */
async function uploadToYouTube(
  post: PostingGateRow,
  hashtags: string[] | null,
  supabase: SupabaseAdmin,
): Promise<YouTubeUploadResult> {
  if (!nonEmpty(post.video_url)) {
    return { ok: false, error: 'YouTube requires a video — no video_url found on this post' }
  }

  let accessToken: string
  try {
    accessToken = await getValidYouTubeAccessToken(supabase)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'YouTube token resolution failed' }
  }

  const meta = buildYouTubeMetadata(post, hashtags)

  // 1. Initiate resumable upload session.
  const initRes = await fetch(YOUTUBE_UPLOAD_INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify({
      snippet: {
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        // categoryId 22 = "People & Blogs" — matches the manual route default.
        categoryId: '22',
        defaultLanguage: 'en',
      },
      status: { privacyStatus: 'public' },
    }),
  })
  const uploadUrl = initRes.headers.get('Location')
  if (!uploadUrl) {
    const detail = await initRes.text().catch(() => `HTTP ${initRes.status}`)
    return { ok: false, error: `YouTube session init failed: ${detail.slice(0, 200)}` }
  }

  // 2. Stream video bytes from source to YouTube.
  const videoRes = await fetch(post.video_url!)
  if (!videoRes.ok || !videoRes.body) {
    return { ok: false, error: `Failed to fetch video bytes from source (HTTP ${videoRes.status})` }
  }
  const contentLength = videoRes.headers.get('content-length')
  const uploadHeaders: Record<string, string> = { 'Content-Type': 'video/mp4' }
  if (contentLength) uploadHeaders['Content-Length'] = contentLength

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: uploadHeaders,
    body: videoRes.body,
    // @ts-expect-error — `duplex` is required for streaming a body in Node but is not yet in lib.dom.d.ts
    duplex: 'half',
  })
  const data = (await putRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
  if (!putRes.ok || !data.id) {
    return { ok: false, error: data?.error?.message ?? `YouTube upload failed (HTTP ${putRes.status})` }
  }
  return {
    ok: true,
    youtube_video_id: data.id,
    youtube_url: `https://www.youtube.com/watch?v=${data.id}`,
  }
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

async function flipKillSwitchToDisabled(supabase: SupabaseAdmin, reason: string): Promise<void> {
  await supabase
    .from('site_settings')
    .upsert(
      { key: KILL_SWITCH_KEY, value: 'false', description: `auto-disabled: ${reason}`, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function sendKillSwitchAlert(args: {
  reason: string
  rowId: string | null
  youtubeVideoId?: string | null
}): Promise<void> {
  const adminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL ?? '').trim()
  if (!adminEmail) {
    console.warn('[youtube-once] kill-switch alert email skipped — ADMIN_NOTIFICATION_EMAIL not configured', { reason: args.reason })
    return
  }
  const subject = '🚨 URGENT: VortexTrips YouTube Auto-Post Halted'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1A1A2E; max-width: 640px;">
      <h1 style="color: #C53030; font-size: 22px; margin-bottom: 8px;">🚨 VortexTrips YouTube Auto-Post Halted</h1>
      <p style="color: #4A5568; margin-top: 0;">
        The YouTube cron at <code>/api/cron/youtube-once</code> hit a definitive failure and
        auto-disabled itself. YouTube auto-posting is paused until you investigate and re-enable.
        Facebook, Instagram, and TikTok auto-posting are NOT affected (separate kill switch).
      </p>
      <div style="background: #FFF5F5; border-left: 4px solid #C53030; padding: 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px 0;"><strong>Reason:</strong> ${escapeHtml(args.reason)}</p>
        ${args.rowId ? `<p style="margin: 0 0 4px 0;"><strong>content_calendar.id:</strong> <code>${escapeHtml(args.rowId)}</code></p>` : ''}
        ${args.youtubeVideoId ? `<p style="margin: 0;"><strong>YouTube video id:</strong> <code>${escapeHtml(args.youtubeVideoId)}</code></p>` : ''}
      </div>
      <p>Re-enable from the dashboard kill switch or run <code>UPDATE site_settings SET value='true' WHERE key='${KILL_SWITCH_KEY}'</code>.</p>
    </div>
  `
  try {
    await sendEmail({ to: adminEmail, subject, html })
  } catch (err) {
    console.warn('[youtube-once] kill-switch alert email failed (non-fatal)', { error: err instanceof Error ? err.message : 'unknown' })
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${envTrim('CRON_SECRET')}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()

  // Kill switch — operator must explicitly enable.
  const switchState = await readKillSwitch(supabase)
  if (switchState === 'disabled') {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'cron_disabled',
      message: `Cron is gated by site_settings.${KILL_SWITCH_KEY}. Set value='true' to enable.`,
      started_at: startedAt,
    })
  }

  // Eligibility — YouTube-only. Uses the existing autoposter-gate helper
  // with platform filter; the helper's media-readiness sub-check already
  // requires video_url for YouTube (see src/lib/media-readiness.ts).
  let plan
  try {
    plan = await getAutoposterEligibleRows({ limit: 50, platform: 'youtube' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'eligibility query failed'
    console.error('[youtube-once] eligibility query failed', { error: message })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }

  if (plan.eligible.length === 0) {
    return NextResponse.json({
      success: true,
      posted: 0,
      reason: 'no_eligible_rows',
      eligible_count: 0,
      skipped_count: plan.skipped.length,
      started_at: startedAt,
    })
  }

  // FIFO — oldest queued first. One row per tick (same invariant as autoposter-once).
  const chosen = plan.eligible[0]
  const queueDepth = plan.eligible.length

  // Re-fetch chosen row with the joined media SELECT so the gate sees the
  // same shape the manual platform routes use.
  const { data: rawPost, error: fetchErr } = await supabase
    .from('content_calendar')
    .select(`hashtags, media_metadata, ${POSTING_GATE_ROW_SELECT_WITH_MEDIA}`)
    .eq('id', chosen.id)
    .single()
  if (fetchErr || !rawPost) {
    console.error('[youtube-once] re-fetch failed', { row_id: chosen.id, error: fetchErr?.message })
    return NextResponse.json({ success: false, error: 'Re-fetch failed' }, { status: 500 })
  }

  const post = flattenPostingGateRow(rawPost)
  if (!post) {
    return NextResponse.json({ success: false, error: 'Re-fetch returned no row' }, { status: 500 })
  }

  // Defense-in-depth gate revalidation.
  const gate = validateManualPostingGate(post, { supportedPlatforms: ['youtube'] })
  if (!gate.allowed) {
    console.warn('[youtube-once] gate refused row at apply time', { row_id: chosen.id, reasons: gate.reasons })
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'gate_refused_at_apply_time',
      row_id: chosen.id,
      gate_reasons: gate.reasons,
      started_at: startedAt,
    })
  }

  // Upload.
  const rawHashtags = (rawPost as unknown as { hashtags?: string[] | null }).hashtags
  const result = await uploadToYouTube(post, rawHashtags ?? null, supabase)
  if (!result.ok) {
    const reason = result.error ?? 'unknown upload failure'
    console.error('[youtube-once] upload failed', { row_id: chosen.id, error: reason })
    await flipKillSwitchToDisabled(supabase, `upload failed: ${reason.slice(0, 200)}`)
    await sendKillSwitchAlert({ reason, rowId: chosen.id })
    return NextResponse.json(
      {
        success: false,
        error: reason,
        row_id: chosen.id,
        kill_switch_flipped: true,
        started_at: startedAt,
      },
      { status: 500 },
    )
  }

  // Atomic UPDATE with idempotency guards — same pattern as autoposter-once,
  // post-to-tiktok, post-to-facebook, post-to-instagram.
  const existingMeta = (rawPost as unknown as { media_metadata?: Record<string, unknown> | null }).media_metadata ?? {}
  const mergedMeta = {
    ...(typeof existingMeta === 'object' && existingMeta !== null ? existingMeta : {}),
    youtube_video_id: result.youtube_video_id,
    youtube_url: result.youtube_url,
    youtube_uploaded_at: new Date().toISOString(),
  }

  const { error: updErr, count } = await supabase
    .from('content_calendar')
    .update(
      {
        status: 'posted',
        posted_at: new Date().toISOString(),
        media_metadata: mergedMeta,
      },
      { count: 'exact' },
    )
    .eq('id', chosen.id)
    .eq('status', 'approved')
    .is('posted_at', null)

  if (updErr || (count ?? 0) !== 1) {
    const reason = updErr?.message ?? `unexpected UPDATE count ${count}`
    console.error('[youtube-once] atomic UPDATE failed after successful upload', {
      row_id: chosen.id,
      youtube_video_id: result.youtube_video_id,
      error: reason,
    })
    await flipKillSwitchToDisabled(supabase, `UPDATE failed after publish: ${reason.slice(0, 200)}`)
    await sendKillSwitchAlert({ reason, rowId: chosen.id, youtubeVideoId: result.youtube_video_id })
    return NextResponse.json(
      {
        success: false,
        warning: 'YouTube accepted the upload but DB update failed — manual reconciliation required',
        youtube_video_id: result.youtube_video_id,
        youtube_url: result.youtube_url,
        kill_switch_flipped: true,
        started_at: startedAt,
      },
      { status: 500 },
    )
  }

  console.log('[youtube-once] published', {
    row_id: chosen.id,
    youtube_video_id: result.youtube_video_id,
    queue_depth_before: queueDepth,
  })
  return NextResponse.json({
    success: true,
    posted: 1,
    row_id: chosen.id,
    youtube_video_id: result.youtube_video_id,
    youtube_url: result.youtube_url,
    queue_depth_before: queueDepth,
    queue_depth_remaining: Math.max(0, queueDepth - 1),
    started_at: startedAt,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
