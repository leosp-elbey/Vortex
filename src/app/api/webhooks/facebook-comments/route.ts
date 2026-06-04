// Phase 22H — Facebook Page comment webhook → auto-DM on trigger keyword.
//
// Same handshake/retry semantics as the IG comment webhook:
//   GET  → echo hub.challenge if hub.verify_token matches our env value.
//   POST → process entry[].changes[] where field === 'feed' and
//          value.item === 'comment'. Always return 200 to prevent Meta from
//          flooding us with retries.
//
// The FB Page Messenger API targets /me/messages (where "me" is the Page the
// access token belongs to) with messaging_type: 'RESPONSE'. The RESPONSE tag
// is appropriate because the user just initiated contact by commenting, so
// the response opens a fresh 24h messaging window.

import { NextRequest, NextResponse } from 'next/server'

const GRAPH_API = 'https://graph.facebook.com/v25.0'
const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

const TRIGGER_KEYWORDS = ['free', 'info', 'join', 'yes', 'interested', 'how', 'details'] as const

const DM_BODY = "Hey! Thanks for your interest ✈️ Get FREE access to wholesale travel rates at 500,000+ hotels — same rates travel agents use. No credit card needed: vortextrips.com/free\n\nWant to learn how to earn from sharing this? vortextrips.com/join"

// Narrow types describing the Meta Page feed-change payload slice we read.
interface FbFeedValue {
  item?: string
  comment_id?: string
  post_id?: string
  message?: string
  from?: { id?: string; name?: string }
}

interface FbFeedChange {
  field?: string
  value?: FbFeedValue
}

interface FbWebhookEntry {
  changes?: FbFeedChange[]
}

interface FbWebhookPayload {
  entry?: FbWebhookEntry[]
}

function matchKeyword(text: string | undefined): string | null {
  if (!text || typeof text !== 'string') return null
  const lower = text.toLowerCase()
  for (const kw of TRIGGER_KEYWORDS) {
    if (lower.includes(kw)) return kw
  }
  return null
}

async function sendFacebookDM(commenterId: string, postId: string | undefined): Promise<void> {
  if (!PAGE_TOKEN) {
    console.error('[fb-comments] DM skipped — FACEBOOK_PAGE_ACCESS_TOKEN missing')
    return
  }
  try {
    const res = await fetch(`${GRAPH_API}/me/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PAGE_TOKEN}`,
      },
      body: JSON.stringify({
        recipient: { id: commenterId },
        message: { text: DM_BODY },
        messaging_type: 'RESPONSE',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || (data as { error?: unknown }).error) {
      console.error('[fb-comments] DM failed', { commenterId, postId, status: res.status, response: data })
      return
    }
    console.log('[fb-comments] DM sent', { commenterId, postId })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown error'
    console.error('[fb-comments] DM failed', { commenterId, postId, error })
  }
}

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

  console.warn('[fb-comments] webhook verification rejected', { mode, hasVerifyToken: Boolean(VERIFY_TOKEN), tokenMatch: Boolean(VERIFY_TOKEN) && token === VERIFY_TOKEN })
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  let payload: FbWebhookPayload
  try {
    payload = (await request.json()) as FbWebhookPayload
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown'
    console.error('[fb-comments] invalid JSON body', { error })
    return NextResponse.json({ ok: true })
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : []
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : []
    for (const change of changes) {
      if (change.field !== 'feed') continue
      const value = change.value
      if (!value || value.item !== 'comment') continue

      const commentId = value.comment_id
      const commenterId = value.from?.id
      const text = value.message
      const postId = value.post_id

      if (!commenterId) {
        console.log('[fb-comments] skipped — no commenter id', { commentId })
        continue
      }

      const keyword = matchKeyword(text)
      if (!keyword) {
        console.log('[fb-comments] no keyword match', { commentId, commenterId })
        continue
      }

      console.log('[fb-comments] keyword match', { commentId, keyword, commenterId })
      await sendFacebookDM(commenterId, postId)
    }
  }

  return NextResponse.json({ ok: true })
}
