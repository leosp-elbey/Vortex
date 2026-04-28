import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import { runAIJob } from '@/lib/ai-router'

const CreateJobSchema = z.object({
  jobType: z.enum([
    'ideas', 'captions', 'hashtags', 'outlines',
    'scripts', 'emails', 'landing-copy', 'blog',
    'code', 'security-review', 'compliance',
    'social-pack', 'video-script', 'email-sequence', 'social-calendar',
  ]),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(50_000),
  systemPrompt: z.string().max(10_000).optional(),
  modelOverride: z.string().optional(),
  inputPayload: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  const parsed = CreateJobSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const result = await runAIJob({ ...parsed.data, createdBy: auth.user.id })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
