// Phase 14L.2.1 — Media provider helpers (Pexels / OpenAI image / HeyGen).
//
// Pure HTTP wrappers for the three providers the media-generation worker
// needs. Each function returns a normalized `MediaProviderResult` so the
// worker can branch uniformly on success/failure across providers.
//
// Design notes:
//   - No DB calls. Callers (the worker / future routes) are responsible for
//     persisting the returned URL / external_id.
//   - No platform posting calls. Even though some providers return public
//     URLs that COULD be embedded in a post, this module never publishes.
//   - Reads API keys from env at call time. A missing key returns a
//     normalized `{ success: false }` rather than throwing — the worker
//     can decide whether to fall back to another provider.
//   - HeyGen is async-only: createHeyGenVideo returns the job id, status
//     'queued', and NO video_url. A separate polling step (already shipped
//     for the SBA video at /api/cron/check-heygen-jobs) must observe
//     completion. The worker uses media_status='pending' + media_source=
//     'heygen' until the polling step writes the final URL.

export type MediaProviderName = 'pexels' | 'openai' | 'heygen'

export interface MediaProviderResult {
  /** True when the provider returned a usable artifact (URL or job id). */
  success: boolean
  provider: MediaProviderName
  /** The fetched/generated public URL. Empty for HeyGen until polling completes. */
  url?: string
  /** Provider-specific id (Pexels photo id, HeyGen video id, etc). */
  external_id?: string
  /**
   * Raw provider payload, primarily for diagnostics. The worker may persist
   * a small subset into campaign_assets.image_source_metadata /
   * .video_source_metadata; full bodies should not be stored.
   */
  raw?: unknown
  /** Normalized error message when success=false. */
  error?: string
  /**
   * For HeyGen — 'queued' / 'processing' / 'completed' / 'failed'. Other
   * providers omit this (they're synchronous, so success=true → completed).
   */
  status?: 'queued' | 'processing' | 'completed' | 'failed'
}

export interface PexelsImageOptions {
  query: string
  /** 'landscape' | 'portrait' | 'square' — defaults to undefined (Pexels picks). */
  orientation?: 'landscape' | 'portrait' | 'square'
  /** Per-page count Pexels returns. Defaults to 1; ceiling 80. */
  perPage?: number
}

export interface OpenAIImageOptions {
  prompt: string
  /** OpenAI image size string. Defaults to '1024x1024'. */
  size?: '1024x1024' | '1792x1024' | '1024x1792' | string
}

export interface HeyGenVideoOptions {
  /** Required: the spoken text. HeyGen needs a script — refuse without one. */
  script: string
  /** Optional title metadata (HeyGen accepts via callback URL etc.; we don't pass). */
  title?: string
  /** Override avatar — defaults to env HEYGEN_AVATAR_ID. */
  avatarId?: string
  /** Override voice — defaults to env HEYGEN_VOICE_ID. */
  voiceId?: string
}

const PROVIDER_ENV_KEY: Record<MediaProviderName, string> = {
  pexels: 'PEXELS_API_KEY',
  openai: 'OPENAI_API_KEY',
  heygen: 'HEYGEN_API_KEY',
}

/**
 * Returns true when the provider's required env var is non-empty.
 * Defensive — never throws. Used by the worker before attempting a call
 * so a missing key surfaces as a clear refusal instead of a 401.
 */
export function isMediaProviderConfigured(provider: MediaProviderName): boolean {
  const key = process.env[PROVIDER_ENV_KEY[provider]]
  return typeof key === 'string' && key.trim().length > 0
}

/**
 * Coerce arbitrary thrown values / response payloads into a short string.
 * Handles common shapes: Error, OpenAI's `{ error: { message } }`, HeyGen's
 * `{ message }`, Pexels's `{ error: '...' }`, and bare strings.
 */
export function normalizeProviderError(err: unknown): string {
  if (!err) return 'unknown error'
  if (typeof err === 'string') return err.slice(0, 500)
  if (err instanceof Error) return err.message.slice(0, 500)
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>
    const oe = obj.error
    if (typeof oe === 'string') return oe.slice(0, 500)
    if (oe && typeof oe === 'object') {
      const m = (oe as Record<string, unknown>).message
      if (typeof m === 'string') return m.slice(0, 500)
    }
    const m = obj.message
    if (typeof m === 'string') return m.slice(0, 500)
  }
  try {
    return JSON.stringify(err).slice(0, 500)
  } catch {
    return 'unserializable error'
  }
}

interface PexelsPhotoSrc {
  large2x?: string
  large?: string
  original?: string
}
interface PexelsPhoto {
  id?: number | string
  src?: PexelsPhotoSrc
  url?: string
  photographer?: string
}
interface PexelsResponse {
  photos?: PexelsPhoto[]
  error?: string
}

/**
 * Fetch a single Pexels photo URL for `query`. Synchronous from the
 * caller's perspective: a successful return has `url` set immediately.
 * Storage (re-uploading to Supabase) is the caller's responsibility — this
 * helper hands back the Pexels-hosted URL only.
 */
export async function fetchPexelsImage(opts: PexelsImageOptions): Promise<MediaProviderResult> {
  const provider: MediaProviderName = 'pexels'
  if (!isMediaProviderConfigured(provider)) {
    return { success: false, provider, error: 'PEXELS_API_KEY not set' }
  }
  if (!opts.query || !opts.query.trim()) {
    return { success: false, provider, error: 'query is required' }
  }
  const perPage = Math.max(1, Math.min(opts.perPage ?? 1, 80))
  const params = new URLSearchParams({
    query: opts.query.slice(0, 200),
    per_page: String(perPage),
  })
  if (opts.orientation) params.set('orientation', opts.orientation)
  const url = `https://api.pexels.com/v1/search?${params.toString()}`
  try {
    const res = await fetch(url, {
      headers: { Authorization: process.env.PEXELS_API_KEY as string },
    })
    const data = (await res.json().catch(() => ({}))) as PexelsResponse
    if (!res.ok) {
      return {
        success: false,
        provider,
        error: normalizeProviderError(data) || `pexels http ${res.status}`,
        raw: data,
      }
    }
    const photo = data.photos?.[0]
    const src = photo?.src?.large2x ?? photo?.src?.large ?? photo?.src?.original
    if (!src) {
      return {
        success: false,
        provider,
        error: 'pexels returned no usable photo for query',
        raw: data,
      }
    }
    return {
      success: true,
      provider,
      url: src,
      external_id: photo?.id != null ? String(photo.id) : undefined,
      raw: photo,
    }
  } catch (err) {
    return { success: false, provider, error: normalizeProviderError(err) }
  }
}

interface OpenAIImageResponse {
  data?: Array<{ url?: string; revised_prompt?: string }>
  error?: { message?: string }
}

/**
 * DALL·E-3 image generation. Returns the temporary OpenAI-hosted URL.
 * Mirrors the `dall-e-3 / 1024x1024 / standard / response_format='url'`
 * shape used elsewhere in the repo (src/lib/openai.ts) so quality and
 * cost stay consistent. Caller is responsible for downloading +
 * re-uploading to Supabase Storage before the URL expires.
 */
export async function generateOpenAIImage(opts: OpenAIImageOptions): Promise<MediaProviderResult> {
  const provider: MediaProviderName = 'openai'
  if (!isMediaProviderConfigured(provider)) {
    return { success: false, provider, error: 'OPENAI_API_KEY not set' }
  }
  if (!opts.prompt || !opts.prompt.trim()) {
    return { success: false, provider, error: 'prompt is required' }
  }
  const size = opts.size ?? '1024x1024'
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: `Photorealistic lifestyle travel photo. ${opts.prompt}. Real people, candid and natural expressions, not posed or stock-photo stiff. Warm, vibrant colors. No text overlays, no logos. Shot on a professional camera, shallow depth of field.`,
        n: 1,
        size,
        quality: 'standard',
        response_format: 'url',
      }),
    })
    const data = (await res.json().catch(() => ({}))) as OpenAIImageResponse
    if (!res.ok) {
      return {
        success: false,
        provider,
        error: normalizeProviderError(data) || `openai http ${res.status}`,
        raw: data,
      }
    }
    const url = data.data?.[0]?.url
    if (!url) {
      return { success: false, provider, error: 'openai returned no image url', raw: data }
    }
    return { success: true, provider, url, raw: data.data?.[0] }
  } catch (err) {
    return { success: false, provider, error: normalizeProviderError(err) }
  }
}

interface HeyGenGenerateResponse {
  data?: { video_id?: string }
  message?: string
  error?: unknown
}

/**
 * Kicks off a HeyGen video render. ASYNC — the function returns as soon as
 * HeyGen accepts the job (status='queued'); a separate polling step (see
 * scripts/check-video-generation-status.js + the existing
 * /api/cron/check-heygen-jobs route) must observe completion and write the
 * final video_url.
 *
 * Refuses to call when:
 *   - HEYGEN_API_KEY missing
 *   - HEYGEN_AVATAR_ID / HEYGEN_VOICE_ID missing AND no override passed
 *   - script is empty (HeyGen needs spoken text)
 *
 * The worker MUST treat a `success: true, status: 'queued'` result as
 * `media_status='pending'` + `media_source='heygen'` and persist the
 * `external_id` (video_id) somewhere safe so the polling step can find it.
 */
export async function createHeyGenVideo(opts: HeyGenVideoOptions): Promise<MediaProviderResult> {
  const provider: MediaProviderName = 'heygen'
  if (!isMediaProviderConfigured(provider)) {
    return { success: false, provider, error: 'HEYGEN_API_KEY not set' }
  }
  if (!opts.script || !opts.script.trim()) {
    return { success: false, provider, error: 'video script is empty — HeyGen needs spoken text' }
  }
  const avatarId = opts.avatarId ?? process.env.HEYGEN_AVATAR_ID
  const voiceId = opts.voiceId ?? process.env.HEYGEN_VOICE_ID
  if (!avatarId) {
    return { success: false, provider, error: 'HEYGEN_AVATAR_ID not set and no avatarId override provided' }
  }
  if (!voiceId) {
    return { success: false, provider, error: 'HEYGEN_VOICE_ID not set and no voiceId override provided' }
  }

  try {
    const res = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_inputs: [{
          character: {
            type: 'avatar',
            avatar_id: avatarId,
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            input_text: opts.script,
            voice_id: voiceId,
            speed: 1.0,
          },
        }],
        // 9:16 portrait — works for TikTok / Reels / Stories. Caller can
        // swap to 1280x720 (16:9) by editing this file when an organic
        // YouTube row appears; until then portrait is the right default.
        dimension: { width: 720, height: 1280 },
        title: opts.title?.slice(0, 120),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as HeyGenGenerateResponse
    if (!res.ok) {
      return {
        success: false,
        provider,
        error: normalizeProviderError(data) || `heygen http ${res.status}`,
        raw: data,
      }
    }
    const videoId = data.data?.video_id
    if (!videoId) {
      return {
        success: false,
        provider,
        error: 'heygen returned no video_id',
        raw: data,
      }
    }
    return {
      success: true,
      provider,
      external_id: videoId,
      status: 'queued',
      raw: data.data,
    }
  } catch (err) {
    return { success: false, provider, error: normalizeProviderError(err) }
  }
}

interface HeyGenStatusResponse {
  data?: {
    status?: string
    video_url?: string | null
    thumbnail_url?: string | null
    error?: unknown
  }
  message?: string
  error?: unknown
}

/**
 * Poll HeyGen for the status of a previously-created video. Mirrors the
 * pattern used by /api/cron/check-heygen-jobs. Returns:
 *   - success: true,  status: 'completed', url    when the render finished
 *   - success: false, status: 'failed',    error  when HeyGen rejected the job
 *   - success: false, status: 'queued' | 'processing'  while still rendering
 *     (caller treats this as "still pending; try again later")
 */
export async function getHeyGenVideoStatus(videoId: string): Promise<MediaProviderResult> {
  const provider: MediaProviderName = 'heygen'
  if (!isMediaProviderConfigured(provider)) {
    return { success: false, provider, error: 'HEYGEN_API_KEY not set' }
  }
  if (!videoId || !videoId.trim()) {
    return { success: false, provider, error: 'videoId is required' }
  }
  try {
    const res = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      { headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY as string } },
    )
    const data = (await res.json().catch(() => ({}))) as HeyGenStatusResponse
    if (!res.ok) {
      return {
        success: false,
        provider,
        error: normalizeProviderError(data) || `heygen status http ${res.status}`,
        raw: data,
      }
    }
    const status = (data.data?.status ?? 'queued') as MediaProviderResult['status']
    const videoUrl = data.data?.video_url ?? undefined
    if (status === 'completed' && videoUrl) {
      return {
        success: true,
        provider,
        url: videoUrl,
        external_id: videoId,
        status: 'completed',
        raw: data.data,
      }
    }
    if (status === 'failed') {
      return {
        success: false,
        provider,
        external_id: videoId,
        status: 'failed',
        error: normalizeProviderError(data.data?.error) || 'heygen reported failure',
        raw: data.data,
      }
    }
    return {
      success: false,
      provider,
      external_id: videoId,
      status,
      error: `heygen status: ${status}`,
      raw: data.data,
    }
  } catch (err) {
    return { success: false, provider, error: normalizeProviderError(err) }
  }
}
