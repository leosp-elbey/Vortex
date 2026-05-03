#!/usr/bin/env node
/**
 * Phase 14I — read-only diagnostic for campaign click attribution.
 *
 * Verifies:
 *   1. Migration 027 columns exist on contact_events.
 *   2. Recent contact_events with utm_medium='event_campaign' counts.
 *   3. Grouped counts by utm_campaign over the last 30 days.
 *   4. Whether the Art Basel campaign has any click rows attributed (FK or UTM).
 *
 * Pulls only — never writes. Run from project root:
 *   node scripts/diagnose-campaign-click-attribution.js
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

const REQUIRED_COLUMNS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'event_campaign_id',
  'campaign_asset_id',
  'content_calendar_id',
]

const LOOKBACK_DAYS = 30

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
  console.log(`${COLORS.bold}Phase 14I — Campaign Click Attribution Diagnostic${COLORS.reset}`)
  console.log()

  // 1. Schema check — does migration 027 exist on the live DB?
  // We test by selecting the columns; if any are missing, supabase returns an error
  // pointing at the missing column.
  console.log(`${COLORS.bold}1. Schema check${COLORS.reset}`)
  const { error: schemaErr } = await supabase
    .from('contact_events')
    .select(REQUIRED_COLUMNS.join(', '))
    .limit(1)

  if (schemaErr) {
    console.log(
      `   ${COLORS.red}✗ Migration 027 not yet applied (or partial):${COLORS.reset} ${schemaErr.message}`,
    )
    console.log(`   ${COLORS.dim}Apply supabase/migrations/027_add_utm_fields_to_contact_events.sql to proceed.${COLORS.reset}`)
    process.exit(2)
  }
  console.log(`   ${COLORS.green}✓ All Phase 14I columns present on contact_events.${COLORS.reset}`)
  console.log()

  // 2. Total campaign-attributed events in lookback window.
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  console.log(`${COLORS.bold}2. Campaign clicks in last ${LOOKBACK_DAYS} days${COLORS.reset}`)

  const { data: rows, error: rowsErr } = await supabase
    .from('contact_events')
    .select('id, event, utm_source, utm_medium, utm_campaign, utm_content, event_campaign_id, campaign_asset_id, content_calendar_id, created_at')
    .eq('utm_medium', 'event_campaign')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500)

  if (rowsErr) {
    console.error(`   ${COLORS.red}Query failed:${COLORS.reset} ${rowsErr.message}`)
    process.exit(3)
  }

  const total = rows?.length ?? 0
  console.log(`   ${COLORS.dim}Rows returned (capped at 500):${COLORS.reset} ${total}`)
  if (total === 0) {
    console.log(`   ${COLORS.yellow}No campaign-attributed contact_events in the last ${LOOKBACK_DAYS} days yet.${COLORS.reset}`)
    console.log(`   ${COLORS.dim}This is expected until a posted asset receives traffic.${COLORS.reset}`)
  }
  console.log()

  // 3. Group by utm_campaign + resolution status.
  if (total > 0) {
    console.log(`${COLORS.bold}3. By utm_campaign${COLORS.reset}`)
    const byCampaign = new Map()
    for (const r of rows) {
      const key = r.utm_campaign ?? '(null)'
      const entry = byCampaign.get(key) ?? {
        total: 0,
        page_view: 0,
        with_event_campaign_fk: 0,
        with_asset_fk: 0,
      }
      entry.total++
      if (r.event === 'page_view') entry.page_view++
      if (r.event_campaign_id) entry.with_event_campaign_fk++
      if (r.campaign_asset_id) entry.with_asset_fk++
      byCampaign.set(key, entry)
    }
    const sorted = [...byCampaign.entries()].sort((a, b) => b[1].total - a[1].total)
    for (const [campaign, e] of sorted) {
      console.log(
        `   ${COLORS.yellow}${campaign}${COLORS.reset}: ${e.total} total, ${e.page_view} page_view, ${e.with_event_campaign_fk} FK-resolved, ${e.with_asset_fk} asset-resolved`,
      )
    }
    console.log()
  }

  // 4. Art Basel-specific check.
  console.log(`${COLORS.bold}4. Art Basel attribution${COLORS.reset}`)
  const { data: artBasel } = await supabase
    .from('event_campaigns')
    .select('id, campaign_name, event_slug, event_year')
    .ilike('event_slug', 'art-basel-miami-beach')
    .limit(1)
    .maybeSingle()

  if (!artBasel) {
    console.log(`   ${COLORS.dim}Art Basel Miami Beach campaign not found in event_campaigns. Skipping.${COLORS.reset}`)
  } else {
    console.log(`   Found: ${artBasel.campaign_name} (id=${artBasel.id}, slug=${artBasel.event_slug}, year=${artBasel.event_year})`)
    const { count: fkCount } = await supabase
      .from('contact_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_campaign_id', artBasel.id)
    const { count: utmCount } = await supabase
      .from('contact_events')
      .select('id', { count: 'exact', head: true })
      .eq('utm_medium', 'event_campaign')
      .ilike('utm_campaign', `${artBasel.event_slug}_${artBasel.event_year}%`)
    console.log(`   ${COLORS.dim}FK-attributed contact_events:${COLORS.reset}  ${fkCount ?? 0}`)
    console.log(`   ${COLORS.dim}UTM-substring matches (any FK):${COLORS.reset} ${utmCount ?? 0}`)
    if ((fkCount ?? 0) === 0 && (utmCount ?? 0) === 0) {
      console.log(`   ${COLORS.yellow}No Art Basel clicks captured yet. Expected until a posted asset receives traffic.${COLORS.reset}`)
    } else {
      console.log(`   ${COLORS.green}✓ Art Basel has campaign-attributed contact_events.${COLORS.reset}`)
    }
  }
  console.log()
  console.log(`${COLORS.dim}Diagnostic read-only — no rows written.${COLORS.reset}`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
