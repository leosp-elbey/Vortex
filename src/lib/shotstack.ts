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
// Highlight-reel design note:
//   21C scripts target ~90s of VO, but Kling produces 5s clips × 4 = 20s
//   of source video. The original Phase 21D attempt was to slow the
//   clips via Shotstack's `speed` property to fill the full 90s VO.
//   Shotstack rejects `speed` as an unknown property on clip objects
//   (one validation error per clip), so the slow-motion approach is
//   dead at the API level — not a matter of finding the right floor.
//
//   New design: play the 4 clips back-to-back at native speed for a
//   20-second highlight reel. The VO audio is trimmed to match the
//   video length (first 20s of the 90s narration plays under the
//   reel). Loses ~70s of narration; gains a tight social/Shorts-style
//   output that Shotstack actually accepts. Phase 21E follow-ups
//   (NOT in scope here) — either generate more Kling clips up front
//   so the reel covers the full VO, or shorten the 21C script target
//   from 90s to ~20s so VO + reel match exactly.

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
  /** Video clips in order. Played back-to-back at native speed. */
  videoClips: ShotstackClip[]
  /** Public URL of the VO audio (typically the elevenlabs_audio_url from Supabase).
   *  Played under the video reel, trimmed to the reel's total length. */
  audioUrl: string
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

/**
 * Build the Shotstack render body. Video clips go on track 0 (top); audio
 * goes on track 1 (Shotstack mixes downward). Clips play back-to-back at
 * native speed (no `speed` property — Shotstack rejects it as unknown on
 * clip objects). The VO is trimmed to the total video length so the
 * output is a clean reel without trailing audio over black.
 */
function buildRenderBody(opts: SubmitRenderOptions): ShotstackRenderBody {
  const videoTrackClips: ShotstackTimelineClip[] = []
  let currentStart = 0
  for (const c of opts.videoClips) {
    const length = Number(c.duration_seconds.toFixed(2))
    videoTrackClips.push({
      asset: {
        type: 'video',
        src: c.src,
        // Mute Kling's video audio so it doesn't fight the VO track.
        volume: 0,
      },
      start: Number(currentStart.toFixed(2)),
      length,
      fit: 'cover',
    })
    currentStart += c.duration_seconds
  }
  const totalVideoDuration = Number(currentStart.toFixed(2))

  const audioTrackClips: ShotstackTimelineClip[] = [
    {
      asset: { type: 'audio', src: opts.audioUrl },
      start: 0,
      // Trim VO to the reel length. The full VO file is referenced by
      // src; Shotstack plays only the first totalVideoDuration seconds.
      // Trailing narration (typically ~70s with 5s × 4 clips vs a 90s VO)
      // is intentionally dropped — see the file-header design note.
      length: totalVideoDuration,
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
      //
      // JSON.stringify with indent — Vercel's log formatter calls
      // util.inspect with default depth=2 which collapses nested arrays
      // (response.errors[], etc.) to [Array]. Stringifying first walks
      // the whole tree and Vercel preserves the multi-line output verbatim.
      console.error(
        '[shotstack] submit failed — full response',
        JSON.stringify(
          { http_status: res.status, response_body: data, sent_body: body },
          null,
          2,
        ),
      )
      const message = data.response?.message ?? data.message ?? `HTTP ${res.status}`
      return { success: false, error: `Shotstack render submit failed: ${message.slice(0, 300)}` }
    }
    const renderId = data.response?.id
    if (typeof renderId !== 'string' || renderId.length === 0) {
      console.error(
        '[shotstack] submit succeeded but no render id',
        JSON.stringify({ response_body: data }, null, 2),
      )
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
