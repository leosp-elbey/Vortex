import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import { runAIJob } from '@/lib/ai-router'
import { WRITER_SYSTEM } from '@/lib/ai-prompts'

const ContentSchema = z.object({
  topic: z.string().min(3).max(500),
  platform: z.enum(['instagram', 'facebook', 'tiktok', 'twitter', 'blog', 'email']).optional(),
  tone: z.enum(['casual', 'professional', 'enthusiastic', 'warm']).default('warm'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  targetAudience: z.string().max(200).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  const parsed = ContentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  const lengthMap = { short: '50-100 words', medium: '150-300 words', long: '400-600 words' }

  const userPrompt = `Write content for VortexTrips.
Topic: ${data.topic}
${data.platform ? `Platform: ${data.platform}` : ''}
Tone: ${data.tone}
Length: ${lengthMap[data.length]}
${data.targetAudience ? `Audience: ${data.targetAudience}` : 'Audience: travelers and prospective members'}

Include a clear CTA where appropriate.`

  try {
    const result = await runAIJob({
      jobType: 'landing-copy',
      title: `Content: ${data.topic.slice(0, 100)}`,
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
