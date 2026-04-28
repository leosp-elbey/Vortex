import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'

const RejectSchema = z.object({
  reason: z.string().min(1).max(2000).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const parsed = RejectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const { error: updateErr } = await auth.admin
    .from('ai_jobs')
    .update({
      status: 'rejected',
      verified_by: 'human',
      verification_status: 'rejected',
      error_message: parsed.data.reason ?? 'Rejected by admin',
    })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: 'rejected' })
}
