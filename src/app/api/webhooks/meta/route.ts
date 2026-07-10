// Phase 23G — Unified Meta webhook endpoint.
//
// Single URL registered in the Meta Developer Portal for BOTH the Facebook
// Page product (subscribe to 'feed' field) and Instagram (subscribe to
// 'comments' field). Register as:
//
//   URL:          https://www.vortextrips.com/api/webhooks/meta
//   Verify Token: value of META_WEBHOOK_VERIFY_TOKEN
//
// Meta calls this route two ways:
//   GET  → the subscription-time verification handshake. Params:
//          hub.mode=subscribe, hub.verify_token=<...>, hub.challenge=<...>
//          We echo hub.challenge back with status 200 if the token matches.
//   POST → real event payloads. Meta signs the raw body with an
//          HMAC-SHA256 using the App Secret. We verify against
//          FACEBOOK_APP_SECRET, then dispatch by payload shape.
//
// Payload dispatch:
//   payload.object === 'instagram'  → processIgCommentChanges
//   payload.object === 'page'       → processFbFeedChanges
//   Otherwise                       → run both dispatchers (each filters
//                                     internally by change.field)
//
// Always returns 200 to Meta (even on invalid JSON or unknown event
// types) to prevent Meta's retry cascade. Signature-verification failures
// return 403 — Meta stops retrying signature-failing bodies quickly, and
// a 200 there would silently accept spoofed traffic.

import { NextRequest, NextResponse } from 'next/server'
import {
  verifyMetaSignature,
  processAnyMetaPayload,
  type MetaWebhookPayload,
} from '@/lib/meta-webhook-utils'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')

  if (mode === 'subscribe' && token && VERIFY_TOKEN && token === VERIFY_TOKEN && challenge) {
    console.log('[meta-webhook] verification handshake succeeded')
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  console.warn('[meta-webhook] verification rejected', {
    mode,
    hasVerifyToken: Boolean(VERIFY_TOKEN),
    tokenMatch: Boolean(VERIFY_TOKEN) && token === VERIFY_TOKEN,
  })
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  // Read raw body BEFORE JSON.parse so signature verification runs against
  // exactly the bytes Meta signed.
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  const secret = process.env.FACEBOOK_APP_SECRET

  if (secret) {
    if (!verifyMetaSignature(rawBody, signature, secret)) {
      console.warn('[meta-webhook] signature verification failed', {
        hasSignature: Boolean(signature),
      })
      return new NextResponse('Forbidden', { status: 403 })
    }
  } else {
    console.warn('[meta-webhook] FACEBOOK_APP_SECRET not configured — signature verification skipped (dev fail-open)')
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown'
    console.error('[meta-webhook] invalid JSON body', { error })
    // Return 200 — bad JSON isn't worth Meta's retry cascade.
    return NextResponse.json({ ok: true })
  }

  try {
    await processAnyMetaPayload(payload)
  } catch (err) {
    // Defense in depth. Individual DM failures are already caught inside
    // the dispatchers, but any unexpected exception here still returns
    // 200 to Meta so we don't trigger a retry storm.
    const error = err instanceof Error ? err.message : 'unknown error'
    console.error('[meta-webhook] dispatcher threw (returning 200 anyway)', { error })
  }

  return NextResponse.json({ ok: true })
}
