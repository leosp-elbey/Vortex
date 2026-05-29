// Phase 21B (re-platformed) — Kling text-to-video via PiAPI reseller.
//
// Originally hit Kling's first-party API at api-singapore.klingai.com
// directly with hand-rolled HS256 JWTs. Re-platformed onto PiAPI's
// unified-task gateway (https://api.piapi.ai) for self-serve credits
// and a much simpler auth surface: a single x-api-key header in place of
// per-request JWT signing.
//
// Public surface (consumed by /api/cron/check-kling-jobs, /api/cron/
// generate-youtube-video, /api/admin/test-kling) is identical to the
// first-party version — same function signatures, same return shapes —
// so callers stay untouched.
//
// API reference (verified against piapi.ai/docs/kling-api/create-task and
// /get-task):
//   Base: https://api.piapi.ai
//   Submit: POST /api/v1/task
//     body { model: "kling", task_type: "video_generation",
//            input: { prompt, duration, aspect_ratio } }
//   Query:  GET  /api/v1/task/{task_id}
//   Auth:   x-api-key: <PIAPI_API_KEY>
//   Response envelope: { code: 200, data: { task_id, status, output, error? }, message }
//
// Status strings PiAPI returns: Pending | Staged | Processing | Completed
// | Failed (capitalized). normalizeStatus() lowercases + maps onto the
// project's canonical KlingJobStatus enum.
//
// Video URL resolution is defensive — PiAPI emits different output shapes
// per Kling model variant. Lookup order:
//   1. data.output.works[0].video.resource_without_watermark   (standard, preferred)
//   2. data.output.works[0].video.resource                     (standard, watermarked fallback)
//   3. data.output.video                                       (Turbo / 3.0 fallback)

const PIAPI_API_BASE = 'https://api.piapi.ai'
const PIAPI_TASK_PATH = '/api/v1/task'
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
  /** Raw status string from PiAPI for diagnostics. */
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
  /** Raw status string from PiAPI for diagnostics. */
  rawStatus?: string
  error?: string
}

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

/**
 * Returns true when PIAPI_API_KEY is non-empty. Defensive — never throws.
 */
export function isKlingConfigured(): boolean {
  return envTrim('PIAPI_API_KEY').length > 0
}

/**
 * Map PiAPI's status strings (Pending / Staged / Processing / Completed /
 * Failed — plus all the historical variants the prior direct-API client
 * tolerated) onto the project's canonical enum.
 */
function normalizeStatus(raw: string | undefined): KlingJobStatus {
  const v = (raw ?? '').toLowerCase().trim()
  if (!v) return 'unknown'
  if (v === 'succeed' || v === 'success' || v === 'completed' || v === 'finished') return 'completed'
  if (v === 'failed' || v === 'fail' || v === 'error') return 'failed'
  // 'staged' (PiAPI's pre-processing queue state) collapses to 'submitted'
  // so the poller treats it identically to a freshly-submitted job.
  if (v === 'submitted' || v === 'queued' || v === 'pending' || v === 'staged') return 'submitted'
  if (v === 'processing' || v === 'running') return 'processing'
  return 'unknown'
}

interface PiApiVideoWork {
  video?: {
    resource?: string
    resource_without_watermark?: string
  }
}

interface PiApiEnvelope {
  code?: number
  message?: string
  data?: {
    task_id?: string
    status?: string
    output?: {
      /** Kling Standard model — array of works with watermarked + clean URLs. */
      works?: PiApiVideoWork[]
      /** Kling Turbo / Kling 3.0 — string URL at the top of output. */
      video?: string
      /** Kling Standard sometimes also surfaces a top-level video_url
       *  on the initial submit response (empty string until rendered). */
      video_url?: string
      /** Some output payloads carry the duration in seconds. */
      duration?: number | string
    }
    error?: {
      code?: number | string
      message?: string
    }
  }
}

/**
 * Defensive multi-path lookup for the rendered video URL. PiAPI returns
 * different output shapes per Kling model variant; prefer unwatermarked
 * standard-Kling, fall back to watermarked standard, then to the
 * Turbo/3.0 top-level field.
 */
function resolveVideoUrl(env: PiApiEnvelope): string | null {
  const out = env.data?.output
  if (!out) return null
  const firstWork = Array.isArray(out.works) ? out.works[0] : undefined
  const unwatermarked = firstWork?.video?.resource_without_watermark
  if (typeof unwatermarked === 'string' && unwatermarked.length > 0) return unwatermarked
  const watermarked = firstWork?.video?.resource
  if (typeof watermarked === 'string' && watermarked.length > 0) return watermarked
  const topLevelVideo = out.video
  if (typeof topLevelVideo === 'string' && topLevelVideo.length > 0) return topLevelVideo
  return null
}

/**
 * Pull the best error string available from a PiAPI envelope. Prefers
 * the inner data.error.message (PiAPI's preferred error surface) over
 * the top-level message (often just "success" or a generic phrase).
 */
function resolveErrorDetail(env: PiApiEnvelope, fallback: string): string {
  const inner = env.data?.error?.message
  if (typeof inner === 'string' && inner.length > 0) return inner
  if (typeof env.message === 'string' && env.message.length > 0) return env.message
  return fallback
}

/**
 * Submit a text-to-video job. Async — returns a task id. Caller persists
 * the id into content_calendar.kling_job_id; the poller cron
 * (check-kling-jobs) walks it to completion.
 */
export async function generateCinematicClip(opts: GenerateCinematicClipOptions): Promise<GenerateCinematicClipResult> {
  const apiKey = envTrim('PIAPI_API_KEY')
  if (!apiKey) return { success: false, error: 'PIAPI_API_KEY not set' }
  const prompt = opts.prompt?.trim() ?? ''
  if (!prompt) return { success: false, error: 'prompt is required' }
  const duration = opts.duration ?? 5
  const aspectRatio = opts.aspectRatio ?? '16:9'

  try {
    const res = await fetch(`${PIAPI_API_BASE}${PIAPI_TASK_PATH}`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'kling',
        task_type: 'video_generation',
        input: {
          prompt: prompt.slice(0, PROMPT_MAX_CHARS),
          duration,
          aspect_ratio: aspectRatio,
        },
      }),
    })
    const data = (await res.json().catch(() => ({}))) as PiApiEnvelope
    // PiAPI success envelope uses code=200 (not Kling's code=0 from the
    // first-party API). Accept any 2xx HTTP status as success too.
    const codeOk = typeof data.code !== 'number' || data.code === 200 || data.code === 0
    if (!res.ok || !codeOk) {
      const detail = resolveErrorDetail(data, `HTTP ${res.status}`)
      return { success: false, error: `Kling submit failed: ${detail.slice(0, 300)}` }
    }
    const taskId = data.data?.task_id
    const rawStatus = data.data?.status
    if (typeof taskId !== 'string' || taskId.length === 0) {
      return { success: false, error: 'PiAPI returned no task_id' }
    }
    return {
      success: true,
      klingJobId: taskId,
      status: normalizeStatus(rawStatus),
      rawStatus,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'PiAPI fetch threw' }
  }
}

/**
 * Poll a Kling task via PiAPI. Returns the normalized status, plus the
 * video URL when finished. The /api/cron/check-kling-jobs route calls
 * this for each pending row and writes results back to content_calendar.
 */
export async function getKlingJobStatus(jobId: string): Promise<KlingJobStatusResult> {
  const apiKey = envTrim('PIAPI_API_KEY')
  if (!apiKey) return { success: false, error: 'PIAPI_API_KEY not set' }
  if (!jobId) return { success: false, error: 'jobId is required' }

  try {
    const res = await fetch(`${PIAPI_API_BASE}${PIAPI_TASK_PATH}/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey },
    })
    const data = (await res.json().catch(() => ({}))) as PiApiEnvelope
    const codeOk = typeof data.code !== 'number' || data.code === 200 || data.code === 0
    if (!res.ok || !codeOk) {
      const detail = resolveErrorDetail(data, `HTTP ${res.status}`)
      return { success: false, error: `Kling status query failed: ${detail.slice(0, 300)}` }
    }
    const blob = data.data ?? {}
    const rawStatus = blob.status
    const status = normalizeStatus(rawStatus)
    const videoUrl = resolveVideoUrl(data)
    const rawDuration = blob.output?.duration
    const duration = rawDuration != null ? Number(rawDuration) : null
    return {
      success: true,
      status,
      videoUrl,
      duration: duration != null && Number.isFinite(duration) ? duration : null,
      rawStatus,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'PiAPI fetch threw' }
  }
}
