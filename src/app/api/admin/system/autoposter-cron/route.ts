// Phase 14U — Admin API for the autoposter cron kill switch.
//
// GET  /api/admin/system/autoposter-cron  → returns { enabled: boolean, last_change: ISO | null, last_reason: string | null }
// POST /api/admin/system/autoposter-cron  body { enabled: boolean }  → upserts site_settings.autoposter_cron_enabled
//
// Both routes go through `requireAdminUser` from src/lib/admin-auth.ts so the
// kill switch can ONLY be read or toggled by users in the `admin_users` table.
// This is the same gate every other admin route on the site uses.
//
// The actual cron route at src/app/api/cron/autoposter-once/route.ts reads
// the same key with `value === 'true'` semantics (anything else = disabled).
// Storing the boolean as the literal string 'true' / 'false' keeps the
// site_settings table's text-only `value` column happy.
//
// Phase 21L: the live `site_settings` table has NO `description` column
// (schema drift from migration 007 — PostgREST rejects reads/writes of it
// with 42703). So this route does NOT touch `description`. The manual-toggle
// reason is echoed in the POST response for the immediate UI toast but is not
// persisted. Mirrors the Phase 20.0 fix in flipKillSwitchToDisabled()
// (/api/cron/autoposter-once). Referencing `description` here was why the
// dashboard "Enable Cron" button silently 500'd.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

const KILL_SWITCH_KEY = 'autoposter_cron_enabled'

export const dynamic = 'force-dynamic'

interface SiteSettingRow {
  value: string | null
  updated_at: string | null
}

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const { data, error } = await auth.admin
    .from('site_settings')
    .select('value, updated_at')
    .eq('key', KILL_SWITCH_KEY)
    .maybeSingle<SiteSettingRow>()

  if (error) {
    return NextResponse.json({ error: `lookup failed: ${error.message}` }, { status: 500 })
  }

  const value = (data?.value ?? '').trim().toLowerCase()
  const enabled = value === 'true'

  return NextResponse.json({
    enabled,
    last_change: data?.updated_at ?? null,
    last_reason: null,
    key: KILL_SWITCH_KEY,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => null)
  if (!body || typeof body.enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Body must be { enabled: boolean }' },
      { status: 400 },
    )
  }

  const newValue = body.enabled ? 'true' : 'false'
  const actorEmail = auth.user.email ?? auth.user.id
  const description = body.enabled
    ? `manually enabled by ${actorEmail}`
    : `manually disabled by ${actorEmail}`
  const updatedAt = new Date().toISOString()

  const { error } = await auth.admin
    .from('site_settings')
    .upsert(
      { key: KILL_SWITCH_KEY, value: newValue, updated_at: updatedAt },
      { onConflict: 'key' },
    )

  if (error) {
    return NextResponse.json({ error: `upsert failed: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    enabled: body.enabled,
    last_change: updatedAt,
    last_reason: description,
  })
}
