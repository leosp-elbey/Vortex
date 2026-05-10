// Phase 14AK — TikTok OAuth login route.
// Phase 14AM — added httpOnly state cookie + 10-minute TTL for CSRF
// validation at the callback. The cookie is set on the redirect response,
// scoped path=/, Secure in production. The callback reads it, compares to
// the `state` query param, and rejects mismatches with a 400-equivalent
// error redirect.
//
// Pairs with the existing Phase 14R callback at /api/auth/tiktok/callback.
// The callback was shipped first (built expecting an external "Connect
// TikTok" UI button to drive the flow), but the operator needs a URL they
// can paste into a browser to kick off the authorization step. This route
// fills that gap.
//
// GET /api/auth/tiktok/login
//   → sets `tt_oauth_state` cookie (httpOnly, Secure, SameSite=Lax, 10min)
//   → 302 redirect to https://www.tiktok.com/v2/auth/authorize/?<params>
//
// Query params sent to TikTok:
//   client_key    = process.env.TIKTOK_CLIENT_KEY
//   scope         = user.info.basic,video.publish
//                   (comma-separated per TikTok OAuth v2; matches the
//                   scope set the post-to-tiktok route expects)
//   response_type = code
//   redirect_uri  = ${NEXT_PUBLIC_APP_URL || request.origin}/api/auth/tiktok/callback
//                   MUST match the URI the callback computes AND the URI
//                   registered in the TikTok Developer Portal. Computed
//                   the same way as src/app/api/auth/tiktok/callback/route.ts.
//   state         = crypto.randomUUID() — also stored in tt_oauth_state cookie
//
// Refusals:
//   - TIKTOK_CLIENT_KEY missing → 500 with a clear setup message so the
//     operator knows what env var to set in Vercel.
//   - everything else falls through to TikTok; any platform-side error
//     (invalid app, scope rejection, etc) lands at the callback which
//     surfaces a truncated message via /dashboard/settings?platform=tiktok&connected=false&error=…
//
// Constraints:
//   - never logs the OAuth state (sensitive in CSRF context)
//   - no DB writes (callback handles token persistence)
//   - no platform calls beyond the redirect itself

import { NextRequest, NextResponse } from 'next/server'
import { getTikTokClientKey, tikTokIsSandboxMode } from '@/lib/tiktok-oauth'

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const SCOPES = 'user.info.basic,video.publish'
const CALLBACK_PATH = '/api/auth/tiktok/callback'
const STATE_COOKIE = 'tt_oauth_state'
/** 10-minute TTL — operator should complete the TikTok authorize step
 *  within this window. Long enough for a thoughtful click-through, short
 *  enough that a stolen cookie has limited replay value. */
const STATE_COOKIE_MAX_AGE_SECONDS = 60 * 10

/** Build the absolute callback URI. Mirrors callback/route.ts:callbackUrl(). */
function callbackUrl(request: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  return new URL(CALLBACK_PATH, base).toString()
}

export async function GET(request: NextRequest) {
  // Phase 14AM.1 — credential resolution honors TIKTOK_USE_SANDBOX.
  const clientKey = getTikTokClientKey()
  if (!clientKey) {
    const missingVar = tikTokIsSandboxMode() ? 'TIKTOK_CLIENT_KEY_SANDBOX' : 'TIKTOK_CLIENT_KEY'
    return NextResponse.json(
      {
        error:
          `${missingVar} is not configured. Set it in Vercel → Project Settings → Environment Variables and redeploy before starting the OAuth flow.`,
      },
      { status: 500 },
    )
  }

  // CSRF token. Phase 14AM — also stored in an httpOnly cookie that the
  // callback validates against the returned `state` query param.
  const state = crypto.randomUUID()

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: callbackUrl(request),
    state,
  })

  const response = NextResponse.redirect(`${AUTHORIZE_URL}?${params.toString()}`)
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
