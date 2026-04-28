// Move an approved AI job's output into content_calendar rows.
// The dashboard parses the job output into per-platform posts and POSTs them here for insertion.
// We require the job to be in 'approved' status as a hard gate.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'

const PostSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'tiktok', 'twitter']),
  caption: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).max(30).default([]),
  image_prompt: z.string().max(1000).optional(),
  week_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
})

const PushSchema = z.object({
  jobId: z.string().uuid(),
  posts: z.array(PostSchema).min(1).max(30),
})

const POSTING_NOT_YET_IMPLEMENTED = new Set(['tiktok', 'twitter'])

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  const parsed = PushSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const { jobId, posts } = parsed.data

  const { data: job, error: jobErr } = await auth.admin
    .from('ai_jobs')
    .select('id, status')
    .eq('id', jobId)
    .single()

  if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'approved') {
    return NextResponse.json(
      { error: `Job must be approved before push (current status: ${job.status})` },
      { status: 400 },
    )
  }

  const rows = posts.map((p) => ({
    week_of: p.week_of,
    platform: p.platform,
    caption: p.caption,
    hashtags: p.hashtags,
    image_prompt: p.image_prompt ?? null,
    status: 'approved' as const,
  }))

  const { data: inserted, error: insertErr } = await auth.admin
    .from('content_calendar')
    .insert(rows)
    .select('id, platform')

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const draftOnlyPlatforms = posts
    .map((p) => p.platform)
    .filter((p) => POSTING_NOT_YET_IMPLEMENTED.has(p))

  return NextResponse.json({
    ok: true,
    inserted: inserted?.length ?? 0,
    rows: inserted ?? [],
    warnings: draftOnlyPlatforms.length > 0
      ? [`Posts for [${[...new Set(draftOnlyPlatforms)].join(', ')}] inserted as draft-only — posting routes not yet implemented`]
      : [],
  })
}
