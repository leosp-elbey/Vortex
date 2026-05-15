// Phase 14R — TikTok OAuth helpers + token persistence.
//
// Functions:
//   - exchangeCodeForTokens(code, redirectUri): trade an authorization code
//     for { access_token, refresh_token, expires_in, ... } via TikTok's
//     /v2/oauth/token/ endpoint.
//   - refreshAccessToken(refreshToken): swap a refresh token for a new
//     access token via the same endpoint with grant_type=refresh_token.
//   - getValidTikTokAccessToken(supabase): read tokens from site_settings,
//     refresh if expired (with a 60s safety buffer), persist the rotated
//     tokens, return a usable access token. Single entrypoint for poster
//     routes — they never touch the OAuth endpoints directly.
//
// Storage convention (mirrors the YouTube pattern in
// src/app/api/auth/youtube/callback/route.ts):
//   site_settings.key = 'tiktok_access_token'         | value = <token>
//   site_settings.key = 'tiktok_refresh_token'        | value = <token>
//   site_settings.key = 'tiktok_token_expires_at'     | value = <ISO 8601>
//   site_settings.key = 'tiktok_open_id'              | value = <open_id>
//
// No platform calls beyond TikTok's OAuth endpoint. Pure POST + upsert.
// Server-only (calls createAdminClient and reads process.env).
//
// Security notes:
//   - The OAuth `code` is short-lived and single-use; we never log it.
//   - Tokens are stored in site_settings which has admin-only RLS
//     (migration 007). The route reads them via the admin client, never
//     exposes them to the browser.
//   - `state` CSRF validation is intentionally deferred — the existing
//     YouTube callback also doesn't validate state. A future phase can
//     unify both flows behind a session-backed state store.
//
// All times in UTC ISO 8601 strings.
//
// Endpoint: https://open.tiktokapis.com/v2/oauth/token/
//   Body: x-www-form-urlencoded
//   Response (success):
//     { access_token, expires_in, open_id, refresh_token,
//       refresh_expires_in, scope, token_type }
//   Response (error):
//     { error, error_description, log_id }

import { createAdminClient } from '@/lib/supabase/admin'

const TIKTOK_OAUTH_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const TIKTOK_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'
const TIKTOK_CREATOR_INFO_URL = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/'

/** Buffer (ms) before access_token expiry at which we proactively refresh. */
const REFRESH_BUFFER_MS = 60_000

export interface TikTokTokenResponse {
  /** Bearer token used for /v2/post/publish/* calls. */
  access_token: string
  /** Seconds until the access_token expires. Typically 86400 (24h). */
  expires_in: number
  /** Stable per-user identifier within the TikTok app. */
  open_id: string
  /** Long-lived token used to mint new access_tokens. */
  refresh_token: string
  /** Seconds until the refresh_token itself expires. Typically 31536000 (365d). */
  refresh_expires_in: number
  /** Granted scope string (e.g. 'user.info.basic,video.publish'). */
  scope: string
  /** Always 'Bearer'. */
  token_type: string
}

interface TikTokOAuthError {
  error: string
  error_description?: string
  log_id?: string
}

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

// ============================================================
// Phase 14AM.1 — Sandbox credential toggle.
//
// TikTok issues two separate credential pairs: one for the audited
// production app and one for the Sandbox app (used for testing
// pre-audit, including the demo video for the app review submission).
// `TIKTOK_USE_SANDBOX=true` (or `=1`) flips every TikTok-touching code
// path to read the `_SANDBOX` variants. Default false → production
// behavior unchanged. Both modes can coexist in Vercel env vars; the
// operator flips one toggle to switch between them.
//
// All four files that read these credentials route through the helpers
// below so the toggle decision lives in exactly one place:
//   - src/lib/tiktok-oauth.ts (this file)         — exchange + refresh
//   - src/app/api/auth/tiktok/login/route.ts      — login redirect
//   - src/app/api/auth/tiktok/status/route.ts     — exposes sandbox flag
//   - scripts/run-autoposter-once.js              — JS mirror in main()
// ============================================================

/** True when `TIKTOK_USE_SANDBOX` env is set to `'true'` or `'1'`. */
export function tikTokIsSandboxMode(): boolean {
  const v = envTrim('TIKTOK_USE_SANDBOX').toLowerCase()
  return v === 'true' || v === '1'
}

/** Resolve the active TikTok client_key — production or sandbox. */
export function getTikTokClientKey(): string {
  return tikTokIsSandboxMode()
    ? envTrim('TIKTOK_CLIENT_KEY_SANDBOX')
    : envTrim('TIKTOK_CLIENT_KEY')
}

/** Resolve the active TikTok client_secret — production or sandbox. */
export function getTikTokClientSecret(): string {
  return tikTokIsSandboxMode()
    ? envTrim('TIKTOK_CLIENT_SECRET_SANDBOX')
    : envTrim('TIKTOK_CLIENT_SECRET')
}

// ============================================================
// Phase 14AO — PULL_FROM_URL ownership proxy.
//
// TikTok's `pull_from_url` source requires the URL's host domain to be
// verified in the TikTok Developer Portal. We verified
// `www.vortextrips.com`. Pexels CDN URLs (`videos.pexels.com`) are not
// — and we can't put a verification file on Pexels' infrastructure.
//
// The fix: a Next.js rewrite at `/v/p/*` proxies to Pexels' video CDN
// (see `next.config.js`). This helper translates a Pexels URL into the
// equivalent vortextrips.com proxy URL so TikTok sees a verified host.
// All other URLs pass through unchanged (already on a verified domain
// or the TikTok call will fail at the same verification step we're
// solving — let TikTok's error speak for itself).
//
// Stable input: https://videos.pexels.com/video-files/<id>/<file>.mp4
// Stable output: https://<APP_HOST>/v/p/<id>/<file>.mp4
//
// `APP_HOST` is read from NEXT_PUBLIC_APP_URL (canonical production
// host) with a fallback that callers can override per-request. The
// fallback exists so cron / script paths that don't carry a request
// context still produce a working absolute URL.
// ============================================================

const PEXELS_VIDEO_HOST = 'videos.pexels.com'
const PEXELS_VIDEO_PATH_PREFIX = '/video-files/'
const PEXELS_PROXY_PATH_PREFIX = '/v/p/'

// Phase 14AU — Supabase Storage proxy for legacy HeyGen-era TikTok videos.
// 26 approved TikTok rows still reference Supabase Storage URLs (Phase 14L.2.2
// HeyGen pipeline, pre-Phase-14AG Pexels swap). Without this proxy they would
// all fail TikTok's URL-ownership check on the next autoposter tick and flip
// the kill switch back off. Path shape from the live DB:
//   /storage/v1/object/public/media/content/tiktok/<filename>
// matches the Supabase public-bucket URL convention (bucket = 'media',
// path = 'content/tiktok/<id>-<hash>.mp4').
const SUPABASE_STORAGE_HOST_SUFFIX = '.supabase.co'
const SUPABASE_STORAGE_PATH_PREFIX = '/storage/v1/object/public/media/content/tiktok/'
const SUPABASE_PROXY_PATH_PREFIX = '/v/s/'

/**
 * Translate a video URL into a TikTok-compatible URL whose host is on
 * a domain we've registered with the TikTok Developer Portal.
 *
 * - Pexels CDN (`videos.pexels.com/video-files/...`) →
 *   `<APP_HOST>/v/p/...` (Phase 14AO).
 * - Supabase Storage (`*.supabase.co/storage/v1/object/public/media/content/tiktok/...`) →
 *   `<APP_HOST>/v/s/...` (Phase 14AU).
 * - For any other URL (already on `vortextrips.com`, etc.), returns the URL
 *   unchanged. TikTok will accept or reject based on whether that host is
 *   also registered; this helper doesn't second-guess.
 *
 * `appHostOverride` lets a caller pass an explicit host when
 * NEXT_PUBLIC_APP_URL isn't set (e.g., a CLI script). When omitted,
 * falls back to NEXT_PUBLIC_APP_URL, then `https://www.vortextrips.com`.
 */
export function proxyVideoUrlForTikTok(videoUrl: string, appHostOverride?: string): string {
  if (!videoUrl || typeof videoUrl !== 'string') return videoUrl
  let parsed: URL
  try {
    parsed = new URL(videoUrl)
  } catch {
    return videoUrl
  }

  const appHost = (
    appHostOverride
    ?? envTrim('NEXT_PUBLIC_APP_URL')
    ?? 'https://www.vortextrips.com'
  ).replace(/\/+$/, '')

  // Pexels CDN → /v/p/* proxy (Phase 14AO).
  if (parsed.hostname === PEXELS_VIDEO_HOST && parsed.pathname.startsWith(PEXELS_VIDEO_PATH_PREFIX)) {
    const tail = parsed.pathname.slice(PEXELS_VIDEO_PATH_PREFIX.length)
    return `${appHost}${PEXELS_PROXY_PATH_PREFIX}${tail}${parsed.search}`
  }

  // Supabase Storage → /v/s/* proxy (Phase 14AU).
  if (
    parsed.hostname.endsWith(SUPABASE_STORAGE_HOST_SUFFIX) &&
    parsed.pathname.startsWith(SUPABASE_STORAGE_PATH_PREFIX)
  ) {
    const tail = parsed.pathname.slice(SUPABASE_STORAGE_PATH_PREFIX.length)
    return `${appHost}${SUPABASE_PROXY_PATH_PREFIX}${tail}${parsed.search}`
  }

  return videoUrl
}

/**
 * Trade a TikTok authorization `code` for an access + refresh token pair.
 *
 * @param code TikTok's `code` query param from the OAuth redirect.
 * @param redirectUri MUST match the URI registered in the TikTok Developer
 *   Portal AND the URI used to start the OAuth flow. Pass it explicitly so
 *   preview deploys can override the production value if needed.
 * @throws Error with descriptive message on non-2xx or error payload.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TikTokTokenResponse> {
  const clientKey = getTikTokClientKey()
  const clientSecret = getTikTokClientSecret()
  if (!clientKey || !clientSecret) {
    throw new Error(
      tikTokIsSandboxMode()
        ? 'TIKTOK_CLIENT_KEY_SANDBOX / TIKTOK_CLIENT_SECRET_SANDBOX not configured (TIKTOK_USE_SANDBOX=true)'
        : 'TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not configured',
    )
  }

  const res = await fetch(TIKTOK_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // TikTok docs: cache-control header recommended.
      'Cache-Control': 'no-cache',
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  const data = (await res.json().catch(() => ({}))) as Partial<TikTokTokenResponse> & Partial<TikTokOAuthError>
  if (!res.ok || !data.access_token || !data.refresh_token) {
    const err = (data as TikTokOAuthError).error_description ?? (data as TikTokOAuthError).error ?? `HTTP ${res.status}`
    throw new Error(`TikTok token exchange failed: ${err}`)
  }
  return data as TikTokTokenResponse
}

/**
 * Swap a refresh_token for a fresh access_token (and a new refresh_token).
 * TikTok rotates refresh tokens on every refresh — the caller MUST persist
 * the returned refresh_token alongside the access_token.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<TikTokTokenResponse> {
  const clientKey = getTikTokClientKey()
  const clientSecret = getTikTokClientSecret()
  if (!clientKey || !clientSecret) {
    throw new Error(
      tikTokIsSandboxMode()
        ? 'TIKTOK_CLIENT_KEY_SANDBOX / TIKTOK_CLIENT_SECRET_SANDBOX not configured (TIKTOK_USE_SANDBOX=true)'
        : 'TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not configured',
    )
  }

  const res = await fetch(TIKTOK_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = (await res.json().catch(() => ({}))) as Partial<TikTokTokenResponse> & Partial<TikTokOAuthError>
  if (!res.ok || !data.access_token || !data.refresh_token) {
    const err = (data as TikTokOAuthError).error_description ?? (data as TikTokOAuthError).error ?? `HTTP ${res.status}`
    throw new Error(`TikTok token refresh failed: ${err}`)
  }
  return data as TikTokTokenResponse
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>

/**
 * Persist the four TikTok token fields into site_settings. Idempotent:
 * uses `upsert(..., { onConflict: 'key' })` for each row.
 *
 * Computes `tiktok_token_expires_at` from `expires_in` so callers don't
 * need to deal with the relative-vs-absolute conversion.
 */
export async function saveTikTokTokens(
  supabase: SupabaseAdmin,
  tokens: TikTokTokenResponse,
): Promise<void> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString()
  const updatedAt = now.toISOString()

  const rows: Array<{ key: string; value: string }> = [
    { key: 'tiktok_access_token', value: tokens.access_token },
    { key: 'tiktok_refresh_token', value: tokens.refresh_token },
    { key: 'tiktok_token_expires_at', value: expiresAt },
    { key: 'tiktok_open_id', value: tokens.open_id },
  ]

  for (const row of rows) {
    const { error } = await supabase
      .from('site_settings')
      .upsert(
        { key: row.key, value: row.value, updated_at: updatedAt },
        { onConflict: 'key' },
      )
    if (error) {
      throw new Error(`site_settings upsert failed for ${row.key}: ${error.message}`)
    }
  }
}

interface StoredTikTokTokens {
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
}

/**
 * Read the four TikTok token rows from site_settings. Missing rows return
 * null fields (rather than throwing), so callers can distinguish "never
 * connected" from "connection exists but expired."
 */
async function loadTikTokTokens(supabase: SupabaseAdmin): Promise<StoredTikTokTokens> {
  const keys = ['tiktok_access_token', 'tiktok_refresh_token', 'tiktok_token_expires_at']
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', keys)
  if (error) {
    throw new Error(`site_settings load failed: ${error.message}`)
  }
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.key && row.value) map.set(row.key as string, row.value as string)
  }
  return {
    access_token: map.get('tiktok_access_token') ?? null,
    refresh_token: map.get('tiktok_refresh_token') ?? null,
    expires_at: map.get('tiktok_token_expires_at') ?? null,
  }
}

/**
 * Return a usable TikTok access_token, refreshing transparently when the
 * stored access_token is missing, expired, or about to expire (within the
 * 60-second buffer). Persists rotated tokens before returning.
 *
 * Throws when no refresh_token is stored (operator must reconnect TikTok
 * via the OAuth callback) or when TikTok refuses the refresh (revoked /
 * expired refresh_token — same fix: reconnect).
 */
export async function getValidTikTokAccessToken(supabase: SupabaseAdmin): Promise<string> {
  const stored = await loadTikTokTokens(supabase)
  if (!stored.refresh_token) {
    throw new Error('TikTok is not connected — no refresh_token in site_settings. Reconnect via /api/auth/tiktok/callback.')
  }

  const now = Date.now()
  const expiresMs = stored.expires_at ? Date.parse(stored.expires_at) : 0
  const stillValid = stored.access_token && expiresMs - now > REFRESH_BUFFER_MS
  if (stillValid && stored.access_token) {
    return stored.access_token
  }

  const fresh = await refreshAccessToken(stored.refresh_token)
  await saveTikTokTokens(supabase, fresh)
  return fresh.access_token
}

// ============================================================
// Phase 14AP — TikTok creator_info pre-flight query.
//
// TikTok's Content Posting API requires the publish init request to
// MATCH what the user's account allows. Specifically:
//   - `privacy_level` must be in `privacy_level_options`
//   - `disable_comment` must equal `comment_disabled`
//   - `disable_duet` must equal `duet_disabled`
//   - `disable_stitch` must equal `stitch_disabled`
//
// If we hardcode values that don't match the user's account settings,
// TikTok rejects the publish init with the generic "Please review our
// integration guidelines" error. The fix is to call
// /v2/post/publish/creator_info/query/ FIRST and use the returned
// values when building the init body.
//
// This function is called by:
//   - src/app/api/automations/post-to-tiktok/route.ts (manual button)
//   - src/app/api/cron/autoposter-once/route.ts (cron tick)
//   - scripts/run-autoposter-once.js (manual runner — has JS mirror)
//
// Returns the creator's allowed values + display metadata. Throws on
// network errors or TikTok-side errors (caller decides how to surface).
// ============================================================

export interface TikTokCreatorInfo {
  /** Display username (e.g. "vortextrips"). Useful for log lines. */
  creator_username: string | null
  /** Display name (e.g. "Vortex Trips"). */
  creator_nickname: string | null
  /** Avatar URL. */
  creator_avatar_url: string | null
  /** Privacy levels TikTok allows for THIS creator. e.g. ['SELF_ONLY']
   *  for unaudited apps; ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS',
   *  'SELF_ONLY'] for audited apps with public accounts. */
  privacy_level_options: string[]
  /** Whether comments are disabled at the account level. The init body's
   *  `disable_comment` must equal this. */
  comment_disabled: boolean
  /** Whether duets are disabled at the account level. */
  duet_disabled: boolean
  /** Whether stitches are disabled at the account level. */
  stitch_disabled: boolean
  /** Max video duration (seconds) for posts via this app for this creator. */
  max_video_post_duration_sec: number
  /** Raw payload, useful for log lines / debugging. Never logged automatically. */
  raw: unknown
}

/**
 * Query TikTok for the creator's allowed post settings.
 *
 * Resolves a fresh access_token via `getValidTikTokAccessToken` (so
 * callers never need to handle expiry themselves) and POSTs to
 * /v2/post/publish/creator_info/query/. Returns the creator's allowed
 * privacy levels, comment/duet/stitch disabled flags, and max video
 * duration. Throws when TikTok rejects (e.g. token revoked, scope
 * missing, network error).
 *
 * Callers MUST use the returned values when building the init body —
 * hardcoding values that don't match the creator's settings is what
 * caused TikTok to reject our publish init with "Please review our
 * integration guidelines" (Phase 14AP root cause).
 */
export async function queryTikTokCreatorInfo(supabase: SupabaseAdmin): Promise<TikTokCreatorInfo> {
  const accessToken = await getValidTikTokAccessToken(supabase)

  const res = await fetch(TIKTOK_CREATOR_INFO_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({}),
  })

  const data = (await res.json().catch(() => ({}))) as {
    data?: {
      creator_username?: string
      creator_nickname?: string
      creator_avatar_url?: string
      privacy_level_options?: string[]
      comment_disabled?: boolean
      duet_disabled?: boolean
      stitch_disabled?: boolean
      max_video_post_duration_sec?: number
    }
    error?: { code?: string; message?: string; log_id?: string }
  }

  const errPayload = data.error
  const hasError = !!errPayload && errPayload.code && errPayload.code !== 'ok'
  if (!res.ok || hasError) {
    const reason = errPayload?.message ?? `HTTP ${res.status}`
    throw new Error(`TikTok creator_info query failed: ${reason}`)
  }

  return {
    creator_username: data.data?.creator_username ?? null,
    creator_nickname: data.data?.creator_nickname ?? null,
    creator_avatar_url: data.data?.creator_avatar_url ?? null,
    privacy_level_options: data.data?.privacy_level_options ?? [],
    comment_disabled: data.data?.comment_disabled ?? false,
    duet_disabled: data.data?.duet_disabled ?? true,
    stitch_disabled: data.data?.stitch_disabled ?? true,
    max_video_post_duration_sec: data.data?.max_video_post_duration_sec ?? 0,
    raw: data,
  }
}

// ============================================================
// Phase 14V — TikTok publish-status polling.
//
// TikTok's Direct Post API is asynchronous: the /v2/post/publish/video/init/
// call returns a publish_id once TikTok accepts the post into its
// processing queue, but the actual download from PULL_FROM_URL, encoding,
// and publish all happen server-side over the next ~30-90 seconds. The
// /v2/post/publish/status/fetch/ endpoint reports where in that pipeline
// a given publish_id currently sits.
//
// Status enum values (per TikTok's docs):
//   - 'PROCESSING_DOWNLOAD'   TikTok is downloading the video from our URL
//   - 'PROCESSING_UPLOAD'     transcoding / preparing for publish
//   - 'SEND_TO_USER_INBOX'    inbox-mode posts (we use direct, not inbox)
//   - 'PUBLISH_COMPLETE'      live on TikTok; publicaly_available_post_id is populated
//   - 'FAILED'                pipeline gave up; fail_reason explains why
// We treat any other string defensively as the literal value the API
// returned so the diagnostic script can surface unexpected enum values
// rather than silently mapping them to 'unknown'.
// ============================================================

export type TikTokPublishStatus =
  | 'PROCESSING_DOWNLOAD'
  | 'PROCESSING_UPLOAD'
  | 'SEND_TO_USER_INBOX'
  | 'PUBLISH_COMPLETE'
  | 'FAILED'
  | string

export interface TikTokStatusResult {
  /** Current pipeline status for this publish_id. */
  status: TikTokPublishStatus
  /** Populated when status === 'FAILED'. Empty / undefined otherwise. */
  fail_reason: string | null
  /**
   * Populated when status === 'PUBLISH_COMPLETE' for direct posts. Note
   * the TikTok API uses the (typo'd) field name `publicaly_available_post_id` —
   * we normalize it to `publicly_available_post_ids` here so callers don't
   * have to remember the spelling.
   */
  publicly_available_post_ids: string[]
  /** TikTok's per-call log id — useful when contacting their support. */
  log_id: string | null
  /** Raw API payload, for diagnostic dumps. Never logged automatically. */
  raw: unknown
}

/**
 * Look up the current status of a TikTok publish_id.
 *
 * Resolves a fresh access_token via `getValidTikTokAccessToken` (so callers
 * never need to handle expiry themselves) and POSTs to /v2/post/publish/status/fetch/.
 * Returns a normalized shape; throws on transport-level failure or when
 * TikTok returns an error payload.
 *
 * NOT idempotent in the sense that TikTok's status can advance between
 * calls — callers polling progress should record each status reading
 * with a timestamp.
 */
export async function checkTikTokPostStatus(
  supabase: SupabaseAdmin,
  publishId: string,
): Promise<TikTokStatusResult> {
  if (!publishId || !publishId.trim()) {
    throw new Error('checkTikTokPostStatus: publishId is required')
  }
  const accessToken = await getValidTikTokAccessToken(supabase)

  const res = await fetch(TIKTOK_STATUS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  })

  const data = (await res.json().catch(() => ({}))) as {
    data?: {
      status?: string
      fail_reason?: string
      // TikTok API spells this field with a typo. Accept both spellings.
      publicaly_available_post_id?: string[]
      publicly_available_post_id?: string[]
    }
    error?: { code?: string; message?: string; log_id?: string }
  }

  const errPayload = data.error
  const hasError = !!errPayload && errPayload.code && errPayload.code !== 'ok'
  if (!res.ok || hasError) {
    const reason = errPayload?.message ?? `HTTP ${res.status}`
    throw new Error(`TikTok status fetch failed: ${reason}`)
  }

  const status = (data.data?.status ?? 'UNKNOWN') as TikTokPublishStatus
  const failReason = data.data?.fail_reason && data.data.fail_reason.trim() ? data.data.fail_reason.trim() : null
  const publicIds =
    (Array.isArray(data.data?.publicaly_available_post_id) && data.data!.publicaly_available_post_id) ||
    (Array.isArray(data.data?.publicly_available_post_id) && data.data!.publicly_available_post_id) ||
    []

  return {
    status,
    fail_reason: failReason,
    publicly_available_post_ids: publicIds,
    log_id: errPayload?.log_id ?? null,
    raw: data,
  }
}
