import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'
import { verifyAIOutput } from '@/lib/ai-verifier'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: job, error: jobErr } = await auth.admin
    .from('ai_jobs')
    .select('id, job_type, output_payload, status')
    .eq('id', id)
    .single()

  if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const output = (job.output_payload as { content?: string } | null)?.content ?? ''
  if (!output) return NextResponse.json({ error: 'Job has no output to verify' }, { status: 400 })

  if (job.status === 'running') {
    return NextResponse.json({ error: 'Job is still running — wait for completion' }, { status: 409 })
  }

  try {
    const result = await verifyAIOutput({ jobId: job.id, output, jobType: job.job_type })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
