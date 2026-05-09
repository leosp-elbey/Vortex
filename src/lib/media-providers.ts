// Phase 14AG — Media provider helpers (Pexels image + OpenAI image fallback +
// Pexels Video). HeyGen was excised in this phase: the avatar pipeline did
// not match brand voice, was expensive, and was async-only (incompatible
// with the synchronous weekly-content cron under Vercel Hobby's 60s ceiling).
//
// Pure HTTP wrappers. No DB, no platform posting. Each function returns a
// normalized `MediaProviderResult` so callers can branch uniformly.
//
// Key design notes for the new Pexels Video path:
//   - Synchronous: a successful return has `url` set immediately.
//   - Returns the Pexels-hosted MP4 URL directly. We do NOT re-upload to
//     Supabase Storage in this phase — Pexels CDN URLs are stable, and
//     re-hosting 5–30 MB MP4s inside the cron would push the function past
//     Vercel's 60s ceiling on weeks with multiple TikTok rows. If durability
//     becomes a concern, a separate hardening phase can add an async
//     re-upload pass without touching this signature.
//   - Picks the highest-quality vertical/portrait MP4 from the Pexels
//     `video_files` array (TikTok / Reels / Shorts are all 9:16). Falls
//     back to the highest-resolution file regardless of orientation if no
//     portrait match is available — better to land a usable URL than to
//     fail the whole cron over a strict filter.

export type MediaProviderName = 'pexels' | 'openai' | 'pexels-video'

export interface MediaProviderResult {
  /** True when the provider returned a usable artifact (URL). */
  success: boolean
  provider: MediaProviderName
  /** The fetched/generated public URL. */
  url?: string
  /** Provider-specific id (Pexels photo/video id). */
  external_id?: string
  /**
   * Raw provider payload, primarily for diagnostics. Callers may persist a
   * small subset into campaign_assets.image_source_metadata /
   * .video_source_metadata; full bodies should not be stored.
   */
  raw?: unknown
  /** Normalized error message when success=false. */
  error?: string
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

export interface PexelsVideoOptions {
  /** Search query (typically the AI-generated `image_prompt`). */
  query: string
  /** 'landscape' | 'portrait' | 'square' — defaults to 'portrait' for vertical reels. */
  orientation?: 'landscape' | 'portrait' | 'square'
  /** Pexels size hint: 'large' | 'medium' | 'small'. Defaults to 'large'. */
  size?: 'large' | 'medium' | 'small'
  /** Per-page count Pexels returns. Defaults to 5 so we can pick the best portrait MP4. */
  perPage?: number
  /** Min seconds — Pexels returns clips of various lengths. Defaults to 5. */
  minDurationSeconds?: number
  /** Max seconds — caps clip length so we don't ship a 60s loop. Defaults to 30. */
  maxDurationSeconds?: number
}

const PROVIDER_ENV_KEY: Record<MediaProviderName, string> = {
  pexels: 'PEXELS_API_KEY',
  openai: 'OPENAI_API_KEY',
  'pexels-video': 'PEXELS_API_KEY',
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
 * Handles common shapes: Error, OpenAI's `{ error: { message } }`,
 * Pexels's `{ error: '...' }`, and bare strings.
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
interface PexelsImageResponse {
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
    const data = (await res.json().catch(() => ({}))) as PexelsImageResponse
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

interface PexelsVideoFile {
  id?: number
  /** 'hd' | 'sd' | 'uhd' | string */
  quality?: string
  /** 'video/mp4' | 'video/quicktime' | string */
  file_type?: string
  width?: number
  height?: number
  fps?: number
  link?: string
}
interface PexelsVideoEntry {
  id?: number | string
  width?: number
  height?: number
  duration?: number
  url?: string
  video_files?: PexelsVideoFile[]
}
interface PexelsVideoResponse {
  videos?: PexelsVideoEntry[]
  error?: string
  total_results?: number
  page?: number
  per_page?: number
}

/**
 * Pick the best video_file from a Pexels video entry for vertical reels:
 *   1. Prefer `video/mp4` (TikTok/IG Reels need MP4).
 *   2. Prefer portrait orientation (height > width).
 *   3. Among matching files, prefer 'hd' / 'uhd' over 'sd'.
 *   4. Among same-quality files, prefer the highest height.
 * Returns null if no usable file found.
 */
function pickBestPortraitMp4(entry: PexelsVideoEntry): PexelsVideoFile | null {
  const files = (entry.video_files ?? []).filter(f => typeof f.link === 'string' && f.link.length > 0)
  if (files.length === 0) return null

  const mp4 = files.filter(f => (f.file_type ?? 'video/mp4').toLowerCase().includes('mp4'))
  const pool = mp4.length > 0 ? mp4 : files

  const portrait = pool.filter(f => (f.height ?? 0) > (f.width ?? 0))
  const target = portrait.length > 0 ? portrait : pool

  const qualityRank = (q?: string) => {
    const lower = (q ?? '').toLowerCase()
    if (lower === 'uhd') return 3
    if (lower === 'hd') return 2
    if (lower === 'sd') return 1
    return 0
  }

  return target.slice().sort((a, b) => {
    const dq = qualityRank(b.quality) - qualityRank(a.quality)
    if (dq !== 0) return dq
    return (b.height ?? 0) - (a.height ?? 0)
  })[0] ?? null
}

/**
 * Fetch a single Pexels video URL for `query`. Synchronous: a successful
 * return has `url` set immediately, ready to drop into
 * content_calendar.video_url with media_status='ready'.
 *
 * The function is named `fetchAndStoreVideo` (per Phase 14AG directive) but
 * the "store" portion is a no-op in this phase — we return the Pexels CDN
 * URL directly. Pexels URLs are durable (months+ stability), and re-hosting
 * 5–30 MB MP4s inside the weekly cron would risk Vercel's 60s ceiling on
 * weeks with multiple TikTok rows. If durability becomes a concern, a
 * future phase can add an async re-upload pass without changing this
 * function's signature — callers persist whatever `url` is returned.
 *
 * Filters:
 *   - orientation defaults to 'portrait' (TikTok / IG Reels are 9:16).
 *   - size defaults to 'large' (Pexels HD/UHD bias).
 *   - duration filter (default 5–30s) keeps clips usable as B-roll loops.
 */
export async function fetchAndStoreVideo(opts: PexelsVideoOptions): Promise<MediaProviderResult> {
  const provider: MediaProviderName = 'pexels-video'
  if (!isMediaProviderConfigured(provider)) {
    return { success: false, provider, error: 'PEXELS_API_KEY not set' }
  }
  if (!opts.query || !opts.query.trim()) {
    return { success: false, provider, error: 'query is required' }
  }
  const perPage = Math.max(1, Math.min(opts.perPage ?? 5, 80))
  const orientation = opts.orientation ?? 'portrait'
  const size = opts.size ?? 'large'
  const minDuration = Math.max(1, opts.minDurationSeconds ?? 5)
  const maxDuration = Math.max(minDuration, opts.maxDurationSeconds ?? 30)

  const params = new URLSearchParams({
    query: opts.query.slice(0, 200),
    per_page: String(perPage),
    orientation,
    size,
  })
  const url = `https://api.pexels.com/videos/search?${params.toString()}`

  try {
    const res = await fetch(url, {
      headers: { Authorization: process.env.PEXELS_API_KEY as string },
    })
    const data = (await res.json().catch(() => ({}))) as PexelsVideoResponse
    if (!res.ok) {
      return {
        success: false,
        provider,
        error: normalizeProviderError(data) || `pexels-video http ${res.status}`,
        raw: data,
      }
    }
    const videos = data.videos ?? []
    if (videos.length === 0) {
      return {
        success: false,
        provider,
        error: 'pexels-video returned no videos for query',
        raw: data,
      }
    }
    // Pick the first video matching the duration filter that yields a usable
    // portrait MP4. Fall through to ANY usable file if no duration match.
    let chosen: { entry: PexelsVideoEntry; file: PexelsVideoFile } | null = null
    for (const entry of videos) {
      const dur = entry.duration ?? 0
      if (dur < minDuration || dur > maxDuration) continue
      const file = pickBestPortraitMp4(entry)
      if (file && file.link) {
        chosen = { entry, file }
        break
      }
    }
    if (!chosen) {
      for (const entry of videos) {
        const file = pickBestPortraitMp4(entry)
        if (file && file.link) {
          chosen = { entry, file }
          break
        }
      }
    }
    if (!chosen || !chosen.file.link) {
      return {
        success: false,
        provider,
        error: 'pexels-video returned no usable mp4 file',
        raw: data,
      }
    }
    return {
      success: true,
      provider,
      url: chosen.file.link,
      external_id: chosen.entry.id != null ? String(chosen.entry.id) : undefined,
      raw: {
        video_id: chosen.entry.id,
        duration: chosen.entry.duration,
        width: chosen.file.width,
        height: chosen.file.height,
        quality: chosen.file.quality,
        file_type: chosen.file.file_type,
        page_url: chosen.entry.url,
      },
    }
  } catch (err) {
    return { success: false, provider, error: normalizeProviderError(err) }
  }
}
