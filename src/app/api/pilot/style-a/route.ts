// Phase 15A — Pilot route /api/pilot/style-a
//
// Orchestrates the "Style A — cinematic" TikTok pilot:
//   1. Validate Bearer CRON_SECRET on POST
//   2. Fetch 7 vertical 9:16 Pexels clips (one per beat 1-7)
//   3. Generate a single 22-second voiceover via OpenAI TTS (tts-1-hd, nova)
//      → upload to Supabase Storage at pilot-assets/style-a/<uuid>/voiceover.mp3
//   4. Build a Shotstack Edit JSON (3 tracks: titles, voiceover, B-roll)
//   5. POST /edit/stage/render (sandbox), poll every 6s up to 180s for 'done'
//   6. Download the rendered MP4, re-upload to pilot-assets/style-a/<uuid>/final.mp4
//   7. Return run summary
//
// Stack-rules:
//   - No GHL, no Make.com, no OpenRouter, no Twitter/X
//   - Pexels via existing src/lib/media-providers.ts:fetchAndStoreVideo
//   - Supabase Storage uploads mirror the pattern at
//     src/app/api/cron/weekly-content/route.ts:80-86
//   - TTS + Shotstack inlined (no new lib files this commit)
//
// Beat 8 (19.5-22.0s): query=null → no video clip. Timeline background
// (#1A1A2E navy) shows through during this window; the Track-0 "Link in bio"
// title overlay carries the visual content. Matches Shotstack's free-tier
// asset capabilities without depending on the html asset type.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAndStoreVideo } from '@/lib/media-providers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Defense-in-depth: route-level maxDuration mirrors vercel.json.functions.
export const maxDuration = 300

const SHOTSTACK_SUBMIT_URL = 'https://api.shotstack.io/edit/stage/render'
const PILOT_BUCKET = 'pilot-assets'
const SHOTSTACK_POLL_INTERVAL_MS = 6_000
const SHOTSTACK_POLL_TIMEOUT_MS = 180_000

type SupabaseAdmin = ReturnType<typeof createAdminClient>

interface Beat {
  start: number
  length: number
  /** Pexels search query, or null for the closing card (no B-roll). */
  query: string | null
  text: string
  voiceover: string
}

const BEATS: readonly Beat[] = [
  { start: 0.0,  length: 2.5, query: 'luxury beach resort aerial drone',  text: '$320/NIGHT.',                          voiceover: 'Three twenty a night.' },
  { start: 2.5,  length: 2.5, query: 'infinity pool ocean view tropical', text: '5-star resort.\nRiviera Maya.',         voiceover: 'Five star resort. Riviera Maya Mexico.' },
  { start: 5.0,  length: 3.0, query: 'luxury hotel lobby modern',         text: 'Public price:\n$1,260/night',           voiceover: 'Public price? Twelve sixty a night.' },
  { start: 8.0,  length: 3.0, query: 'tropical suite balcony sunset',     text: 'Member rate:\n$320/night',              voiceover: 'Member rate? Three twenty.' },
  { start: 11.0, length: 3.5, query: 'palm trees beach cocktail',         text: 'Same room.\nSame week.\nSame hotel.',   voiceover: 'Same room. Same week. Same hotel.' },
  { start: 14.5, length: 2.5, query: 'person walking tropical beach back',text: 'The difference?',                       voiceover: 'The only difference...' },
  { start: 17.0, length: 2.5, query: 'hands smartphone booking app',     text: 'Member access.',                        voiceover: 'Member access.' },
  { start: 19.5, length: 2.5, query: null,                                text: 'Link in bio →\nvortextrips.com',        voiceover: 'Link in bio.' },
]

const FULL_VOICEOVER = BEATS.map(b => b.voiceover).join(' ')

interface BeatPexelsResult {
  beat: number
  query: string | null
  videoUrl: string | null
}

/**
 * Ensure the pilot-assets bucket exists. Idempotent — swallows the
 * "duplicate / already exists" error so subsequent runs no-op.
 */
async function ensurePilotAssetsBucket(supabase: SupabaseAdmin): Promise<void> {
  const { error } = await supabase.storage.createBucket(PILOT_BUCKET, { public: true })
  if (error && !/already exists|duplicate|exists/i.test(error.message)) {
    throw new Error(`createBucket(${PILOT_BUCKET}) failed: ${error.message}`)
  }
}

/**
 * Fetch a vertical Pexels video for `query`. First tries portrait at
 * the requested minimum duration; if Pexels returns nothing usable, falls
 * back to landscape (Shotstack will crop with fit:cover). Returns null on
 * complete failure so the caller can decide whether to abort the run.
 */
async function fetchVerticalVideo(query: string, minDurationSec: number): Promise<string | null> {
  const portrait = await fetchAndStoreVideo({
    query,
    orientation: 'portrait',
    minDurationSeconds: minDurationSec,
    maxDurationSeconds: 30,
  })
  if (portrait.success && portrait.url) return portrait.url

  const landscape = await fetchAndStoreVideo({
    query,
    orientation: 'landscape',
    minDurationSeconds: minDurationSec,
    maxDurationSeconds: 30,
  })
  if (landscape.success && landscape.url) return landscape.url

  return null
}

/**
 * Generate MP3 voiceover bytes for `text` via OpenAI's tts-1-hd / nova.
 * Throws on non-2xx so the route's outer try/catch surfaces the failure.
 */
async function generateTTSAudio(text: string): Promise<ArrayBuffer> {
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      voice: 'nova',
      input: text,
      response_format: 'mp3',
      speed: 1.0,
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenAI TTS failed: HTTP ${res.status}: ${errText.slice(0, 200)}`)
  }
  return res.arrayBuffer()
}

/**
 * Upload a buffer to pilot-assets/<path> and return its public URL.
 * Mirrors the inline pattern from weekly-content/route.ts.
 */
async function uploadToPilotBucket(
  supabase: SupabaseAdmin,
  storagePath: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from(PILOT_BUCKET)
    .upload(storagePath, data, { contentType, upsert: false })
  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`)

  const { data: pub } = supabase.storage.from(PILOT_BUCKET).getPublicUrl(storagePath)
  return pub.publicUrl
}

interface ShotstackSubmitResponse {
  response?: { id?: string }
  message?: string
}

interface ShotstackStatusResponse {
  response?: {
    id?: string
    status?: string
    url?: string
    error?: string
  }
}

/**
 * POST the assembled Edit JSON to the Shotstack stage (sandbox) endpoint.
 * Returns the render id, which is then polled.
 */
async function submitShotstackRender(edit: unknown, apiKey: string): Promise<string> {
  const res = await fetch(SHOTSTACK_SUBMIT_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(edit),
  })
  const data = (await res.json().catch(() => ({}))) as ShotstackSubmitResponse
  if (!res.ok || !data?.response?.id) {
    const detail = JSON.stringify(data).slice(0, 300)
    throw new Error(`Shotstack submit failed: HTTP ${res.status}: ${detail}`)
  }
  return data.response.id
}

/**
 * Poll Shotstack's stage render endpoint every 6s for up to 180s.
 * Resolves with the rendered MP4 URL on `status === 'done'`.
 * Throws on `status === 'failed'` or when the 180s budget expires.
 */
async function pollShotstackRender(renderId: string, apiKey: string, runId: string): Promise<string> {
  const url = `${SHOTSTACK_SUBMIT_URL}/${renderId}`
  const startedAt = Date.now()
  let attempt = 0
  while (Date.now() - startedAt < SHOTSTACK_POLL_TIMEOUT_MS) {
    await new Promise(resolve => setTimeout(resolve, SHOTSTACK_POLL_INTERVAL_MS))
    attempt++
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } })
    const data = (await res.json().catch(() => ({}))) as ShotstackStatusResponse
    if (!res.ok) {
      const detail = JSON.stringify(data).slice(0, 300)
      console.error(`[pilot/style-a] poll runId=${runId} attempt=${attempt} HTTP ${res.status}: ${detail}`)
      throw new Error(`Shotstack poll failed: HTTP ${res.status}: ${detail}`)
    }
    const pollStatus = (data.response?.status ?? '').toLowerCase()
    // Phase 15A.1 — per-poll visibility. First render timed out at 180s
    // despite Shotstack completing in ~22s; logging each polled status
    // surfaces silent fall-through when data.response is shaped oddly.
    console.log(`[pilot/style-a] poll runId=${runId} attempt=${attempt} status=${pollStatus || '<missing>'}`)
    if (pollStatus === 'done') {
      const finalUrl = data.response?.url
      if (!finalUrl) throw new Error('Shotstack reported done but returned no URL')
      return finalUrl
    }
    if (pollStatus === 'failed') {
      const errMsg = data.response?.error ?? 'unknown'
      console.error(`[pilot/style-a] poll runId=${runId} attempt=${attempt} FAILED error=${errMsg}`)
      throw new Error(`Shotstack render failed: ${errMsg}`)
    }
    // status is one of: queued | fetching | rendering | saving — keep polling.
  }
  throw new Error(`Shotstack poll timeout after ${SHOTSTACK_POLL_TIMEOUT_MS}ms`)
}

/**
 * Phase 15A.1 — Build a per-beat title overlay using Shotstack `html` assets
 * so we can ship readable TikTok-scale typography (the built-in `title` asset
 * was unreadable at scroll speed in 15A's first render).
 *
 * Beat-specific layouts:
 *   index 0 → big "$320/NIGHT" hook, no background card, drop shadow
 *   index 2 → "Public price" + red strikethrough on $1,260/night
 *   index 3 → "Member rate" + orange (#FF6B35) $320/night
 *   index 7 → final CTA: orange "Link in bio →" + white "vortextrips.com"
 *   default → generic dark-translucent card with white bold text (beats 2,5,6,7)
 *
 * Every clip carries `position: 'center'` at the clip level so the html
 * frame sits in the middle of the 9:16 canvas. Scale is intentionally NOT
 * set — Shotstack scales html assets via the `width`/`height` props on the
 * asset itself.
 */
function buildTitleClipForBeat(b: Beat, index: number): Record<string, unknown> {
  let asset: Record<string, unknown>

  if (index === 0) {
    // Beat 1 — opening hook, no background card.
    asset = {
      type: 'html',
      html: `<div class="hook">$320<span class="unit">/NIGHT</span></div>`,
      css: `
        .hook {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1000px;
          color: #FFFFFF;
          font-family: 'Arial Black', sans-serif;
          font-weight: 900;
          font-size: 220px;
          letter-spacing: -4px;
          text-shadow: 0px 6px 24px rgba(0,0,0,0.85);
        }
        .unit { font-size: 80px; letter-spacing: 0; margin-left: 12px; }
      `,
      width: 1080,
      height: 500,
      background: 'transparent',
    }
  } else if (index === 2) {
    // Beat 3 — public price with red strikethrough.
    asset = {
      type: 'html',
      html: `<div class="text-card"><div class="label">Public price:</div><div class="strike">$1,260/night</div></div>`,
      css: `
        .text-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 900px;
          padding: 50px 50px;
          background: rgba(26, 26, 46, 0.78);
          color: #FFFFFF;
          font-family: 'Arial Black', sans-serif;
          font-weight: 900;
          text-align: center;
          border-radius: 20px;
        }
        .label { font-size: 70px; opacity: 0.85; margin-bottom: 16px; }
        .strike { font-size: 130px; color: #E63946; text-decoration: line-through; text-decoration-thickness: 10px; }
      `,
      width: 1000,
      height: 600,
      background: 'transparent',
    }
  } else if (index === 3) {
    // Beat 4 — member rate, orange.
    asset = {
      type: 'html',
      html: `<div class="text-card"><div class="label">Member rate:</div><div class="price">$320/night</div></div>`,
      css: `
        .text-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 900px;
          padding: 50px 50px;
          background: rgba(26, 26, 46, 0.78);
          color: #FFFFFF;
          font-family: 'Arial Black', sans-serif;
          font-weight: 900;
          text-align: center;
          border-radius: 20px;
        }
        .label { font-size: 70px; opacity: 0.85; margin-bottom: 16px; }
        .price { font-size: 130px; color: #FF6B35; }
      `,
      width: 1000,
      height: 600,
      background: 'transparent',
    }
  } else if (index === 7) {
    // Beat 8 — final CTA.
    asset = {
      type: 'html',
      html: `<div class="cta"><div class="arrow">Link in bio →</div><div class="domain">vortextrips.com</div></div>`,
      css: `
        .cta {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 1000px;
          color: #FFFFFF;
          font-family: 'Arial Black', sans-serif;
          font-weight: 900;
          text-align: center;
        }
        .arrow { font-size: 110px; color: #FF6B35; margin-bottom: 30px; }
        .domain { font-size: 90px; color: #FFFFFF; letter-spacing: -2px; }
      `,
      width: 1080,
      height: 800,
      background: 'transparent',
    }
  } else {
    // Beats 2, 5, 6, 7 (indices 1, 4, 5, 6) — generic body card.
    asset = {
      type: 'html',
      html: `<div class="text-card">${b.text.replace(/\n/g, '<br/>')}</div>`,
      css: `
        .text-card {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 900px;
          padding: 40px 50px;
          background: rgba(26, 26, 46, 0.75);
          color: #FFFFFF;
          font-family: 'Arial Black', 'Helvetica Neue', sans-serif;
          font-weight: 900;
          font-size: 100px;
          line-height: 1.15;
          text-align: center;
          border-radius: 20px;
          letter-spacing: -1px;
        }
      `,
      width: 1000,
      height: 600,
      background: 'transparent',
    }
  }

  return {
    asset,
    start: b.start,
    length: b.length,
    position: 'center',
    transition: { in: 'fade', out: 'fade' },
  }
}

/**
 * Assemble the 3-track Shotstack timeline:
 *   Track 0 (top)    — title overlays (one per beat 1..8)
 *   Track 1 (middle) — single 22s voiceover audio clip
 *   Track 2 (bottom) — B-roll videos for beats 1..7 only (beat 8 left empty so
 *                      the timeline.background navy shows through)
 */
function buildShotstackEdit(
  pexelsUrls: Array<string | null>,
  voiceoverUrl: string,
): unknown {
  const titleClips = BEATS.map((b, i) => buildTitleClipForBeat(b, i))

  const audioClips = [{
    asset: { type: 'audio', src: voiceoverUrl, volume: 1 },
    start: 0,
    length: 22,
  }]

  // Beat 8 has query=null → no video clip. Filter it out so Track 2 has 7
  // clips covering 0-19.5s; the remaining 19.5-22s gap shows the timeline
  // background (#1A1A2E) — that's the closing-card navy backdrop.
  const videoClips: unknown[] = []
  for (let i = 0; i < BEATS.length; i++) {
    const b = BEATS[i]
    if (b.query === null) continue
    const src = pexelsUrls[i]
    if (!src) continue
    videoClips.push({
      asset: { type: 'video', src, volume: 0 },
      start: b.start,
      length: b.length,
      // Phase 15A.1 — `crop` enforces canvas fill on 9:16; `cover` was
      // letterboxing landscape Pexels sources into the vertical canvas.
      fit: 'crop',
      effect: videoClips.length % 2 === 0 ? 'zoomIn' : 'zoomOut',
    })
  }

  return {
    timeline: {
      background: '#1A1A2E',
      tracks: [
        { clips: titleClips },
        { clips: audioClips },
        { clips: videoClips },
      ],
    },
    output: {
      format: 'mp4',
      // Phase 15A.1 — triple-redundancy to force 9:16 1080×1920 regardless
      // of how Shotstack interprets defaults on the stage tier. First render
      // came out 16:9 with only `size` set; `aspectRatio` + `resolution`
      // belt-and-suspenders the vertical output.
      aspectRatio: '9:16',
      resolution: '1080',
      size: { width: 1080, height: 1920 },
      fps: 25,
    },
  }
}

export async function POST(request: NextRequest) {
  const runId = crypto.randomUUID().slice(0, 8)
  const startedAt = Date.now()
  console.log(`[pilot/style-a] start runId=${runId} startedAt=${new Date(startedAt).toISOString()}`)

  // 1. Auth — Bearer CRON_SECRET only.
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${(process.env.CRON_SECRET ?? '').trim()}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: 'Unauthorized', runId }, { status: 401 })
  }

  const shotstackKey = (process.env.SHOTSTACK_API_KEY ?? '').trim()
  if (!shotstackKey) {
    return NextResponse.json({ ok: false, error: 'SHOTSTACK_API_KEY not configured', runId }, { status: 503 })
  }

  try {
    const supabase = createAdminClient()
    const assetUuid = crypto.randomUUID()

    // 2. Pilot-assets bucket — create if missing (idempotent).
    await ensurePilotAssetsBucket(supabase)

    // 3. Fetch 7 vertical Pexels clips in parallel (beats 1..7).
    const fetchableBeats: Array<{ beat: number; query: string; length: number }> = []
    for (let i = 0; i < BEATS.length; i++) {
      const b = BEATS[i]
      if (b.query !== null) fetchableBeats.push({ beat: i + 1, query: b.query, length: b.length })
    }
    const fetched = await Promise.all(
      fetchableBeats.map(({ beat, query, length }) =>
        fetchVerticalVideo(query, length).then(url => ({ beat, query, videoUrl: url } as BeatPexelsResult)),
      ),
    )

    const missing = fetched.find(r => !r.videoUrl)
    if (missing) {
      throw new Error(`Pexels returned no usable video for beat ${missing.beat} (query="${missing.query}")`)
    }

    // 4. Generate voiceover + upload.
    const voiceoverBuffer = await generateTTSAudio(FULL_VOICEOVER)
    const voiceoverUrl = await uploadToPilotBucket(
      supabase,
      `style-a/${assetUuid}/voiceover.mp3`,
      voiceoverBuffer,
      'audio/mpeg',
    )

    // 5. Map fetched URLs back into a beat-index-aligned array (null for beat 8).
    const pexelsUrls: Array<string | null> = BEATS.map((b, i) => {
      if (b.query === null) return null
      const idx = fetchableBeats.findIndex(fb => fb.beat === i + 1)
      return idx >= 0 ? (fetched[idx]?.videoUrl ?? null) : null
    })

    // 6. Build the Shotstack Edit, submit, and poll until done.
    const edit = buildShotstackEdit(pexelsUrls, voiceoverUrl)
    const renderId = await submitShotstackRender(edit, shotstackKey)
    const shotstackUrl = await pollShotstackRender(renderId, shotstackKey, runId)

    // 7. Download the rendered MP4 once and re-upload to Supabase Storage
    //    so the asset is durable beyond Shotstack's stage retention window.
    const finalRes = await fetch(shotstackUrl)
    if (!finalRes.ok) {
      throw new Error(`Failed to download rendered MP4 from Shotstack: HTTP ${finalRes.status}`)
    }
    const finalBuffer = await finalRes.arrayBuffer()
    const supabaseUrl = await uploadToPilotBucket(
      supabase,
      `style-a/${assetUuid}/final.mp4`,
      finalBuffer,
      'video/mp4',
    )

    const durationMs = Date.now() - startedAt
    console.log(`[pilot/style-a] done runId=${runId} elapsed=${durationMs}ms supabaseUrl=${supabaseUrl}`)

    return NextResponse.json({
      ok: true,
      runId,
      renderId,
      shotstackUrl,
      supabaseUrl,
      durationMs,
      beats: fetched,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const durationMs = Date.now() - startedAt
    console.error(`[pilot/style-a] failed runId=${runId} elapsed=${durationMs}ms error=${message}`)
    return NextResponse.json(
      { ok: false, runId, durationMs, error: message },
      { status: 500 },
    )
  }
}
