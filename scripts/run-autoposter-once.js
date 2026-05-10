#!/usr/bin/env node
/**
 * Phase 14O.1 — Manual autoposter runner. One row, one click, no cron.
 * Phase 14AJ update — the prior "queue size must be exactly 1" refusal is
 * removed in favor of FIFO behavior matching the cron route. The script
 * now posts the OLDEST eligible row (by `queued_for_posting_at`) and
 * leaves the rest in queue. Same one-row-per-invocation invariant; the
 * operator can run the script multiple times to drain a batch, or rely
 * on the 3-tick-per-day cron to do it automatically.
 *
 * Mirrors the deployed `/api/cron/autoposter-dry-run` eligibility logic AND
 * (with --apply) the platform-poster routes
 * (`/api/automations/post-to-{facebook,instagram,tiktok}`) so the operator can
 * exercise the autoposter pipeline daily WITHOUT a registered cron, while
 * keeping the same gate / atomic-update / safety guarantees the routes
 * already enforce.
 *
 * Phase 14R update: TikTok was added to the supported set. The runner now
 * resolves a TikTok access_token via site_settings (refreshing through
 * `https://open.tiktokapis.com/v2/oauth/token/` when needed), then posts
 * via `https://open.tiktokapis.com/v2/post/publish/video/init/` using
 * `source: PULL_FROM_URL` against the row's HeyGen-rendered video_url
 * (re-hosted in Supabase Storage per Phase 14L.2.3). Twitter/X stays
 * permanently refused (Phase 14Q drop).
 *
 * Modes:
 *   default       → DRY-RUN. No platform calls. No DB writes. Selects the
 *                    OLDEST eligible row, prints the plan, exits.
 *   --apply       → Posts the OLDEST eligible row. Refuses if:
 *                    - eligible queue is empty
 *                    - selected row's platform is twitter / x
 *                    - any pre-flight gate check fails
 *                    - any post-flight invariant fails
 *
 * Refusal contract (Phase 14AJ — relaxed from "queue must be exactly 1"):
 *   - eligible queue must have at least 1 row
 *   - manual + autoposter validators must agree
 *   - selected row's platform must be facebook, instagram, OR tiktok
 *   - validateAutoposterCandidate must return null (eligible)
 *   - validateManualPostingGate (with supportedPlatforms) must allow
 *
 * Allowed writes (only with --apply, only on platform success):
 *   content_calendar.status          → 'posted'   (atomic)
 *   content_calendar.posted_at        → now()     (atomic, Phase 14M.2)
 *   site_settings.{tiktok_access_token, tiktok_refresh_token,
 *     tiktok_token_expires_at, tiktok_open_id}        (only on TikTok refresh)
 *
 * NEVER writes:
 *   posting_status / posting_gate_approved / queued_for_posting_at /
 *   posting_block_reason / video_url / image_url / caption / image_prompt /
 *   campaign_asset_id / tracking_url
 *
 * NEVER calls:
 *   HeyGen / Pexels / OpenAI / X / email / any non-target platform
 *
 * Run from project root:
 *   node scripts/run-autoposter-once.js          # DRY-RUN (default)
 *   node scripts/run-autoposter-once.js --apply  # operator-authorized post
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

// Phase 14R — Twitter/X stays refused (permanent drop in Phase 14Q).
// TikTok moves into SUPPORTED_PLATFORMS now that token exchange + Direct
// Post wiring landed in src/lib/tiktok-oauth.ts and post-to-tiktok/route.ts.
const REFUSED_PLATFORMS = new Set(['twitter', 'x'])
const SUPPORTED_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok'])
const TERMINAL_STATUSES = new Set(['posted', 'rejected', 'archived'])

const GRAPH_API = 'https://graph.facebook.com/v25.0'
const TIKTOK_OAUTH_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const TIKTOK_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
const TIKTOK_REFRESH_BUFFER_MS = 60_000
const TIKTOK_CAPTION_MAX = 2200

function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0 }

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error(`${COLORS.red}.env.local not found at ${envPath}${COLORS.reset}`)
    process.exit(1)
  }
  const text = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
  }
}

// ============================================================
// Validator mirrors — kept in sync with src/lib/posting-gate.ts +
// src/lib/autoposter-gate.ts + src/lib/media-readiness.ts. Mirroring
// here avoids cross-tooling import complexity (script is plain CommonJS;
// the validators are TypeScript). The audit script uses the same mirrors.
// ============================================================

const PLATFORM_RULES = {
  instagram: { image: 'required',    video: 'required',    either_satisfies: true  },
  tiktok:    { image: 'none',        video: 'required',    either_satisfies: false },
  youtube:   { image: 'none',        video: 'required',    either_satisfies: false },
  facebook:  { image: 'recommended', video: 'recommended', either_satisfies: true  },
}
const NONE_RULE = { image: 'none', video: 'none', either_satisfies: false }
function getRule(platform) {
  if (!platform) return NONE_RULE
  return PLATFORM_RULES[String(platform).toLowerCase().trim()] ?? NONE_RULE
}

function validateMediaReadinessJs(row) {
  const rule = getRule(row.platform)
  const has_image = nonEmpty(row.image_url)
  const has_video = nonEmpty(row.video_url)
  const platformRequiresMedia = rule.image === 'required' || rule.video === 'required'
  const reasons = []
  const platformLabel = row.platform ? row.platform.toLowerCase().trim() : ''
  const ms = nonEmpty(row.media_status) ? row.media_status.trim().toLowerCase() : null

  if (ms === 'failed') {
    reasons.push(`media generation failed${nonEmpty(row.media_error) ? `: ${row.media_error.trim()}` : ''}`)
  } else if (ms === 'skipped' && platformRequiresMedia && !has_image && !has_video) {
    reasons.push(`media_status='skipped' but platform ${platformLabel} requires media`)
  }
  if (rule.either_satisfies) {
    if (platformRequiresMedia && !has_image && !has_video) {
      reasons.push(platformLabel === 'instagram'
        ? 'missing required image_url for Instagram'
        : `missing required image_url or video_url for ${platformLabel || 'this platform'}`)
    }
  } else {
    if (rule.image === 'required' && !has_image) reasons.push(`missing required image_url for ${platformLabel || 'this platform'}`)
    if (rule.video === 'required' && !has_video) {
      const label = platformLabel === 'tiktok' ? 'TikTok' : (platformLabel || 'this platform')
      reasons.push(`missing required video_url for ${label}`)
    }
  }
  if (nonEmpty(row.image_prompt) && !has_image) reasons.push('campaign media prompt exists but generated media is missing')
  return { blocked: reasons.length > 0, reasons }
}

function validateAutoposterCandidateJs(row) {
  if (row.status !== 'approved') return `status is '${row.status}', need 'approved'`
  if (row.posting_status !== 'ready') return `posting_status is '${row.posting_status ?? 'null'}', need 'ready'`
  if (row.posting_gate_approved !== true) return 'posting_gate_approved is not true'
  if (row.manual_posting_only !== true) return 'manual_posting_only is not true'
  if (!row.queued_for_posting_at) return 'queued_for_posting_at is null'
  if (row.posted_at) return 'already posted'
  if (!nonEmpty(row.platform)) return 'platform is missing'
  if (!nonEmpty(row.caption)) return 'caption is empty'
  if (row.campaign_asset_id && !nonEmpty(row.tracking_url)) return 'campaign-originated row missing tracking_url'
  const media = validateMediaReadinessJs(row)
  if (media.blocked && media.reasons.length > 0) return media.reasons[0]
  return null
}

// ============================================================
// Eligibility query — mirrors getAutoposterEligibleRows in
// src/lib/autoposter-gate.ts. Pre-filters server-side to status='approved'
// then runs the JS mirror per row to produce a precise eligibility list.
// ============================================================

// Phase 14V — also pulls media_metadata so the TikTok branch can merge
// tiktok_publish_id into the existing JSONB without clobbering anything
// the worker put there.
const ROW_SELECT =
  'id, platform, status, caption, hashtags, posting_status, posting_gate_approved, queued_for_posting_at, manual_posting_only, tracking_url, campaign_asset_id, posted_at, week_of, created_at, image_prompt, image_url, video_url, media_status, media_error, media_metadata, ' +
  'campaign_asset:campaign_assets!campaign_asset_id(image_url, video_url, asset_type)'

function flattenRow(r) {
  const ca = Array.isArray(r.campaign_asset) ? (r.campaign_asset[0] ?? null) : (r.campaign_asset ?? null)
  return {
    ...r,
    image_url: ca?.image_url ?? r.image_url ?? null,
    video_url: ca?.video_url ?? r.video_url ?? null,
    video_prompt: null,
  }
}

async function getEligibleRows(supabase) {
  const { data, error } = await supabase
    .from('content_calendar')
    .select(ROW_SELECT)
    .eq('status', 'approved')
    .order('queued_for_posting_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(100)
  if (error) throw new Error(`autoposter eligibility query failed: ${error.message}`)
  const rows = (data ?? []).map(flattenRow)
  const eligible = []
  for (const r of rows) {
    const reason = validateAutoposterCandidateJs(r)
    if (reason === null) eligible.push(r)
  }
  return eligible
}

// ============================================================
// Platform posters — mirror src/app/api/automations/post-to-{facebook,instagram}/route.ts.
// Use plain fetch for Graph API; never call any other platform.
// ============================================================

function buildMessage(row) {
  const tags = Array.isArray(row.hashtags) && row.hashtags.length > 0
    ? row.hashtags.map(h => `#${h}`).join(' ')
    : ''
  const caption = row.caption ?? ''
  return tags ? `${caption}\n\n${tags}`.trim() : caption.trim()
}

/** Mirror of post-to-facebook route. Returns { ok, fb_post_id, error }. */
async function postToFacebook(row, env) {
  const PAGE_ID = env.FACEBOOK_PAGE_ID
  const PAGE_TOKEN = env.FACEBOOK_PAGE_ACCESS_TOKEN
  if (!nonEmpty(PAGE_ID) || !nonEmpty(PAGE_TOKEN)) return { ok: false, error: 'Facebook Page credentials not configured' }
  const message = buildMessage(row)
  try {
    if (nonEmpty(row.image_url)) {
      // Photo post first; fall back to text-only if Graph API rejects.
      const photoRes = await fetch(`${GRAPH_API}/${PAGE_ID}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: row.image_url, caption: message, access_token: PAGE_TOKEN }),
      })
      const photoData = await photoRes.json().catch(() => ({}))
      if (photoRes.ok && !photoData.error && photoData.id) {
        return { ok: true, fb_post_id: photoData.id }
      }
      // Fall back to text-only feed post.
      const feedRes = await fetch(`${GRAPH_API}/${PAGE_ID}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, access_token: PAGE_TOKEN }),
      })
      const feedData = await feedRes.json().catch(() => ({}))
      if (!feedRes.ok || feedData.error) {
        return { ok: false, error: feedData.error?.message ?? 'Facebook feed post failed' }
      }
      return { ok: true, fb_post_id: feedData.id }
    }
    // Text-only path.
    const res = await fetch(`${GRAPH_API}/${PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: PAGE_TOKEN }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) return { ok: false, error: data.error?.message ?? 'Facebook feed post failed' }
    return { ok: true, fb_post_id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Facebook API error' }
  }
}

// ============================================================
// TikTok helpers — mirrors src/lib/tiktok-oauth.ts and
// src/app/api/automations/post-to-tiktok/route.ts. The runner reads
// tokens from site_settings, refreshes when needed, then calls the
// Direct Post init endpoint. Same atomic-update contract on success.
// ============================================================

async function loadTikTokTokensJs(supabase) {
  const keys = ['tiktok_access_token', 'tiktok_refresh_token', 'tiktok_token_expires_at']
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', keys)
  if (error) throw new Error(`site_settings load failed: ${error.message}`)
  const map = new Map()
  for (const row of data ?? []) {
    if (row.key && row.value) map.set(row.key, row.value)
  }
  return {
    access_token: map.get('tiktok_access_token') ?? null,
    refresh_token: map.get('tiktok_refresh_token') ?? null,
    expires_at: map.get('tiktok_token_expires_at') ?? null,
  }
}

// Phase 14AM.1 — sandbox credential toggle. JS mirror of the helpers in
// src/lib/tiktok-oauth.ts. `TIKTOK_USE_SANDBOX=true` (or `=1`) flips the
// script to the `_SANDBOX` credential pair so the manual runner posts via
// the same sandbox app the OAuth flow connects against.
function tikTokSandboxEnabledJs(env) {
  const v = (env.TIKTOK_USE_SANDBOX ?? '').trim().toLowerCase()
  return v === 'true' || v === '1'
}
function getTikTokClientKeyJs(env) {
  return tikTokSandboxEnabledJs(env)
    ? (env.TIKTOK_CLIENT_KEY_SANDBOX ?? '').trim()
    : (env.TIKTOK_CLIENT_KEY ?? '').trim()
}
function getTikTokClientSecretJs(env) {
  return tikTokSandboxEnabledJs(env)
    ? (env.TIKTOK_CLIENT_SECRET_SANDBOX ?? '').trim()
    : (env.TIKTOK_CLIENT_SECRET ?? '').trim()
}

async function refreshTikTokTokensJs(env, refreshToken) {
  const clientKey = getTikTokClientKeyJs(env)
  const clientSecret = getTikTokClientSecretJs(env)
  if (!nonEmpty(clientKey) || !nonEmpty(clientSecret)) {
    throw new Error(tikTokSandboxEnabledJs(env)
      ? 'TIKTOK_CLIENT_KEY_SANDBOX / TIKTOK_CLIENT_SECRET_SANDBOX not configured (TIKTOK_USE_SANDBOX=true)'
      : 'TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not configured')
  }
  const res = await fetch(TIKTOK_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token || !data.refresh_token) {
    const err = data.error_description ?? data.error ?? `HTTP ${res.status}`
    throw new Error(`TikTok token refresh failed: ${err}`)
  }
  return data
}

async function saveTikTokTokensJs(supabase, tokens) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString()
  const updatedAt = now.toISOString()
  const rows = [
    { key: 'tiktok_access_token', value: tokens.access_token },
    { key: 'tiktok_refresh_token', value: tokens.refresh_token },
    { key: 'tiktok_token_expires_at', value: expiresAt },
    { key: 'tiktok_open_id', value: tokens.open_id },
  ]
  for (const row of rows) {
    const { error } = await supabase
      .from('site_settings')
      .upsert({ key: row.key, value: row.value, updated_at: updatedAt }, { onConflict: 'key' })
    if (error) throw new Error(`site_settings upsert failed for ${row.key}: ${error.message}`)
  }
}

async function getValidTikTokAccessTokenJs(supabase, env) {
  const stored = await loadTikTokTokensJs(supabase)
  if (!stored.refresh_token) {
    throw new Error('TikTok is not connected — no refresh_token in site_settings. Reconnect via /api/auth/tiktok/callback.')
  }
  const now = Date.now()
  const expiresMs = stored.expires_at ? Date.parse(stored.expires_at) : 0
  if (stored.access_token && expiresMs - now > TIKTOK_REFRESH_BUFFER_MS) {
    return stored.access_token
  }
  const fresh = await refreshTikTokTokensJs(env, stored.refresh_token)
  await saveTikTokTokensJs(supabase, fresh)
  return fresh.access_token
}

function buildTikTokTitle(row) {
  const tags = Array.isArray(row.hashtags) && row.hashtags.length > 0
    ? row.hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')
    : ''
  const base = (row.caption ?? '').trim()
  const full = tags ? `${base}\n\n${tags}` : base
  return full.length <= TIKTOK_CAPTION_MAX ? full : full.slice(0, TIKTOK_CAPTION_MAX - 1) + '…'
}

function resolveTikTokPrivacyLevel(env) {
  const raw = (env.TIKTOK_PRIVACY_LEVEL || '').toUpperCase().trim()
  const allowed = new Set(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'])
  return allowed.has(raw) ? raw : 'SELF_ONLY'
}

/**
 * Mirror of post-to-tiktok route. Returns { ok, tiktok_publish_id, error }.
 * Note this poster uniquely needs the supabase client (for site_settings
 * token rotation) AND env (for TIKTOK_CLIENT_KEY / SECRET / PRIVACY_LEVEL).
 */
async function postToTikTok(row, env, supabase) {
  if (!nonEmpty(row.video_url)) {
    return { ok: false, error: 'TikTok requires a video — no video_url found on this post' }
  }
  let accessToken
  try {
    accessToken = await getValidTikTokAccessTokenJs(supabase, env)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'TikTok token resolution failed' }
  }

  const initBody = {
    post_info: {
      title: buildTikTokTitle(row),
      privacy_level: resolveTikTokPrivacyLevel(env),
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: row.video_url,
    },
  }

  let res
  try {
    res = await fetch(TIKTOK_INIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(initBody),
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'TikTok network error' }
  }
  const data = await res.json().catch(() => ({}))
  const errPayload = data?.error
  const publishId = data?.data?.publish_id
  const hasError = !!errPayload && errPayload.code && errPayload.code !== 'ok'
  if (!res.ok || hasError || !publishId) {
    const reason = errPayload?.message ?? `HTTP ${res.status}`
    return { ok: false, error: `TikTok publish init failed: ${reason}` }
  }
  return { ok: true, tiktok_publish_id: publishId }
}

/** Mirror of post-to-instagram route. Three-step: container → wait → publish. */
async function postToInstagram(row, env) {
  const IG_ACCOUNT_ID = env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const IG_ACCESS_TOKEN = env.INSTAGRAM_ACCESS_TOKEN
  if (!nonEmpty(IG_ACCOUNT_ID) || !nonEmpty(IG_ACCESS_TOKEN)) return { ok: false, error: 'Instagram credentials not configured' }
  if (!nonEmpty(row.image_url)) return { ok: false, error: 'Instagram requires an image — no image_url found on this post' }
  const caption = buildMessage(row)
  try {
    // 1. Create container.
    const cRes = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: IG_ACCESS_TOKEN, caption, image_url: row.image_url, media_type: 'IMAGE' }),
    })
    const cData = await cRes.json().catch(() => ({}))
    if (!cRes.ok || cData.error || !cData.id) {
      return { ok: false, error: `Container creation failed: ${cData.error?.message ?? 'unknown'}` }
    }
    const containerId = cData.id

    // 2. Wait for container ready (up to 6s; matches route's loop).
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 1000))
      const sRes = await fetch(`${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${IG_ACCESS_TOKEN}`)
      const sData = await sRes.json().catch(() => ({}))
      if (sData.error) return { ok: false, error: `Status check failed: ${sData.error.message}` }
      if (sData.status_code === 'FINISHED') break
      if (sData.status_code === 'ERROR' || sData.status_code === 'EXPIRED') {
        return { ok: false, error: `Container failed processing: ${sData.status_code}` }
      }
      if (i === 5) return { ok: false, error: 'Container still IN_PROGRESS after 6 seconds' }
    }

    // 3. Publish.
    const pRes = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerId, access_token: IG_ACCESS_TOKEN }),
    })
    const pData = await pRes.json().catch(() => ({}))
    if (!pRes.ok || pData.error || !pData.id) {
      return { ok: false, error: `Publish failed: ${pData.error?.message ?? 'unknown'}` }
    }
    return { ok: true, ig_post_id: pData.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Instagram API error' }
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${COLORS.reset}`)
    process.exit(1)
  }
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log()
  console.log(`${COLORS.bold}Phase 14O.1 — Manual Autoposter Runner [${flags.apply ? 'APPLY (will post + write)' : 'DRY-RUN'}]${COLORS.reset}`)
  console.log(`${COLORS.dim}One row only. No cron. No Twitter/X. TikTok via Direct Post (Phase 14R).${COLORS.reset}`)
  console.log()

  // ============================================================
  // Pre-flight snapshots
  // ============================================================
  const { count: postedAtBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  const { count: statusPostedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted')

  // ============================================================
  // Eligibility
  // ============================================================
  const eligible = await getEligibleRows(supabase)

  console.log(`${COLORS.bold}1. Eligibility${COLORS.reset}`)
  console.log(`   eligible queue size: ${eligible.length}`)

  if (eligible.length === 0) {
    console.log(`   ${COLORS.yellow}No eligible row.${COLORS.reset} Mark Ready at least one approved Facebook, Instagram, or TikTok row in /dashboard/content first.`)
    finalize({ postedAtBefore, postedAtAfter: postedAtBefore, statusPostedBefore, statusPostedAfter: statusPostedBefore, applied: false })
    process.exit(0)
  }

  // Phase 14AJ — FIFO: pick the oldest queued row. Remaining rows stay in
  // queue for the next run (or the next cron tick at 14:00 / 18:00 / 22:00 UTC).
  const row = eligible[0]
  const platform = (row.platform ?? '').toLowerCase().trim()
  if (eligible.length > 1) {
    console.log(`   ${COLORS.dim}queue depth: ${eligible.length} (oldest selected; others wait for next run / next cron tick)${COLORS.reset}`)
    for (const r of eligible.slice(1)) {
      console.log(`   ${COLORS.dim}  queued: ${r.id} ${r.platform}${COLORS.reset}`)
    }
  }

  console.log(`   ${COLORS.green}selected:${COLORS.reset} ${row.id}`)
  console.log(`   platform:           ${platform}`)
  console.log(`   week_of:            ${row.week_of}`)
  console.log(`   queued_for_posting_at: ${row.queued_for_posting_at}`)
  console.log(`   campaign_asset_id:  ${row.campaign_asset_id ?? '(none)'}`)
  console.log(`   tracking_url:       ${nonEmpty(row.tracking_url) ? row.tracking_url : '(none — organic)'}`)
  console.log(`   image_url:          ${nonEmpty(row.image_url) ? '✓ present' : '(none)'}`)
  console.log(`   video_url:          ${nonEmpty(row.video_url) ? '✓ present' : '(none)'}`)
  console.log(`   caption preview:    ${(row.caption ?? '').slice(0, 120).replace(/\s+/g, ' ')}${(row.caption ?? '').length > 120 ? '…' : ''}`)
  console.log()

  // ============================================================
  // Platform refusals
  // ============================================================
  console.log(`${COLORS.bold}2. Platform safety check${COLORS.reset}`)
  if (REFUSED_PLATFORMS.has(platform)) {
    console.log(`${COLORS.red}Refused: this runner does not post to '${platform}'.${COLORS.reset}`)
    if (platform === 'twitter' || platform === 'x') {
      console.log(`${COLORS.dim}Twitter/X was permanently removed in Phase 14Q (executive decision). Historical rows are read-only.${COLORS.reset}`)
    }
    process.exit(2)
  }
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    console.log(`${COLORS.red}Refused: platform '${platform}' is not supported by this runner.${COLORS.reset}`)
    console.log(`${COLORS.dim}Supported: facebook, instagram, tiktok. Got: ${platform}.${COLORS.reset}`)
    process.exit(2)
  }
  console.log(`   ${COLORS.green}platform '${platform}' is supported${COLORS.reset}`)
  console.log()

  // ============================================================
  // Defensive re-validation (catches anything that drifted between
  // the eligibility query and now)
  // ============================================================
  console.log(`${COLORS.bold}3. Defensive pre-flight gates${COLORS.reset}`)
  const autoReason = validateAutoposterCandidateJs(row)
  if (autoReason !== null) {
    console.log(`${COLORS.red}Refused: validateAutoposterCandidate said: ${autoReason}${COLORS.reset}`)
    process.exit(2)
  }
  console.log(`   ${COLORS.green}validateAutoposterCandidate: eligible${COLORS.reset}`)
  // Manual gate (with supportedPlatforms restriction) — defense in depth
  // mirroring exactly what the platform routes themselves call.
  const mediaCheck = validateMediaReadinessJs(row)
  if (mediaCheck.blocked) {
    console.log(`${COLORS.red}Refused: media readiness blocked — ${mediaCheck.reasons.join('; ')}${COLORS.reset}`)
    process.exit(2)
  }
  console.log(`   ${COLORS.green}validateMediaReadiness: passes for ${platform}${COLORS.reset}`)
  console.log()

  // ============================================================
  // Plan
  // ============================================================
  console.log(`${COLORS.bold}4. Plan${COLORS.reset}`)
  if (platform === 'facebook') {
    console.log(`   ${COLORS.cyan}POST${COLORS.reset} ${GRAPH_API}/${env.FACEBOOK_PAGE_ID}/${nonEmpty(row.image_url) ? 'photos' : 'feed'}`)
    console.log(`   ${COLORS.dim}headers:${COLORS.reset} Content-Type: application/json`)
    console.log(`   ${COLORS.dim}body:${COLORS.reset} { url|message, access_token: <FACEBOOK_PAGE_ACCESS_TOKEN> }`)
  } else if (platform === 'instagram') {
    console.log(`   ${COLORS.cyan}POST${COLORS.reset} ${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media     ${COLORS.dim}(create container){COLORS.reset}`)
    console.log(`   ${COLORS.cyan}GET${COLORS.reset}  ${GRAPH_API}/<container_id>?fields=status_code,status     ${COLORS.dim}(poll up to 6s){COLORS.reset}`)
    console.log(`   ${COLORS.cyan}POST${COLORS.reset} ${GRAPH_API}/${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish     ${COLORS.dim}(publish){COLORS.reset}`)
  } else if (platform === 'tiktok') {
    console.log(`   ${COLORS.cyan}GET site_settings${COLORS.reset} keys: tiktok_access_token, tiktok_refresh_token, tiktok_token_expires_at`)
    console.log(`   ${COLORS.dim}(if expired or near expiry):${COLORS.reset}`)
    console.log(`   ${COLORS.cyan}POST${COLORS.reset} ${TIKTOK_OAUTH_URL}     ${COLORS.dim}(grant_type=refresh_token){COLORS.reset}`)
    console.log(`   ${COLORS.cyan}UPSERT site_settings${COLORS.reset} (rotated tokens)`)
    console.log(`   ${COLORS.cyan}POST${COLORS.reset} ${TIKTOK_INIT_URL}`)
    console.log(`   ${COLORS.dim}headers:${COLORS.reset} Authorization: Bearer <access_token>, Content-Type: application/json; charset=UTF-8`)
    console.log(`   ${COLORS.dim}body:${COLORS.reset} { post_info: { title, privacy_level: ${resolveTikTokPrivacyLevel(env)}, ... }, source_info: { source: 'PULL_FROM_URL', video_url } }`)
  }
  console.log(`   ${COLORS.dim}on platform success → atomic UPDATE content_calendar SET status='posted', posted_at=<now> WHERE id='${row.id}'${COLORS.reset}`)
  console.log()

  // ============================================================
  // DRY-RUN exit
  // ============================================================
  if (!flags.apply) {
    console.log(`${COLORS.dim}--apply not set. No platform call. No DB write.${COLORS.reset}`)
    finalize({ postedAtBefore, postedAtAfter: postedAtBefore, statusPostedBefore, statusPostedAfter: statusPostedBefore, applied: false })
    process.exit(0)
  }

  // ============================================================
  // APPLY — call platform, atomic UPDATE on success
  // ============================================================
  console.log(`${COLORS.bold}5. Apply${COLORS.reset}`)
  let result
  if (platform === 'facebook') {
    result = await postToFacebook(row, env)
  } else if (platform === 'instagram') {
    result = await postToInstagram(row, env)
  } else if (platform === 'tiktok') {
    result = await postToTikTok(row, env, supabase)
  }
  if (!result?.ok) {
    console.log(`${COLORS.red}✗ Platform call failed:${COLORS.reset} ${result?.error ?? 'unknown error'}`)
    console.log(`${COLORS.dim}DB unchanged. Row remains in queue for retry after the platform-side issue is fixed.${COLORS.reset}`)
    finalize({ postedAtBefore, postedAtAfter: postedAtBefore, statusPostedBefore, statusPostedAfter: statusPostedBefore, applied: true, failed: true })
    process.exit(3)
  }
  const platformPostId = result.fb_post_id ?? result.ig_post_id ?? result.tiktok_publish_id
  console.log(`   ${COLORS.green}✓ Platform post id:${COLORS.reset} ${platformPostId}`)

  // Phase 14V — for TikTok rows, merge the publish_id into media_metadata
  // so scripts/diagnose-tiktok-uploads.js can later poll TikTok's async
  // status endpoint. Other platforms skip this. Spreading the existing
  // JSONB preserves any worker-set fields (heygen_video_id, etc.).
  const updatePayload = { status: 'posted', posted_at: new Date().toISOString() }
  if (platform === 'tiktok' && nonEmpty(result.tiktok_publish_id)) {
    const existingMeta = row.media_metadata && typeof row.media_metadata === 'object' ? row.media_metadata : {}
    updatePayload.media_metadata = {
      ...existingMeta,
      tiktok_publish_id: result.tiktok_publish_id,
      tiktok_published_at: new Date().toISOString(),
    }
  }

  // Atomic UPDATE — defensive guards inline:
  //   .eq('status', 'approved')   refuse to flip a row that's no longer approved
  //   .is('posted_at', null)      refuse to overwrite a posted_at set by a concurrent path
  const { error: updErr, count: updateCount } = await supabase
    .from('content_calendar')
    .update(updatePayload, { count: 'exact' })
    .eq('id', row.id)
    .eq('status', 'approved')
    .is('posted_at', null)
  if (updErr) {
    console.log(`${COLORS.red}✗ DB update failed:${COLORS.reset} ${updErr.message}`)
    console.log(`${COLORS.yellow}⚠ Platform post landed (id=${platformPostId}) but DB row was not flipped. Manual reconciliation required.${COLORS.reset}`)
    process.exit(4)
  }
  if ((updateCount ?? 0) !== 1) {
    console.log(`${COLORS.red}✗ DB update affected ${updateCount} rows, expected exactly 1.${COLORS.reset}`)
    console.log(`${COLORS.yellow}⚠ Platform post landed (id=${platformPostId}). Investigate row state.${COLORS.reset}`)
    process.exit(4)
  }
  console.log(`   ${COLORS.green}✓ DB update:${COLORS.reset} status='posted', posted_at=<now>`)
  console.log()

  // ============================================================
  // Post-flight invariants
  // ============================================================
  const { count: postedAtAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  const { count: statusPostedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted')
  // Check 9 invariant
  const { count: orphanA } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted')
    .is('posted_at', null)
  const { count: orphanB } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'posted')
    .not('posted_at', 'is', null)
  // Eligible queue must be 0 now
  const eligibleAfter = await getEligibleRows(supabase)

  console.log(`${COLORS.bold}6. Post-flight${COLORS.reset}`)
  const postedAtDelta = (postedAtAfter ?? 0) - (postedAtBefore ?? 0)
  const statusDelta = (statusPostedAfter ?? 0) - (statusPostedBefore ?? 0)
  const tag = (cond) => cond ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.reset}`
  console.log(`   ${tag(postedAtDelta === 1)} posted_at count: ${postedAtBefore} → ${postedAtAfter}  (delta ${postedAtDelta}, expected +1)`)
  console.log(`   ${tag(statusDelta === 1)} status='posted' count: ${statusPostedBefore} → ${statusPostedAfter}  (delta ${statusDelta}, expected +1)`)
  console.log(`   ${tag((orphanA ?? 0) === 0)} Check 9 anomaly (a) status='posted' AND posted_at IS NULL: ${orphanA}`)
  console.log(`   ${tag((orphanB ?? 0) === 0)} Check 9 anomaly (b) status != 'posted' AND posted_at IS NOT NULL: ${orphanB}`)
  console.log(`   ${tag(eligibleAfter.length === 0)} eligible queue after apply: ${eligibleAfter.length}  (expected 0)`)

  finalize({
    postedAtBefore,
    postedAtAfter,
    statusPostedBefore,
    statusPostedAfter,
    applied: true,
    failed: false,
    platformPostId,
  })

  // Hard fail if any invariant slipped — exit non-zero so wrappers catch.
  if (postedAtDelta !== 1 || statusDelta !== 1 || (orphanA ?? 0) > 0 || eligibleAfter.length !== 0) {
    process.exit(5)
  }
}

function finalize({ postedAtBefore, postedAtAfter, statusPostedBefore, statusPostedAfter, applied, failed, platformPostId }) {
  console.log()
  console.log(`${COLORS.bold}Summary${COLORS.reset}`)
  console.log(`   posted_at count: ${postedAtBefore ?? 0} → ${postedAtAfter ?? 0}  (delta ${(postedAtAfter ?? 0) - (postedAtBefore ?? 0)})`)
  console.log(`   status='posted' count: ${statusPostedBefore ?? 0} → ${statusPostedAfter ?? 0}  (delta ${(statusPostedAfter ?? 0) - (statusPostedBefore ?? 0)})`)
  console.log(`   apply mode: ${applied ? 'YES' : 'no'}`)
  if (applied && !failed && platformPostId) console.log(`   platform post id: ${platformPostId}`)
  if (applied && failed) console.log(`   ${COLORS.red}platform call failed; DB unchanged${COLORS.reset}`)
  console.log(`${COLORS.dim}No cron registered. No Twitter/X. TikTok via Direct Post when --apply. No HeyGen / Pexels / OpenAI.${COLORS.reset}`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
