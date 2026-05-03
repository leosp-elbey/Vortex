// Phase 14J — Posting gate admin endpoint.
// POST /api/admin/content-calendar/posting-gate
//
// Admin-only. Toggles a content_calendar row's gate state without touching
// `content_calendar.status` or any platform API. The future autoposter will
// require posting_status='ready' AND posting_gate_approved=true; this route
// is the only authorized path to that state.
//
// Body:
//   {
//     content_calendar_id: uuid,
//     action: 'queue' | 'unqueue',
//     notes?: string
//   }
//
// Response 200:
//   { ok, content_calendar_id, posting_status, posting_gate_approved, posting_block_reason }
// Response 400 — invalid input or row ineligible.
// Response 404 — row not found.
// Response 500 — DB error.
//
// Never auto-posts. Never calls any platform API. Never modifies status.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import { markReadyForPosting, removeFromPostingQueue } from '@/lib/posting-gate'

export const dynamic = 'force-dynamic'

const RequestSchema = z.object({
  content_calendar_id: z.string().uuid(),
  action: z.enum(['queue', 'unqueue']),
  notes: z.string().trim().min(1).max(2000).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const rawBody = await request.json().catch(() => null)
  const parsed = RequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const actor = { user_id: auth.user.id }

  try {
    const result =
      parsed.data.action === 'queue'
        ? await markReadyForPosting({
            contentCalendarId: parsed.data.content_calendar_id,
            actor,
            notes: parsed.data.notes ?? null,
          })
        : await removeFromPostingQueue({
            contentCalendarId: parsed.data.content_calendar_id,
            actor,
            reason: parsed.data.notes ?? null,
          })

    if (!result.ok) {
      // Row not found maps to 404; eligibility / validation maps to 400.
      const status = result.reason?.toLowerCase().includes('not found') ? 404 : 400
      return NextResponse.json(
        {
          ok: false,
          content_calendar_id: parsed.data.content_calendar_id,
          reason: result.reason,
        },
        { status },
      )
    }

    return NextResponse.json({
      ok: true,
      content_calendar_id: parsed.data.content_calendar_id,
      posting_status: result.row?.posting_status ?? null,
      posting_gate_approved: result.row?.posting_gate_approved ?? false,
      posting_block_reason: result.row?.posting_block_reason ?? null,
      queued_for_posting_at: result.row?.queued_for_posting_at ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Posting gate action failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
