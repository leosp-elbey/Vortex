// Phase 20.2 — Instagram image URL proxy helper.
//
// Meta's `/{ig-account-id}/media` container endpoint crawls `image_url`
// server-side before publishing. Raw Supabase Storage URLs
// (`*.supabase.co/storage/v1/object/public/media/content/<file>.jpg`) come
// back with `status_code=ERROR` because Meta's crawler either times out
// on Supabase's edge or refuses the host. The fix mirrors the Phase 14AO/14AU
// pattern used for TikTok: route the URL through the verified
// `www.vortextrips.com` host via a Next.js rewrite (see next.config.js,
// `/v/i/:path*` source), so Meta sees a known host and Vercel's edge
// streams the bytes from Supabase transparently.
//
// The DB still stores the canonical Supabase URL in
// content_calendar.image_url for clean record-keeping; only the URL handed
// to Meta is rewritten.

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

const SUPABASE_HOST_SUFFIX = '.supabase.co'
const SUPABASE_STORAGE_PATH_PREFIX = '/storage/v1/object/public/media/content/'
const IG_PROXY_PATH_PREFIX = '/v/i/'

/**
 * Rewrite an image URL into one Meta's crawler will accept.
 *
 * Rules:
 *   - vortextrips.com (any subdomain) → returned unchanged.
 *   - *.supabase.co/storage/v1/object/public/media/content/<rest> →
 *       <APP_HOST>/v/i/<rest>  (where <rest> may be `<file>.jpg` for the
 *       flat layout produced by weekly-content/generate-content, OR
 *       `instagram/<file>.jpg` for the legacy layout produced by
 *       scripts/generate-missing-media.js — both routed by the same
 *       rewrite because `:path*` preserves slashes).
 *   - *.pexels.com/* → returned unchanged. Pexels CDN URLs are publicly
 *       crawlable and Meta accepts them historically.
 *   - Anything else → returned unchanged with a console.warn so an
 *       unexpected provider shows up in logs before it gets shipped to Meta.
 *
 * `appHostOverride` lets a caller pass an explicit host when
 * NEXT_PUBLIC_APP_URL isn't set (e.g., a CLI script). Mirrors the optional
 * override on proxyVideoUrlForTikTok in src/lib/tiktok-oauth.ts.
 */
export function rewriteImageUrlForInstagram(rawUrl: string, appHostOverride?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return rawUrl
  }

  const appHost = (
    appHostOverride
    || envTrim('NEXT_PUBLIC_APP_URL')
    || 'https://www.vortextrips.com'
  ).replace(/\/+$/, '')

  if (parsed.hostname === 'vortextrips.com' || parsed.hostname.endsWith('.vortextrips.com')) {
    return rawUrl
  }

  if (
    parsed.hostname.endsWith(SUPABASE_HOST_SUFFIX) &&
    parsed.pathname.startsWith(SUPABASE_STORAGE_PATH_PREFIX)
  ) {
    const tail = parsed.pathname.slice(SUPABASE_STORAGE_PATH_PREFIX.length)
    return `${appHost}${IG_PROXY_PATH_PREFIX}${tail}${parsed.search}`
  }

  if (parsed.hostname === 'pexels.com' || parsed.hostname.endsWith('.pexels.com')) {
    return rawUrl
  }

  console.warn('[instagram-image-proxy] unrecognized image host — sending to Meta unchanged', {
    host: parsed.hostname,
    url: rawUrl,
  })
  return rawUrl
}
