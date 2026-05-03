// Phase 14H.1 — Tracking URL helper.
//
// Pure functions that resolve the placeholder template
// `?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event_slug}_{year}_{wave}`
// (from VORTEX_EVENT_CAMPAIGN_SKILL.md §11) into a real URL with UTM tags appended
// to a base CTA URL.
//
// No side effects, no DB calls, no env reads. Safe to import from server or client.

/** Default base URL when an event campaign has no per-campaign cta_url set. */
export const DEFAULT_BASE_URL = 'https://myvortex365.com/leosp'

/** UTM medium constant — the value that lets the attribution view match contacts back to a campaign. */
export const CAMPAIGN_UTM_MEDIUM = 'event_campaign'

/**
 * Sluggify an event name for UTM use.
 *   "Art Basel Miami Beach" → "art-basel-miami-beach"
 *   "X / Twitter Wedding-Reunion" → "x-twitter-wedding-reunion"
 *   "  Multiple   Spaces  " → "multiple-spaces"
 *   "" → ""
 *
 * Matches the regex used by `event_campaign_attribution_summary` (migration 023):
 *   regexp_replace(lower(event_name), '[^a-z0-9]+', '-', 'g')
 * with the addition of leading/trailing dash trimming so a name like "*Wow*" becomes
 * "wow" rather than "-wow-". The view tolerates trailing dashes, but trimming keeps
 * generated URLs cleaner for humans copy-pasting them.
 */
export function slugifyEventName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return ''
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Build the `utm_campaign` value: `<event_slug>_<year>[_<wave>]`. Wave is appended
 * only when a non-empty wave string is provided (W1-W8). When the event slug is
 * empty (event name was blank / null), returns an empty string so callers can
 * decide to skip emitting the UTM rather than emit a broken value like `_2026_W1`.
 */
export function buildCampaignUtmCampaign(opts: {
  eventName: string | null | undefined
  eventYear: number | null | undefined
  wave?: string | null | undefined
}): string {
  const slug = slugifyEventName(opts.eventName)
  const year = opts.eventYear
  if (!slug || !year || !Number.isFinite(year)) return ''
  const parts = [slug, String(year)]
  if (opts.wave && opts.wave.trim()) parts.push(opts.wave.trim())
  return parts.join('_')
}

/**
 * Truncate a long ID to a stable short form for `utm_content`.
 *
 * Returns `''` when the input is missing OR when the cleaned input does not produce
 * exactly 8 alphanumeric characters. Real Supabase UUIDs always satisfy the
 * requirement; literal placeholder strings (`<shortid>`, `{assetId}`, `<asset_id>`,
 * etc.) get stripped to fewer-than-8 chars or to a non-hex slice and are rejected.
 *
 * Defense-in-depth — even if a placeholder string somehow reaches this function,
 * it can never be emitted into a URL.
 */
function shortAssetId(assetId: string | null | undefined): string {
  if (!assetId || typeof assetId !== 'string') return ''
  // Strip ALL non-alphanumerics (dashes, braces, angle brackets, underscores, etc.)
  // before slicing, so placeholders like `<shortid>` collapse to `shortid` (7 chars,
  // fails the length gate below) rather than `<shorti` (which would round-trip).
  const cleaned = assetId.replace(/[^a-z0-9]/gi, '').slice(0, 8)
  if (!/^[a-z0-9]{8}$/i.test(cleaned)) return ''
  return cleaned.toLowerCase()
}

interface BuildTrackingUrlOptions {
  /** Base URL — usually event_campaigns.cta_url. Falls back to DEFAULT_BASE_URL. */
  baseUrl?: string | null | undefined
  /** UTM source. Will be lowercased. */
  platform: string
  eventName: string | null | undefined
  eventYear: number | null | undefined
  /** Wave like "W1" .. "W8". Optional — when missing, utm_campaign omits the wave segment. */
  wave?: string | null | undefined
  /** Asset type like "social_post". Used for utm_content. Optional. */
  assetType?: string | null | undefined
  /** Asset UUID. Last 8 chars (no dashes) appended to utm_content. Optional. */
  assetId?: string | null | undefined
}

/**
 * Build the resolved campaign tracking URL.
 *
 * Behavior:
 *   - Preserves existing query params on the base URL.
 *   - Existing UTM params on the base URL are overwritten with campaign values.
 *   - When a value cannot be resolved (e.g. blank event name), the corresponding
 *     UTM is omitted rather than emitted with an empty or placeholder value.
 *   - `utm_content` requires BOTH a clean asset_type AND an asset-id that yields
 *     a real 8-char short (see `shortAssetId`). A placeholder-shaped assetId like
 *     `<shortid>` or `{assetId}` is rejected by the length+charset gate and the
 *     `utm_content` param is dropped entirely — never round-tripped to the URL.
 *   - Returns the resolved URL string. Throws only on a fundamentally malformed
 *     base URL (which should never happen in practice).
 *
 * Example:
 *   buildCampaignTrackingUrl({
 *     baseUrl: 'https://myvortex365.com/leosp',
 *     platform: 'instagram',
 *     eventName: 'Art Basel Miami Beach',
 *     eventYear: 2026,
 *     wave: 'W1',
 *     assetType: 'social_post',
 *     assetId: '7ca6bc3f-5cb2-4bdf-9883-1470a31c8a8f',
 *   })
 *   →
 *   'https://myvortex365.com/leosp?utm_source=instagram&utm_medium=event_campaign&utm_campaign=art-basel-miami-beach_2026_W1&utm_content=social_post_7ca6bc3f'
 */
export function buildCampaignTrackingUrl(opts: BuildTrackingUrlOptions): string {
  const base = opts.baseUrl?.trim() || DEFAULT_BASE_URL
  let url: URL
  try {
    url = new URL(base)
  } catch {
    // Defensive — malformed cta_url is treated as if cta_url was empty.
    url = new URL(DEFAULT_BASE_URL)
  }

  const platform = (opts.platform ?? '').trim().toLowerCase()
  if (platform) url.searchParams.set('utm_source', platform)
  url.searchParams.set('utm_medium', CAMPAIGN_UTM_MEDIUM)

  const utmCampaign = buildCampaignUtmCampaign({
    eventName: opts.eventName,
    eventYear: opts.eventYear,
    wave: opts.wave,
  })
  if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign)

  const assetType = (opts.assetType ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '-')
  const idShort = shortAssetId(opts.assetId)
  // Policy: utm_content is emitted only when BOTH a clean asset_type AND a real
  // asset-id-derived 8-char short are available. If either is missing — including
  // the case where shortAssetId rejects a placeholder-shaped input — the param is
  // dropped entirely rather than emitted half-formed (e.g. `social_post` alone or
  // `social_post_<shortid>`). This matches the Phase 14H.1 spec: "If assetId is
  // missing, omit utm_content entirely rather than using a placeholder."
  if (assetType && idShort) {
    url.searchParams.set('utm_content', `${assetType}_${idShort}`)
  }

  return url.toString()
}
