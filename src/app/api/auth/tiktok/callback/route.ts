// Phase 14R — TikTok OAuth callback with token exchange.
// Phase 14AM — adds CSRF state cookie validation. The login route at
// /api/auth/tiktok/login sets `tt_oauth_state` (httpOnly, 10-min TTL);
// this callback compares the cookie value to the `state` query param
// returned by TikTok and rejects mismatches. The cookie is cleared after
// validation regardless of outcome to prevent replay.
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
// Phase 14AM CSRF flow:
//   1. Login route generates `state = crypto.randomUUID()`, sends it to
//      TikTok in the authorize URL AND sets `tt_oauth_state` cookie.
//   2. TikTok echoes the `state` back in this callback's query string.
//   3. Callback compares query.state to cookie.tt_oauth_state. If they
//      don't match, redirect with `connected=false&error=state_mismatch`.
//   4. Cookie is cleared in BOTH success and failure paths so a replay of
//      the same `state` value can't succeed twice.
//   5. If the cookie is missing entirely (e.g., direct callback hit, expired
//      cookie, browser cleared cookies between login and callback), reject
//      with `connected=false&error=state_missing`.
// The YouTube callback still defers state validation; that's a separate
// follow-up phase if/when we want symmetric protection there.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForTokens, saveTikTokTokens } from '@/lib/tiktok-oauth'

const SETTINGS_PATH = '/dashboard/settings'
const CALLBACK_PATH = '/api/auth/tiktok/callback'
const STATE_COOKIE = 'tt_oauth_state'

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

/**
 * Phase 14AM — produce a redirect response that ALSO clears the
 * `tt_oauth_state` cookie. Used in both success and failure paths so a
 * given `state` value can never replay a second authorization flow.
 */
function redirectAndClearStateCookie(target: string): NextResponse {
  const response = NextResponse.redirect(target)
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
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
    return redirectAndClearStateCookie(
      buildRedirectUrl(request, {
        platform: 'tiktok',
        connected: 'false',
        error: message,
      }),
    )
  }

  // 2. Phase 14AM — CSRF state validation. The login route stored a
  //    `tt_oauth_state` cookie at flow start; TikTok echoed the same
  //    `state` value back in the query string. The two MUST match. A
  //    missing cookie means either (a) the callback was hit directly
  //    without going through /api/auth/tiktok/login first, (b) the cookie
  //    expired (10-min TTL), or (c) the browser cleared cookies between
  //    login and callback. A mismatched cookie means a CSRF attempt — a
  //    third-party site embedded an authorize URL with their own state.
  //    Either way, abort before exchanging the code for tokens.
  const cookieState = request.cookies.get(STATE_COOKIE)?.value ?? null
  if (!cookieState) {
    return redirectAndClearStateCookie(
      buildRedirectUrl(request, {
        platform: 'tiktok',
        connected: 'false',
        error: 'state_missing',
      }),
    )
  }
  if (!state || state !== cookieState) {
    return redirectAndClearStateCookie(
      buildRedirectUrl(request, {
        platform: 'tiktok',
        connected: 'false',
        error: 'state_mismatch',
      }),
    )
  }

  // 3. No code in the query string. Usually means someone hit the callback
  //    URL directly, not via TikTok's redirect — e.g. browser refresh.
  if (!code) {
    return redirectAndClearStateCookie(
      buildRedirectUrl(request, {
        platform: 'tiktok',
        connected: 'false',
        error: 'missing_code',
      }),
    )
  }

  // 4. Exchange the code for tokens. Network or TikTok-side errors land
  //    in connected=false with a truncated explanation. The `code` itself
  //    is never logged.
  try {
    const tokens = await exchangeCodeForTokens(code, callbackUrl(request))
    const admin = createAdminClient()
    await saveTikTokTokens(admin, tokens)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'token exchange failed'
    return redirectAndClearStateCookie(
      buildRedirectUrl(request, {
        platform: 'tiktok',
        connected: 'false',
        error: truncate(message),
      }),
    )
  }

  return redirectAndClearStateCookie(
    buildRedirectUrl(request, {
      platform: 'tiktok',
      connected: 'true',
    }),
  )
}
