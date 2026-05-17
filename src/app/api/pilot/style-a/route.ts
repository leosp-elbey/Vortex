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
async function pollShotstackRender(renderId: string, apiKey: string): Promise<string> {
  const url = `${SHOTSTACK_SUBMIT_URL}/${renderId}`
  const startedAt = Date.now()
  while (Date.now() - startedAt < SHOTSTACK_POLL_TIMEOUT_MS) {
    await new Promise(resolve => setTimeout(resolve, SHOTSTACK_POLL_INTERVAL_MS))
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } })
    const data = (await res.json().catch(() => ({}))) as ShotstackStatusResponse
    if (!res.ok) {
      const detail = JSON.stringify(data).slice(0, 300)
      throw new Error(`Shotstack poll failed: HTTP ${res.status}: ${detail}`)
    }
    const status = (data.response?.status ?? '').toLowerCase()
    if (status === 'done') {
      const finalUrl = data.response?.url
      if (!finalUrl) throw new Error('Shotstack reported done but returned no URL')
      return finalUrl
    }
    if (status === 'failed') {
      throw new Error(`Shotstack render failed: ${data.response?.error ?? 'unknown'}`)
    }
    // status is one of: queued | fetching | rendering | saving — keep polling.
  }
  throw new Error(`Shotstack poll timeout after ${SHOTSTACK_POLL_TIMEOUT_MS}ms`)
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
  const titleClips = BEATS.map(b => ({
    asset: {
      type: 'title',
      text: b.text,
      style: 'minimal',
      color: b.start === 5.0 ? '#E63946' : (b.start === 8.0 ? '#FF6B35' : '#FFFFFF'),
      size: (b.start === 0 || b.start === 19.5) ? 'x-large' : 'large',
      background: 'transparent',
      position: 'center',
    },
    start: b.start,
    length: b.length,
    transition: { in: 'fade', out: 'fade' },
  }))

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
      fit: 'cover',
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
    const shotstackUrl = await pollShotstackRender(renderId, shotstackKey)

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
