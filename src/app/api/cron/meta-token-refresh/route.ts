// Phase 23A — daily Meta (FB/IG) token health check.
//
// Runs at 05:30 UTC (before tiktok-token-refresh at 06:00 and morning-monitor
// at 08:00) so any "needs rotation" condition surfaces in the operator's
// inbox before the autoposter (10/12/14/16/18/20 UTC) can fail.
//
// Meta page access tokens have TWO independent expiry concepts:
//   1. expires_at — 0 means "never expires" (permanent page token). Any
//      non-zero value means Meta will auto-revoke at that timestamp.
//   2. data_access_expires_at — Meta auto-revokes data access permissions
//      every 90 days unless a Page admin re-completes OAuth or the app
//      stays in App Review. This is independent of token validity: a
//      permanent token can still hit data-access expiry and start returning
//      errors on graph reads.
//
// Health criteria:
//   - expires_at === 0 (token itself never expires)
//   - data_access_expires_at > NOW + 7 days (90-day refresh not imminent)
//
// Unlike TikTok, the Meta page token cannot be refreshed via API call —
// rotation requires re-running the Graph API Explorer "Extend Access Token"
// flow. So this cron only DETECTS and EMAILS the operator; it does not
// auto-refresh.
//
// Always returns 200 so Vercel's cron health doesn't double-up on the
// operator notification email already sent here.

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ADMIN_EMAIL = 'info@vortextrips.com'
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60
const GRAPH_DEBUG_URL = 'https://graph.facebook.com/debug_token'
const ROTATION_URL = 'https://developers.facebook.com/tools/explorer/2138194153633175/'
const ALERT_SUBJECT = 'ACTION REQUIRED: VortexTrips FB/IG Token Expires Soon'

interface DebugTokenData {
  expires_at?: number
  data_access_expires_at?: number
  is_valid?: boolean
  scopes?: string[]
}

interface DebugTokenResponse {
  data?: DebugTokenData
  error?: { message?: string; code?: number }
}

function fmtTimestamp(secs: number | null): string {
  if (secs == null) return '<unknown>'
  if (secs === 0) return 'never (permanent)'
  return new Date(secs * 1000).toISOString()
}

function renderAlertHTML(args: {
  reason: string
  expiresAt: number | null
  dataAccessExpiresAt: number | null
}): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="margin:0 0 12px;color:#ef4444">🔴 VortexTrips FB/IG Token — Action Required</h2>
    <p>The daily Meta token health check at 05:30 UTC flagged a condition that requires manual rotation. Without it, autoposter calls to Facebook and Instagram will start failing within days.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
      <tr><td style="padding:6px 0;color:#6b7280">Reason</td><td><strong>${args.reason}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Token expires_at</td><td>${fmtTimestamp(args.expiresAt)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Data access expires</td><td>${fmtTimestamp(args.dataAccessExpiresAt)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">When detected</td><td>${new Date().toISOString()}</td></tr>
    </table>
    <h3 style="margin:18px 0 8px">Fix (≈ 10 minutes)</h3>
    <ol style="padding-left:20px;line-height:1.6">
      <li>Open <a href="${ROTATION_URL}" style="color:#FF6B35;font-weight:600">Graph API Explorer</a> while logged in as a Vortex Trips Page admin.</li>
      <li>Select Meta App → <strong>VortexTrips API</strong>, User/Page → <strong>Vortex Trips</strong>.</li>
      <li>Click the info icon → "Open in Access Token Tool" → "Extend Access Token" → enter password.</li>
      <li>Copy the never-expiring page token.</li>
      <li>Update <code>FACEBOOK_PAGE_ACCESS_TOKEN</code> + <code>INSTAGRAM_ACCESS_TOKEN</code> in Vercel env vars → redeploy.</li>
    </ol>
  </div>`
}

interface MetaTokenStatus {
  ok: boolean
  reason: string
  expiresAt: number | null
  dataAccessExpiresAt: number | null
}

async function checkMetaToken(token: string): Promise<MetaTokenStatus> {
  const url = `${GRAPH_DEBUG_URL}?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    return {
      ok: false,
      reason: `debug_token fetch threw: ${err instanceof Error ? err.message : 'unknown'}`,
      expiresAt: null,
      dataAccessExpiresAt: null,
    }
  }
  let body: DebugTokenResponse
  try {
    body = (await res.json()) as DebugTokenResponse
  } catch {
    return {
      ok: false,
      reason: `debug_token returned non-JSON (status ${res.status})`,
      expiresAt: null,
      dataAccessExpiresAt: null,
    }
  }
  if (body.error || !body.data) {
    return {
      ok: false,
      reason: `debug_token error: ${body.error?.message ?? 'no data payload'}`,
      expiresAt: null,
      dataAccessExpiresAt: null,
    }
  }

  const expiresAt = typeof body.data.expires_at === 'number' ? body.data.expires_at : null
  const dataAccessExpiresAt =
    typeof body.data.data_access_expires_at === 'number' ? body.data.data_access_expires_at : null
  const nowSec = Math.floor(Date.now() / 1000)

  if (expiresAt === null) {
    return { ok: false, reason: 'expires_at missing from debug_token response', expiresAt, dataAccessExpiresAt }
  }
  if (expiresAt !== 0) {
    return {
      ok: false,
      reason: `token will expire at ${fmtTimestamp(expiresAt)} — not a permanent page token`,
      expiresAt,
      dataAccessExpiresAt,
    }
  }
  if (dataAccessExpiresAt === null) {
    return {
      ok: false,
      reason: 'data_access_expires_at missing from debug_token response',
      expiresAt,
      dataAccessExpiresAt,
    }
  }
  if (dataAccessExpiresAt < nowSec + SEVEN_DAYS_SEC) {
    return {
      ok: false,
      reason: `data_access_expires_at within 7 days (${fmtTimestamp(dataAccessExpiresAt)})`,
      expiresAt,
      dataAccessExpiresAt,
    }
  }
  return { ok: true, reason: 'healthy', expiresAt, dataAccessExpiresAt }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? '').trim()
  const startedAt = new Date().toISOString()

  if (!token) {
    const reason = 'FACEBOOK_PAGE_ACCESS_TOKEN not configured'
    console.log(`[meta-refresh] CRITICAL: FB/IG token needs manual rotation — visit ${ROTATION_URL} (${reason})`)
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: ALERT_SUBJECT,
        html: renderAlertHTML({ reason, expiresAt: null, dataAccessExpiresAt: null }),
      })
    } catch (mailErr) {
      console.error('[meta-refresh] alert email failed:', mailErr instanceof Error ? mailErr.message : mailErr)
    }
    return NextResponse.json(
      { refreshed: false, action_required: true, reason, startedAt },
      { status: 200 },
    )
  }

  const result = await checkMetaToken(token)

  if (!result.ok) {
    console.log(`[meta-refresh] CRITICAL: FB/IG token needs manual rotation — visit ${ROTATION_URL} (${result.reason})`)
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: ALERT_SUBJECT,
        html: renderAlertHTML({
          reason: result.reason,
          expiresAt: result.expiresAt,
          dataAccessExpiresAt: result.dataAccessExpiresAt,
        }),
      })
    } catch (mailErr) {
      console.error('[meta-refresh] alert email failed:', mailErr instanceof Error ? mailErr.message : mailErr)
    }
    return NextResponse.json(
      {
        refreshed: false,
        action_required: true,
        reason: result.reason,
        expires_at: result.expiresAt,
        data_access_expires_at: result.dataAccessExpiresAt,
        startedAt,
      },
      { status: 200 },
    )
  }

  const dataAccessIso = fmtTimestamp(result.dataAccessExpiresAt)
  console.log(`[meta-refresh] token healthy, data_access_expires: ${dataAccessIso}`)
  return NextResponse.json(
    { healthy: true, data_access_expires_at: dataAccessIso, startedAt },
    { status: 200 },
  )
}

export async function POST(request: NextRequest) {
  return GET(request)
}
