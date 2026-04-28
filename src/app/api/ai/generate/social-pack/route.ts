import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import { runAIJob } from '@/lib/ai-router'
import { SOCIAL_SYSTEM } from '@/lib/ai-prompts'

const SocialPackSchema = z.object({
  theme: z.string().min(3).max(300),
  platforms: z.array(z.enum(['instagram', 'facebook', 'tiktok', 'twitter']))
    .min(1)
    .default(['instagram', 'facebook', 'tiktok', 'twitter']),
  destination: z.string().max(200).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  const parsed = SocialPackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  const userPrompt = `Create a coordinated social media post pack across these platforms: ${data.platforms.join(', ')}.

Theme: ${data.theme}
${data.destination ? `Destination focus: ${data.destination}` : ''}

For EACH platform, produce a clearly-labeled section with:
- Caption (platform-appropriate length: IG ~150 words, FB ~100 words, TikTok ~50 words for the on-screen text, Twitter/X ≤280 chars)
- 3-7 hashtags
- A 1-2 sentence image_prompt describing the ideal accompanying photo

Format the output with clear ## headers per platform so it's easy to parse. End each platform section with a CTA.`

  try {
    const result = await runAIJob({
      jobType: 'social-pack',
      title: `Social pack: ${data.theme.slice(0, 100)}`,
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
