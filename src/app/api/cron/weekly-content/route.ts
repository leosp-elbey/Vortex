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
import { enforceCaptionRules } from '@/lib/caption-format'
import { runEventCampaignResearch, type RunResult as EventResearchResult } from '@/lib/event-campaign-generator'
import { fetchAndStoreVideo } from '@/lib/media-providers'

// Phase 14AG — extend the cron's allowed runtime to 60s. Phase 14L only
// fetched Pexels images in this cron (sub-second per call). We now also
// fetch a Pexels Video for each TikTok row, which adds a second HTTP call
// per TikTok day — still well under 60s for a 7-day plan, but the default
// 10s ceiling would be tight on weeks where Pexels is slow.
export const maxDuration = 60

// Phase 14C: cap how many event seeds get scored per cron tick. The
// research pass runs in series after weekly-content's main work completes.
const EVENT_RESEARCH_LIMIT_PER_RUN = 6

// Twitter/X removed in Phase 14Q.
// Phase 22E — YouTube added to weekly content generation.
const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube'] as const
type Platform = (typeof PLATFORMS)[number]

interface ParsedPost {
  date: string
  platform: Platform
  caption: string
  hashtags: string[]
  imagePrompt: string
  /**
   * Phase 14AG — short text overlay for TikTok B-roll videos (max 10 words).
   * Stored on every row's `media_metadata.on_screen_hook` if present, but
   * the AI is only asked to provide one for TikTok. Empty string for
   * non-TikTok platforms or when the AI omits it.
   */
  onScreenHook: string
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

      const captionMatch = pBlock.match(/Caption:\s*([\s\S]+?)(?:\n[A-Z][a-zA-Z\s-]+:|$)/)
      const hashtagsMatch = pBlock.match(/Hashtags:\s*([\s\S]+?)(?:\n[A-Z][a-zA-Z\s-]+:|$)/)
      const imageMatch = pBlock.match(/Image(?:\s+Prompt)?:\s*([\s\S]+?)(?:\n[A-Z][a-zA-Z\s-]+:|$)/)
      // Phase 14AG — capture the new "On-Screen Hook:" line. Optional —
      // only TikTok rows are required to have one; older rows / FB / IG
      // simply leave the string empty and we don't write metadata for them.
      const hookMatch = pBlock.match(/On[-\s]?Screen\s+Hook:\s*([\s\S]+?)(?:\n[A-Z][a-zA-Z\s-]+:|$)/i)

      if (!captionMatch) continue

      const caption = captionMatch[1].trim()
      const hashtagsRaw = hashtagsMatch?.[1].trim() ?? ''
      // No length cap here — enforceCaptionRules() applies the 2-hashtag
      // hard cap at row-build time (Phase 19.1C, single source of truth).
      const hashtags = hashtagsRaw
        .split(/[,\s]+/)
        .map(h => h.trim().replace(/^#/, ''))
        .filter(h => h.length > 0 && h.length < 50)
      const imagePrompt = imageMatch?.[1].trim() ?? ''
      // Cap on_screen_hook at 10 words / 80 chars defensively even though
      // the prompt asks the AI for the same. Trailing punctuation kept.
      const rawHook = hookMatch?.[1].trim() ?? ''
      const onScreenHook = rawHook
        .replace(/\s+/g, ' ')
        .split(' ')
        .slice(0, 10)
        .join(' ')
        .slice(0, 80)
        .trim()

      posts.push({ date, platform, caption, hashtags, imagePrompt, onScreenHook })
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

Theme: Weekly VortexTrips content calendar. Rotate through ALL 6 content series types (RULE 5 in your system prompt): 1 SAVINGS PROOF post, 1 INSIDER TRUTH post, 1 DESTINATION SPOTLIGHT post, 1 SOCIAL PROOF post using approved metrics (406+ Powerline members, up to 75% savings, 500,000+ hotels, 3-and-Free waiver), 1 BUSINESS OPPORTUNITY post (soft-sell, lead with travel savings first, CTA to vortextrips.com/join), and 1 VORTEX INVITE post (free portal, CTA to vortextrips.com/free), plus 1 BOOKING ENGINE post (CTA to vortextrips.com/book). Use RULE 6 approved numbers throughout. Vary destinations across continents — mix beach, city, adventure, luxury, and budget travel weekly.
Platforms: ${PLATFORMS.join(', ')}
Start date: ${startDate}

Distribute posts evenly. Vary tone, format, and angle across days so the calendar doesn't feel repetitive.

For each post, provide:
- DATE (YYYY-MM-DD)
- PLATFORM
- CAPTION (platform-appropriate length: IG 100-200 chars, FB 150-300, TikTok 100-150)
- HASHTAGS (3-5 relevant tags)
- IMAGE PROMPT (one sentence describing the ideal photo or — for TikTok — the cinematic travel B-roll clip)

For TikTok ONLY, also provide:
- ON-SCREEN HOOK (max 10 words; the bold attention-grabbing text we will burn onto the video later, e.g. "Cancun for $1,540. Members only.")

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

### tiktok
Caption: <text>
Hashtags: tag1, tag2, tag3
Image: <cinematic travel b-roll description — beach drone shot, resort pool, etc.>
On-Screen Hook: <max 10 words>

### youtube
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

    // Phase 14AH.1 — duplicate prevention strategy. Phase 14AH originally
    // pre-queried `content_calendar.video_url` + `media_metadata.pexels_
    // video_id` here to seed an exclude set. The operator decided in
    // 14AH.1 to remove that DB read from the cron's hot path and rely on
    // randomized page (1–5) + random index selection inside
    // `fetchAndStoreVideo` for visual variety. Inside a single cron run,
    // the in-run accumulator below still prevents the cron from picking
    // the same MP4 twice in one tick. Cross-week dedup is statistical
    // rather than guaranteed under this strategy, but with random page ×
    // random index across thousands of Pexels results per query, the
    // collision probability is acceptable for the weekly cadence.
    const existingUrls = new Set<string>()
    const existingPexelsIds = new Set<string>()

    // Phase 14AG/14AH — fetch images for every platform in PARALLEL (image
    // dedup is not a concern — Pexels image variety is broad and FB/IG don't
    // collide visually the way two identical TikTok B-roll clips would).
    // Then fetch TikTok videos SEQUENTIALLY so the in-run accumulator stays
    // consistent — two parallel video fetches with the same exclude set
    // could both pick the same MP4 before either write lands. Sequential
    // video fetches are ~200–500ms each, so 7 TikTok rows = ~3.5s extra,
    // well inside the cron's 60s budget.
    const imageUrls = await Promise.all(
      posts.map(p => fetchAndStoreImage(p.imagePrompt, p.platform, supabase)),
    )

    const rowsWithMedia: Array<Record<string, unknown>> = []
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i]
      const image_url = imageUrls[i]
      const isTikTok = p.platform === 'tiktok'
      // Phase 19.1C — deterministically guarantee the vortextrips.com/free
      // link and the 2-hashtag cap before the row is inserted.
      const { caption: enforcedCaption, hashtags: enforcedHashtags } =
        enforceCaptionRules(p.caption, p.hashtags)
      let video_url: string | null = null
      let pexelsVideoId: string | null = null
      if (isTikTok && p.imagePrompt) {
        const videoResult = await fetchAndStoreVideo({
          query: p.imagePrompt,
          orientation: 'portrait',
          size: 'large',
          excludePexelsIds: existingPexelsIds,
          excludeUrls: existingUrls,
        })
        if (videoResult.success && videoResult.url) {
          video_url = videoResult.url
          pexelsVideoId = videoResult.external_id ?? null
          // Accumulate so subsequent rows in this run can't re-pick.
          existingUrls.add(videoResult.url)
          if (pexelsVideoId) existingPexelsIds.add(pexelsVideoId)
        }
      }
      // Build media_metadata for TikTok rows so the on_screen_hook + the
      // Pexels video provenance survive into the dashboard / autoposter.
      // Non-TikTok rows don't carry media_metadata — keep the row shape
      // compatible with the pre-14AG insert path for FB/IG.
      const media_metadata = isTikTok
        ? {
            source: 'pexels-video',
            on_screen_hook: p.onScreenHook || null,
            pexels_video_id: pexelsVideoId,
            fetched_at: new Date().toISOString(),
          }
        : null
      rowsWithMedia.push({
        week_of: startDate,
        platform: p.platform,
        caption: enforcedCaption,
        hashtags: enforcedHashtags,
        image_prompt: p.imagePrompt,
        image_url,
        video_url,
        // Phase 14AG — TikTok rows that landed a Pexels MP4 are
        // immediately media-ready; non-TikTok rows skip these columns.
        ...(video_url
          ? {
              media_status: 'ready',
              media_source: 'pexels',
              media_generated_at: new Date().toISOString(),
            }
          : {}),
        ...(media_metadata ? { media_metadata } : {}),
        status: 'draft',
      })
    }
    const rows = rowsWithMedia
    const imagesGenerated = rows.filter(r => r.image_url).length
    const videosGenerated = rows.filter(r => r.video_url).length

    const { error: insertError } = await supabase.from('content_calendar').insert(rows)
    if (insertError) {
      return NextResponse.json({
        success: false,
        error: `content_calendar insert failed: ${insertError.message}`,
        jobId: result.jobId,
      }, { status: 500 })
    }

    // Phase 14C: piggyback the event-campaign research pass on the weekly cron.
    // We're at Vercel Hobby's 4-cron limit, so this lives inside weekly-content
    // rather than as its own route. Failures here are logged but never break the
    // weekly content generation that already succeeded above.
    let eventResearch: EventResearchResult | null = null
    let eventResearchError: string | null = null
    try {
      eventResearch = await runEventCampaignResearch({ limit: EVENT_RESEARCH_LIMIT_PER_RUN })
    } catch (err) {
      eventResearchError = err instanceof Error ? err.message : String(err)
      console.error('[weekly-content] event research failed —', eventResearchError)
    }

    await supabase.from('ai_actions_log').insert({
      action_type: 'weekly-content-cron',
      service: 'openrouter',
      status: 'success',
      response_payload: {
        generated: rows.length,
        images_generated: imagesGenerated,
        videos_generated: videosGenerated,
        weekOf: startDate,
        model: result.modelUsed,
        cost: result.costEstimate,
        jobId: result.jobId,
        event_research: eventResearch
          ? {
              processed: eventResearch.processed,
              inserted: eventResearch.inserted,
              updated: eventResearch.updated,
              errors: eventResearch.errors.length,
            }
          : null,
        event_research_error: eventResearchError,
      } as Record<string, unknown>,
    })

    return NextResponse.json({
      success: true,
      generated: rows.length,
      images_generated: imagesGenerated,
      videos_generated: videosGenerated,
      weekOf: startDate,
      model: result.modelUsed,
      cost: result.costEstimate,
      jobId: result.jobId,
      event_research: eventResearch,
      event_research_error: eventResearchError,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
