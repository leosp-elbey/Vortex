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
}

export type MediaReadinessOutcome = 'ready' | 'missing' | 'text-only-allowed'

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
 */
export function validateMediaReadiness(row: MediaReadinessRow): MediaReadinessResult {
  const rule = getRequiredMediaForPlatform(row.platform)
  const has_image = nonEmpty(row.image_url)
  const has_video = nonEmpty(row.video_url)
  const reasons: string[] = []
  const platformLabel = row.platform ? row.platform.toLowerCase().trim() : ''

  // 1. Platform-level required media.
  if (rule.either_satisfies) {
    const hardRequired = rule.image === 'required' || rule.video === 'required'
    if (hardRequired && !has_image && !has_video) {
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

  if (reasons.length > 0) {
    return { outcome: 'missing', blocked: true, reasons, rule, has_image, has_video }
  }
  if (has_image || has_video) {
    return { outcome: 'ready', blocked: false, reasons: [], rule, has_image, has_video }
  }
  return { outcome: 'text-only-allowed', blocked: false, reasons: [], rule, has_image, has_video }
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
 *   'ready'     → "Media ready"
 *   'missing'   → "Media missing"
 *   'text-only' → "Text-only allowed"
 */
export function getMediaReadinessLabel(outcome: MediaReadinessOutcome): string {
  if (outcome === 'ready') return 'Media ready'
  if (outcome === 'missing') return 'Media missing'
  return 'Text-only allowed'
}
