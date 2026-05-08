// Phase 14S — 100% Automation Cron. Autoposter, scheduled daily.
//
// GET /api/cron/autoposter-once
// Authorization: Bearer <CRON_SECRET>
//
// Wraps the logic from `scripts/run-autoposter-once.js` (Phase 14O.1) into a
// CRON_SECRET-gated route that Vercel calls on the schedule registered in
// vercel.json. Targets ONE eligible row per execution and posts to Facebook,
// Instagram, or TikTok via the same gate / atomic-UPDATE contract the manual
// platform-poster routes use. Mirrors the 5-step operator SOP at
// docs/skills/autoposter-operator-sop.md step-for-step:
//
//   Step 1 (Audit pre-flight)  → snapshot posted_at + status='posted' counts.
//   Step 2 (Mark Ready)        → operator-driven; cron does NOT mark Ready.
//   Step 3 (Dry-run / gate)    → getAutoposterEligibleRows + validateManualPostingGate.
//   Step 4 (Apply)             → platform call + atomic UPDATE.
//   Step 5 (Audit post-flight) → re-snapshot, verify deltas == +1; on slip,
//                                  auto-disable the cron via the kill switch.
//
// Kill switch (defense-in-depth):
//   site_settings.autoposter_cron_enabled
//     'true'         → cron actively posts
//     anything else  → cron returns { skipped: true, reason: 'cron_disabled' }
//     missing key    → treated as disabled (safe default for first deploy)
//
//   On the first non-2xx platform response OR a post-flight invariant slip,
//   the cron flips this key to 'false' and returns 500 so the operator gets a
//   loud signal. Re-enable manually after diagnosing the root cause.
//
// Twitter/X is permanently refused (Phase 14Q drop). The runner's
// REFUSED_PLATFORMS still lists it as defense-in-depth; this route mirrors
// that refusal at the platform-branch level.
//
// Vercel Hobby 10s function timeout — IG's 6s container-wait loop is the
// tightest path; total budget is ~8s for IG. FB and TikTok stay under 5s.
//
// Allowed writes (only on platform success):
//   content_calendar.status                            → 'posted'  (atomic)
//   content_calendar.posted_at                         → now()     (atomic)
//   site_settings.autoposter_cron_enabled              → 'false'   (only on failure auto-disable)
//   site_settings.tiktok_{access_token,refresh_token,
//     token_expires_at,open_id}                        → rotated tokens (TikTok refresh only)
//
// Forbidden writes (regardless of state):
//   posting_status / posting_gate_approved / queued_for_posting_at /
//   posting_block_reason / video_url / image_url / caption / image_prompt /
//   campaign_asset_id / tracking_url / any campaign_assets column.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  validateManualPostingGate,
  POSTING_GATE_ROW_SELECT_WITH_MEDIA,
  flattenPostingGateRow,
  type PostingGateRow,
} from '@/lib/posting-gate'
import { getAutoposterEligibleRows } from '@/lib/autoposter-gate'
import { getValidTikTokAccessToken } from '@/lib/tiktok-oauth'
import { sendEmail } from '@/lib/resend'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const GRAPH_API = 'https://graph.facebook.com/v25.0'
const TIKTOK_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
const TIKTOK_CAPTION_MAX = 2200

const REFUSED_PLATFORMS = new Set(['twitter', 'x'])
const SUPPORTED_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok'])

const KILL_SWITCH_KEY = 'autoposter_cron_enabled'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

function nonEmpty(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

interface PlatformPostResult {
  ok: boolean
  platform_post_id?: string | null
  error?: string
}

/** Mirror of post-to-facebook/route.ts. */
async function postToFacebook(post: PostingGateRow, hashtags: string[] | null): Promise<PlatformPostResult> {
  const PAGE_ID = envTrim('FACEBOOK_PAGE_ID')
  const PAGE_TOKEN = envTrim('FACEBOOK_PAGE_ACCESS_TOKEN')
  if (!PAGE_ID || !PAGE_TOKEN) {
    return { ok: false, error: 'Facebook Page credentials not configured' }
  }
  const tagStr = (hashtags ?? []).map(h => `#${h}`).join(' ')
  const message = `${post.caption ?? ''}\n\n${tagStr}`.trim()

  if (nonEmpty(post.image_url)) {
    const photoRes = await fetch(`${GRAPH_API}/${PAGE_ID}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: post.image_url, caption: message, access_token: PAGE_TOKEN }),
    })
    const photoData = await photoRes.json().catch(() => ({}))
    if (photoRes.ok && !photoData.error && photoData.id) {
      return { ok: true, platform_post_id: photoData.id as string }
    }
    // Fall back to text-only feed post.
    const feedRes = await fetch(`${GRAPH_API}/${PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: PAGE_TOKEN }),
    })
    const feedData = await feedRes.json().catch(() => ({}))
    if (!feedRes.ok || feedData.error) {
      return { ok: false, error: feedData.error?.message ?? 'Facebook feed post failed' }
    }
    return { ok: true, platform_post_id: feedData.id as string }
  }

  // Text-only path.
  const res = await fetch(`${GRAPH_API}/${PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: PAGE_TOKEN }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) return { ok: false, error: data.error?.message ?? 'Facebook feed post failed' }
  return { ok: true, platform_post_id: data.id as string }
}

/** Mirror of post-to-instagram/route.ts: container → wait up to 6s → publish. */
async function postToInstagram(post: PostingGateRow, hashtags: string[] | null): Promise<PlatformPostResult> {
  const IG_ACCOUNT_ID = envTrim('INSTAGRAM_BUSINESS_ACCOUNT_ID')
  const IG_TOKEN = envTrim('INSTAGRAM_ACCESS_TOKEN')
  if (!IG_ACCOUNT_ID || !IG_TOKEN) {
    return { ok: false, error: 'Instagram credentials not configured' }
  }
  if (!nonEmpty(post.image_url)) {
    return { ok: false, error: 'Instagram requires an image — no image_url found on this post' }
  }
  const tagStr = (hashtags ?? []).map(h => `#${h}`).join(' ')
  const caption = `${post.caption ?? ''}\n\n${tagStr}`.trim()

  // 1. Create container.
  const cRes = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: IG_TOKEN, caption, image_url: post.image_url, media_type: 'IMAGE' }),
  })
  const cData = await cRes.json().catch(() => ({}))
  if (!cRes.ok || cData.error || !cData.id) {
    return { ok: false, error: `Container creation failed: ${cData.error?.message ?? 'unknown'}` }
  }
  const containerId = cData.id as string

  // 2. Wait for container ready (up to 6s).
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1000))
    const sRes = await fetch(`${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${IG_TOKEN}`)
    const sData = await sRes.json().catch(() => ({}))
    if (sData.error) return { ok: false, error: `Status check failed: ${sData.error.message}` }
    if (sData.status_code === 'FINISHED') break
    if (sData.status_code === 'ERROR' || sData.status_code === 'EXPIRED') {
      return { ok: false, error: `Container failed processing: ${sData.status_code}` }
    }
    if (i === 5) return { ok: false, error: 'Container still IN_PROGRESS after 6 seconds' }
  }

  // 3. Publish.
  const pRes = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: IG_TOKEN }),
  })
  const pData = await pRes.json().catch(() => ({}))
  if (!pRes.ok || pData.error || !pData.id) {
    return { ok: false, error: `Publish failed: ${pData.error?.message ?? 'unknown'}` }
  }
  return { ok: true, platform_post_id: pData.id as string }
}

/** Mirror of post-to-tiktok/route.ts: token resolution → Direct Post init. */
async function postToTikTok(post: PostingGateRow, hashtags: string[] | null, supabase: SupabaseAdmin): Promise<PlatformPostResult> {
  if (!nonEmpty(post.video_url)) {
    return { ok: false, error: 'TikTok requires a video — no video_url found on this post' }
  }
  let accessToken: string
  try {
    accessToken = await getValidTikTokAccessToken(supabase)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'TikTok token resolution failed' }
  }

  const tagStr = (hashtags ?? []).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')
  const baseCaption = (post.caption ?? '').trim()
  const fullTitle = tagStr ? `${baseCaption}\n\n${tagStr}` : baseCaption
  const title = fullTitle.length <= TIKTOK_CAPTION_MAX ? fullTitle : fullTitle.slice(0, TIKTOK_CAPTION_MAX - 1) + '…'

  const allowedPrivacy = new Set(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'])
  const rawPrivacy = envTrim('TIKTOK_PRIVACY_LEVEL').toUpperCase()
  const privacy_level = allowedPrivacy.has(rawPrivacy) ? rawPrivacy : 'SELF_ONLY'

  const initBody = {
    post_info: {
      title,
      privacy_level,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: post.video_url!,
    },
  }

  const res = await fetch(TIKTOK_INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(initBody),
  })
  const data = await res.json().catch(() => ({}))
  const errPayload = data?.error
  const publishId = data?.data?.publish_id as string | undefined
  const hasError = !!errPayload && errPayload.code && errPayload.code !== 'ok'
  if (!res.ok || hasError || !publishId) {
    const reason = errPayload?.message ?? `HTTP ${res.status}`
    return { ok: false, error: `TikTok publish init failed: ${reason}` }
  }
  return { ok: true, platform_post_id: publishId }
}

async function readKillSwitch(supabase: SupabaseAdmin): Promise<'enabled' | 'disabled'> {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', KILL_SWITCH_KEY)
    .maybeSingle()
  const value = (data?.value as string | undefined)?.trim().toLowerCase()
  return value === 'true' ? 'enabled' : 'disabled'
}

async function flipKillSwitchToDisabled(supabase: SupabaseAdmin, reason: string): Promise<void> {
  await supabase
    .from('site_settings')
    .upsert(
      { key: KILL_SWITCH_KEY, value: 'false', description: `auto-disabled: ${reason}`, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
}

/**
 * Phase 14U — fire a critical alert email when the kill switch auto-flips.
 *
 * Best-effort: this function NEVER throws. If ADMIN_NOTIFICATION_EMAIL is
 * unset OR Resend rejects the send, we log a warning and continue. The
 * cron's primary job is bookkeeping integrity (atomic UPDATE + kill switch
 * flip); the email is an operator notification on top, not a hard
 * dependency.
 */
async function sendKillSwitchAlert(args: {
  reason: string
  platform: string | null
  rowId: string | null
  platformPostId?: string | null
  detail?: Record<string, unknown>
}): Promise<void> {
  const adminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL ?? '').trim()
  if (!adminEmail) {
    console.warn('[autoposter-once] kill-switch alert email skipped — ADMIN_NOTIFICATION_EMAIL not configured', {
      reason: args.reason,
    })
    return
  }

  const subject = '🚨 URGENT: VortexTrips Autoposter Halted'
  const detailLines = args.detail
    ? Object.entries(args.detail).map(
        ([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`,
      )
    : []

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1A1A2E; max-width: 640px;">
      <h1 style="color: #C53030; font-size: 22px; margin-bottom: 8px;">🚨 VortexTrips Autoposter Halted</h1>
      <p style="color: #4A5568; margin-top: 0;">
        The autoposter cron at <code>/api/cron/autoposter-once</code> hit a definitive failure
        and auto-disabled itself. Daily posting is paused until you investigate and re-enable.
      </p>

      <div style="background: #FFF5F5; border-left: 4px solid #C53030; padding: 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px 0;"><strong>Reason:</strong> ${escapeHtml(args.reason)}</p>
        ${args.platform ? `<p style="margin: 0 0 4px 0;"><strong>Platform:</strong> ${escapeHtml(args.platform)}</p>` : ''}
        ${args.rowId ? `<p style="margin: 0 0 4px 0;"><strong>content_calendar.id:</strong> <code>${escapeHtml(args.rowId)}</code></p>` : ''}
        ${args.platformPostId ? `<p style="margin: 0 0 4px 0;"><strong>Platform post id:</strong> <code>${escapeHtml(args.platformPostId)}</code></p>` : ''}
      </div>

      ${detailLines.length > 0 ? `<p style="font-weight: 600; margin-bottom: 4px;">Additional context:</p><ul style="color: #4A5568; padding-left: 20px;">${detailLines.join('')}</ul>` : ''}

      <h2 style="font-size: 16px; margin-top: 24px;">Next steps</h2>
      <ol style="color: #4A5568; padding-left: 20px;">
        <li>Open the <strong>System Status &amp; Kill Switch</strong> card on the AI Command Center dashboard for current state and last-change reason.</li>
        <li>Run <code>node scripts/audit-pre-autoposter-readiness.js</code> to confirm DB invariants are intact.</li>
        ${args.platformPostId ? '<li><strong>Critical:</strong> the platform post may have landed but the DB UPDATE failed. Verify on the platform UI and reconcile with <code>scripts/repair-posted-at-invariants.js</code> if needed.</li>' : ''}
        <li>Once the root cause is fixed, re-enable from the dashboard kill switch (or run <code>UPDATE site_settings SET value='true' WHERE key='${KILL_SWITCH_KEY}'</code>).</li>
      </ol>

      <p style="color: #A0AEC0; font-size: 12px; margin-top: 24px;">
        Sent automatically by the autoposter cron route. To stop receiving these alerts, unset
        <code>ADMIN_NOTIFICATION_EMAIL</code> in Vercel env vars (note: the cron will still
        auto-disable, you just won't be emailed about it).
      </p>
    </div>
  `

  try {
    await sendEmail({ to: adminEmail, subject, html })
    console.log('[autoposter-once] kill-switch alert email sent', { to: adminEmail, reason: args.reason })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.warn('[autoposter-once] kill-switch alert email failed (non-fatal)', { to: adminEmail, error: message })
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function snapshotPostedCounts(supabase: SupabaseAdmin): Promise<{ posted_at: number; status_posted: number }> {
  const [postedAt, statusPosted] = await Promise.all([
    supabase.from('content_calendar').select('id', { count: 'exact', head: true }).not('posted_at', 'is', null),
    supabase.from('content_calendar').select('id', { count: 'exact', head: true }).eq('status', 'posted'),
  ])
  return {
    posted_at: postedAt.count ?? 0,
    status_posted: statusPosted.count ?? 0,
  }
}

export async function GET(request: NextRequest) {
  // Auth — same Bearer-token pattern as the other 4 cron routes.
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${envTrim('CRON_SECRET')}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()

  // Kill switch — operator must explicitly enable. Missing key = disabled.
  const switchState = await readKillSwitch(supabase)
  if (switchState === 'disabled') {
    console.log('[autoposter-once] cron disabled', { startedAt, kill_switch: KILL_SWITCH_KEY })
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'cron_disabled',
      message: `Cron is gated by site_settings.${KILL_SWITCH_KEY}. Set value='true' to enable.`,
      started_at: startedAt,
    })
  }

  // Pre-flight snapshot.
  const before = await snapshotPostedCounts(supabase)

  // Eligibility — read at most 5 candidates; we only post if exactly 1 is eligible.
  let plan
  try {
    plan = await getAutoposterEligibleRows({ limit: 5 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'eligibility query failed'
    console.error('[autoposter-once] eligibility query failed', { error: message })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }

  if (plan.eligible.length === 0) {
    console.log('[autoposter-once] no eligible row', { startedAt, skipped_count: plan.skipped.length })
    return NextResponse.json({
      success: true,
      posted: 0,
      reason: 'no_eligible_rows',
      eligible_count: 0,
      skipped_count: plan.skipped.length,
      started_at: startedAt,
    })
  }

  if (plan.eligible.length > 1) {
    // Operator-fixable; do NOT auto-disable. Operator should Unqueue all but one.
    const ids = plan.eligible.map(r => r.id)
    console.warn('[autoposter-once] queue size > 1 — refusing', { startedAt, queue: ids })
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'queue_size_gt_1',
      eligible_count: plan.eligible.length,
      eligible_ids: ids,
      message: 'One-row-per-cron is a hard guardrail. Unqueue all but one row, then wait for the next cron tick.',
      started_at: startedAt,
    })
  }

  const chosen = plan.eligible[0]
  const platform = (chosen.platform ?? '').toLowerCase().trim()

  if (REFUSED_PLATFORMS.has(platform)) {
    console.warn('[autoposter-once] refused platform', { row_id: chosen.id, platform })
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'refused_platform',
      platform,
      message: 'Twitter/X was permanently removed in Phase 14Q. Historical rows are read-only.',
      started_at: startedAt,
    })
  }
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    console.warn('[autoposter-once] unsupported platform', { row_id: chosen.id, platform })
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'unsupported_platform',
      platform,
      message: 'Supported: facebook, instagram, tiktok.',
      started_at: startedAt,
    })
  }

  // Re-fetch the chosen row with the joined media SELECT so the gate sees the
  // same shape the manual platform routes use. Defense-in-depth: even though
  // getAutoposterEligibleRows already validated this row, the gate runs again
  // here against the freshly-fetched data.
  const { data: rawPost, error: fetchErr } = await supabase
    .from('content_calendar')
    .select(`hashtags, ${POSTING_GATE_ROW_SELECT_WITH_MEDIA}`)
    .eq('id', chosen.id)
    .single()
  if (fetchErr || !rawPost) {
    console.error('[autoposter-once] re-fetch failed', { row_id: chosen.id, error: fetchErr?.message })
    return NextResponse.json({ success: false, error: 'Re-fetch failed' }, { status: 500 })
  }

  const post = flattenPostingGateRow(rawPost)
  if (!post) {
    return NextResponse.json({ success: false, error: 'Re-fetch returned no row' }, { status: 500 })
  }

  // Defense-in-depth gate. Mirrors exactly what the manual route on this
  // platform calls. supportedPlatforms is single-element so we never cross-fire.
  const gate = validateManualPostingGate(post, { supportedPlatforms: [platform] })
  if (!gate.allowed) {
    console.warn('[autoposter-once] gate refused row at apply time', { row_id: chosen.id, platform, reasons: gate.reasons })
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'gate_refused_at_apply',
      platform,
      gate_reasons: gate.reasons,
      started_at: startedAt,
    })
  }

  const rawHashtags = (rawPost as unknown as { hashtags?: string[] | null }).hashtags ?? null

  // Platform call.
  let result: PlatformPostResult
  try {
    if (platform === 'facebook') {
      result = await postToFacebook(post, rawHashtags)
    } else if (platform === 'instagram') {
      result = await postToInstagram(post, rawHashtags)
    } else {
      // tiktok
      result = await postToTikTok(post, rawHashtags, supabase)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Platform call threw'
    console.error('[autoposter-once] platform call exception', { row_id: chosen.id, platform, error: message })
    // Network / unexpected exceptions: do NOT auto-disable (likely transient).
    return NextResponse.json(
      { success: false, error: message, platform, row_id: chosen.id },
      { status: 500 },
    )
  }

  if (!result.ok) {
    // Definitive platform-side failure — flip the kill switch to 'false' so
    // the next scheduled tick stays quiet until the operator diagnoses + re-enables.
    const failureReason = `${platform} post failed at row ${chosen.id}: ${result.error ?? 'unknown'}`
    await flipKillSwitchToDisabled(supabase, failureReason)
    console.error('[autoposter-once] platform post failed — auto-disabled cron', {
      row_id: chosen.id,
      platform,
      error: result.error,
    })
    await sendKillSwitchAlert({
      reason: failureReason,
      platform,
      rowId: chosen.id,
      detail: { platform_error: result.error ?? 'unknown' },
    })
    return NextResponse.json(
      {
        success: false,
        error: result.error ?? 'Platform call failed',
        platform,
        row_id: chosen.id,
        kill_switch: 'disabled',
        message: `Cron auto-disabled. Diagnose, then re-enable via UPDATE site_settings SET value='true' WHERE key='${KILL_SWITCH_KEY}'.`,
      },
      { status: 500 },
    )
  }

  // Atomic UPDATE — same defensive guards the manual routes and runner use.
  const { error: updErr, count: updateCount } = await supabase
    .from('content_calendar')
    .update(
      { status: 'posted', posted_at: new Date().toISOString() },
      { count: 'exact' },
    )
    .eq('id', chosen.id)
    .eq('status', 'approved')
    .is('posted_at', null)

  if (updErr) {
    // Platform post landed but DB didn't flip — operator MUST manually
    // reconcile. Auto-disable so we don't keep posting without bookkeeping.
    const failureReason = `DB update failed after ${platform} post landed at row ${chosen.id}: ${updErr.message}`
    await flipKillSwitchToDisabled(supabase, failureReason)
    console.error('[autoposter-once] CRITICAL: DB update failed after platform post landed — auto-disabled cron', {
      row_id: chosen.id,
      platform,
      platform_post_id: result.platform_post_id,
      error: updErr.message,
    })
    await sendKillSwitchAlert({
      reason: failureReason,
      platform,
      rowId: chosen.id,
      platformPostId: result.platform_post_id ?? null,
      detail: { db_error: updErr.message, severity: 'CRITICAL — platform post may have landed; manual reconciliation required' },
    })
    return NextResponse.json(
      {
        success: false,
        warning: 'Platform post landed but DB update failed — manual reconciliation required',
        platform,
        platform_post_id: result.platform_post_id,
        row_id: chosen.id,
        error: updErr.message,
        kill_switch: 'disabled',
      },
      { status: 500 },
    )
  }
  if ((updateCount ?? 0) !== 1) {
    const failureReason = `DB update affected ${updateCount} rows after ${platform} post at row ${chosen.id}`
    await flipKillSwitchToDisabled(supabase, failureReason)
    console.error('[autoposter-once] CRITICAL: DB update affected unexpected count — auto-disabled cron', {
      row_id: chosen.id,
      platform,
      platform_post_id: result.platform_post_id,
      update_count: updateCount,
    })
    await sendKillSwitchAlert({
      reason: failureReason,
      platform,
      rowId: chosen.id,
      platformPostId: result.platform_post_id ?? null,
      detail: { update_count: updateCount, severity: 'CRITICAL — platform post landed; manual reconciliation required' },
    })
    return NextResponse.json(
      {
        success: false,
        warning: `Platform post landed but DB UPDATE affected ${updateCount} rows (expected 1) — manual reconciliation required`,
        platform,
        platform_post_id: result.platform_post_id,
        row_id: chosen.id,
        kill_switch: 'disabled',
      },
      { status: 500 },
    )
  }

  // Post-flight snapshot. If the deltas don't match, auto-disable so the
  // operator investigates before the next tick. Posted_at delta should be +1
  // and status='posted' delta should be +1.
  const after = await snapshotPostedCounts(supabase)
  const postedAtDelta = after.posted_at - before.posted_at
  const statusDelta = after.status_posted - before.status_posted

  if (postedAtDelta !== 1 || statusDelta !== 1) {
    const failureReason = `post-flight invariant slip at row ${chosen.id}: posted_at_delta=${postedAtDelta}, status_delta=${statusDelta}`
    await flipKillSwitchToDisabled(supabase, failureReason)
    console.error('[autoposter-once] CRITICAL: post-flight invariant slip — auto-disabled cron', {
      row_id: chosen.id,
      platform,
      platform_post_id: result.platform_post_id,
      before,
      after,
      posted_at_delta: postedAtDelta,
      status_delta: statusDelta,
    })
    await sendKillSwitchAlert({
      reason: failureReason,
      platform,
      rowId: chosen.id,
      platformPostId: result.platform_post_id ?? null,
      detail: {
        posted_at_before: before.posted_at,
        posted_at_after: after.posted_at,
        status_posted_before: before.status_posted,
        status_posted_after: after.status_posted,
        posted_at_delta: postedAtDelta,
        status_delta: statusDelta,
        severity: 'CRITICAL — DB counters disagree; investigate before re-enabling',
      },
    })
    return NextResponse.json(
      {
        success: false,
        warning: 'Post-flight invariant slip — manual investigation required',
        platform,
        platform_post_id: result.platform_post_id,
        row_id: chosen.id,
        before,
        after,
        kill_switch: 'disabled',
      },
      { status: 500 },
    )
  }

  console.log('[autoposter-once] posted', {
    row_id: chosen.id,
    platform,
    platform_post_id: result.platform_post_id,
    posted_at_count: after.posted_at,
    started_at: startedAt,
  })

  return NextResponse.json({
    success: true,
    posted: 1,
    platform,
    row_id: chosen.id,
    platform_post_id: result.platform_post_id,
    before,
    after,
    started_at: startedAt,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
