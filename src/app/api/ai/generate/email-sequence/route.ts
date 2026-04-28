import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/admin-auth'
import { runAIJob } from '@/lib/ai-router'
import { EMAIL_SYSTEM } from '@/lib/ai-prompts'

const EmailSequenceSchema = z.object({
  goal: z.string().min(3).max(500),
  steps: z.number().int().min(2).max(10).default(5),
  audience: z.enum(['lead', 'free-member', 'paid-member', 'sba-affiliate']).default('lead'),
  cadence: z.string().max(200).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  const parsed = EmailSequenceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  const userPrompt = `Write a ${data.steps}-step email sequence for VortexTrips.
Goal: ${data.goal}
Audience: ${data.audience}
${data.cadence ? `Cadence: ${data.cadence}` : 'Cadence: Day 0, Day 2, Day 5, Day 8, Day 14 (or evenly spaced if step count differs)'}

For EACH email, provide:
- Step number and day offset (e.g., "Email 1 — Day 0")
- Subject line (≤60 chars, no spam triggers)
- Body (200-400 words, scannable, one clear ask)
- CTA button text + URL

Format with clear ## Email N headers. End the final email with a soft breakup or upgrade ask depending on the goal.`

  try {
    const result = await runAIJob({
      jobType: 'email-sequence',
      title: `Email sequence: ${data.goal.slice(0, 100)}`,
      prompt: userPrompt,
      systemPrompt: EMAIL_SYSTEM,
      inputPayload: data,
      createdBy: auth.user.id,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
