// Phase 22H → Phase 23G — Facebook Page comment webhook → auto-DM.
//
// Legacy per-platform URL retained for backward compatibility. New
// deployments should register the unified /api/webhooks/meta URL in the
// Meta Developer Portal instead — this route continues to function but
// receives no traffic until/unless the operator subscribes it.
//
// Phase 23G changes:
//   - Reads raw request body first so X-Hub-Signature-256 can be verified
//     against the exact bytes Meta signed.
//   - Verifies signature via HMAC-SHA256 using FACEBOOK_APP_SECRET.
//     Fail-open when the secret is missing (dev/local env), fail-closed
//     when the secret is present but signature invalid.
//   - Uses shared meta-webhook-utils for keyword matching, throttle,
//     compliant DM copy, and dispatch loop.
//
// See src/lib/meta-webhook-utils.ts for the actual logic.

import { NextRequest, NextResponse } from 'next/server'
import {
  verifyMetaSignature,
  processFbFeedChanges,
  type MetaWebhookPayload,
} from '@/lib/meta-webhook-utils'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')

  if (mode === 'subscribe' && token && VERIFY_TOKEN && token === VERIFY_TOKEN && challenge) {
    console.log('[fb-comments] webhook verification handshake succeeded')
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  console.warn('[fb-comments] webhook verification rejected', {
    mode,
    hasVerifyToken: Boolean(VERIFY_TOKEN),
    tokenMatch: Boolean(VERIFY_TOKEN) && token === VERIFY_TOKEN,
  })
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  // Phase 23G — read raw body FIRST for HMAC verification. JSON.parse comes
  // after signature check succeeds.
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  const secret = process.env.FACEBOOK_APP_SECRET

  if (secret) {
    if (!verifyMetaSignature(rawBody, signature, secret)) {
      console.warn('[fb-comments] signature verification failed', {
        hasSignature: Boolean(signature),
      })
      return new NextResponse('Forbidden', { status: 403 })
    }
  } else {
    console.warn('[fb-comments] FACEBOOK_APP_SECRET not configured — signature verification skipped (dev fail-open)')
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown'
    console.error('[fb-comments] invalid JSON body', { error })
    // Return 200 anyway — Meta retries on non-200 and bad JSON isn't
    // worth a retry storm.
    return NextResponse.json({ ok: true })
  }

  await processFbFeedChanges(payload.entry)
  return NextResponse.json({ ok: true })
}
