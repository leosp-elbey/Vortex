// Phase 14M.1 — TikTok OAuth callback (no token exchange yet).
//
// Receives the redirect from TikTok's authorization step and routes the
// operator back to /dashboard/settings with a clear connection status.
//
// Token exchange (POST to TikTok's /v2/oauth/token endpoint with
// TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET + code) is INTENTIONALLY
// deferred — env vars are documented in .env.example but no helper exists
// yet. A future Phase 14K-tt sub-phase will land the exchange + token
// storage (mirroring the YouTube callback pattern at
// src/app/api/auth/youtube/callback/route.ts that upserts into
// site_settings).
//
// Constraints (all satisfied by this route):
//   - never posts to any platform
//   - never touches content_calendar / posting_status / posting_gate_*
//   - never enables cron
//   - never logs the OAuth code (sensitive)
//   - read-only: no DB writes in this phase
//   - no platform API calls

import { NextRequest, NextResponse } from 'next/server'

const SETTINGS_PATH = '/dashboard/settings'

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

  // 2. No code in the query string. This usually means someone hit the
  //    callback URL directly, not via TikTok's redirect — e.g. browser
  //    refresh or manual navigation. Surface `missing_code` so the
  //    settings page can render an explanation rather than silently
  //    landing the operator on a confusing screen.
  if (!code) {
    return NextResponse.redirect(
      buildRedirectUrl(request, {
        platform: 'tiktok',
        connected: 'false',
        error: 'missing_code',
      }),
    )
  }

  // 3. Code received. Token exchange is deferred (see header comment).
  //    `state` is the CSRF token TikTok bounces back; the future helper
  //    will validate it against a session-stored value before the
  //    exchange. For now we acknowledge the callback and route the
  //    operator to a "connection pending" state.
  //
  //    Intentionally NOT logging `code` or `state` — sensitive values.
  void code
  void state

  return NextResponse.redirect(
    buildRedirectUrl(request, {
      platform: 'tiktok',
      connected: 'pending',
    }),
  )
}
