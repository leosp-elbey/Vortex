// Phase 14R — TikTok automated posting via Content Posting API (Direct Post).
//
// Mirrors the gate / atomic-UPDATE contract that post-to-facebook and
// post-to-instagram already follow:
//
//   1. Auth: admin user only.
//   2. Fetch the row with the joined campaign_assets media URL.
//   3. Run validateManualPostingGate({ supportedPlatforms: ['tiktok'] })
//      — defends against the operator sending an FB/IG row to this route.
//      The gate also runs validateMediaReadiness, which for TikTok requires
//      a non-empty video_url (per src/lib/media-readiness.ts PLATFORM_RULES).
//   4. Resolve the access_token via getValidTikTokAccessToken — refreshes
//      transparently on miss/near-expiry.
//   5. POST to /v2/post/publish/video/init/ with PULL_FROM_URL pointing at
//      the row's video_url (HeyGen-rendered, re-hosted in Supabase Storage
//      per Phase 14L.2.3 to dodge HeyGen's signed-URL expiry).
//   6. On 2xx + non-error payload + publish_id present:
//      atomic UPDATE content_calendar SET status='posted', posted_at=now()
//      with the same defensive guards the other poster routes use:
//        .eq('status', 'approved')   refuse if no longer approved
//        .is('posted_at', null)      refuse if posted_at was set concurrently
//   7. On non-2xx or no publish_id: leave the row intact, return 500/502
//      with TikTok's error.
//
// What this route does NOT do (deliberate scope cuts):
//   - Does NOT pre-query /v2/post/publish/creator_info/query/ for allowed
//     privacy levels. We default to TIKTOK_PRIVACY_LEVEL (env var, default
//     'SELF_ONLY') — the safest setting for an unaudited app. Operators
//     flip to 'PUBLIC_TO_EVERYONE' once their TikTok app is fully audited.
//   - Does NOT poll /v2/post/publish/status/fetch/. The init response is
//     authoritative for "TikTok accepted the post." The actual download +
//     processing happens server-side; if the URL is unreachable or the
//     video is invalid, TikTok returns the error synchronously on init.
//     A future phase can add an async status-poll cron if we want
//     end-state confirmation.
//   - Does NOT handle the FILE_UPLOAD source path. PULL_FROM_URL is the
//     right shape for our HeyGen → Supabase Storage pipeline; chunked file
//     upload is unnecessary and would push us past Vercel Hobby's 10s
//     function timeout.
//   - Does NOT touch posting_status, posting_gate_*, queued_for_posting_at
//     — only status + posted_at flip in the atomic UPDATE.
//
// Endpoint: POST https://open.tiktokapis.com/v2/post/publish/video/init/
//   Headers: Authorization: Bearer <access_token>, Content-Type: application/json; charset=UTF-8
//   Body: {
//     post_info: {
//       title: <caption>,
//       privacy_level: <SELF_ONLY | PUBLIC_TO_EVERYONE | ...>,
//       disable_duet, disable_comment, disable_stitch,
//       video_cover_timestamp_ms,
//     },
//     source_info: { source: 'PULL_FROM_URL', video_url: <https://...> }
//   }
//   Response: { data: { publish_id }, error: { code, message, log_id } }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateManualPostingGate, POSTING_GATE_ROW_SELECT_WITH_MEDIA, flattenPostingGateRow } from '@/lib/posting-gate'
import { getValidTikTokAccessToken } from '@/lib/tiktok-oauth'
import { checkRateLimit } from '@/lib/rate-limit'

const TIKTOK_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/'

/** Caption limit per src/lib/social-specs.ts TIKTOK_SPEC.captionMaxChars. */
const TIKTOK_CAPTION_MAX = 2200

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

/**
 * Build the TikTok post title from caption + hashtags. Trim to platform
 * max so we don't get a 4xx on a long caption.
 */
function buildTitle(caption: string | null, hashtags: string[] | null | undefined): string {
  const tags = (hashtags ?? []).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')
  const base = (caption ?? '').trim()
  const full = tags ? `${base}\n\n${tags}` : base
  if (full.length <= TIKTOK_CAPTION_MAX) return full
  return full.slice(0, TIKTOK_CAPTION_MAX - 1) + '…'
}

/** Coerce `TIKTOK_PRIVACY_LEVEL` into a TikTok-accepted value, defaulting to SELF_ONLY. */
function resolvePrivacyLevel(): string {
  const raw = envTrim('TIKTOK_PRIVACY_LEVEL').toUpperCase()
  const allowed = new Set([
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY',
  ])
  return allowed.has(raw) ? raw : 'SELF_ONLY'
}

interface TikTokInitOk {
  data: { publish_id: string }
  error?: { code: string; message: string; log_id?: string }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Phase 14AM — rate limit: 10 publish attempts / hour / authenticated user.
  // The route is admin-gated upstream, so per-user is the right granularity
  // (per-IP would be too narrow if the operator is on a shared NAT). Users
  // can still re-trigger via the autoposter cron, which has its own kill
  // switch + per-tick FIFO ordering — this guard only catches manual
  // button-mash from the dashboard.
  const rl = checkRateLimit(`post-to-tiktok:${user.id}`, 10, 60 * 60 * 1000)
  if (!rl.ok) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      {
        error: `Too many TikTok publish attempts in the last hour. Retry in ${retryAfterSec}s.`,
        retry_after_seconds: retryAfterSec,
      },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }
  const { content_id } = await request.json().catch(() => ({}))
  if (!content_id) return NextResponse.json({ error: 'content_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Fetch row with the joined campaign_assets media URL — same SELECT
  // shape the gate / IG / FB routes use, so we get the resolved
  // image_url / video_url after flattenPostingGateRow. Phase 14V also
  // pulls media_metadata so we can merge the new tiktok_publish_id into
  // the existing JSONB without clobbering anything the worker put there.
  const { data: rawPost, error: fetchErr } = await admin
    .from('content_calendar')
    .select(`hashtags, media_metadata, ${POSTING_GATE_ROW_SELECT_WITH_MEDIA}`)
    .eq('id', content_id)
    .single()

  if (fetchErr || !rawPost) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const post = flattenPostingGateRow(rawPost)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  // Phase 14K.0.5 / 14L gate. supportedPlatforms restricts this route to
  // TikTok rows only; validateMediaReadiness inside the gate refuses any
  // TikTok row without video_url (PLATFORM_RULES.tiktok.video='required').
  const gate = validateManualPostingGate(post, { supportedPlatforms: ['tiktok'] })
  if (!gate.allowed) {
    return NextResponse.json(
      { success: false, blocked_by_gate: true, reasons: gate.reasons },
      { status: 403 },
    )
  }

  // Defense-in-depth: even though the gate already required video_url,
  // double-check before the token round-trip so an empty URL never reaches
  // TikTok's API.
  const videoUrl = post.video_url
  if (!videoUrl || !videoUrl.trim()) {
    return NextResponse.json(
      { error: 'TikTok post is missing video_url after gate — investigate' },
      { status: 500 },
    )
  }

  // Resolve a usable access_token. Throws when TikTok is not connected
  // (no refresh_token in site_settings) or refresh fails — surface as 503
  // so the operator knows to reconnect, not a generic 500.
  let accessToken: string
  try {
    accessToken = await getValidTikTokAccessToken(admin)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TikTok credentials not configured'
    return NextResponse.json({ error: message }, { status: 503 })
  }

  // Build the Direct Post init payload.
  const rawHashtags = (rawPost as unknown as { hashtags?: string[] | null }).hashtags
  const title = buildTitle(post.caption ?? '', rawHashtags ?? null)

  const initBody = {
    post_info: {
      title,
      privacy_level: resolvePrivacyLevel(),
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: videoUrl,
    },
  }

  let initRes: Response
  try {
    initRes = await fetch(TIKTOK_INIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(initBody),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TikTok network error'
    console.error('[tiktok] init fetch failed', { content_id, error: message })
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const initData = (await initRes.json().catch(() => ({}))) as Partial<TikTokInitOk>
  const errorPayload = initData?.error
  const publishId = initData?.data?.publish_id

  // TikTok returns HTTP 200 with `error.code === 'ok'` on success, and
  // can also return non-2xx with an error object. Treat absence of
  // publish_id OR non-'ok' error code as failure regardless of status.
  const hasError = !!errorPayload && errorPayload.code && errorPayload.code !== 'ok'
  if (!initRes.ok || hasError || !publishId) {
    const reason = errorPayload?.message ?? `HTTP ${initRes.status}`
    console.error('[tiktok] init rejected', { content_id, status: initRes.status, error: errorPayload })
    return NextResponse.json(
      {
        error: `TikTok publish init failed: ${reason}`,
        tiktok_error_code: errorPayload?.code ?? null,
        tiktok_log_id: errorPayload?.log_id ?? null,
      },
      { status: 500 },
    )
  }

  // Phase 14V — merge the new tiktok_publish_id into media_metadata so
  // scripts/diagnose-tiktok-uploads.js can later poll TikTok's async
  // status endpoint for this row. Spread the existing JSONB so any
  // worker-set fields (heygen_video_id, etc.) survive the write. JS-side
  // merge is safe because the row is locked into the {approved, posted_at IS NULL}
  // tuple the inline UPDATE guards check.
  const existingMeta = (rawPost as unknown as { media_metadata?: Record<string, unknown> | null }).media_metadata ?? {}
  const mergedMeta = {
    ...(typeof existingMeta === 'object' && existingMeta !== null ? existingMeta : {}),
    tiktok_publish_id: publishId,
    tiktok_published_at: new Date().toISOString(),
  }

  // Atomic UPDATE — defensive guards inline (mirror of FB / IG / runner
  // patterns):
  //   .eq('status', 'approved')   refuse to flip a row no longer approved
  //   .is('posted_at', null)      refuse to overwrite a concurrently-set posted_at
  const { error: updErr, count: updateCount } = await admin
    .from('content_calendar')
    .update(
      {
        status: 'posted',
        posted_at: new Date().toISOString(),
        media_metadata: mergedMeta,
      },
      { count: 'exact' },
    )
    .eq('id', content_id)
    .eq('status', 'approved')
    .is('posted_at', null)

  if (updErr) {
    console.error('[tiktok] DB update failed after successful init', { content_id, publish_id: publishId, error: updErr.message })
    return NextResponse.json(
      {
        success: false,
        warning: 'TikTok accepted the post but DB update failed — manual reconciliation required',
        tiktok_publish_id: publishId,
        error: updErr.message,
      },
      { status: 500 },
    )
  }
  if ((updateCount ?? 0) !== 1) {
    console.error('[tiktok] DB update affected unexpected row count', { content_id, publish_id: publishId, updateCount })
    return NextResponse.json(
      {
        success: false,
        warning: `TikTok accepted the post but DB UPDATE affected ${updateCount} rows (expected 1) — manual reconciliation required`,
        tiktok_publish_id: publishId,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success: true,
    tiktok_publish_id: publishId,
  })
}
