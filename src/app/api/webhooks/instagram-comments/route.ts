// Phase 22H — Instagram comment webhook → auto-DM on trigger keyword.
//
// Meta webhooks use two HTTP verbs against the same URL:
//   GET  → verification challenge during subscription handshake.
//          Meta sends ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
//          We must echo the challenge back as text/plain with 200.
//   POST → real event payloads. Meta retries on non-200, so we always return
//          200 once the payload has been received, even if downstream send
//          fails. Errors are logged, not surfaced.
//
// Trigger logic: when a user comments on one of our IG posts with any of the
// approved keywords, we DM the commenter the /free + /join CTA pair.
//
// All errors swallowed by design — never let Meta retry a comment storm.

import { NextRequest, NextResponse } from 'next/server'

const GRAPH_API = 'https://graph.facebook.com/v25.0'
const IG_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
const IG_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

const TRIGGER_KEYWORDS = ['free', 'info', 'join', 'yes', 'interested', 'how', 'details'] as const

const DM_BODY = "Hey! Thanks for your interest 🌍 Get FREE access to wholesale travel rates at 500,000+ hotels — same rates travel agents use. No credit card needed: vortextrips.com/free\n\nWant to learn how to earn from sharing this? vortextrips.com/join"

// Narrow types describing the slice of Meta's IG webhook payload we read.
// Meta sends a lot of fields we don't care about — we only validate what we need.
interface IgCommentFromValue {
  id?: string
  text?: string
  from?: { id?: string }
  media?: { id?: string }
}

interface IgCommentChange {
  field?: string
  value?: IgCommentFromValue
}

interface IgWebhookEntry {
  changes?: IgCommentChange[]
}

interface IgWebhookPayload {
  entry?: IgWebhookEntry[]
}

function matchKeyword(text: string | undefined): string | null {
  if (!text || typeof text !== 'string') return null
  const lower = text.toLowerCase()
  for (const kw of TRIGGER_KEYWORDS) {
    // Word-boundary-ish match: substring is sufficient since these are all
    // short tokens and IG comments are short. False positives on "freedom"
    // / "information" are acceptable — better to over-DM than miss leads.
    if (lower.includes(kw)) return kw
  }
  return null
}

async function sendInstagramDM(commenterId: string, mediaId: string | undefined): Promise<void> {
  if (!IG_ACCOUNT_ID || !IG_ACCESS_TOKEN) {
    console.error('[ig-comments] DM skipped — IG credentials missing')
    return
  }
  try {
    const res = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${IG_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        recipient: { id: commenterId },
        message: { text: DM_BODY },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || (data as { error?: unknown }).error) {
      console.error('[ig-comments] DM failed', { commenterId, mediaId, status: res.status, response: data })
      return
    }
    console.log('[ig-comments] DM sent', { commenterId, mediaId })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown error'
    console.error('[ig-comments] DM failed', { commenterId, mediaId, error })
  }
}

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

  console.warn('[ig-comments] webhook verification rejected', { mode, hasVerifyToken: Boolean(VERIFY_TOKEN), tokenMatch: Boolean(VERIFY_TOKEN) && token === VERIFY_TOKEN })
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  let payload: IgWebhookPayload
  try {
    payload = (await request.json()) as IgWebhookPayload
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown'
    console.error('[ig-comments] invalid JSON body', { error })
    // Meta still retries on non-200, so return 200 — bad JSON isn't worth a storm.
    return NextResponse.json({ ok: true })
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : []
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : []
    for (const change of changes) {
      if (change.field !== 'comments') continue
      const value = change.value
      if (!value) continue

      const commentId = value.id
      const commenterId = value.from?.id
      const text = value.text
      const mediaId = value.media?.id

      if (!commenterId) {
        console.log('[ig-comments] skipped — no commenter id', { commentId })
        continue
      }

      const keyword = matchKeyword(text)
      if (!keyword) {
        console.log('[ig-comments] no keyword match', { commentId, commenterId })
        continue
      }

      console.log('[ig-comments] keyword match', { commentId, keyword, commenterId })
      // Fire-and-await within the request lifetime so logs land before Vercel
      // tears down the function. Failure is logged inside sendInstagramDM and
      // does NOT throw.
      await sendInstagramDM(commenterId, mediaId)
    }
  }

  return NextResponse.json({ ok: true })
}
