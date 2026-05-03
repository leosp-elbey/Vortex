// Phase 14H.1 — Tracking URL helper.
//
// Pure functions that resolve the placeholder template
// `?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event_slug}_{year}_{wave}`
// (from VORTEX_EVENT_CAMPAIGN_SKILL.md §11) into a real URL with UTM tags appended
// to a base CTA URL.
//
// No side effects, no DB calls, no env reads. Safe to import from server or client.

/**
 * Default base URL when an event campaign has no per-campaign cta_url set.
 *
 * Pre-Phase-14J.2: this was the visible social link (`myvortex365.com/leosp`).
 * Phase 14J.2 introduced the branded `vortextrips.com/t/<slug>` redirect route,
 * so this constant is now used ONLY as the fallback for non-campaign tracking
 * URLs (when no `eventSlug` is provided to the helper). Campaign-attributed
 * URLs route through `BRAND_TRACKING_BASE_URL` instead, even when `cta_url`
 * still points at the legacy host.
 */
export const DEFAULT_BASE_URL = 'https://myvortex365.com/leosp'

/**
 * Phase 14J.2 — branded base for campaign tracking URLs visible on social posts.
 * Resolves to `https://www.vortextrips.com/t/<event_slug>` and is what the helper
 * emits whenever an `eventSlug` is supplied. The `/t/<slug>` route on the site
 * (server-side) logs the click to `contact_events` with full UTM resolution and
 * 302-redirects to the campaign's actual `cta_url` (typically the free portal).
 *
 * The destination URL behind the redirect (e.g. `myvortex365.com/leosp`) is
 * intentionally still configurable per-campaign via `event_campaigns.cta_url` —
 * it just isn't the visible social link anymore.
 */
export const BRAND_TRACKING_BASE_URL = 'https://www.vortextrips.com/t'

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
 *
 * Phase 14H.2 — prefers `eventSlug` (the persisted column) when supplied. Falls
 * back to deriving the slug from `eventName` only when `eventSlug` is empty/null.
 * Both paths produce byte-identical strings since they share `slugifyEventName`,
 * but preferring the persisted value means a future rename of `eventName` does
 * not break attribution against historical UTMs.
 */
export function buildCampaignUtmCampaign(opts: {
  eventName: string | null | undefined
  eventYear: number | null | undefined
  wave?: string | null | undefined
  /** Optional persisted slug from event_campaigns.event_slug. Wins over derived. */
  eventSlug?: string | null | undefined
}): string {
  const persistedSlug = opts.eventSlug && typeof opts.eventSlug === 'string' ? opts.eventSlug.trim() : ''
  const slug = persistedSlug || slugifyEventName(opts.eventName)
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
  /**
   * Phase 14H.2 — persisted `event_campaigns.event_slug`. When present, used for
   * the `utm_campaign` slug segment instead of deriving from `eventName`. This
   * makes attribution survive future event-name edits.
   */
  eventSlug?: string | null | undefined
}

/**
 * Build the resolved campaign tracking URL.
 *
 * Phase 14J.2 behavior change:
 *   - When `eventSlug` is provided AND a usable slug results, the URL is built
 *     against `BRAND_TRACKING_BASE_URL/<eventSlug>` rather than the supplied
 *     `baseUrl`. This emits the branded `vortextrips.com/t/<slug>?utm_*=...`
 *     visible link expected on social posts, regardless of what the campaign's
 *     `cta_url` says (the cta_url remains the redirect destination, not the
 *     visible URL).
 *   - When `eventSlug` is missing/blank, falls back to the pre-14J.2 behavior:
 *     base URL = `baseUrl ?? DEFAULT_BASE_URL`. Used for non-campaign tracking
 *     URLs and as a defensive fallback during data migration.
 *
 * General behavior:
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
  // Phase 14J.2: prefer the branded `/t/<slug>` base whenever a usable slug is
  // available. The slug must pass the same alnum+dash sanitization as the
  // attribution view's regex so the visible URL matches what the view will
  // attribute against on click.
  const persistedSlug = opts.eventSlug && typeof opts.eventSlug === 'string' ? opts.eventSlug.trim() : ''
  const resolvedSlug = persistedSlug || slugifyEventName(opts.eventName)

  let base: string
  if (resolvedSlug) {
    // URL-encode the slug to defend against operator-set values that contain
    // characters that would otherwise need escaping in a URL path. The slug
    // produced by `slugifyEventName` is alnum+dash so encoding is a no-op,
    // but persisted slugs from operator edits could be anything.
    base = `${BRAND_TRACKING_BASE_URL}/${encodeURIComponent(resolvedSlug)}`
  } else {
    // No slug — fall back to the legacy behavior so non-campaign tracking
    // URLs (organic, future use cases, defensive fallback during migrations)
    // still work the same as pre-14J.2.
    base = opts.baseUrl?.trim() || DEFAULT_BASE_URL
  }

  let url: URL
  try {
    url = new URL(base)
  } catch {
    // Defensive — malformed base URL is treated as if cta_url was empty AND
    // no slug was provided.
    url = new URL(DEFAULT_BASE_URL)
  }

  const platform = (opts.platform ?? '').trim().toLowerCase()
  if (platform) url.searchParams.set('utm_source', platform)
  url.searchParams.set('utm_medium', CAMPAIGN_UTM_MEDIUM)

  const utmCampaign = buildCampaignUtmCampaign({
    eventName: opts.eventName,
    eventYear: opts.eventYear,
    wave: opts.wave,
    eventSlug: opts.eventSlug,
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
