// Phase 22H → Phase 23G — Instagram comment webhook → auto-DM.
//
// Legacy per-platform URL retained for backward compatibility. New
// deployments should register the unified /api/webhooks/meta URL instead.
// See src/lib/meta-webhook-utils.ts for actual logic (HMAC verification,
// keyword matching, throttle, DM copy, dispatch loop).
//
// Phase 23G changes: raw-body-first read + HMAC signature verification via
// FACEBOOK_APP_SECRET, shared compliant DM copy (no income framing), shared
// word-boundary keyword matching, shared throttle Map.

import { NextRequest, NextResponse } from 'next/server'
import {
  verifyMetaSignature,
  processIgCommentChanges,
  type MetaWebhookPayload,
} from '@/lib/meta-webhook-utils'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')

  if (mode === 'subscribe' && token && VERIFY_TOKEN && token === VERIFY_TOKEN && challenge) {
    console.log('[ig-comments] webhook verification handshake succeeded')
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  console.warn('[ig-comments] webhook verification rejected', {
    mode,
    hasVerifyToken: Boolean(VERIFY_TOKEN),
    tokenMatch: Boolean(VERIFY_TOKEN) && token === VERIFY_TOKEN,
  })
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  // Phase 23G — read raw body FIRST for HMAC verification.
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  const secret = process.env.FACEBOOK_APP_SECRET

  if (secret) {
    if (!verifyMetaSignature(rawBody, signature, secret)) {
      console.warn('[ig-comments] signature verification failed', {
        hasSignature: Boolean(signature),
      })
      return new NextResponse('Forbidden', { status: 403 })
    }
  } else {
    console.warn('[ig-comments] FACEBOOK_APP_SECRET not configured — signature verification skipped (dev fail-open)')
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown'
    console.error('[ig-comments] invalid JSON body', { error })
    return NextResponse.json({ ok: true })
  }

  await processIgCommentChanges(payload.entry)
  return NextResponse.json({ ok: true })
}
