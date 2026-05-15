// Phase 14AS — YouTube OAuth helpers + token persistence.
//
// Single source of truth for YouTube access-token refresh. Consumed by:
//   - /api/admin/upload-to-youtube/route.ts  (manual admin upload)
//   - /api/cron/youtube-once/route.ts        (Phase 14AS auto-post cron)
//
// Token storage convention (mirrors the TikTok pattern in
// src/lib/tiktok-oauth.ts):
//   site_settings.key = 'youtube_refresh_token' | value = <refresh_token>
//
// The refresh_token is minted via the OAuth handshake at
// /api/auth/youtube/callback. Google's refresh tokens are long-lived
// (effectively non-expiring until manually revoked or 6 months of
// inactivity), so unlike TikTok we don't rotate the refresh token —
// we just trade it for a fresh access_token on every call.
//
// Endpoint: https://oauth2.googleapis.com/token

import { createAdminClient } from '@/lib/supabase/admin'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

/**
 * Trade a refresh_token for a fresh access_token via Google OAuth.
 * Throws when YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are unset OR
 * Google rejects the refresh (revoked token, etc.).
 */
export async function getFreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = (process.env.YOUTUBE_CLIENT_ID ?? '').trim()
  const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET ?? '').trim()
  if (!clientId || !clientSecret) {
    throw new Error('YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET not configured')
  }
  if (!refreshToken || !refreshToken.trim()) {
    throw new Error('refreshToken is required')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !data.access_token) {
    const detail = data.error_description ?? data.error ?? `HTTP ${res.status}`
    throw new Error(`YouTube token refresh failed: ${detail}`)
  }
  return data.access_token
}

/**
 * Read the stored YouTube refresh_token from site_settings, exchange it for
 * an access_token, return the access_token. Throws when no refresh token is
 * stored (operator must reconnect YouTube via /api/auth/youtube) or when
 * Google rejects the refresh.
 */
export async function getValidYouTubeAccessToken(supabase: SupabaseAdmin): Promise<string> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'youtube_refresh_token')
    .maybeSingle()
  if (error) {
    throw new Error(`site_settings load failed: ${error.message}`)
  }
  const refreshToken = (data?.value as string | undefined)?.trim()
  if (!refreshToken) {
    throw new Error('YouTube is not connected — no youtube_refresh_token in site_settings. Authorize via /api/auth/youtube.')
  }
  return getFreshAccessToken(refreshToken)
}
