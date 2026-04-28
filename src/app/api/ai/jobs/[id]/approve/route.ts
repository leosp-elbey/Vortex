import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: job, error: jobErr } = await auth.admin
    .from('ai_jobs')
    .select('id, status')
    .eq('id', id)
    .single()

  if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status === 'approved') return NextResponse.json({ ok: true, status: 'approved', alreadyApproved: true })

  if (!['pending_review', 'needs_revision', 'completed'].includes(job.status)) {
    return NextResponse.json({ error: `Cannot approve job in status '${job.status}'` }, { status: 400 })
  }

  const { error: updateErr } = await auth.admin
    .from('ai_jobs')
    .update({
      status: 'approved',
      verified_by: 'human',
      verification_status: 'approved',
    })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: 'approved' })
}
