// Weekly content generator — runs Mondays 1pm UTC (per vercel.json).
// Generates 7 days of social drafts via OpenRouter cheap tier (llama-3.3-70b),
// parses the markdown output, and inserts directly into content_calendar
// with status='draft' so Leo can review + approve on Monday morning.
//
// Cost: ~$0.001-0.005 per run via cheap model. Daily / monthly budget guards
// in ai-router prevent runaway spend even if something loops.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAIJob } from '@/lib/ai-router'
import { SOCIAL_SYSTEM } from '@/lib/ai-prompts'

const PLATFORMS = ['instagram', 'facebook', 'twitter', 'tiktok'] as const
type Platform = (typeof PLATFORMS)[number]

interface ParsedPost {
  date: string
  platform: Platform
  caption: string
  hashtags: string[]
  imagePrompt: string
}

interface PexelsResponse {
  photos?: Array<{ src?: { large2x?: string; large?: string; original?: string } }>
}

/**
 * Fetch a relevant photo from Pexels using the imagePrompt as the search query,
 * download it, upload to Supabase Storage, and return the public URL.
 * Returns null on any failure — caller treats image as optional.
 */
async function fetchAndStoreImage(
  imagePrompt: string,
  platform: string,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  const pexelsKey = envTrim('PEXELS_API_KEY')
  if (!pexelsKey || !imagePrompt) return null

  try {
    const query = encodeURIComponent(imagePrompt.slice(0, 60))
    const orientation = platform === 'instagram' || platform === 'tiktok' ? 'portrait' : 'landscape'
    const pexelsRes = await fetch(
      `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=${orientation}`,
      { headers: { Authorization: pexelsKey } },
    )
    if (!pexelsRes.ok) return null
    const pexelsData = (await pexelsRes.json()) as PexelsResponse
    const srcUrl = pexelsData?.photos?.[0]?.src?.large2x ?? pexelsData?.photos?.[0]?.src?.large
    if (!srcUrl) return null

    const imgRes = await fetch(srcUrl)
    if (!imgRes.ok) return null
    const imgBuffer = await imgRes.arrayBuffer()

    const fileName = `content/${Date.now()}-${platform}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from('media')
      .upload(fileName, imgBuffer, { contentType: 'image/jpeg', upsert: false })
    if (uploadErr) return null

    const { data: pub } = supabase.storage.from('media').getPublicUrl(fileName)
    return pub.publicUrl
  } catch (err) {
    console.error('[weekly-content] image fetch failed for', platform, '—', err)
    return null
  }
}

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

/** Compute the upcoming Monday (or today if today is Monday) in UTC. */
function nextMondayISODate(): string {
  const d = new Date()
  const dayOfWeek = d.getUTCDay() // 0=Sun, 1=Mon, ...
  const daysUntilMon = (1 - dayOfWeek + 7) % 7
  d.setUTCDate(d.getUTCDate() + daysUntilMon)
  return d.toISOString().split('T')[0]
}

function parseCalendarMarkdown(text: string): ParsedPost[] {
  const posts: ParsedPost[] = []
  // Split on day headers like "## Day N — YYYY-MM-DD" or "## Day N - YYYY-MM-DD"
  const dayBlocks = text.split(/^## Day \d+[\s—-]+/im).slice(1)

  for (const block of dayBlocks) {
    const dateMatch = block.match(/(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) continue
    const date = dateMatch[1]

    // Within a day block, split on platform headers "### platform"
    const platformBlocks = block.split(/^###\s+/m).slice(1)
    for (const pBlock of platformBlocks) {
      const platformLine = pBlock.split('\n')[0].trim().toLowerCase()
      const platform = PLATFORMS.find(p => platformLine.startsWith(p))
      if (!platform) continue

      const captionMatch = pBlock.match(/Caption:\s*([\s\S]+?)(?:\n[A-Z][a-z]+:|$)/)
      const hashtagsMatch = pBlock.match(/Hashtags:\s*([\s\S]+?)(?:\n[A-Z][a-z]+:|$)/)
      const imageMatch = pBlock.match(/Image(?:\s+Prompt)?:\s*([\s\S]+?)(?:\n[A-Z][a-z]+:|$)/)

      if (!captionMatch) continue

      const caption = captionMatch[1].trim()
      const hashtagsRaw = hashtagsMatch?.[1].trim() ?? ''
      const hashtags = hashtagsRaw
        .split(/[,\s]+/)
        .map(h => h.trim().replace(/^#/, ''))
        .filter(h => h.length > 0 && h.length < 50)
        .slice(0, 8)
      const imagePrompt = imageMatch?.[1].trim() ?? ''

      posts.push({ date, platform, caption, hashtags, imagePrompt })
    }
  }
  return posts
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${envTrim('CRON_SECRET')}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const startDate = nextMondayISODate()
    const supabase = createAdminClient()

    const userPrompt = `Plan a 7-day social media content calendar for VortexTrips.

Theme: weekly travel inspiration mixing destination spotlights, savings examples, and member success angles.
Platforms: ${PLATFORMS.join(', ')}
Start date: ${startDate}

Distribute posts evenly. Vary tone, format, and angle across days so the calendar doesn't feel repetitive.

For each post, provide:
- DATE (YYYY-MM-DD)
- PLATFORM
- CAPTION (platform-appropriate length: IG 100-200 chars, FB 150-300, X under 240, TikTok 100-150)
- HASHTAGS (3-5 relevant tags)
- IMAGE PROMPT (one sentence describing the ideal photo)

Use this exact markdown structure to make output easy to parse:

## Day 1 — ${startDate}
### instagram
Caption: <text>
Hashtags: tag1, tag2, tag3
Image: <description>

### facebook
Caption: <text>
Hashtags: tag1, tag2, tag3
Image: <description>

### twitter
Caption: <text>
Hashtags: tag1, tag2
Image: <description>

### tiktok
Caption: <text>
Hashtags: tag1, tag2, tag3
Image: <description>

## Day 2 — <next date>
... and so on through Day 7.

Be terse. Skip filler. Optimize for parseability over prose.`

    // Force cheap model to keep cron cost predictable. Budget guards in ai-router
    // still apply (AI_DAILY_BUDGET_LIMIT, AI_MONTHLY_BUDGET_LIMIT).
    const cheapModel = envTrim('AI_CHEAP_MODEL') || envTrim('AI_DEFAULT_MODEL')

    const result = await runAIJob({
      jobType: 'social-calendar',
      title: `Weekly content auto-gen — week of ${startDate}`,
      prompt: userPrompt,
      systemPrompt: SOCIAL_SYSTEM,
      inputPayload: { startDate, platforms: PLATFORMS, days: 7, source: 'cron' },
      modelOverride: cheapModel || undefined,
      createdBy: null, // system / cron job
    })

    if (result.status === 'failed' || !result.output) {
      await supabase.from('ai_actions_log').insert({
        action_type: 'weekly-content-cron',
        service: 'openrouter',
        status: 'failed',
        response_payload: { error: result.error ?? 'no output', jobId: result.jobId } as Record<string, unknown>,
      })
      return NextResponse.json({ success: false, error: result.error ?? 'AI generation failed', jobId: result.jobId }, { status: 500 })
    }

    const posts = parseCalendarMarkdown(result.output)

    if (posts.length === 0) {
      await supabase.from('ai_actions_log').insert({
        action_type: 'weekly-content-cron',
        service: 'openrouter',
        status: 'failed',
        response_payload: {
          error: 'parser produced 0 posts',
          jobId: result.jobId,
          outputPreview: result.output.slice(0, 500),
        } as Record<string, unknown>,
      })
      return NextResponse.json({
        success: false,
        error: 'AI output could not be parsed into posts',
        jobId: result.jobId,
      }, { status: 500 })
    }

    // Fetch real photos from Pexels in parallel and store in Supabase Storage.
    // Each fetch is independent; failures don't block other posts.
    const rowsWithImages = await Promise.all(
      posts.map(async p => {
        const image_url = await fetchAndStoreImage(p.imagePrompt, p.platform, supabase)
        return {
          week_of: startDate,
          platform: p.platform,
          caption: p.caption,
          hashtags: p.hashtags,
          image_prompt: p.imagePrompt,
          image_url,
          status: 'draft' as const,
        }
      }),
    )
    const rows = rowsWithImages
    const imagesGenerated = rows.filter(r => r.image_url).length

    const { error: insertError } = await supabase.from('content_calendar').insert(rows)
    if (insertError) {
      return NextResponse.json({
        success: false,
        error: `content_calendar insert failed: ${insertError.message}`,
        jobId: result.jobId,
      }, { status: 500 })
    }

    await supabase.from('ai_actions_log').insert({
      action_type: 'weekly-content-cron',
      service: 'openrouter',
      status: 'success',
      response_payload: {
        generated: rows.length,
        images_generated: imagesGenerated,
        weekOf: startDate,
        model: result.modelUsed,
        cost: result.costEstimate,
        jobId: result.jobId,
      } as Record<string, unknown>,
    })

    return NextResponse.json({
      success: true,
      generated: rows.length,
      images_generated: imagesGenerated,
      weekOf: startDate,
      model: result.modelUsed,
      cost: result.costEstimate,
      jobId: result.jobId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
