// Phase 22C — daily morning ops monitor.
//
// Runs at 08:00 UTC, sends a summary email to info@vortextrips.com via
// Resend whenever any check returns WARNING or RED.
//
// CHECK 1: autoposter_cron_enabled in site_settings
// CHECK 2: tiktok_token_expires_at in site_settings (warns if <8h to expiry — Phase 22D)
// CHECK 3: content_calendar approved+ready queue depth (warns if <10)
// CHECK 4: Resend last-24h bounce rate (RED if >5%)
// CHECK 5: content_calendar posted_at in last 25h (warns if 0)
// CHECK 6: FB/IG token via Graph debug_token (Phase 23A) — warns if
//          data_access_expires_at <7d or token has non-permanent expires_at.
//          Backstop for the meta-token-refresh cron at 05:30 UTC; this
//          monitor runs 2.5h later so any miss bubbles up here.
//
// Returns JSON with the per-check results so the cron log carries the full
// status for any post-hoc debugging.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type CheckStatus = 'OK' | 'WARNING' | 'RED'

interface CheckResult {
  check: string
  status: CheckStatus
  message: string
}

const ADMIN_EMAIL = 'info@vortextrips.com'

interface ResendEmail {
  id?: string
  created_at?: string
  last_event?: string
}

interface ResendListResponse {
  data?: ResendEmail[]
}

async function checkAutoposter(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<CheckResult> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'autoposter_cron_enabled')
    .maybeSingle()
  if (error) {
    return { check: 'autoposter', status: 'RED', message: `query error: ${error.message}` }
  }
  if (!data) {
    return { check: 'autoposter', status: 'WARNING', message: "site_settings row 'autoposter_cron_enabled' not found" }
  }
  const value = String(data.value).toLowerCase()
  if (value === 'true') {
    return { check: 'autoposter', status: 'OK', message: 'autoposter enabled' }
  }
  return { check: 'autoposter', status: 'WARNING', message: `autoposter DISABLED (value=${value})` }
}

async function checkTikTokExpiry(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<CheckResult> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'tiktok_token_expires_at')
    .maybeSingle()
  if (error) {
    return { check: 'tiktok-expiry', status: 'RED', message: `query error: ${error.message}` }
  }
  if (!data) {
    return { check: 'tiktok-expiry', status: 'WARNING', message: "site_settings row 'tiktok_token_expires_at' not found" }
  }
  const raw = data.value as string
  const expiresAt = new Date(raw)
  if (Number.isNaN(expiresAt.getTime())) {
    return { check: 'tiktok-expiry', status: 'WARNING', message: `tiktok_token_expires_at not parseable: ${raw}` }
  }
  // Phase 22D — threshold widened from 2h to 8h so this check catches any
  // overnight failure of the 06:00 UTC tiktok-token-refresh cron. With auto-
  // refresh in place, a valid token should always have >>8h remaining when
  // this 08:00 UTC monitor runs.
  const cutoff = new Date(Date.now() + 8 * 60 * 60 * 1000)
  if (expiresAt < cutoff) {
    return {
      check: 'tiktok-expiry',
      status: 'WARNING',
      message: `TikTok token expires within 8h (${expiresAt.toISOString()}) — auto-refresh may have failed; visit vortextrips.com/api/auth/tiktok/login`,
    }
  }
  return { check: 'tiktok-expiry', status: 'OK', message: `TikTok token valid until ${expiresAt.toISOString()}` }
}

async function checkQueueDepth(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<CheckResult> {
  const { count, error } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq('posting_status', 'ready')
  if (error) {
    return { check: 'queue-depth', status: 'RED', message: `query error: ${error.message}` }
  }
  const n = count ?? 0
  if (n < 10) {
    return { check: 'queue-depth', status: 'WARNING', message: `queue low (${n} posts) — generate more content` }
  }
  return { check: 'queue-depth', status: 'OK', message: `queue depth ${n} posts` }
}

async function checkBounceRate(): Promise<CheckResult> {
  const key = (process.env.RESEND_API_KEY ?? '').trim()
  if (!key) {
    return { check: 'bounce-rate', status: 'WARNING', message: 'RESEND_API_KEY not configured' }
  }
  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails?limit=100', {
      headers: { Authorization: `Bearer ${key}` },
    })
  } catch (err) {
    return { check: 'bounce-rate', status: 'WARNING', message: `Resend fetch threw: ${err instanceof Error ? err.message : err}` }
  }
  if (!res.ok) {
    return { check: 'bounce-rate', status: 'WARNING', message: `Resend API ${res.status}` }
  }
  const body = (await res.json()) as ResendListResponse | ResendEmail[]
  const emails = Array.isArray(body) ? body : (body.data ?? [])
  const since = Date.now() - 24 * 60 * 60 * 1000
  let delivered = 0
  let bounced = 0
  let finalized = 0
  for (const e of emails) {
    const created = e.created_at ? new Date(e.created_at).getTime() : 0
    if (!created || created < since) continue
    const ev = (e.last_event ?? '').toLowerCase()
    if (ev === 'delivered' || ev === 'opened' || ev === 'clicked') { delivered++; finalized++ }
    else if (ev === 'bounced') { bounced++; finalized++ }
    else if (ev === 'complained') { finalized++ }
    else if (ev === 'send_failed' || ev === 'undelivered' || ev === 'dropped') { finalized++ }
  }
  if (finalized < 5) {
    return { check: 'bounce-rate', status: 'OK', message: `low volume (finalized=${finalized}) — verdict skipped` }
  }
  const bounceRate = (bounced / finalized) * 100
  if (bounceRate > 5) {
    return {
      check: 'bounce-rate',
      status: 'RED',
      message: `bounce rate ${bounceRate.toFixed(1)}% (${bounced}/${finalized}) — run cleanup-bounces.mjs`,
    }
  }
  return { check: 'bounce-rate', status: 'OK', message: `bounce rate ${bounceRate.toFixed(1)}% (${bounced}/${finalized})` }
}

// Phase 23A — Meta token health backstop. Mirrors the criteria used by the
// meta-token-refresh cron at 05:30 UTC: warns if the FB Page token either
// has a non-permanent expires_at or a data_access_expires_at inside 7 days.
// Identical Graph debug_token call as the dedicated cron, kept here as a
// second line of defense so the morning summary email surfaces any miss.
interface DebugTokenData {
  expires_at?: number
  data_access_expires_at?: number
  is_valid?: boolean
}
interface DebugTokenResponse {
  data?: DebugTokenData
  error?: { message?: string }
}

async function checkFacebookToken(): Promise<CheckResult> {
  const token = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? '').trim()
  if (!token) {
    return { check: 'fb-token-health', status: 'WARNING', message: 'FACEBOOK_PAGE_ACCESS_TOKEN not configured' }
  }
  const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    return {
      check: 'fb-token-health',
      status: 'WARNING',
      message: `debug_token fetch threw: ${err instanceof Error ? err.message : 'unknown'}`,
    }
  }
  let body: DebugTokenResponse
  try {
    body = (await res.json()) as DebugTokenResponse
  } catch {
    return { check: 'fb-token-health', status: 'WARNING', message: `debug_token non-JSON (status ${res.status})` }
  }
  if (body.error || !body.data) {
    return {
      check: 'fb-token-health',
      status: 'WARNING',
      message: `debug_token error: ${body.error?.message ?? 'no data payload'}`,
    }
  }
  const expiresAt = typeof body.data.expires_at === 'number' ? body.data.expires_at : null
  const dataAccessExpiresAt =
    typeof body.data.data_access_expires_at === 'number' ? body.data.data_access_expires_at : null
  const nowSec = Math.floor(Date.now() / 1000)
  const sevenDaysSec = 7 * 24 * 60 * 60

  if (expiresAt === null) {
    return { check: 'fb-token-health', status: 'WARNING', message: 'expires_at missing from debug_token response' }
  }
  if (expiresAt !== 0) {
    return {
      check: 'fb-token-health',
      status: 'WARNING',
      message: `token will expire at ${new Date(expiresAt * 1000).toISOString()} — not a permanent page token`,
    }
  }
  if (dataAccessExpiresAt === null) {
    return { check: 'fb-token-health', status: 'WARNING', message: 'data_access_expires_at missing from debug_token response' }
  }
  if (dataAccessExpiresAt < nowSec + sevenDaysSec) {
    return {
      check: 'fb-token-health',
      status: 'WARNING',
      message: `data_access expires ${new Date(dataAccessExpiresAt * 1000).toISOString()} — within 7 days; rotate via developers.facebook.com/tools/explorer/2138194153633175/`,
    }
  }
  return {
    check: 'fb-token-health',
    status: 'OK',
    message: `permanent token; data_access expires ${new Date(dataAccessExpiresAt * 1000).toISOString()}`,
  }
}

async function checkRecentPosts(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<CheckResult> {
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .gt('posted_at', since)
  if (error) {
    return { check: 'recent-posts', status: 'RED', message: `query error: ${error.message}` }
  }
  const n = count ?? 0
  if (n === 0) {
    return { check: 'recent-posts', status: 'WARNING', message: 'no posts in last 25 hours — check autoposter' }
  }
  return { check: 'recent-posts', status: 'OK', message: `${n} posts in last 25 hours` }
}

function renderSummaryHTML(results: CheckResult[]): string {
  const rows = results
    .map((r) => {
      const color =
        r.status === 'OK' ? '#10b981' : r.status === 'WARNING' ? '#f59e0b' : '#ef4444'
      const icon = r.status === 'OK' ? '✅' : r.status === 'WARNING' ? '⚠️' : '🔴'
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${icon} <strong>${r.check}</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${color};font-weight:600;">${r.status}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${r.message}</td>
      </tr>`
    })
    .join('')
  return `<div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="margin:0 0 16px">VortexTrips morning monitor — ${new Date().toISOString().slice(0, 10)}</h2>
    <p style="margin:0 0 16px;color:#6b7280">Daily 08:00 UTC health snapshot. Any WARNING or RED triggered this alert.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="text-align:left;padding:8px 12px">Check</th>
          <th style="text-align:left;padding:8px 12px">Status</th>
          <th style="text-align:left;padding:8px 12px">Detail</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const checks = await Promise.all([
    checkAutoposter(supabase),
    checkTikTokExpiry(supabase),
    checkQueueDepth(supabase),
    checkBounceRate(),
    checkRecentPosts(supabase),
    checkFacebookToken(),
  ])

  const hasFailure = checks.some((c) => c.status !== 'OK')
  const counts = checks.reduce<Record<CheckStatus, number>>(
    (acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }),
    { OK: 0, WARNING: 0, RED: 0 },
  )

  if (hasFailure) {
    try {
      const subject = `${counts.RED ? '🔴' : '⚠️'} VortexTrips morning monitor — ${counts.RED ?? 0} RED / ${counts.WARNING ?? 0} WARNING`
      await sendEmail({ to: ADMIN_EMAIL, subject, html: renderSummaryHTML(checks) })
    } catch (err) {
      console.error('[morning-monitor] alert email failed:', err instanceof Error ? err.message : err)
    }
  }

  console.log('[morning-monitor] summary', { counts, checks })

  return NextResponse.json({
    success: true,
    startedAt: new Date().toISOString(),
    counts,
    checks,
    alertEmailed: hasFailure,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
