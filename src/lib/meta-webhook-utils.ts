// Phase 23G — Shared machinery for Meta comment→DM webhooks.
//
// Consumed by three route files:
//   - src/app/api/webhooks/facebook-comments/route.ts  (legacy FB-only URL)
//   - src/app/api/webhooks/instagram-comments/route.ts (legacy IG-only URL)
//   - src/app/api/webhooks/meta/route.ts               (unified URL — the one
//                                                        registered with Meta)
//
// Centralizes:
//   - X-Hub-Signature-256 HMAC verification (Bug 3 fix)
//   - Word-boundary keyword matching (Bug 2 fix — no more matching "freedom"
//     or "however" against a substring `free` / `how`)
//   - Compliant DM copy (Bug 1 fix — no income framing, adds STOP mechanism)
//   - Per-commenter throttle so Meta retries don't produce duplicate DMs
//     (single Map shared across all three routes within a warm process)
//   - FB feed→comment dispatch loop
//   - IG comments dispatch loop
//
// All errors swallowed by design — Meta retries on non-200 and a comment
// storm on a single post could otherwise create a retry cascade.

import { createHmac, timingSafeEqual } from 'crypto'

// ─── config ──────────────────────────────────────────────────────────────
export const GRAPH_API = 'https://graph.facebook.com/v25.0'

export const TRIGGER_KEYWORDS = [
  'free',
  'info',
  'join',
  'yes',
  'interested',
  'how',
  'details',
] as const

// Phase 23G Bug 1 fix — income framing stripped. Reviewers testing the
// pages_messaging flow will receive ONLY the travel-savings pitch with a
// clear opt-out line, no /join CTA and no "earn from sharing" language.
export const FACEBOOK_DM_BODY =
  "Thanks for your interest in VortexTrips! ✈️\n\nGet free access to member travel rates on 500,000+ hotels, flights, cruises, and vacation packages — same rates travel agents use. No credit card needed.\n\nActivate here: https://vortextrips.com/free\n\nReply STOP if you'd prefer not to receive messages."

export const INSTAGRAM_DM_BODY =
  "Thanks for your interest in VortexTrips! 🌍\n\nGet free access to member travel rates on 500,000+ hotels, flights, cruises, and vacation packages — same rates travel agents use. No credit card needed.\n\nActivate here: https://vortextrips.com/free\n\nReply STOP if you'd prefer not to receive messages."

// ─── HMAC signature verification (Bug 3 fix) ─────────────────────────────
// Meta signs webhook POST bodies with an HMAC-SHA256 over the raw request
// body using the App Secret. The signature arrives in the
// X-Hub-Signature-256 header as `sha256=<hex>`. Verification requires the
// EXACT raw bytes Meta sent — so callers must read the body as text before
// JSON.parse, then hand both the raw body and the header value here.
export function verifyMetaSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    // timingSafeEqual throws when the two buffers have different lengths.
    // Return false rather than crashing the webhook.
    return false
  }
}

// ─── word-boundary keyword matching (Bug 2 fix) ──────────────────────────
// Replaces the earlier String.prototype.includes substring match, which
// fired on "freedom" (matching 'free'), "however" (matching 'how'), and
// "yesterday" (matching 'yes'). App reviewers explicitly test that DMs
// only fire on clear opt-in intent signals.
export function matchesKeyword(text: string | undefined | null): boolean {
  if (!text || typeof text !== 'string') return false
  return TRIGGER_KEYWORDS.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(text))
}

// ─── throttle (prevent duplicate DMs on Meta retries) ────────────────────
// Simple in-memory Map — persists across requests within the same warm
// serverless process. Cold starts wipe it, which is acceptable because
// Meta's retry cadence is fast enough that most duplicates hit a warm
// process anyway. The 1000-entry cap + lazy prune keeps memory bounded.
const recentlySent = new Map<string, number>()
const THROTTLE_MS = 5 * 60 * 1000 // 5 minutes

export function isThrottled(commenterId: string): boolean {
  const now = Date.now()
  const last = recentlySent.get(commenterId)
  if (last && now - last < THROTTLE_MS) return true
  recentlySent.set(commenterId, now)
  // Lazy pruning — bounded by size to avoid unbounded growth under load.
  if (recentlySent.size > 1000) {
    const cutoff = now - THROTTLE_MS
    for (const [k, v] of recentlySent) {
      if (v < cutoff) recentlySent.delete(k)
    }
  }
  return false
}

// ─── DM senders ──────────────────────────────────────────────────────────
export async function sendFacebookDM(
  commenterId: string,
  postId: string | undefined,
): Promise<void> {
  const pageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  if (!pageToken) {
    console.error('[meta-webhook] FB DM skipped — FACEBOOK_PAGE_ACCESS_TOKEN missing')
    return
  }
  try {
    const res = await fetch(`${GRAPH_API}/me/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pageToken}`,
      },
      body: JSON.stringify({
        recipient: { id: commenterId },
        message: { text: FACEBOOK_DM_BODY },
        messaging_type: 'RESPONSE',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || (data as { error?: unknown }).error) {
      console.error('[meta-webhook] FB DM failed', {
        commenterId,
        postId,
        status: res.status,
        response: data,
      })
      return
    }
    console.log('[meta-webhook] FB DM sent', { commenterId, postId })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown error'
    console.error('[meta-webhook] FB DM failed', { commenterId, postId, error })
  }
}

export async function sendInstagramDM(
  commenterId: string,
  mediaId: string | undefined,
): Promise<void> {
  const igAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!igAccountId || !igToken) {
    console.error('[meta-webhook] IG DM skipped — IG credentials missing')
    return
  }
  try {
    const res = await fetch(`${GRAPH_API}/${igAccountId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${igToken}`,
      },
      body: JSON.stringify({
        recipient: { id: commenterId },
        message: { text: INSTAGRAM_DM_BODY },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || (data as { error?: unknown }).error) {
      console.error('[meta-webhook] IG DM failed', {
        commenterId,
        mediaId,
        status: res.status,
        response: data,
      })
      return
    }
    console.log('[meta-webhook] IG DM sent', { commenterId, mediaId })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown error'
    console.error('[meta-webhook] IG DM failed', { commenterId, mediaId, error })
  }
}

// ─── payload types ───────────────────────────────────────────────────────
// Narrow types — only the slice of Meta's payload we actually read.

// Facebook Page feed events (`field: 'feed'`, `value.item: 'comment'`).
export interface FbFeedValue {
  item?: string
  comment_id?: string
  post_id?: string
  message?: string
  from?: { id?: string; name?: string }
}

export interface FbFeedChange {
  field?: string
  value?: FbFeedValue
}

// Instagram comment events (`field: 'comments'`).
export interface IgCommentValue {
  id?: string
  text?: string
  from?: { id?: string }
  media?: { id?: string }
}

export interface IgCommentChange {
  field?: string
  value?: IgCommentValue
}

// Generic entry shape — Meta uses the same `entry[].changes[]` structure
// for both Page (FB) and Instagram, so a single interface covers both.
export interface MetaWebhookEntry {
  changes?: Array<FbFeedChange | IgCommentChange>
}

export interface MetaWebhookPayload {
  object?: string // 'page' | 'instagram' | ...
  entry?: MetaWebhookEntry[]
}

// ─── dispatch loops ──────────────────────────────────────────────────────
// Each loop is defensive: bad payload shapes yield 0 DMs, never throw.

export async function processFbFeedChanges(
  entries: MetaWebhookEntry[] | undefined,
): Promise<void> {
  if (!Array.isArray(entries)) return
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : []
    for (const change of changes) {
      if (change.field !== 'feed') continue
      const value = (change as FbFeedChange).value
      if (!value || value.item !== 'comment') continue

      const commentId = value.comment_id
      const commenterId = value.from?.id
      const text = value.message
      const postId = value.post_id

      if (!commenterId) {
        console.log('[meta-webhook] FB skipped — no commenter id', { commentId })
        continue
      }
      if (!matchesKeyword(text)) {
        console.log('[meta-webhook] FB no keyword match', { commentId, commenterId })
        continue
      }
      if (isThrottled(commenterId)) {
        console.log(`[meta-webhook] throttled duplicate DM for commenter ${commenterId}`)
        continue
      }

      console.log('[meta-webhook] FB keyword match', { commentId, commenterId })
      await sendFacebookDM(commenterId, postId)
    }
  }
}

export async function processIgCommentChanges(
  entries: MetaWebhookEntry[] | undefined,
): Promise<void> {
  if (!Array.isArray(entries)) return
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : []
    for (const change of changes) {
      if (change.field !== 'comments') continue
      const value = (change as IgCommentChange).value
      if (!value) continue

      const commentId = value.id
      const commenterId = value.from?.id
      const text = value.text
      const mediaId = value.media?.id

      if (!commenterId) {
        console.log('[meta-webhook] IG skipped — no commenter id', { commentId })
        continue
      }
      if (!matchesKeyword(text)) {
        console.log('[meta-webhook] IG no keyword match', { commentId, commenterId })
        continue
      }
      if (isThrottled(commenterId)) {
        console.log(`[meta-webhook] throttled duplicate DM for commenter ${commenterId}`)
        continue
      }

      console.log('[meta-webhook] IG keyword match', { commentId, commenterId })
      await sendInstagramDM(commenterId, mediaId)
    }
  }
}

// ─── unified dispatcher ──────────────────────────────────────────────────
// Consumed by /api/webhooks/meta/route.ts. Reads payload.object AND the
// per-change field to route correctly. Unknown/mixed payloads fall through
// silently (both dispatchers filter internally by change.field).
export async function processAnyMetaPayload(payload: MetaWebhookPayload): Promise<void> {
  const obj = (payload.object ?? '').toLowerCase()

  if (obj === 'instagram') {
    // IG payloads only carry IG comment changes.
    await processIgCommentChanges(payload.entry)
    return
  }

  if (obj === 'page') {
    // Page payloads carry FB feed events but may also carry other change
    // types we don't handle (messages, messaging_postbacks, mention). The
    // FB dispatcher filters by field internally, so unknown-field changes
    // are silently ignored.
    await processFbFeedChanges(payload.entry)
    return
  }

  // Unknown object type or missing — try both dispatchers, they each filter
  // by field so nothing fires that shouldn't.
  console.log('[meta-webhook] unknown or missing payload.object — running both dispatchers', {
    object: obj,
  })
  await processFbFeedChanges(payload.entry)
  await processIgCommentChanges(payload.entry)
}
