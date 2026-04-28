import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import { runAIJob } from '@/lib/ai-router'
import { VIDEO_SYSTEM } from '@/lib/ai-prompts'

const VideoSchema = z.object({
  topic: z.string().min(3).max(500),
  platform: z.enum(['tiktok', 'instagram-reels', 'youtube-shorts']).default('tiktok'),
  durationSec: z.number().int().min(15).max(180).default(60),
  hookStyle: z.enum(['question', 'shocking-fact', 'before-after', 'pattern-interrupt']).default('shocking-fact'),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  const parsed = VideoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  const userPrompt = `Write a ${data.durationSec}-second video script for ${data.platform}.
Topic: ${data.topic}
Hook style: ${data.hookStyle}

Format:
[HOOK 0-3s] (one-liner that stops the scroll)
[BODY 3-${data.durationSec - 7}s] (problem, savings example, member proof)
[CTA last 7s] (specific URL — vortextrips.com/book or /quote)

Include on-screen text suggestions in brackets where helpful. Keep total spoken word count appropriate for ${data.durationSec} seconds at a natural pace (~150 words/minute).`

  try {
    const result = await runAIJob({
      jobType: 'video-script',
      title: `Video script: ${data.topic.slice(0, 100)}`,
      prompt: userPrompt,
      systemPrompt: VIDEO_SYSTEM,
      inputPayload: data,
      createdBy: auth.user.id,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
