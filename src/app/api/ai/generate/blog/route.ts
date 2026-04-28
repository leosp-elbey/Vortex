import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import { runAIJob } from '@/lib/ai-router'
import { WRITER_SYSTEM } from '@/lib/ai-prompts'

const BlogSchema = z.object({
  topic: z.string().min(3).max(500),
  targetWords: z.number().int().min(300).max(2500).default(1000),
  audience: z.string().max(200).optional(),
  keywords: z.array(z.string()).max(15).default([]),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  const parsed = BlogSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  const userPrompt = `Write a ${data.targetWords}-word blog post for VortexTrips.
Topic: ${data.topic}
${data.audience ? `Audience: ${data.audience}` : 'Audience: travelers and prospective members'}
${data.keywords.length > 0 ? `Target keywords: ${data.keywords.join(', ')}` : ''}

Structure:
- H1 title (compelling, keyword-rich, < 70 chars)
- Intro paragraph with a hook
- 3-5 H2 sections with substantive content (use bullets/lists where helpful)
- Closing section with a clear CTA to vortextrips.com

Use markdown formatting. Write to be read, not skimmed — substance over filler.`

  try {
    const result = await runAIJob({
      jobType: 'blog',
      title: `Blog: ${data.topic.slice(0, 100)}`,
      prompt: userPrompt,
      systemPrompt: WRITER_SYSTEM,
      inputPayload: data,
      createdBy: auth.user.id,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
