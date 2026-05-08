#!/usr/bin/env node
/**
 * Phase 14V — TikTok upload status diagnostic. READ-ONLY.
 *
 * TikTok's Direct Post API (/v2/post/publish/video/init/) returns a
 * publish_id once the post is queued, but the actual download from
 * PULL_FROM_URL, encoding, and publish all happen server-side over the
 * next ~30-90 seconds. This script polls TikTok's status endpoint for
 * each posted row whose media_metadata carries a tiktok_publish_id and
 * surfaces the current state (PROCESSING_DOWNLOAD / PROCESSING_UPLOAD /
 * PUBLISH_COMPLETE / FAILED).
 *
 * SAFETY:
 *   - read-only against the DB (no UPDATE / INSERT / DELETE)
 *   - does NOT mutate site_settings tokens (token refresh writes the
 *     site_settings.tiktok_* keys via getValidTikTokAccessTokenJs, which
 *     mirrors the lib helper; that's the same behavior the runner has
 *     when it refreshes mid-post — an authorized side effect)
 *   - never calls Facebook / Instagram / X / HeyGen / Pexels / OpenAI
 *
 * Usage:
 *   node scripts/diagnose-tiktok-uploads.js
 *   node scripts/diagnose-tiktok-uploads.js --limit=20
 *   node scripts/diagnose-tiktok-uploads.js --since=2026-05-01
 *
 * Flags:
 *   --limit=N        cap rows polled (default 25)
 *   --since=ISO      only poll rows posted on/after this date (YYYY-MM-DD or full ISO)
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

const TIKTOK_OAUTH_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const TIKTOK_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'
const REFRESH_BUFFER_MS = 60_000

function nonEmpty(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error(`${COLORS.red}.env.local not found at ${envPath}${COLORS.reset}`)
    process.exit(1)
  }
  const text = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function parseArgs(argv) {
  const out = { limit: 25, since: null }
  for (const a of argv) {
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10)
      if (Number.isFinite(n) && n > 0) out.limit = Math.min(n, 200)
    } else if (a.startsWith('--since=')) {
      out.since = a.slice('--since='.length).trim() || null
    }
  }
  return out
}

// ============================================================
// JS mirror of getValidTikTokAccessToken from src/lib/tiktok-oauth.ts.
// Kept in sync by hand — when the lib changes, update this too. Same
// pattern the runner script uses for postToTikTok.
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

async function refreshTikTokTokensJs(env, refreshToken) {
  const clientKey = env.TIKTOK_CLIENT_KEY
  const clientSecret = env.TIKTOK_CLIENT_SECRET
  if (!nonEmpty(clientKey) || !nonEmpty(clientSecret)) {
    throw new Error('TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not configured')
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
  if (stored.access_token && expiresMs - now > REFRESH_BUFFER_MS) {
    return stored.access_token
  }
  const fresh = await refreshTikTokTokensJs(env, stored.refresh_token)
  await saveTikTokTokensJs(supabase, fresh)
  return fresh.access_token
}

// ============================================================
// JS mirror of checkTikTokPostStatus from src/lib/tiktok-oauth.ts.
// ============================================================

async function checkTikTokPostStatusJs(accessToken, publishId) {
  const res = await fetch(TIKTOK_STATUS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  })
  const data = await res.json().catch(() => ({}))
  const errPayload = data?.error
  const hasError = !!errPayload && errPayload.code && errPayload.code !== 'ok'
  if (!res.ok || hasError) {
    const reason = errPayload?.message ?? `HTTP ${res.status}`
    return { ok: false, error: reason, log_id: errPayload?.log_id ?? null }
  }
  const status = data?.data?.status ?? 'UNKNOWN'
  const failReason = nonEmpty(data?.data?.fail_reason) ? data.data.fail_reason.trim() : null
  // TikTok API spells the field with a typo. Accept both spellings.
  const publicIds =
    (Array.isArray(data?.data?.publicaly_available_post_id) && data.data.publicaly_available_post_id) ||
    (Array.isArray(data?.data?.publicly_available_post_id) && data.data.publicly_available_post_id) ||
    []
  return {
    ok: true,
    status,
    fail_reason: failReason,
    publicly_available_post_ids: publicIds,
    log_id: errPayload?.log_id ?? null,
  }
}

function statusColor(status) {
  switch (status) {
    case 'PUBLISH_COMPLETE': return COLORS.green
    case 'PROCESSING_DOWNLOAD':
    case 'PROCESSING_UPLOAD': return COLORS.cyan
    case 'SEND_TO_USER_INBOX': return COLORS.blue
    case 'FAILED': return COLORS.red
    default: return COLORS.yellow
  }
}

function statusEmoji(status) {
  switch (status) {
    case 'PUBLISH_COMPLETE': return '✅'
    case 'PROCESSING_DOWNLOAD': return '⏬'
    case 'PROCESSING_UPLOAD': return '🔄'
    case 'SEND_TO_USER_INBOX': return '📥'
    case 'FAILED': return '❌'
    default: return '❓'
  }
}

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
  console.log(`${COLORS.bold}Phase 14V — TikTok upload status diagnostic${COLORS.reset}`)
  console.log(`${COLORS.dim}Read-only against the DB. Polls TikTok /v2/post/publish/status/fetch/ per row.${COLORS.reset}`)
  console.log(`${COLORS.dim}Started: ${new Date().toISOString()}${COLORS.reset}`)
  console.log(`${COLORS.dim}Limit: ${flags.limit}${flags.since ? `  ·  since: ${flags.since}` : ''}${COLORS.reset}`)
  console.log()

  // Build the candidate query: TikTok rows with status='posted' that
  // carry a publish_id in media_metadata. Order newest-first so the
  // diagnostic surfaces recent posts (still in flight) before old ones.
  let query = supabase
    .from('content_calendar')
    .select('id, platform, posted_at, caption, media_metadata')
    .eq('platform', 'tiktok')
    .eq('status', 'posted')
    .not('media_metadata->>tiktok_publish_id', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(flags.limit)

  if (flags.since) {
    query = query.gte('posted_at', flags.since)
  }

  const { data: rows, error } = await query
  if (error) {
    console.error(`${COLORS.red}Query failed:${COLORS.reset} ${error.message}`)
    process.exit(2)
  }

  if (!rows || rows.length === 0) {
    console.log(`${COLORS.yellow}No TikTok posts with a publish_id found.${COLORS.reset}`)
    console.log(`${COLORS.dim}This is normal if no autoposter has posted to TikTok yet, OR if all TikTok posts predate Phase 14V.${COLORS.reset}`)
    return
  }

  console.log(`${COLORS.bold}Polling ${rows.length} TikTok ${rows.length === 1 ? 'post' : 'posts'}…${COLORS.reset}`)
  console.log()

  // Resolve a single access token up front; reuse for every status call.
  let accessToken
  try {
    accessToken = await getValidTikTokAccessTokenJs(supabase, env)
  } catch (err) {
    console.error(`${COLORS.red}Token resolution failed:${COLORS.reset} ${err instanceof Error ? err.message : 'unknown'}`)
    process.exit(3)
  }

  const counts = {
    PUBLISH_COMPLETE: 0,
    PROCESSING_DOWNLOAD: 0,
    PROCESSING_UPLOAD: 0,
    SEND_TO_USER_INBOX: 0,
    FAILED: 0,
    UNKNOWN: 0,
    ERROR: 0,
  }

  for (const row of rows) {
    const meta = row.media_metadata && typeof row.media_metadata === 'object' ? row.media_metadata : {}
    const publishId = meta.tiktok_publish_id
    if (!nonEmpty(publishId)) {
      // Shouldn't happen given the .not(...is null) filter, but defensively skip.
      continue
    }

    const captionPreview = (row.caption ?? '').slice(0, 80).replace(/\s+/g, ' ')
    const postedAt = row.posted_at ? new Date(row.posted_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '?'

    const result = await checkTikTokPostStatusJs(accessToken, publishId)

    if (!result.ok) {
      counts.ERROR++
      console.log(`${COLORS.red}❌ ERROR${COLORS.reset}  ${row.id}  ${COLORS.dim}publish_id=${publishId}${COLORS.reset}`)
      console.log(`   ${COLORS.dim}posted ${postedAt}  ·  caption: ${captionPreview}…${COLORS.reset}`)
      console.log(`   ${COLORS.red}status fetch failed:${COLORS.reset} ${result.error}${result.log_id ? `  (log_id=${result.log_id})` : ''}`)
      console.log()
      continue
    }

    const color = statusColor(result.status)
    const emoji = statusEmoji(result.status)
    counts[result.status] = (counts[result.status] ?? 0) + 1

    console.log(`${color}${emoji} ${result.status}${COLORS.reset}  ${row.id}  ${COLORS.dim}publish_id=${publishId}${COLORS.reset}`)
    console.log(`   ${COLORS.dim}posted ${postedAt}  ·  caption: ${captionPreview}…${COLORS.reset}`)
    if (result.status === 'PUBLISH_COMPLETE' && result.publicly_available_post_ids.length > 0) {
      console.log(`   ${COLORS.green}live post id(s):${COLORS.reset} ${result.publicly_available_post_ids.join(', ')}`)
    }
    if (result.status === 'FAILED' && result.fail_reason) {
      console.log(`   ${COLORS.red}fail_reason:${COLORS.reset} ${result.fail_reason}`)
    }
    console.log()
  }

  // Summary
  console.log(`${COLORS.bold}Summary${COLORS.reset}`)
  for (const [status, count] of Object.entries(counts)) {
    if (count === 0) continue
    const color = status === 'ERROR' ? COLORS.red : statusColor(status)
    const emoji = status === 'ERROR' ? '❌' : statusEmoji(status)
    console.log(`   ${color}${emoji} ${status.padEnd(22)}${COLORS.reset} ${count}`)
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  console.log(`   ${COLORS.dim}total polled:${COLORS.reset}            ${total}`)
  console.log()

  if (counts.FAILED > 0) {
    console.log(`${COLORS.red}⚠ ${counts.FAILED} TikTok post(s) ultimately FAILED on TikTok's side.${COLORS.reset}`)
    console.log(`${COLORS.dim}These rows show status='posted' in our DB but never went live. Consider manual review.${COLORS.reset}`)
  }
  if (counts.PROCESSING_DOWNLOAD + counts.PROCESSING_UPLOAD > 0) {
    console.log(`${COLORS.cyan}⏳ ${counts.PROCESSING_DOWNLOAD + counts.PROCESSING_UPLOAD} post(s) still processing — re-run this script in a minute or two.${COLORS.reset}`)
  }
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
