// 30-day social calendar generator. Output is structured by day/platform.
// Capped to keep total expected output under Vercel Hobby's 10s function limit.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import { runAIJob } from '@/lib/ai-router'
import { SOCIAL_SYSTEM } from '@/lib/ai-prompts'

const SocialCalendarSchema = z.object({
  theme: z.string().min(3).max(500),
  platforms: z.array(z.enum(['instagram', 'facebook', 'tiktok', 'twitter']))
    .min(1).max(4)
    .default(['instagram', 'facebook']),
  days: z.number().int().min(7).max(60).default(30),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  const parsed = SocialCalendarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  // Soft cap on total posts to keep generation time reasonable on Hobby plan.
  const totalPosts = data.days * data.platforms.length
  if (totalPosts > 60) {
    return NextResponse.json({
      error: `Requested ${totalPosts} posts (${data.days} days × ${data.platforms.length} platforms). Max is 60 to stay within the 10s function limit. Reduce days or platforms.`,
    }, { status: 400 })
  }

  const userPrompt = `Plan a ${data.days}-day social media content calendar for VortexTrips.

Theme: ${data.theme}
Platforms: ${data.platforms.join(', ')}
Start date: ${data.startDate}

Distribute posts evenly. Vary the tone, format, and angle across days so the calendar doesn't feel repetitive.

For each post, provide:
- DATE (YYYY-MM-DD)
- PLATFORM
- CAPTION (platform-appropriate length)
- HASHTAGS (3-5 relevant tags)
- IMAGE_PROMPT (1 sentence describing the ideal photo)

Use this exact markdown structure to make output easy to parse:

## Day 1 — 2026-04-28
### instagram
Caption: <text>
Hashtags: tag1, tag2, tag3
Image: <description>

### facebook
...

Be terse. Skip filler. Optimize for parseability over prose.`

  try {
    const result = await runAIJob({
      jobType: 'social-calendar',
      title: `${data.days}d calendar: ${data.theme.slice(0, 80)}`,
      prompt: userPrompt,
      systemPrompt: SOCIAL_SYSTEM,
      inputPayload: data,
      createdBy: auth.user.id,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
