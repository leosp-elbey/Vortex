// Phase 21B — Kling AI text-to-video wrapper for the cinematic YouTube pipeline.
//
// Two-step async flow:
//   1. generateCinematicClip(prompt, duration, aspectRatio) → POST submit
//      → returns klingJobId. Caller persists into
//      content_calendar.kling_job_id.
//   2. getKlingJobStatus(jobId) → GET poll. The /api/cron/check-kling-jobs
//      route walks pending jobs every 10 min and writes video_url +
//      media_status='ready' when finished.
//
// HTTP-only — matches the house style for AI providers (no SDK; see
// src/lib/media-providers.ts and src/lib/elevenlabs.ts). JWT signing is
// hand-rolled HS256 via node:crypto so we don't add a jsonwebtoken
// dependency.
//
// API reference:
//   Base: https://api-singapore.klingai.com
//   Submit: POST /v1/videos/text2video    body { prompt, duration, aspect_ratio }
//   Query:  GET  /v1/videos/text2video/{task_id}
//   Auth:   Authorization: Bearer <JWT> where JWT = HS256({iss,exp,nbf}, api_secret)
//   Response envelope: { code: 0, message: "SUCCEED", data: {...} } on success.

import { createHmac } from 'node:crypto'

const KLING_API_BASE = 'https://api-singapore.klingai.com'
const KLING_TEXT2VIDEO_PATH = '/v1/videos/text2video'
// 30-minute access tokens — short-lived so a leaked JWT has limited blast
// radius. The signing is cheap enough to do per-request; no caching.
const JWT_TTL_SECONDS = 1800
// nbf slack absorbs clock skew between Vercel functions and Kling.
const JWT_NBF_SLACK_SECONDS = 5
const PROMPT_MAX_CHARS = 2500

export type KlingJobStatus = 'submitted' | 'processing' | 'completed' | 'failed' | 'unknown'

export interface GenerateCinematicClipOptions {
  /** Prompt text. Required. Capped at 2500 chars before send. */
  prompt: string
  /** Seconds — Kling supports 5 or 10. Defaults to 5. */
  duration?: 5 | 10
  /** '16:9' (YouTube landscape, default) | '9:16' (Shorts) | '1:1'. */
  aspectRatio?: '16:9' | '9:16' | '1:1'
}

export interface GenerateCinematicClipResult {
  success: boolean
  klingJobId?: string
  status?: KlingJobStatus
  /** Raw status string from Kling for diagnostics. */
  rawStatus?: string
  error?: string
}

export interface KlingJobStatusResult {
  success: boolean
  status?: KlingJobStatus
  /** Final video URL when status='completed'. */
  videoUrl?: string | null
  /** Clip duration in seconds when status='completed'. */
  duration?: number | null
  /** Raw status string from Kling for diagnostics. */
  rawStatus?: string
  error?: string
}

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64url')
}

/**
 * Sign a Kling JWT (HS256). Per Kling docs:
 *   iss = api_key (developer access key)
 *   exp = unix-seconds, short-lived
 *   nbf = unix-seconds, with small slack
 *   key = api_secret
 */
function signKlingJwt(apiKey: string, apiSecret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: apiKey,
    exp: now + JWT_TTL_SECONDS,
    nbf: now - JWT_NBF_SLACK_SECONDS,
  }
  const encHeader = base64url(JSON.stringify(header))
  const encPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encHeader}.${encPayload}`
  const signature = createHmac('sha256', apiSecret).update(signingInput).digest()
  return `${signingInput}.${base64url(signature)}`
}

/**
 * Returns true when both KLING_API_KEY and KLING_API_SECRET are non-empty.
 * Defensive — never throws.
 */
export function isKlingConfigured(): boolean {
  return envTrim('KLING_API_KEY').length > 0 && envTrim('KLING_API_SECRET').length > 0
}

/**
 * Map the variety of Kling status strings (submitted / queued / processing /
 * succeed / completed / failed / fail / error / running) onto a small fixed
 * set the cron + dashboards can pattern-match on.
 */
function normalizeStatus(raw: string | undefined): KlingJobStatus {
  const v = (raw ?? '').toLowerCase().trim()
  if (!v) return 'unknown'
  if (v === 'succeed' || v === 'success' || v === 'completed' || v === 'finished') return 'completed'
  if (v === 'failed' || v === 'fail' || v === 'error') return 'failed'
  if (v === 'submitted' || v === 'queued' || v === 'pending') return 'submitted'
  if (v === 'processing' || v === 'running') return 'processing'
  return 'unknown'
}

interface KlingEnvelope {
  code?: number
  message?: string
  data?: {
    task_id?: string
    task_status?: string
    task_result?: {
      videos?: Array<{ url?: string; duration?: number | string }>
    }
  }
}

/**
 * Submit a text-to-video job to Kling. Async — returns a job id. Caller
 * persists the id into content_calendar.kling_job_id; the poller cron
 * (check-kling-jobs) walks it to completion.
 */
export async function generateCinematicClip(opts: GenerateCinematicClipOptions): Promise<GenerateCinematicClipResult> {
  const apiKey = envTrim('KLING_API_KEY')
  const apiSecret = envTrim('KLING_API_SECRET')
  if (!apiKey || !apiSecret) return { success: false, error: 'KLING_API_KEY / KLING_API_SECRET not set' }
  const prompt = opts.prompt?.trim() ?? ''
  if (!prompt) return { success: false, error: 'prompt is required' }
  const duration = opts.duration ?? 5
  const aspectRatio = opts.aspectRatio ?? '16:9'

  try {
    const jwt = signKlingJwt(apiKey, apiSecret)
    const res = await fetch(`${KLING_API_BASE}${KLING_TEXT2VIDEO_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt.slice(0, PROMPT_MAX_CHARS),
        duration: String(duration),
        aspect_ratio: aspectRatio,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as KlingEnvelope
    if (!res.ok || (typeof data.code === 'number' && data.code !== 0)) {
      const message = data.message ?? `HTTP ${res.status}`
      return { success: false, error: `Kling submit failed: ${message.slice(0, 300)}` }
    }
    const taskId = data.data?.task_id
    const rawStatus = data.data?.task_status
    if (typeof taskId !== 'string' || taskId.length === 0) {
      return { success: false, error: 'Kling returned no task_id' }
    }
    return {
      success: true,
      klingJobId: taskId,
      status: normalizeStatus(rawStatus),
      rawStatus,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Kling fetch threw' }
  }
}

/**
 * Poll a Kling job. Returns the normalized status, plus the video URL
 * when finished. The /api/cron/check-kling-jobs route calls this for
 * each pending row and writes results back to content_calendar.
 */
export async function getKlingJobStatus(jobId: string): Promise<KlingJobStatusResult> {
  const apiKey = envTrim('KLING_API_KEY')
  const apiSecret = envTrim('KLING_API_SECRET')
  if (!apiKey || !apiSecret) return { success: false, error: 'KLING_API_KEY / KLING_API_SECRET not set' }
  if (!jobId) return { success: false, error: 'jobId is required' }

  try {
    const jwt = signKlingJwt(apiKey, apiSecret)
    const res = await fetch(`${KLING_API_BASE}${KLING_TEXT2VIDEO_PATH}/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${jwt}` },
    })
    const data = (await res.json().catch(() => ({}))) as KlingEnvelope
    if (!res.ok || (typeof data.code === 'number' && data.code !== 0)) {
      const message = data.message ?? `HTTP ${res.status}`
      return { success: false, error: `Kling status query failed: ${message.slice(0, 300)}` }
    }
    const blob = data.data ?? {}
    const rawStatus = blob.task_status
    const status = normalizeStatus(rawStatus)
    const firstVideo = blob.task_result?.videos?.[0] ?? null
    const videoUrl = firstVideo?.url ?? null
    const duration = firstVideo?.duration != null ? Number(firstVideo.duration) : null
    return {
      success: true,
      status,
      videoUrl,
      duration: Number.isFinite(duration) ? duration : null,
      rawStatus,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Kling fetch threw' }
  }
}
