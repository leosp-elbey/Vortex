// Phase 14AL — TikTok connection status endpoint.
// Phase 14AM.1 — also reports `sandbox: boolean` so the settings page can
// show a clear "Sandbox mode" indicator while TIKTOK_USE_SANDBOX=true.
//
// GET /api/auth/tiktok/status (admin-only)
//   → 200 { connected: boolean, expires_at: string | null, open_id: string | null, sandbox: boolean }
//   → 401 if not authenticated as an admin
//
// Powers the "Connected Accounts" section on /dashboard/settings — lets the
// dashboard show ✓ Connected / Not Connected, the expiration timestamp,
// a partial open_id, and a Sandbox-mode pill — without ever shipping the
// access_token or refresh_token to the browser. The four TikTok rows in
// `site_settings` are admin-only per migration 007 RLS, but this route
// reads via the admin client so it can run from a 'use client' page on
// the dashboard.
//
// Constraints:
//   - never returns access_token or refresh_token
//   - returns full open_id (it's TikTok's stable per-user identifier; not
//     a credential — TikTok itself uses it in URLs and webhook payloads)
//   - never logs sensitive values
//   - no DB writes

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tikTokIsSandboxMode } from '@/lib/tiktok-oauth'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .single()
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('site_settings')
    .select('key, value')
    .in('key', ['tiktok_refresh_token', 'tiktok_token_expires_at', 'tiktok_open_id'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.key && typeof row.value === 'string') {
      map.set(row.key as string, row.value as string)
    }
  }

  // `connected` is true iff a refresh_token exists. The access_token is
  // ephemeral — `getValidTikTokAccessToken()` rotates it transparently — so
  // the presence of refresh_token is the durable "is this connected?" signal.
  const refreshToken = map.get('tiktok_refresh_token')
  const connected = typeof refreshToken === 'string' && refreshToken.trim().length > 0

  return NextResponse.json({
    connected,
    expires_at: map.get('tiktok_token_expires_at') ?? null,
    open_id: map.get('tiktok_open_id') ?? null,
    sandbox: tikTokIsSandboxMode(),
  })
}
