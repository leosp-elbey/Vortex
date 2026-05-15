// Phase 14AR — Meta Graph API token expiry healthcheck.
//
// Facebook + Instagram posters use static long-lived access tokens stored
// in env vars (FACEBOOK_PAGE_ACCESS_TOKEN, INSTAGRAM_ACCESS_TOKEN). Unlike
// TikTok which auto-refreshes via getValidTikTokAccessToken(), Meta tokens
// are never refreshed by our code. If a token is the 60-day type rather
// than the never-expires kind, it'll silently expire and every post attempt
// from that moment onward returns 401 with no upstream signal.
//
// This helper hits Meta's debug_token endpoint on every post attempt and
// logs the token's expires_at to Vercel function logs. The operator can
// then see expiry approaching in the cron logs and rotate before posts
// start failing.
//
// Behavior:
//   - expires_at === 0    → permanent page token; one log line and done
//   - expires_at > 0      → log absolute ISO timestamp + raise a warning if
//                           within 7 days of expiry
//   - lookup failed       → log the failure (don't throw) so the actual
//                           post attempt isn't blocked by a healthcheck
//                           network blip
//
// Never throws — fire-and-forget by design.

const GRAPH_DEBUG_URL = 'https://graph.facebook.com/debug_token'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export async function logMetaTokenHealth(token: string, label: string): Promise<void> {
  try {
    const url = `${GRAPH_DEBUG_URL}?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
    const res = await fetch(url)
    const data = await res.json().catch(() => ({})) as { data?: { expires_at?: number; data_access_expires_at?: number; is_valid?: boolean } }
    const expiresAt = data?.data?.expires_at

    if (typeof expiresAt !== 'number') {
      console.log(`[${label}] token healthcheck — expires_at: <unknown>`, { is_valid: data?.data?.is_valid })
      return
    }

    if (expiresAt === 0) {
      console.log(`[${label}] token healthcheck — never expires (permanent page token)`)
      return
    }

    const expiresAtIso = new Date(expiresAt * 1000).toISOString()
    const msUntilExpiry = expiresAt * 1000 - Date.now()
    console.log(`[${label}] token healthcheck — expires at ${expiresAtIso}`)

    if (msUntilExpiry < SEVEN_DAYS_MS) {
      console.warn(`[${label}] Token expires soon — rotate before ${expiresAtIso}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.log(`[${label}] token healthcheck failed: ${message}`)
  }
}
