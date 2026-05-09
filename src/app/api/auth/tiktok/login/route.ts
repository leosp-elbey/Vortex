// Phase 14AK — TikTok OAuth login route.
//
// Pairs with the existing Phase 14R callback at /api/auth/tiktok/callback.
// The callback was shipped first (built expecting an external "Connect
// TikTok" UI button to drive the flow), but the operator needs a URL they
// can paste into a browser to kick off the authorization step. This route
// fills that gap.
//
// GET /api/auth/tiktok/login
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
//   state         = crypto.randomUUID() — CSRF token. Validation is
//                   deferred (the callback currently does `void state`,
//                   matching the YouTube callback's behavior). A future
//                   phase can add a session-backed state store and
//                   validate at the callback hook point.
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

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const SCOPES = 'user.info.basic,video.publish'
const CALLBACK_PATH = '/api/auth/tiktok/callback'

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

/** Build the absolute callback URI. Mirrors callback/route.ts:callbackUrl(). */
function callbackUrl(request: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  return new URL(CALLBACK_PATH, base).toString()
}

export async function GET(request: NextRequest) {
  const clientKey = envTrim('TIKTOK_CLIENT_KEY')
  if (!clientKey) {
    return NextResponse.json(
      {
        error:
          'TIKTOK_CLIENT_KEY is not configured. Set it in Vercel → Project Settings → Environment Variables and redeploy before starting the OAuth flow.',
      },
      { status: 500 },
    )
  }

  // CSRF token. The callback does not yet validate it (matches the existing
  // YouTube callback) but TikTok still requires the param to be present and
  // a future state-validation phase can hook in here.
  const state = crypto.randomUUID()

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: callbackUrl(request),
    state,
  })

  return NextResponse.redirect(`${AUTHORIZE_URL}?${params.toString()}`)
}
