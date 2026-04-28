import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: job, error: jobErr } = await auth.admin
    .from('ai_jobs')
    .select('*')
    .eq('id', id)
    .single()

  if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const { data: verifications } = await auth.admin
    .from('ai_verification_logs')
    .select('*')
    .eq('job_id', id)
    .order('created_at', { ascending: false })

  const { data: usage } = await auth.admin
    .from('ai_model_usage')
    .select('*')
    .eq('job_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ job, verifications: verifications ?? [], usage: usage ?? [] })
}
