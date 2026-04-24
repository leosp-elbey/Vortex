import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCompletion } from '@/lib/openai'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminUser } = await supabase.from('admin_users').select('id').eq('id', user.id).single()
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const weekOf = new Date()
    weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1)
    const weekOfStr = weekOf.toISOString().split('T')[0]

    const { content } = await generateCompletion({
      systemPrompt: `You are a social media content strategist for VortexTrips, a travel savings membership.
Brand voice: exciting, aspirational, benefit-driven. Real savings, real results.
Key angles: "40-60% off", "exclusive member rates", "save $1,200+ per trip", "500,000+ hotels".
IMPORTANT: Always use "VortexTrips" as the brand name. NEVER use "Travel Team Perks" — that is an old name.
Return ONLY a valid JSON array — no markdown, no code blocks, nothing else.`,
      userPrompt: `Generate 5 social media posts for week of ${weekOfStr}.
Platforms: instagram, facebook, tiktok, twitter, instagram (in this order).

For EVERY post include these exact fields:
- platform (string)
- caption (string, platform-native length and tone)
- hashtags (string array, 3-8 tags)
- image_prompt (string — vivid photorealistic description for DALL-E 3. ALWAYS feature real people: happy families at resorts, couples on beaches, friends exploring cities, parents with kids at pools, smiling travelers checking into hotels. Show genuine joy and excitement. Include specific details: ethnicities, ages, clothing, location, lighting. Style: candid lifestyle photography, warm golden-hour light, NOT stock-photo-stiff. Example: "A joyful Black family of four — mom, dad, and two young kids — laughing and splashing in a crystal-clear resort pool in Cancún, warm afternoon sun, candid lifestyle photo")
- video_script (string — for tiktok/reels: a 30-45 second spoken script with [VISUAL] stage directions; for other platforms: empty string "")

TikTok example video_script format:
"[VISUAL: aerial drone shot of turquoise Cancún beach] Hook: Did you know most people overpay by 60% on their hotels? [VISUAL: split screen hotel prices] Here's how VortexTrips members get 5-star stays for 3-star prices... [VISUAL: phone showing booking savings] Link in bio — your first quote is free."

Return this exact JSON structure:
[{"platform":"instagram","caption":"...","hashtags":["tag1"],"image_prompt":"...","video_script":""},...]`,
      temperature: 0.8,
      maxTokens: 2000,
    })

    let posts: Array<{
      platform: string
      caption: string
      hashtags?: string[]
      image_prompt?: string
      video_script?: string
    }>

    try {
      posts = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('Failed to parse content JSON')
      posts = JSON.parse(jsonMatch[0])
    }

    const admin = createAdminClient()

    // Fetch real photos from Pexels and persist to Supabase Storage
    const rows = await Promise.all(posts.map(async (post) => {
      let image_url: string | null = null

      if ((post.platform === 'instagram' || post.platform === 'facebook') && post.image_prompt) {
        try {
          // Extract search keywords from image_prompt (first 60 chars works well)
          const query = encodeURIComponent(post.image_prompt.slice(0, 60))
          const pexelsRes = await fetch(
            `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=landscape`,
            { headers: { Authorization: process.env.PEXELS_API_KEY! } }
          )
          const pexelsData = await pexelsRes.json()
          const srcUrl = pexelsData?.photos?.[0]?.src?.large2x

          if (srcUrl) {
            // Download and store permanently in Supabase Storage
            const imgRes = await fetch(srcUrl)
            const imgBuffer = await imgRes.arrayBuffer()
            const ext = 'jpg'
            const fileName = `content/${Date.now()}-${post.platform}.${ext}`
            const { error: uploadErr } = await admin.storage
              .from('media')
              .upload(fileName, imgBuffer, { contentType: 'image/jpeg', upsert: false })
            if (!uploadErr) {
              const { data: pub } = admin.storage.from('media').getPublicUrl(fileName)
              image_url = pub.publicUrl
            }
          }
        } catch {
          // Non-fatal — post without image
        }
      }

      return {
        week_of: weekOfStr,
        platform: post.platform,
        caption: post.caption,
        hashtags: post.hashtags || [],
        image_prompt: post.image_prompt || '',
        image_url,
        video_script: post.video_script || '',
        status: 'draft',
      }
    }))

    await admin.from('content_calendar').insert(rows)
    await admin.from('ai_actions_log').insert({
      action_type: 'content-generation',
      service: 'openai',
      status: 'success',
      response_payload: {
        count: rows.length,
        week_of: weekOfStr,
        images_generated: rows.filter(r => r.image_url).length,
      } as Record<string, unknown>,
    })

    return NextResponse.json({
      success: true,
      generated: rows.length,
      images_generated: rows.filter(r => r.image_url).length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
