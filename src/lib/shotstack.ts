// Phase 21D — Shotstack video-assembly wrapper for the cinematic YouTube
// pipeline. Replaces the FFmpeg/WASM path proposed in 21C (rejected as too
// risky on Vercel — see commit d0d53a7's body for the rationale).
//
// Two-step async flow:
//   1. submitShotstackRender(videoClips, audioUrl, ...) → POST submit
//      → returns shotstackRenderId. Caller persists into
//      media_metadata.shotstack_render_id.
//   2. getShotstackRenderStatus(renderId) → GET poll. The
//      /api/cron/assemble-youtube-video cron walks pending renders every
//      15 min, downloads the finished MP4, re-hosts to Supabase Storage,
//      and writes content_calendar.video_url.
//
// HTTP-only — matches the house style for AI/media providers (see
// src/lib/media-providers.ts, elevenlabs.ts, kling.ts). No SDK.
//
// API reference:
//   Base: https://api.shotstack.io/edit/{stage}     stage = 'v1' (prod) or 'stage' (sandbox)
//   Submit: POST {base}/render                       body { timeline, output }
//   Query:  GET  {base}/render/{render_id}
//   Auth:   x-api-key header
//   Response envelope: { success, message, response: {...} }
//
// Slow-motion design note:
//   21C scripts target ~90s of VO. Kling clips are 5s each × 4 = 20s of
//   source video. We resolve the mismatch via Shotstack's `speed`
//   parameter — each 5s clip plays slowed to (90/4) = 22.5s, producing
//   90s of cinematic slow-motion that pairs with the VO. If this reads
//   too languid in practice, 21E can switch to clip-looping.
//
//   Speed floor: 0.25 (Shotstack's documented minimum — lower values are
//   rejected with a validation error per clip). With 5s sources clamped
//   to 0.25, max display per clip = 20s → 4 clips = 80s. A 90s VO ends
//   with ~10s of trailing silence + black. Acceptable for v1; a Phase 21E
//   fix would either switch the orchestrator to 10s Kling clips
//   (5/22.5=0.222 vs 10/22.5=0.444 — the latter is in range) or loop the
//   sequence to fill the gap.

const SHOTSTACK_BASE = 'https://api.shotstack.io/edit'
const PROD_STAGE = 'v1'

export type ShotstackRenderStatus =
  | 'queued'
  | 'fetching'
  | 'rendering'
  | 'saving'
  | 'done'
  | 'failed'
  | 'unknown'

export interface ShotstackClip {
  /** Public URL of the source video clip. */
  src: string
  /** Source duration in seconds (Kling clips are 5s by default). */
  duration_seconds: number
}

export interface SubmitRenderOptions {
  /** Video clips in order. Each will be slowed to fit audioDurationSeconds / clips.length. */
  videoClips: ShotstackClip[]
  /** Public URL of the VO audio (typically the elevenlabs_audio_url from Supabase). */
  audioUrl: string
  /** Total VO length in seconds — defines the timeline length. Defaults to 90 (21C's target). */
  audioDurationSeconds?: number
  /** Output resolution. 'hd' = 1280x720 (default), 'sd' = 854x480, '1080' = 1920x1080. */
  resolution?: 'sd' | 'hd' | '1080'
}

export interface SubmitRenderResult {
  success: boolean
  shotstackRenderId?: string
  error?: string
}

export interface ShotstackRenderStatusResult {
  success: boolean
  status?: ShotstackRenderStatus
  /** Final MP4 URL on Shotstack's CDN when status='done'. */
  videoUrl?: string | null
  /** Duration of the rendered MP4 in seconds (if reported). */
  durationSeconds?: number
  /** Raw status string from Shotstack for diagnostics. */
  rawStatus?: string
  /** Shotstack's error string when status='failed'. */
  errorDetail?: string | null
  error?: string
}

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

function shotstackBaseUrl(): string {
  const stage = envTrim('SHOTSTACK_STAGE') || PROD_STAGE
  return `${SHOTSTACK_BASE}/${stage}`
}

/**
 * True when SHOTSTACK_API_KEY is non-empty. Defensive — never throws.
 */
export function isShotstackConfigured(): boolean {
  return envTrim('SHOTSTACK_API_KEY').length > 0
}

/**
 * Map Shotstack's status strings onto the small enum the assembler cron
 * pattern-matches on. Anything unknown collapses to 'unknown' (leave row
 * alone, retry next tick).
 */
function normalizeStatus(raw: string | undefined): ShotstackRenderStatus {
  const v = (raw ?? '').toLowerCase().trim()
  if (v === 'done') return 'done'
  if (v === 'failed') return 'failed'
  if (v === 'queued' || v === 'fetching' || v === 'rendering' || v === 'saving') return v
  return 'unknown'
}

interface ShotstackTimelineClip {
  asset: {
    type: 'video' | 'audio'
    src: string
    /** Mute the asset's native audio track (set to 0 on video clips so the
     *  VO track isn't competing with any incidental Kling audio). */
    volume?: number
  }
  start: number
  length: number
  speed?: number
  fit?: 'cover' | 'contain' | 'crop' | 'none'
}

interface ShotstackRenderBody {
  timeline: {
    tracks: Array<{ clips: ShotstackTimelineClip[] }>
  }
  output: {
    format: 'mp4'
    resolution: 'sd' | 'hd' | '1080'
  }
}

// Shotstack's documented speed range. Going below SHOTSTACK_MIN_SPEED
// triggers per-clip validation errors ("Validation failed for timeline").
const SHOTSTACK_MIN_SPEED = 0.25
const SHOTSTACK_MAX_SPEED = 1.0 // we never speed UP, only slow down

/**
 * Build the Shotstack render body. Video clips go on track 0 (top); audio
 * goes on track 1 (Shotstack mixes downward). Each video clip is slowed
 * via `speed` so the 4-clip sequence covers as much of the VO as the
 * speed floor allows.
 *
 * When the ideal speed would fall below SHOTSTACK_MIN_SPEED (= 0.25), the
 * clip is clamped and its display length recomputed from the clamped
 * value. This keeps the per-clip start/length math internally consistent
 * with what Shotstack will actually render, even if the resulting video
 * track is shorter than the audio track (trailing silence + black —
 * acceptable for v1 per the file header).
 */
function buildRenderBody(opts: SubmitRenderOptions): ShotstackRenderBody {
  const audioDuration = Math.max(1, opts.audioDurationSeconds ?? 90)
  const clipCount = opts.videoClips.length
  const idealPerClipDisplayDuration = audioDuration / clipCount

  const videoTrackClips: ShotstackTimelineClip[] = []
  let currentStart = 0
  for (const c of opts.videoClips) {
    const idealSpeed = c.duration_seconds / idealPerClipDisplayDuration
    const speed = Math.max(SHOTSTACK_MIN_SPEED, Math.min(SHOTSTACK_MAX_SPEED, idealSpeed))
    // length follows from the clamped speed, NOT from the ideal duration.
    // Example: 5s source at speed=0.25 plays for 20s; if the ideal was
    // 22.5s, the clip is 2.5s shorter than the ideal but the math is
    // honest about what Shotstack will produce.
    const displayLength = c.duration_seconds / speed
    videoTrackClips.push({
      asset: {
        type: 'video',
        src: c.src,
        // Mute Kling's video audio so it doesn't fight the VO track.
        volume: 0,
      },
      start: Number(currentStart.toFixed(2)),
      length: Number(displayLength.toFixed(2)),
      speed: Number(speed.toFixed(3)),
      fit: 'cover',
    })
    currentStart += displayLength
  }

  const audioTrackClips: ShotstackTimelineClip[] = [
    {
      asset: { type: 'audio', src: opts.audioUrl },
      start: 0,
      length: audioDuration,
    },
  ]

  return {
    timeline: {
      tracks: [
        { clips: videoTrackClips },
        { clips: audioTrackClips },
      ],
    },
    output: {
      format: 'mp4',
      resolution: opts.resolution ?? 'hd',
    },
  }
}

interface ShotstackEnvelope<T = unknown> {
  success?: boolean
  message?: string
  response?: T
}

interface ShotstackSubmitResponse {
  id?: string
  message?: string
}

interface ShotstackStatusResponse {
  id?: string
  status?: string
  url?: string
  error?: string
  duration?: number
}

/**
 * Submit a render job to Shotstack. Returns the render id, which the
 * assembler cron persists into media_metadata.shotstack_render_id.
 */
export async function submitShotstackRender(opts: SubmitRenderOptions): Promise<SubmitRenderResult> {
  const apiKey = envTrim('SHOTSTACK_API_KEY')
  if (!apiKey) return { success: false, error: 'SHOTSTACK_API_KEY not set' }
  if (!opts.videoClips || opts.videoClips.length === 0) {
    return { success: false, error: 'videoClips is empty' }
  }
  if (!opts.audioUrl) return { success: false, error: 'audioUrl is empty' }

  try {
    const body = buildRenderBody(opts)
    const res = await fetch(`${shotstackBaseUrl()}/render`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as ShotstackEnvelope<ShotstackSubmitResponse>
    if (!res.ok || data.success !== true) {
      // Capture the FULL Shotstack response — their validation errors land
      // in nested arrays (response.errors, response.message.errors, etc.)
      // that the previous shallow extraction missed entirely. Without this,
      // a generic "Validation failed for timeline: Found 4 validation errors"
      // gives us nothing to act on. Also log the body we sent so we can
      // diff against what the docs say is valid.
      console.error('[shotstack] submit failed — full response', {
        http_status: res.status,
        response_body: data,
        sent_body: body,
      })
      const message = data.response?.message ?? data.message ?? `HTTP ${res.status}`
      return { success: false, error: `Shotstack render submit failed: ${message.slice(0, 300)}` }
    }
    const renderId = data.response?.id
    if (typeof renderId !== 'string' || renderId.length === 0) {
      console.error('[shotstack] submit succeeded but no render id', { response_body: data })
      return { success: false, error: 'Shotstack returned no render id' }
    }
    return { success: true, shotstackRenderId: renderId }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Shotstack submit threw' }
  }
}

/**
 * Poll a Shotstack render. Returns the normalized status, plus the MP4
 * URL when finished. The assembler cron calls this for each pending row.
 */
export async function getShotstackRenderStatus(renderId: string): Promise<ShotstackRenderStatusResult> {
  const apiKey = envTrim('SHOTSTACK_API_KEY')
  if (!apiKey) return { success: false, error: 'SHOTSTACK_API_KEY not set' }
  if (!renderId) return { success: false, error: 'renderId is required' }

  try {
    const res = await fetch(`${shotstackBaseUrl()}/render/${encodeURIComponent(renderId)}`, {
      headers: { 'x-api-key': apiKey },
    })
    const data = (await res.json().catch(() => ({}))) as ShotstackEnvelope<ShotstackStatusResponse>
    if (!res.ok || data.success !== true) {
      const message = data.message ?? `HTTP ${res.status}`
      return { success: false, error: `Shotstack status query failed: ${message.slice(0, 300)}` }
    }
    const r = data.response ?? {}
    const rawStatus = typeof r.status === 'string' ? r.status : undefined
    return {
      success: true,
      status: normalizeStatus(rawStatus),
      videoUrl: typeof r.url === 'string' ? r.url : null,
      durationSeconds: typeof r.duration === 'number' && Number.isFinite(r.duration) ? r.duration : undefined,
      rawStatus,
      errorDetail: typeof r.error === 'string' ? r.error : null,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Shotstack fetch threw' }
  }
}
