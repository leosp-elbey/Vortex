import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCompletion } from '@/lib/openai'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const weekOf = new Date()
    weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1)
    const weekOfStr = weekOf.toISOString().split('T')[0]

    const { content } = await generateCompletion({
      systemPrompt: `You are a social media content strategist for VortexTrips, a travel savings membership platform (brand: Travel Team Perks).
Create engaging, platform-native content that drives leads to sign up.
Use travel savings angles: "40-60% off", "exclusive member rates", "dream vacations on a budget".
Return ONLY a valid JSON array with no markdown or code blocks.`,
      userPrompt: `Generate 5 social media posts for week of ${weekOfStr}. Use these platforms: instagram, facebook, tiktok, twitter, instagram.
Return this exact JSON structure:
[
  {
    "platform": "instagram",
    "caption": "...",
    "hashtags": ["tag1", "tag2"],
    "image_prompt": "description for AI image generation"
  }
]`,
      temperature: 0.8,
      maxTokens: 1500,
    })

    let posts: Array<{
      platform: string
      caption: string
      hashtags?: string[]
      image_prompt?: string
    }>

    try {
      posts = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('Failed to parse content JSON')
      posts = JSON.parse(jsonMatch[0])
    }

    const rows = posts.map((post) => ({
      week_of: weekOfStr,
      platform: post.platform,
      caption: post.caption,
      hashtags: post.hashtags || [],
      image_prompt: post.image_prompt || '',
      status: 'draft',
    }))

    await supabase.from('content_calendar').insert(rows)

    await supabase.from('ai_actions_log').insert({
      action_type: 'content-generation',
      service: 'openai',
      status: 'success',
      response_payload: { count: rows.length, week_of: weekOfStr } as Record<string, unknown>,
    })

    return NextResponse.json({ success: true, generated: rows.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
