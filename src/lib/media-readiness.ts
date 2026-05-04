// Phase 14L — Media readiness validator.
//
// Pure functions that determine whether a content_calendar row has the
// image/video media required by its target platform. Consumed by:
//   - validateManualPostingGate (posting-gate.ts) — refuses post when blocked
//   - validateAutoposterCandidate (autoposter-gate.ts) — same, dry-run path
//   - dashboard content page — surfaces "Media ready / Media missing /
//     Text-only allowed" labels and hides post buttons when media is missing
//
// No DB calls, no platform calls, no env reads. Inputs are passed by the
// caller — for campaign-originated rows the caller is responsible for
// joining `campaign_assets` (via `content_calendar.campaign_asset_id`) so
// the validator sees `image_url` / `video_url` / prompts.

export type MediaRequirement = 'required' | 'recommended' | 'none'

export interface PlatformMediaRule {
  image: MediaRequirement
  video: MediaRequirement
  /**
   * When TRUE, EITHER an image_url OR a video_url satisfies the platform's
   * media requirement (e.g. Instagram accepts a single-image OR a video post).
   * When FALSE, image and video are evaluated independently (e.g. TikTok needs
   * a video specifically — a still image does not satisfy it).
   */
  either_satisfies: boolean
}

const PLATFORM_RULES: Record<string, PlatformMediaRule> = {
  // Visual-first platforms — at least one media URL is required.
  instagram: { image: 'required',    video: 'required',    either_satisfies: true  },
  tiktok:    { image: 'none',        video: 'required',    either_satisfies: false },
  youtube:   { image: 'none',        video: 'required',    either_satisfies: false },

  // Text-OK platforms — media recommended for engagement but not required to post.
  facebook:  { image: 'recommended', video: 'recommended', either_satisfies: true  },
  twitter:   { image: 'recommended', video: 'recommended', either_satisfies: true  },
  threads:   { image: 'recommended', video: 'recommended', either_satisfies: true  },
  linkedin:  { image: 'recommended', video: 'recommended', either_satisfies: true  },

  // Non-social channels — never need image/video at the platform level.
  email:     { image: 'none',        video: 'none',        either_satisfies: false },
  sms:       { image: 'none',        video: 'none',        either_satisfies: false },
  web:       { image: 'none',        video: 'none',        either_satisfies: false },
}

const NONE_RULE: PlatformMediaRule = { image: 'none', video: 'none', either_satisfies: false }

/**
 * Resolve the platform's media requirement. Unknown / blank platforms collapse
 * to "no media required" — defensive default so a typo never silently blocks
 * an organic post.
 *
 * `contentType` is reserved for future per-content-type tightening (e.g.
 * "story" vs "feed" on Instagram). Today it has no effect; pass null/undefined.
 */
export function getRequiredMediaForPlatform(
  platform: string | null | undefined,
  contentType?: string | null,
): PlatformMediaRule {
  void contentType
  if (!platform || typeof platform !== 'string') return NONE_RULE
  const key = platform.toLowerCase().trim()
  return PLATFORM_RULES[key] ?? NONE_RULE
}

/**
 * Minimum shape `validateMediaReadiness` reads. Callers MUST populate
 * `image_url` / `video_url` from the linked campaign_assets row (joined via
 * content_calendar.campaign_asset_id) for campaign-originated rows.
 *
 * Organic rows (no campaign_asset_id) currently have no place to carry media
 * URLs — content_calendar has no `image_url` column. They are correctly
 * classified as "media missing" if their platform requires media.
 */
export interface MediaReadinessRow {
  platform: string | null
  /** Resolved image URL — typically from campaign_assets.image_url. */
  image_url?: string | null
  /** Resolved video URL — typically from campaign_assets.video_url. */
  video_url?: string | null
  /**
   * Image generation prompt. When non-empty, the gate REQUIRES `image_url`
   * to also be populated — a row whose campaign attached an image prompt is
   * expected to ship with the generated image, not as text-only.
   */
  image_prompt?: string | null
  /** Same as image_prompt but for video. */
  video_prompt?: string | null
  /** TRUE when the row originated from a campaign asset. Diagnostic-only — does not change rules. */
  campaign_asset_id?: string | null
  /**
   * Per-row override. When TRUE, the row REQUIRES at least one of
   * image_url/video_url regardless of platform default. Reserved for the
   * campaign plan's "media_required" flag (added in a future phase).
   */
  media_required?: boolean | null
  /**
   * Phase 14L.2 — `content_calendar.media_status`. When the worker has run,
   * this is one of 'pending' | 'ready' | 'failed' | 'skipped'. NULL on rows
   * that predate migration 032 OR were never picked up by the worker; in
   * that case the validator falls back to the platform-rule check below.
   *
   * Block rules:
   *   'failed'  → block with `media_error` if available
   *   'skipped' → block when the platform requires media; pass otherwise
   *   'ready'   → still verify image_url/video_url exists (column trusts but verifies)
   *   'pending' → no block on its own; platform rule decides
   *   null      → no block on its own; platform rule decides
   */
  media_status?: MediaStatus | string | null
  /**
   * Phase 14L.2 — most recent worker error. Only consulted when
   * media_status === 'failed'. Free-text; no length cap here (the worker
   * truncates to 1000 chars before insert).
   */
  media_error?: string | null
}

export type MediaReadinessOutcome = 'ready' | 'missing' | 'text-only-allowed' | 'failed'

/**
 * Phase 14L.2 — per-row media generation state, sourced from
 * content_calendar.media_status (migration 032). NULL is treated as
 * "no opinion" (platform rules apply as before 14L.2). 'ready' still
 * requires the underlying URL to actually be present — the gate trusts
 * the column but verifies.
 */
export type MediaStatus = 'pending' | 'ready' | 'failed' | 'skipped'

export const MEDIA_STATUS_VALUES: readonly MediaStatus[] = ['pending', 'ready', 'failed', 'skipped'] as const

export function normalizeMediaStatus(input: string | null | undefined): MediaStatus | null {
  if (!input || typeof input !== 'string') return null
  const v = input.trim().toLowerCase()
  return (MEDIA_STATUS_VALUES as readonly string[]).includes(v) ? (v as MediaStatus) : null
}

export interface MediaReadinessResult {
  outcome: MediaReadinessOutcome
  /** TRUE when posting must be refused. The posting gate consumes this. */
  blocked: boolean
  /** Human-readable refusal strings (empty when not blocked). */
  reasons: string[]
  /** Resolved per-platform rule (handy for the dashboard). */
  rule: PlatformMediaRule
  /** Convenience flags for UI. */
  has_image: boolean
  has_video: boolean
  /** Phase 14L.2 — resolved media_status (null when row didn't carry one). */
  media_status: MediaStatus | null
}

function nonEmpty(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Returns `{ outcome, blocked, reasons, ... }`. The posting gate refuses the
 * row whenever `blocked === true`. Reasons are designed to match the strings
 * called out in the Phase 14L spec verbatim:
 *   "missing required image_url for Instagram"
 *   "missing required video_url for TikTok"
 *   "campaign media prompt exists but generated media is missing"
 *
 * Phase 14L.2 — also consults `media_status` (migration 032):
 *   'failed'  → block with `media_error` if available
 *   'skipped' → block when platform requires media; otherwise text-only OK
 *   'ready'   → still verifies image_url/video_url exists ("trust but verify")
 *   'pending' / null → falls through to platform-rule check
 */
export function validateMediaReadiness(row: MediaReadinessRow): MediaReadinessResult {
  const rule = getRequiredMediaForPlatform(row.platform)
  const has_image = nonEmpty(row.image_url)
  const has_video = nonEmpty(row.video_url)
  const reasons: string[] = []
  const platformLabel = row.platform ? row.platform.toLowerCase().trim() : ''
  const media_status = normalizeMediaStatus(row.media_status as string | null | undefined)
  const platformRequiresMedia = rule.image === 'required' || rule.video === 'required'

  // 0. media_status short-circuits — Phase 14L.2.
  // 'failed' is unconditional: the worker tried, the operator should fix the
  // upstream cause before posting. 'skipped' only blocks when the platform
  // actually requires media; on text-OK platforms it's a no-op.
  if (media_status === 'failed') {
    const detail = nonEmpty(row.media_error) ? `: ${row.media_error!.trim()}` : ''
    reasons.push(`media generation failed${detail}`)
  } else if (media_status === 'skipped' && platformRequiresMedia && !has_image && !has_video) {
    reasons.push(`media_status='skipped' but platform ${platformLabel || 'this platform'} requires media`)
  }

  // 1. Platform-level required media.
  if (rule.either_satisfies) {
    if (platformRequiresMedia && !has_image && !has_video) {
      // Phrase the message around image_url — matches the Phase 14L spec
      // example for Instagram. Falls back to a generic phrase if a future
      // platform with either_satisfies + required is added.
      if (platformLabel === 'instagram') {
        reasons.push('missing required image_url for Instagram')
      } else {
        reasons.push(`missing required image_url or video_url for ${platformLabel || 'this platform'}`)
      }
    }
  } else {
    if (rule.image === 'required' && !has_image) {
      reasons.push(`missing required image_url for ${platformLabel || 'this platform'}`)
    }
    if (rule.video === 'required' && !has_video) {
      // Phase 14L spec mandates "missing required video_url for TikTok".
      const label = platformLabel === 'tiktok' ? 'TikTok' : (platformLabel || 'this platform')
      reasons.push(`missing required video_url for ${label}`)
    }
  }

  // 2. Per-row override flag — campaign plan can pin a row as "must have media".
  if (row.media_required === true && !has_image && !has_video) {
    reasons.push('row marked media_required=true but neither image_url nor video_url is present')
  }

  // 3. Prompt-without-resolution. If a campaign attached an image_prompt or
  // video_prompt, the gate refuses to post until the resolved media URL is
  // populated. Prevents the "text-only stub posted before the generation
  // worker finished" failure mode.
  if (nonEmpty(row.image_prompt) && !has_image) {
    reasons.push('campaign media prompt exists but generated media is missing')
  }
  if (nonEmpty(row.video_prompt) && !has_video) {
    // Use the same canonical string so dashboard counts collapse cleanly.
    if (!reasons.includes('campaign media prompt exists but generated media is missing')) {
      reasons.push('campaign media prompt exists but generated media is missing')
    }
  }

  // 4. Phase 14L.2 — "trust but verify" for media_status='ready'. If the
  // worker claimed success but the URL is missing on a platform that needs
  // it, surface that explicitly. (When platform doesn't need media, an empty
  // URL alongside 'ready' is harmless.)
  if (media_status === 'ready' && platformRequiresMedia && !has_image && !has_video) {
    if (!reasons.some(r => r.startsWith('missing required'))) {
      reasons.push(`media_status='ready' but no image_url/video_url present`)
    }
  }

  if (reasons.length > 0) {
    const outcome: MediaReadinessOutcome = media_status === 'failed' ? 'failed' : 'missing'
    return { outcome, blocked: true, reasons, rule, has_image, has_video, media_status }
  }
  if (has_image || has_video) {
    return { outcome: 'ready', blocked: false, reasons: [], rule, has_image, has_video, media_status }
  }
  return { outcome: 'text-only-allowed', blocked: false, reasons: [], rule, has_image, has_video, media_status }
}

export interface PerPlatformReadinessCounts {
  total: number
  ready: number
  text_only: number
  missing: number
}

export interface MediaReadinessSummary {
  total: number
  ready: number
  text_only_allowed: number
  missing: number
  by_platform: Record<string, PerPlatformReadinessCounts>
  missing_reasons: Record<string, number>
}

export function summarizeMediaReadiness(rows: MediaReadinessRow[]): MediaReadinessSummary {
  const summary: MediaReadinessSummary = {
    total: rows.length,
    ready: 0,
    text_only_allowed: 0,
    missing: 0,
    by_platform: {},
    missing_reasons: {},
  }
  for (const row of rows) {
    const result = validateMediaReadiness(row)
    const platform = (row.platform ?? 'unknown').toLowerCase()
    if (!summary.by_platform[platform]) {
      summary.by_platform[platform] = { total: 0, ready: 0, missing: 0, text_only: 0 }
    }
    summary.by_platform[platform].total++
    if (result.outcome === 'ready') {
      summary.ready++
      summary.by_platform[platform].ready++
    } else if (result.outcome === 'text-only-allowed') {
      summary.text_only_allowed++
      summary.by_platform[platform].text_only++
    } else {
      summary.missing++
      summary.by_platform[platform].missing++
      for (const r of result.reasons) {
        summary.missing_reasons[r] = (summary.missing_reasons[r] ?? 0) + 1
      }
    }
  }
  return summary
}

/**
 * Convenience label for the dashboard's small media-status badge:
 *   'ready'             → "Media ready"
 *   'missing'           → "Media missing"
 *   'failed'            → "Media failed"
 *   'text-only-allowed' → "Text-only allowed"
 */
export function getMediaReadinessLabel(outcome: MediaReadinessOutcome): string {
  if (outcome === 'ready') return 'Media ready'
  if (outcome === 'missing') return 'Media missing'
  if (outcome === 'failed') return 'Media failed'
  return 'Text-only allowed'
}
