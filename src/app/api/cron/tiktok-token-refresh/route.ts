// Phase 22D — daily TikTok token auto-refresh.
//
// Runs at 06:00 UTC (2h before morning-monitor at 08:00) so we always
// rotate the access_token *before* the autoposter (14:00/18:00/22:00 UTC)
// could fail on an expired token.
//
// Logic:
//   1. Read tiktok_token_expires_at from site_settings.
//   2. If it expires within 6 hours (or is already expired), call
//      refreshAccessToken(stored_refresh_token) and saveTikTokTokens(...).
//      TikTok rotates refresh tokens on every refresh, so the helper
//      persists BOTH the new access + new refresh tokens.
//   3. If the token is still valid (> 6h to expiry), skip the refresh.
//   4. If refresh fails (revoked / expired refresh_token), email
//      info@vortextrips.com so the operator runs the manual reconnect.
//
// Always returns 200 — including the failure case. The cron health is
// already monitored by morning-monitor (CHECK 2), so we don't want a
// non-2xx here to trigger Vercel's cron failure noise on top of an
// operator notification email.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshAccessToken, saveTikTokTokens } from '@/lib/tiktok-oauth'
import { sendEmail } from '@/lib/resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ADMIN_EMAIL = 'info@vortextrips.com'
const REFRESH_WINDOW_MS = 6 * 60 * 60 * 1000 // refresh when <=6h to expiry

interface SiteSettingRow {
  key: string
  value: string
}

async function loadTokenState(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<{ refreshToken: string | null; expiresAt: string | null }> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['tiktok_refresh_token', 'tiktok_token_expires_at'])
  if (error) throw new Error(`site_settings load failed: ${error.message}`)
  const rows = (data ?? []) as SiteSettingRow[]
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null
  return {
    refreshToken: get('tiktok_refresh_token'),
    expiresAt: get('tiktok_token_expires_at'),
  }
}

function renderFailureEmailHTML(args: { stage: string; reason: string }): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="margin:0 0 12px;color:#ef4444">🔴 TikTok token refresh failed</h2>
    <p>The daily TikTok token refresh cron (06:00 UTC) could not rotate the access token. The autoposter will not be able to publish to TikTok until this is resolved.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
      <tr><td style="padding:6px 0;color:#6b7280">Stage</td><td><strong>${args.stage}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Reason</td><td>${args.reason}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">When</td><td>${new Date().toISOString()}</td></tr>
    </table>
    <h3 style="margin:18px 0 8px">Fix</h3>
    <p>Reconnect TikTok by visiting <a href="https://www.vortextrips.com/api/auth/tiktok/login" style="color:#FF6B35;font-weight:600">https://www.vortextrips.com/api/auth/tiktok/login</a> while logged in as an admin. The OAuth flow will mint a fresh access_token + refresh_token and persist both into site_settings.</p>
  </div>`
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()

  let state: { refreshToken: string | null; expiresAt: string | null }
  try {
    state = await loadTokenState(supabase)
  } catch (err) {
    console.error('[tiktok-refresh] CRITICAL: failed to read site_settings', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { refreshed: false, error: 'site_settings_load_failed', startedAt },
      { status: 200 },
    )
  }

  // No refresh_token at all = nothing we can do automatically. Treat as the
  // same "operator must reconnect" case.
  if (!state.refreshToken) {
    const reason = 'no refresh_token in site_settings'
    console.log(`[tiktok-refresh] CRITICAL: refresh failed — manual reauth required at vortextrips.com/api/auth/tiktok/login (${reason})`)
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: '🔴 TikTok token refresh failed — manual reauth required',
        html: renderFailureEmailHTML({ stage: 'load_tokens', reason }),
      })
    } catch (mailErr) {
      console.error('[tiktok-refresh] alert email failed:', mailErr instanceof Error ? mailErr.message : mailErr)
    }
    return NextResponse.json(
      { refreshed: false, error: 'refresh_failed', reason, startedAt },
      { status: 200 },
    )
  }

  // Decide whether to refresh.
  const expiresMs = state.expiresAt ? Date.parse(state.expiresAt) : 0
  const now = Date.now()
  const msToExpiry = expiresMs - now
  const needsRefresh = !expiresMs || msToExpiry <= REFRESH_WINDOW_MS

  if (!needsRefresh) {
    const msg = `[tiktok-refresh] token valid, no refresh needed, expires: ${state.expiresAt}`
    console.log(msg)
    return NextResponse.json(
      { refreshed: false, expires_at: state.expiresAt, ms_to_expiry: msToExpiry, startedAt },
      { status: 200 },
    )
  }

  // Refresh path.
  try {
    const fresh = await refreshAccessToken(state.refreshToken)
    await saveTikTokTokens(supabase, fresh)
    const newExpiresAt = new Date(now + fresh.expires_in * 1000).toISOString()
    console.log(`[tiktok-refresh] token refreshed, new expiry: ${newExpiresAt}`)
    return NextResponse.json(
      {
        refreshed: true,
        new_expires_at: newExpiresAt,
        previous_expires_at: state.expiresAt,
        startedAt,
      },
      { status: 200 },
    )
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.log(`[tiktok-refresh] CRITICAL: refresh failed — manual reauth required at vortextrips.com/api/auth/tiktok/login (${reason})`)
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: '🔴 TikTok token refresh failed — manual reauth required',
        html: renderFailureEmailHTML({ stage: 'refresh_access_token', reason }),
      })
    } catch (mailErr) {
      console.error('[tiktok-refresh] alert email failed:', mailErr instanceof Error ? mailErr.message : mailErr)
    }
    return NextResponse.json(
      { refreshed: false, error: 'refresh_failed', reason, startedAt },
      { status: 200 },
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
