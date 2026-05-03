#!/usr/bin/env node
/**
 * Phase 14J.2.1 — read-only diagnostic for the /t/<slug> branded redirect.
 *
 * Lists recent `branded_redirect` rows from contact_events and surfaces:
 *   - route_slug
 *   - redirect_target
 *   - redirect_reason  (campaign_cta_url / portal_fallback / slug_unmatched / empty_slug / final_fallback)
 *   - resolved campaign / asset / calendar IDs
 *   - UTM tags
 *
 * Confirms no `slug_unmatched` or `final_fallback` reasons are observed for
 * known good slugs (Art Basel by default — override with the first CLI arg).
 *
 * Run from project root:
 *   node scripts/diagnose-branded-redirect.js
 *   node scripts/diagnose-branded-redirect.js art-basel-miami-beach
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

const KNOWN_GOOD_SLUG = (process.argv[2] || 'art-basel-miami-beach').toLowerCase().trim()
const LOOKBACK_HOURS = 48
const RECENT_LIMIT = 25

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error(`${COLORS.red}.env.local not found at ${envPath}${COLORS.reset}`)
    process.exit(1)
  }
  const text = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local${COLORS.reset}`)
    process.exit(1)
  }

  let createClient
  try {
    ;({ createClient } = require('@supabase/supabase-js'))
  } catch {
    console.error(`${COLORS.red}@supabase/supabase-js not installed. Run "npm install" first.${COLORS.reset}`)
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log()
  console.log(`${COLORS.bold}Phase 14J.2.1 — Branded Redirect Diagnostic${COLORS.reset}`)
  console.log(`${COLORS.dim}Known-good slug:${COLORS.reset} ${KNOWN_GOOD_SLUG}`)
  console.log(`${COLORS.dim}Lookback:${COLORS.reset}        ${LOOKBACK_HOURS}h`)
  console.log()

  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString()

  // 1. Pull recent branded_redirect rows.
  console.log(`${COLORS.bold}1. Recent branded_redirect events${COLORS.reset}`)
  const { data: rows, error } = await supabase
    .from('contact_events')
    .select('id, event, utm_source, utm_medium, utm_campaign, utm_content, event_campaign_id, campaign_asset_id, content_calendar_id, metadata, created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT * 4)

  if (error) {
    console.error(`   ${COLORS.red}Query failed:${COLORS.reset} ${error.message}`)
    process.exit(2)
  }

  const branded = (rows ?? []).filter(r => {
    const meta = (r.metadata && typeof r.metadata === 'object') ? r.metadata : {}
    return meta.source === 'branded_redirect'
  })

  console.log(`   ${COLORS.dim}Total branded_redirect events in last ${LOOKBACK_HOURS}h:${COLORS.reset} ${branded.length}`)
  if (branded.length === 0) {
    console.log(`   ${COLORS.yellow}No clicks captured yet. Click a /t/<slug> link to generate one.${COLORS.reset}`)
    console.log()
    console.log(`${COLORS.dim}Diagnostic read-only — no rows written.${COLORS.reset}`)
    return
  }
  console.log()

  // 2. Tabular listing of the most recent N rows.
  console.log(`${COLORS.bold}2. Last ${Math.min(branded.length, RECENT_LIMIT)} events${COLORS.reset}`)
  for (const r of branded.slice(0, RECENT_LIMIT)) {
    const meta = (r.metadata && typeof r.metadata === 'object') ? r.metadata : {}
    const reason = meta.redirect_reason ?? '(missing)'
    const target = meta.redirect_target ?? '(missing)'
    const slug = meta.route_slug ?? '(missing)'
    const reasonColor =
      reason === 'campaign_cta_url' ? COLORS.green :
      reason === 'portal_fallback'  ? COLORS.yellow :
      COLORS.red
    console.log(`   ${COLORS.dim}${r.created_at}${COLORS.reset}`)
    console.log(`     slug:   ${slug}`)
    console.log(`     reason: ${reasonColor}${reason}${COLORS.reset}`)
    console.log(`     target: ${target}`)
    console.log(`     utm:    source=${r.utm_source ?? '-'}  medium=${r.utm_medium ?? '-'}  campaign=${r.utm_campaign ?? '-'}  content=${r.utm_content ?? '-'}`)
    console.log(`     ids:    campaign=${r.event_campaign_id ?? '-'}  asset=${r.campaign_asset_id ?? '-'}  calendar=${r.content_calendar_id ?? '-'}`)
    console.log()
  }

  // 3. Reason distribution.
  console.log(`${COLORS.bold}3. Reason distribution${COLORS.reset}`)
  const reasonCounts = {}
  for (const r of branded) {
    const meta = (r.metadata && typeof r.metadata === 'object') ? r.metadata : {}
    const reason = meta.redirect_reason ?? '(missing)'
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1
  }
  for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    const color =
      reason === 'campaign_cta_url' ? COLORS.green :
      reason === 'portal_fallback'  ? COLORS.yellow :
      COLORS.red
    console.log(`   ${color}${reason.padEnd(20)}${COLORS.reset} ${count}`)
  }
  console.log()

  // 4. Spot-check the known-good slug.
  console.log(`${COLORS.bold}4. Known-good slug check: ${KNOWN_GOOD_SLUG}${COLORS.reset}`)
  const knownGoodHits = branded.filter(r => {
    const meta = (r.metadata && typeof r.metadata === 'object') ? r.metadata : {}
    return meta.route_slug === KNOWN_GOOD_SLUG
  })
  if (knownGoodHits.length === 0) {
    console.log(`   ${COLORS.dim}No clicks for /t/${KNOWN_GOOD_SLUG} in the last ${LOOKBACK_HOURS}h.${COLORS.reset}`)
    console.log(`   ${COLORS.dim}Click a fresh tracking URL to generate one, then re-run this script.${COLORS.reset}`)
  } else {
    const badReasons = knownGoodHits.filter(r => {
      const reason = (r.metadata?.redirect_reason ?? '')
      return reason === 'slug_unmatched' || reason === 'empty_slug' || reason === 'final_fallback'
    })
    if (badReasons.length === 0) {
      console.log(`   ${COLORS.green}✓ All ${knownGoodHits.length} known-good clicks resolved cleanly (no slug_unmatched / final_fallback).${COLORS.reset}`)
    } else {
      console.log(`   ${COLORS.red}✗ ${badReasons.length} of ${knownGoodHits.length} known-good clicks fell through to a fallback reason.${COLORS.reset}`)
      for (const r of badReasons.slice(0, 5)) {
        console.log(`     - ${r.created_at} reason=${r.metadata?.redirect_reason} target=${r.metadata?.redirect_target}`)
      }
    }
  }
  console.log()
  console.log(`${COLORS.dim}Diagnostic read-only — no rows written.${COLORS.reset}`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
