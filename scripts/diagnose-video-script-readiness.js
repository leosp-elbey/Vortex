#!/usr/bin/env node
/**
 * Phase 14L.2.5 — Read-only video-script readiness diagnostic.
 *
 * Reports for unposted TikTok rows:
 *   - missing video_url
 *   - have video_script but no video_url (HeyGen-eligible)
 *   - have neither (script-backfill candidates for Phase 14L.2.5)
 *   - rows that would become HeyGen-eligible after script generation
 *   - posted_at row-count cross-check (must be unchanged)
 *
 * No platform calls. No AI calls. No mutations.
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

const TERMINAL = new Set(['posted', 'rejected', 'archived'])

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

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${COLORS.reset}`)
    process.exit(1)
  }
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log()
  console.log(`${COLORS.bold}Phase 14L.2.5 — Video-Script Readiness Diagnostic${COLORS.reset}`)
  console.log(`${COLORS.dim}Read-only. No platform calls. No AI calls. No mutations.${COLORS.reset}`)
  console.log()

  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  const { data, error } = await supabase
    .from('content_calendar')
    .select('id, platform, status, video_url, video_script, posted_at, week_of')
    .eq('platform', 'tiktok')
    .order('week_of', { ascending: true, nullsFirst: false })
    .limit(2000)
  if (error) { console.error(error.message); process.exit(2) }

  const all = data ?? []
  const unposted = all.filter(r => !r.posted_at && !TERMINAL.has((r.status ?? '').toLowerCase()))

  const missingVideoUrl = unposted.filter(r => !nonEmpty(r.video_url))
  const hasScriptNoVideo = unposted.filter(r => !nonEmpty(r.video_url) && nonEmpty(r.video_script))
  const noScriptNoVideo  = unposted.filter(r => !nonEmpty(r.video_url) && !nonEmpty(r.video_script))
  const hasVideo         = unposted.filter(r =>  nonEmpty(r.video_url))

  console.log(`${COLORS.bold}TikTok unposted population${COLORS.reset}`)
  console.log(`   total unposted TikTok rows:                       ${unposted.length}`)
  console.log()

  console.log(`${COLORS.bold}1. video_url status${COLORS.reset}`)
  console.log(`   ${COLORS.green}has video_url:${COLORS.reset}                                   ${hasVideo.length}`)
  console.log(`   ${COLORS.yellow}missing video_url:${COLORS.reset}                              ${missingVideoUrl.length}`)
  console.log()

  console.log(`${COLORS.bold}2. Script presence (rows still missing video_url)${COLORS.reset}`)
  console.log(`   ${COLORS.cyan}have video_script — HeyGen-eligible NOW:${COLORS.reset}        ${hasScriptNoVideo.length}`)
  console.log(`   ${COLORS.red}no video_script — script-backfill candidates:${COLORS.reset}   ${noScriptNoVideo.length}`)
  console.log()

  console.log(`${COLORS.bold}3. Projected HeyGen-eligible after Phase 14L.2.5 backfill${COLORS.reset}`)
  console.log(`   ${COLORS.green}rows that would be HeyGen-ready after script generation:${COLORS.reset} ${hasScriptNoVideo.length + noScriptNoVideo.length}`)
  console.log(`   ${COLORS.dim}(every script-backfill candidate becomes HeyGen-eligible once a script lands)${COLORS.reset}`)
  console.log()

  console.log(`${COLORS.bold}4. Sample rows missing scripts (first 5)${COLORS.reset}`)
  for (const r of noScriptNoVideo.slice(0, 5)) {
    console.log(`   ${COLORS.dim}${r.id}${COLORS.reset} week_of=${r.week_of}  status=${r.status}`)
  }
  if (noScriptNoVideo.length > 5) console.log(`   ${COLORS.dim}… +${noScriptNoVideo.length - 5} more${COLORS.reset}`)
  console.log()

  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  console.log(postedBefore === postedAfter
    ? `${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`
    : `${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`
  )
  console.log(`${COLORS.dim}No platform API calls. No AI calls. Read-only.${COLORS.reset}`)
}

main().catch(err => { console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err); process.exit(99) })
