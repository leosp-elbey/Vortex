#!/usr/bin/env node
/**
 * Phase 14L.2.5 — Read-only inspector for TikTok rows missing video_script.
 *
 * Lists rows where:
 *   - platform = 'tiktok'
 *   - posted_at IS NULL
 *   - status NOT IN posted/rejected/archived
 *   - video_url IS NULL
 *   - video_script IS NULL or empty
 *
 * No mutations. No provider calls. No platform calls.
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
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

function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0 }
const TERMINAL = new Set(['posted', 'rejected', 'archived'])

async function main() {
  const env = loadEnvLocal()
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('content_calendar')
    .select('id, platform, status, week_of, caption, hashtags, image_prompt, video_url, video_script, tracking_url, campaign_asset_id, posted_at')
    .eq('platform', 'tiktok')
    .is('posted_at', null)
    .is('video_url', null)
    .order('week_of', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) { console.error(error.message); process.exit(2) }

  const target = (data ?? []).filter(r =>
    !TERMINAL.has((r.status ?? '').toLowerCase()) &&
    !nonEmpty(r.video_script)
  )

  console.log()
  console.log(`${COLORS.bold}TikTok rows missing video_script (Phase 14L.2.5)${COLORS.reset}`)
  console.log(`   total: ${target.length}`)
  console.log()
  for (const r of target.slice(0, 5)) {
    console.log(`${COLORS.cyan}${r.id}${COLORS.reset}`)
    console.log(`   week_of:        ${r.week_of}`)
    console.log(`   status:         ${r.status}`)
    console.log(`   campaign_asset: ${r.campaign_asset_id ?? '(none — organic)'}`)
    console.log(`   tracking_url:   ${r.tracking_url ?? '(none)'}`)
    const hashtags = Array.isArray(r.hashtags) ? r.hashtags.slice(0, 6).join(' ') : ''
    console.log(`   hashtags:       ${hashtags || '(none)'}`)
    console.log(`   image_prompt:   ${nonEmpty(r.image_prompt) ? r.image_prompt.slice(0, 120) + (r.image_prompt.length > 120 ? '…' : '') : '(none)'}`)
    console.log(`   caption:        ${nonEmpty(r.caption) ? r.caption.slice(0, 200).replace(/\s+/g, ' ') + (r.caption.length > 200 ? '…' : '') : '(none)'}`)
    console.log()
  }
  if (target.length > 5) console.log(`${COLORS.dim}… +${target.length - 5} more${COLORS.reset}`)
}

main().catch(err => { console.error(err); process.exit(99) })
