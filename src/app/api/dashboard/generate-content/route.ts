import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCompletion } from '@/lib/openai'
import { fetchAndStoreVideo } from '@/lib/media-providers'
import { SOCIAL_SYSTEM } from '@/lib/ai-prompts'

// Phase 14AI — manual "Generate This Week" button. Mirrors the synchronous
// Pexels Video fetch behavior added to the weekly cron in Phase 14AG, so
// rows produced by this manual path land in the same shape as cron-produced
// rows: TikTok rows get an `image_url` (Pexels portrait image), a `video_url`
// (Pexels portrait MP4), `media_status='ready'`, `media_source='pexels'`,
// and `media_metadata` carrying the on-screen hook + provenance. Pre-14AI,
// this route only fetched images for IG/FB and skipped video entirely,
// which is why TikTok rows produced via the dashboard button were appearing
// as "Media missing" while cron-produced TikTok rows were "Media ready".
//
// Vercel-hosted route. The default 10s ceiling applies to non-cron API
// routes on Hobby; with 5 posts × ~1s per Pexels image fetch + 1 TikTok ×
// ~1s per Pexels Video fetch + an OpenAI call (~3–6s for 5 posts), we're
// at ~10–15s. Bumping maxDuration to 60s gives the same headroom the
// weekly cron uses.
export const maxDuration = 60

export async function POST() {
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
      // Phase 19.1B — use the shared SOCIAL_SYSTEM playbook (hook template,
      // 75% savings framing, mandatory vortextrips.com/free link, 2-hashtag
      // cap) instead of the old stale inline prompt. The JSON-output
      // requirement is this route's own contract, so it is appended here
      // rather than baked into SOCIAL_SYSTEM (which other callers parse as
      // markdown).
      systemPrompt: `${SOCIAL_SYSTEM}

OUTPUT FORMAT (this call only): Return ONLY a valid JSON array — no markdown, no code blocks, no surrounding prose. Each array element is one post object with exactly the fields described in the user message.`,
      userPrompt: `Generate 5 social media posts for week of ${weekOfStr}.
Platforms: instagram, facebook, tiktok, instagram, facebook (in this order).

For EVERY post include these exact fields:
- platform (string)
- caption (string, platform-native length and tone; MUST follow the HOOK -> CONTRAST -> PROOF -> CTA template and contain the literal URL vortextrips.com/free)
- hashtags (string array, MAXIMUM 2 tags — never more than 2)
- image_prompt (string)
  - For instagram / facebook: a vivid photorealistic description for a Pexels image search. ALWAYS feature real people: happy families at resorts, couples on beaches, friends exploring cities, parents with kids at pools, smiling travelers checking into hotels. Include specific details: ethnicities, ages, clothing, location, lighting. Style: candid lifestyle photography, warm golden-hour light, NOT stock-photo-stiff.
  - For tiktok: a 3–7 word Pexels Video search query for a cinematic vertical travel B-roll clip. Examples: "cinematic beach drone overhead", "luxury resort pool aerial", "couple walking paris night street", "infinity pool ocean view sunset", "tropical waterfall slow motion". Strongly prefer concrete travel imagery over abstract concepts — the Pexels library is curated for travel.
- video_script (string — for tiktok: a 30-45 second spoken script with [VISUAL] stage directions; for other platforms: empty string "")
- on_screen_hook (string — REQUIRED for tiktok, empty string "" for other platforms): max 10 words, the bold attention-grabbing text we will burn onto the video later. Examples: "Cancun for $1,540. Members only.", "Paris hotel: $89 a night.", "Hotels have wholesale rates." Avoid generic taglines.

Return this exact JSON structure:
[{"platform":"instagram","caption":"...","hashtags":["tag1"],"image_prompt":"...","video_script":"","on_screen_hook":""},{"platform":"tiktok","caption":"...","hashtags":["tag1"],"image_prompt":"luxury resort pool aerial","video_script":"...","on_screen_hook":"Cancun for $1,540. Members only."}]`,
      temperature: 0.8,
      maxTokens: 2000,
    })

    let posts: Array<{
      platform: string
      caption: string
      hashtags?: string[]
      image_prompt?: string
      video_script?: string
      on_screen_hook?: string
    }>

    try {
      posts = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('Failed to parse content JSON')
      posts = JSON.parse(jsonMatch[0])
    }

    const admin = createAdminClient()

    // Phase 14AI — fetch a Pexels image for EVERY platform (image fetch was
    // previously gated to IG/FB only) and a Pexels Video for TikTok rows.
    // We run posts in parallel via Promise.all; each row's image and video
    // fetches run sequentially to keep the row's row build coherent. With
    // at most 1 TikTok per batch, in-run video dedup is already handled by
    // the lib helper's randomized page + index strategy.
    const rows = await Promise.all(posts.map(async (post) => {
      let image_url: string | null = null
      let video_url: string | null = null
      let pexels_video_id: string | null = null
      const isTikTok = post.platform === 'tiktok'

      // Image — Pexels search across all platforms.
      if (post.image_prompt) {
        try {
          const query = encodeURIComponent(post.image_prompt.slice(0, 60))
          const orientation = post.platform === 'instagram' || post.platform === 'tiktok' ? 'portrait' : 'landscape'
          const pexelsRes = await fetch(
            `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=${orientation}`,
            { headers: { Authorization: process.env.PEXELS_API_KEY! } }
          )
          const pexelsData = await pexelsRes.json()
          const srcUrl = pexelsData?.photos?.[0]?.src?.large2x

          if (srcUrl) {
            const imgRes = await fetch(srcUrl)
            const imgBuffer = await imgRes.arrayBuffer()
            const fileName = `content/${Date.now()}-${post.platform}-${Math.random().toString(36).slice(2, 8)}.jpg`
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

      // Phase 14AI — TikTok rows synchronously fetch a Pexels Video too.
      // Mirrors the Phase 14AG behavior in src/app/api/cron/weekly-content.
      // Failures are non-fatal: the row inserts with `video_url=null` and
      // shows as "Media missing" on the dashboard (recoverable via
      // `node scripts/generate-missing-media.js --videos-only --content-only --generate --apply`).
      if (isTikTok && post.image_prompt) {
        const videoResult = await fetchAndStoreVideo({
          query: post.image_prompt,
          orientation: 'portrait',
          size: 'large',
        })
        if (videoResult.success && videoResult.url) {
          video_url = videoResult.url
          pexels_video_id = videoResult.external_id ?? null
        }
      }

      // Build media_metadata for TikTok rows so the on_screen_hook + the
      // Pexels-video provenance survive into the dashboard / autoposter,
      // matching the cron's row shape.
      const media_metadata = isTikTok
        ? {
            source: 'pexels-video',
            on_screen_hook: post.on_screen_hook || null,
            pexels_video_id,
            fetched_at: new Date().toISOString(),
          }
        : null

      return {
        week_of: weekOfStr,
        platform: post.platform,
        caption: post.caption,
        hashtags: post.hashtags || [],
        image_prompt: post.image_prompt || '',
        image_url,
        video_url,
        video_script: post.video_script || '',
        // Phase 14AI — TikTok rows that landed a Pexels MP4 are immediately
        // media-ready; non-TikTok rows skip these columns to keep their
        // shape compatible with the pre-14AI insert path.
        ...(video_url
          ? {
              media_status: 'ready',
              media_source: 'pexels',
              media_generated_at: new Date().toISOString(),
            }
          : {}),
        ...(media_metadata ? { media_metadata } : {}),
        status: 'draft',
      }
    }))

    await admin.from('content_calendar').insert(rows)
    const imagesGenerated = rows.filter(r => r.image_url).length
    const videosGenerated = rows.filter(r => r.video_url).length
    await admin.from('ai_actions_log').insert({
      action_type: 'content-generation',
      service: 'openai',
      status: 'success',
      response_payload: {
        count: rows.length,
        week_of: weekOfStr,
        images_generated: imagesGenerated,
        videos_generated: videosGenerated,
      } as Record<string, unknown>,
    })

    return NextResponse.json({
      success: true,
      generated: rows.length,
      images_generated: imagesGenerated,
      videos_generated: videosGenerated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
