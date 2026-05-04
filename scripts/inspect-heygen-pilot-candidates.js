#!/usr/bin/env node
/**
 * Phase 14L.2.2 — HeyGen pilot candidate inspector.
 *
 * Lists the unposted rows that are eligible to be queued for a HeyGen
 * render. Eligibility:
 *   - row is unposted (status NOT IN posted/rejected/archived; posted_at IS NULL)
 *   - platform is one that requires video (today: tiktok / youtube)
 *   - video_url is empty (already-resolved rows are excluded)
 *   - a usable script is available (video_script OR video_prompt)
 *
 * Read-only. No provider calls. No mutations.
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0 }

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error(`${COLORS.red}.env.local not found at ${envPath}${COLORS.reset}`)
    process.exit(1)
  }
  const text = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

const VIDEO_REQUIRED_PLATFORMS = new Set(['tiktok', 'youtube'])
const TERMINAL = new Set(['posted', 'rejected', 'archived'])

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${COLORS.reset}`)
    process.exit(1)
  }
  let createClient
  try { ;({ createClient } = require('@supabase/supabase-js')) }
  catch { console.error(`${COLORS.red}@supabase/supabase-js not installed.${COLORS.reset}`); process.exit(1) }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log()
  console.log(`${COLORS.bold}Phase 14L.2.2 — HeyGen Pilot Candidates${COLORS.reset}`)
  console.log(`${COLORS.dim}Read-only. No provider calls. No mutations.${COLORS.reset}`)
  console.log()

  const { data: rows, error } = await supabase
    .from('content_calendar')
    .select(
      'id, platform, status, week_of, video_url, video_script, image_prompt, posted_at, ' +
      'campaign_asset_id, media_status, media_source, ' +
      'campaign_asset:campaign_assets!campaign_asset_id(id, asset_type, video_url, body)'
    )
    .order('week_of', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) { console.error(error.message); process.exit(2) }

  const eligible = []
  const blockedNoScript = []
  for (const r of rows ?? []) {
    if (r.posted_at) continue
    if (TERMINAL.has((r.status ?? '').toLowerCase())) continue
    const platform = (r.platform ?? '').toLowerCase()
    if (!VIDEO_REQUIRED_PLATFORMS.has(platform)) continue
    const ca = Array.isArray(r.campaign_asset) ? (r.campaign_asset[0] ?? null) : (r.campaign_asset ?? null)
    const videoUrl = ca?.video_url ?? r.video_url ?? null
    if (nonEmpty(videoUrl)) continue
    // Match the diagnostic's eligibility rule exactly: only
    // content_calendar.video_script counts. campaign_asset.body is often a
    // CTA snippet (~100-130 chars), not a real video script — excluded.
    const script = nonEmpty(r.video_script) ? r.video_script : null
    if (!nonEmpty(script)) {
      blockedNoScript.push({ id: r.id, platform, week_of: r.week_of, has_campaign_asset: !!ca })
      continue
    }
    eligible.push({
      content_calendar_id: r.id,
      campaign_asset_id: r.campaign_asset_id ?? null,
      target_table: r.campaign_asset_id ? 'campaign_assets' : 'content_calendar',
      platform,
      week_of: r.week_of,
      script_length: script.trim().length,
      script_preview: script.trim().slice(0, 120) + (script.trim().length > 120 ? '…' : ''),
    })
  }

  console.log(`${COLORS.bold}Eligible (have script, no video_url yet)${COLORS.reset}`)
  console.log(`   total: ${eligible.length}`)
  for (const e of eligible) {
    console.log(`   ${COLORS.cyan}${e.content_calendar_id}${COLORS.reset} ${e.platform} ${e.week_of}  → ${e.target_table}`)
    console.log(`     script: ${e.script_length} chars · ${COLORS.dim}${e.script_preview}${COLORS.reset}`)
  }
  console.log()

  console.log(`${COLORS.bold}Blocked (video required, no script available)${COLORS.reset}`)
  console.log(`   total: ${blockedNoScript.length}`)
  console.log()

  // Recommendation: pilot the first eligible row deterministically.
  if (eligible.length > 0) {
    const pick = eligible[0]
    console.log(`${COLORS.bold}Recommended pilot row${COLORS.reset}`)
    console.log(`   ${COLORS.green}${pick.content_calendar_id}${COLORS.reset}`)
    console.log(`   ${COLORS.dim}Use:${COLORS.reset} node scripts/generate-missing-media.js --videos-only --provider=heygen --limit=1 --id=${pick.content_calendar_id}`)
  } else {
    console.log(`${COLORS.yellow}No eligible HeyGen pilot rows.${COLORS.reset}`)
  }
}

main().catch(err => { console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err); process.exit(99) })
