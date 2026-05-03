// Phase 14G — Per-platform creative sizing and media rules.
//
// Source of truth for platform-specific format requirements (caption length, hashtag
// count, image / video aspect ratios, preferred dimensions, file-size caps). Used by:
//   - Dashboard campaign planner: shows a "Recommended: …" guidance line per asset.
//   - Future media generation phases: image gen / Pexels / HeyGen pick the right
//     aspect ratio + dimensions per target platform.
//   - Future post-validation: the per-platform poster routes (post-to-twitter,
//     post-to-instagram, etc.) can pre-validate before hitting the Graph / X / TikTok
//     APIs and surface clean failures instead of opaque 4xx responses.
//
// This module is data + pure helpers only. It does not call any external API, does not
// generate any media, and does not modify any DB row. Safe to import from server or
// client code.
//
// Notes on numbers below — these reflect each platform's *operative* limits as
// documented in their developer references in early 2026. Sources are listed in the
// `notes` field of each spec rather than crammed into comments. When platforms change
// limits (rare, but it happens — Twitter Premium expanded the 280-char limit for paid
// tiers), edit the spec here and downstream consumers pick up the change automatically.

export type PlatformId =
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'tiktok'
  | 'youtube_shorts'

export const ALL_PLATFORM_IDS: readonly PlatformId[] = [
  'instagram',
  'facebook',
  'twitter',
  'tiktok',
  'youtube_shorts',
] as const

export type ContentType = 'image' | 'video' | 'text' | 'carousel' | 'short_form_video'

export interface MediaDimension {
  width: number
  height: number
  /** Human-readable label, e.g. "Reel 9:16" or "Feed square". */
  label: string
}

export interface SocialSpec {
  id: PlatformId
  displayName: string
  /** Content types the platform meaningfully supports for this brand's use case. */
  allowedContentTypes: ContentType[]

  /** Hard upper bound — exceeding this fails the platform API. */
  captionMaxChars: number
  /** Where copy actually performs well, per platform best-practice references. */
  captionRecommendedChars: number

  /** Hard upper bound for hashtag count. */
  hashtagMaxCount: number
  /** Where hashtag count actually performs well; many platforms penalize spam. */
  hashtagRecommendedCount: number

  /** Aspect ratios the platform accepts for static images. First entry = preferred. */
  imageAspectRatios: string[]
  /** Aspect ratios the platform accepts for video. First entry = preferred. */
  videoAspectRatios: string[]

  /** Concrete image dimensions to target. First entry is the default. */
  preferredImageDimensions: MediaDimension[]
  /** Concrete video dimensions to target. First entry is the default. */
  preferredVideoDimensions: MediaDimension[]

  /** Hard upper bound on uploaded image size, in megabytes. null = effectively unbounded. */
  maxImageFileSizeMB: number | null
  /** Hard upper bound on uploaded video size, in megabytes. null = effectively unbounded. */
  maxVideoFileSizeMB: number | null
  /** Hard upper bound on video length in seconds. null = effectively unbounded. */
  maxVideoLengthSec: number | null

  /** True when an http(s) link in the caption renders as a clickable hyperlink. */
  linkInCaptionUseful: boolean
  /** True when hashtags meaningfully drive discovery on this platform. */
  hashtagsUseful: boolean
  /** True when short-form vertical video is the primary distribution format. */
  shortFormVideoPreferred: boolean

  /** Free-form practitioner notes shown in the dashboard tooltip. */
  notes: string[]
}

// ────────────────────────────────────────────────────────────────────────────────
// Platform specs
// ────────────────────────────────────────────────────────────────────────────────

const INSTAGRAM_SPEC: SocialSpec = {
  id: 'instagram',
  displayName: 'Instagram',
  allowedContentTypes: ['image', 'video', 'carousel', 'short_form_video'],
  captionMaxChars: 2200,
  captionRecommendedChars: 150,
  hashtagMaxCount: 30,
  hashtagRecommendedCount: 8,
  imageAspectRatios: ['1:1', '4:5', '9:16'],
  videoAspectRatios: ['9:16', '1:1', '4:5'],
  preferredImageDimensions: [
    { width: 1080, height: 1080, label: 'Feed square 1:1' },
    { width: 1080, height: 1350, label: 'Feed portrait 4:5' },
    { width: 1080, height: 1920, label: 'Reel / Story 9:16' },
  ],
  preferredVideoDimensions: [
    { width: 1080, height: 1920, label: 'Reel / Story 9:16' },
    { width: 1080, height: 1080, label: 'Feed square 1:1' },
  ],
  maxImageFileSizeMB: 30,
  maxVideoFileSizeMB: 100,
  maxVideoLengthSec: 90, // Reels cap (Feed video can be 60 min; Reels is the operative format)
  linkInCaptionUseful: false, // links in caption are NOT clickable on IG; bio link only
  hashtagsUseful: true,
  shortFormVideoPreferred: true,
  notes: [
    'Captions are not clickable; route traffic via the single bio link or a stickerless story link.',
    'First 125 chars of caption are visible without "more"; lead with the hook.',
    'Reels are the dominant distribution format — 9:16 video outperforms 1:1.',
  ],
}

const FACEBOOK_SPEC: SocialSpec = {
  id: 'facebook',
  displayName: 'Facebook',
  allowedContentTypes: ['image', 'video', 'text', 'carousel', 'short_form_video'],
  captionMaxChars: 63206, // hard limit; effectively unbounded
  captionRecommendedChars: 250,
  hashtagMaxCount: 30,
  hashtagRecommendedCount: 2,
  imageAspectRatios: ['1.91:1', '1:1', '4:5'],
  videoAspectRatios: ['16:9', '1:1', '4:5', '9:16'],
  preferredImageDimensions: [
    { width: 1200, height: 630, label: 'Link card / OG 1.91:1' },
    { width: 1080, height: 1080, label: 'Feed square 1:1' },
  ],
  preferredVideoDimensions: [
    { width: 1280, height: 720, label: 'Feed landscape 16:9' },
    { width: 1080, height: 1080, label: 'Feed square 1:1' },
    { width: 1080, height: 1920, label: 'Reel 9:16' },
  ],
  maxImageFileSizeMB: 30,
  maxVideoFileSizeMB: 4096,
  maxVideoLengthSec: 14400, // Feed video allows up to 240 min; Reels are 90s
  linkInCaptionUseful: true,
  hashtagsUseful: true,
  shortFormVideoPreferred: false,
  notes: [
    'Clickable links in caption — works well for funnel CTAs.',
    'Hashtags exist but matter less than IG; 1-3 high-quality tags are plenty.',
    'Engagement skews longer-form vs. IG; reasonable to use 200-300 char captions.',
  ],
}

const TWITTER_SPEC: SocialSpec = {
  id: 'twitter',
  displayName: 'X / Twitter',
  allowedContentTypes: ['text', 'image', 'video'],
  captionMaxChars: 280,
  captionRecommendedChars: 240,
  hashtagMaxCount: 2,
  hashtagRecommendedCount: 1,
  imageAspectRatios: ['16:9', '1:1', '2:1'],
  videoAspectRatios: ['16:9', '1:1'],
  preferredImageDimensions: [
    { width: 1600, height: 900, label: 'In-feed 16:9' },
    { width: 1200, height: 675, label: 'In-feed compact 16:9' },
    { width: 1200, height: 1200, label: 'Square 1:1' },
  ],
  preferredVideoDimensions: [
    { width: 1280, height: 720, label: 'Landscape 16:9' },
    { width: 1080, height: 1080, label: 'Square 1:1' },
  ],
  maxImageFileSizeMB: 5,
  maxVideoFileSizeMB: 512,
  maxVideoLengthSec: 140, // free-tier cap; paid tiers can go longer
  linkInCaptionUseful: true,
  hashtagsUseful: false, // hashtags are weak ranking signals on X; 0-1 is best
  shortFormVideoPreferred: false,
  notes: [
    'Hard 280-char cap — leave room for the URL (≈23 chars after t.co wrapping).',
    'Hashtags add little reach on X; one situational tag is plenty.',
    'Reply-thread strategies often outperform single posts for long thoughts.',
  ],
}

const TIKTOK_SPEC: SocialSpec = {
  id: 'tiktok',
  displayName: 'TikTok',
  allowedContentTypes: ['short_form_video', 'video'],
  captionMaxChars: 2200,
  captionRecommendedChars: 100,
  hashtagMaxCount: 30,
  hashtagRecommendedCount: 4,
  imageAspectRatios: ['9:16'],
  videoAspectRatios: ['9:16'],
  preferredImageDimensions: [
    { width: 1080, height: 1920, label: 'Vertical 9:16 (Photo Mode)' },
  ],
  preferredVideoDimensions: [
    { width: 1080, height: 1920, label: 'Vertical 9:16' },
  ],
  maxImageFileSizeMB: 20,
  maxVideoFileSizeMB: 287,
  maxVideoLengthSec: 180, // 3-min cap; sweet spot 21-34s for retention
  linkInCaptionUseful: false, // links in caption are not clickable; bio link or QR only
  hashtagsUseful: true,
  shortFormVideoPreferred: true,
  notes: [
    'Vertical 9:16 only — anything else gets cropped or pillarboxed.',
    'Sweet spot is 21-34 seconds; under 60s for max watch-through.',
    'Hooks must land in the first 1-2 seconds — algorithm rewards retention.',
    'Captions over 100 chars are routinely truncated in-feed.',
  ],
}

const YOUTUBE_SHORTS_SPEC: SocialSpec = {
  id: 'youtube_shorts',
  displayName: 'YouTube Shorts',
  allowedContentTypes: ['short_form_video'],
  captionMaxChars: 5000, // description field
  captionRecommendedChars: 200,
  hashtagMaxCount: 15,
  hashtagRecommendedCount: 3,
  imageAspectRatios: ['9:16'],
  videoAspectRatios: ['9:16'],
  preferredImageDimensions: [
    { width: 1080, height: 1920, label: 'Vertical thumbnail 9:16' },
  ],
  preferredVideoDimensions: [
    { width: 1080, height: 1920, label: 'Vertical 9:16' },
  ],
  maxImageFileSizeMB: 2, // thumbnail upload cap
  maxVideoFileSizeMB: 256,
  maxVideoLengthSec: 60, // Shorts cap; #shorts tag becomes mandatory under 60s
  linkInCaptionUseful: true, // description supports clickable links
  hashtagsUseful: true,
  shortFormVideoPreferred: true,
  notes: [
    'Vertical 9:16, ≤ 60 seconds, with #Shorts in title or description for discovery.',
    'Thumbnails are auto-generated for Shorts — manual thumbnail upload not supported.',
    'Descriptions can be long; first 100 chars show in-feed.',
  ],
}

const SPECS: Record<PlatformId, SocialSpec> = {
  instagram: INSTAGRAM_SPEC,
  facebook: FACEBOOK_SPEC,
  twitter: TWITTER_SPEC,
  tiktok: TIKTOK_SPEC,
  youtube_shorts: YOUTUBE_SHORTS_SPEC,
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Map free-form platform strings (case-insensitive aliases) to the canonical PlatformId.
 * Returns null when the string can't be resolved — callers should treat this as
 * "platform unknown; fall back to a sensible default rather than throw".
 */
export function normalizePlatform(input: string | null | undefined): PlatformId | null {
  if (!input || typeof input !== 'string') return null
  const v = input.toLowerCase().trim()
  switch (v) {
    case 'instagram':
    case 'ig':
    case 'insta':
      return 'instagram'
    case 'facebook':
    case 'fb':
    case 'meta':
      return 'facebook'
    case 'twitter':
    case 'x':
    case 'x/twitter':
    case 'twitter/x':
      return 'twitter'
    case 'tiktok':
    case 'tik tok':
    case 'tt':
      return 'tiktok'
    case 'youtube_shorts':
    case 'youtube shorts':
    case 'yt shorts':
    case 'shorts':
    case 'youtube':
    case 'yt':
      return 'youtube_shorts'
    default:
      return null
  }
}

/**
 * Look up the full platform spec. Accepts free-form aliases via normalizePlatform.
 * Returns null for unknown platforms so callers can degrade gracefully (e.g. hide a
 * guidance line) rather than throw or display garbage.
 */
export function getSocialSpec(platform: string | null | undefined): SocialSpec | null {
  const id = normalizePlatform(platform)
  return id ? SPECS[id] : null
}

export interface CaptionValidationResult {
  ok: boolean
  /** Why the caption failed validation. Empty when ok=true. */
  reason: string | null
  lengthChars: number
  maxChars: number
  recommendedChars: number
  /** True when length > recommended but ≤ max — the caller should warn but allow. */
  overRecommended: boolean
}

/**
 * Validate a caption against platform constraints. Returns {ok:false} only when the
 * caption *exceeds the hard max* — going past the recommended length is a soft warning
 * (overRecommended=true) and does not block.
 *
 * Unknown platforms validate as ok with default Instagram-like limits, so we never
 * silently allow a 5000-char tweet through.
 */
export function validateCaptionForPlatform(
  platform: string | null | undefined,
  caption: string | null | undefined,
): CaptionValidationResult {
  const spec = getSocialSpec(platform) ?? INSTAGRAM_SPEC
  const lengthChars = (caption ?? '').length
  const overMax = lengthChars > spec.captionMaxChars
  const overRecommended = !overMax && lengthChars > spec.captionRecommendedChars
  return {
    ok: !overMax,
    reason: overMax
      ? `Caption is ${lengthChars} chars; ${spec.displayName} hard limit is ${spec.captionMaxChars}.`
      : null,
    lengthChars,
    maxChars: spec.captionMaxChars,
    recommendedChars: spec.captionRecommendedChars,
    overRecommended,
  }
}

/**
 * Trim a caption so it fits the platform's hard max, preserving as much of the start
 * as possible and appending a single ellipsis. Returns the original string if it
 * already fits. Pure / no side effects.
 *
 * Useful for Twitter where the 280-char limit is non-negotiable. Not used by the
 * push-to-calendar route in Phase 14G — it just returns 400 — but available for the
 * eventual per-platform poster pre-flight.
 */
export function suggestCaptionTrim(
  platform: string | null | undefined,
  caption: string | null | undefined,
): string {
  const spec = getSocialSpec(platform) ?? INSTAGRAM_SPEC
  const text = caption ?? ''
  if (text.length <= spec.captionMaxChars) return text
  const ellipsis = '…'
  const room = spec.captionMaxChars - ellipsis.length
  if (room <= 0) return text.slice(0, spec.captionMaxChars)
  return text.slice(0, room).trimEnd() + ellipsis
}

/**
 * Return the recommended (first) image dimensions for the platform. Returns null when
 * the platform is unknown or has no image dimensions defined.
 */
export function getRecommendedImageSpec(platform: string | null | undefined): MediaDimension | null {
  const spec = getSocialSpec(platform)
  return spec?.preferredImageDimensions[0] ?? null
}

/**
 * Return the recommended (first) video dimensions for the platform. Returns null when
 * the platform is unknown or has no video dimensions defined.
 */
export function getRecommendedVideoSpec(platform: string | null | undefined): MediaDimension | null {
  const spec = getSocialSpec(platform)
  return spec?.preferredVideoDimensions[0] ?? null
}

/**
 * Compact one-line guidance string for dashboard hints.
 * Format: "1080×1080 image · caption ≤ 150 chars · 8 hashtags".
 * Returns null when the platform can't be resolved so callers can hide the line entirely.
 */
export function buildPlatformGuidanceLine(platform: string | null | undefined): string | null {
  const spec = getSocialSpec(platform)
  if (!spec) return null
  const img = spec.preferredImageDimensions[0]
  const vid = spec.preferredVideoDimensions[0]
  const parts: string[] = []
  if (spec.shortFormVideoPreferred && vid) {
    parts.push(`${vid.width}×${vid.height} video`)
  } else if (img) {
    parts.push(`${img.width}×${img.height} image`)
  }
  parts.push(`caption ≤ ${spec.captionRecommendedChars} chars`)
  parts.push(`${spec.hashtagRecommendedCount} hashtag${spec.hashtagRecommendedCount === 1 ? '' : 's'}`)
  return parts.join(' · ')
}
