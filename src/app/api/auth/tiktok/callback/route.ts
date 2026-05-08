// Phase 14R — TikTok OAuth callback with token exchange.
//
// Receives the redirect from TikTok's authorization step, exchanges the
// `code` for an access + refresh token pair via tiktok-oauth.ts, and
// persists the tokens into site_settings so the post-to-tiktok route
// (and the future autoposter cron) can publish on the operator's behalf.
//
// Constraints (preserved from Phase 14M.1):
//   - never posts to any platform
//   - never touches content_calendar / posting_status / posting_gate_*
//   - never enables cron
//   - never logs the OAuth `code` or `state` (sensitive)
//   - the only DB writes are upserts into site_settings (token storage)
//
// Phase 14R additions:
//   - calls exchangeCodeForTokens(code, redirect_uri)
//   - calls saveTikTokTokens(admin, tokens) which upserts:
//     {tiktok_access_token, tiktok_refresh_token, tiktok_token_expires_at, tiktok_open_id}
//   - on success → connected=true; on token-exchange failure → connected=false&error=<truncated>
//
// State CSRF validation is intentionally still deferred (matches the
// existing YouTube callback behavior). A future phase can introduce a
// session-backed state store and apply it uniformly to both flows.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForTokens, saveTikTokTokens } from '@/lib/tiktok-oauth'

const SETTINGS_PATH = '/dashboard/settings'
const CALLBACK_PATH = '/api/auth/tiktok/callback'

/**
 * Build an absolute URL pointing at /dashboard/settings with a query
 * string. Prefer NEXT_PUBLIC_APP_URL when set so production redirects
 * always land on the canonical host; fall back to the request's origin
 * (handles preview deploys + local dev).
 */
function buildRedirectUrl(request: NextRequest, params: Record<string, string>): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const url = new URL(SETTINGS_PATH, base)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return url.toString()
}

/** The TikTok-registered redirect URI. MUST match what was used to start the flow. */
function callbackUrl(request: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  return new URL(CALLBACK_PATH, base).toString()
}

/** Trim a free-text TikTok error_description to a safe length for the redirect URL. */
function truncate(message: string, max = 200): string {
  if (message.length <= max) return message
  return message.slice(0, max - 1) + '…'
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')
  const errorDescription = params.get('error_description')

  // 1. TikTok reported an error during authorization (user denied scope,
  //    invalid app, etc). Surface a short message in the redirect.
  if (error) {
    const message = truncate(errorDescription ?? error)
    return NextResponse.redirect(
      buildRedirectUrl(request, {
        platform: 'tiktok',
        connected: 'false',
        error: message,
      }),
    )
  }

  // 2. No code in the query string. Usually means someone hit the callback
  //    URL directly, not via TikTok's redirect — e.g. browser refresh.
  if (!code) {
    return NextResponse.redirect(
      buildRedirectUrl(request, {
        platform: 'tiktok',
        connected: 'false',
        error: 'missing_code',
      }),
    )
  }

  // `state` is intentionally not validated yet (matches YouTube callback).
  // We still acknowledge it exists so a future state-validation phase has
  // a clear hook point.
  void state

  // 3. Exchange the code for tokens. Network or TikTok-side errors land
  //    in connected=false with a truncated explanation. The `code` itself
  //    is never logged.
  try {
    const tokens = await exchangeCodeForTokens(code, callbackUrl(request))
    const admin = createAdminClient()
    await saveTikTokTokens(admin, tokens)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'token exchange failed'
    return NextResponse.redirect(
      buildRedirectUrl(request, {
        platform: 'tiktok',
        connected: 'false',
        error: truncate(message),
      }),
    )
  }

  return NextResponse.redirect(
    buildRedirectUrl(request, {
      platform: 'tiktok',
      connected: 'true',
    }),
  )
}
