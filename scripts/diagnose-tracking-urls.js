#!/usr/bin/env node
/**
 * Phase 14H.1 patch — read-only diagnostic.
 *
 * Pulls every content_calendar row with a non-null tracking_url, joins through to
 * the linked campaign_asset + event_campaign, and flags any row whose tracking_url
 * matches a literal placeholder pattern OR has a half-formed utm_content. Mirrors
 * the SQL diagnostic in PROJECT_STATE_CURRENT.md Phase 14H.1 patch section.
 *
 * Run from project root:
 *   node scripts/diagnose-tracking-urls.js
 *
 * Prints affected rows; never writes. The repair UPDATE is documented separately
 * and must be run manually after review.
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

const PLACEHOLDER_SUBSTRINGS = [
  '<shortid>',
  '<asset_id>',
  '{assetId}',
  '{asset_id}',
  '<8 chars>',
  // URL-encoded variants (a literal `<` would have been encoded as `%3C` if it
  // ever round-tripped through searchParams).
  '%3Cshortid',
  '%7Bshortid',
]

const HALF_FORMED_REGEX = /utm_content=[a-z_]+(?:$|&)/i // type-only, no _<8 hex>
const BARE_EQ_REGEX = /utm_content=(?:$|&)/i           // utm_content with empty value

function isAffected(trackingUrl) {
  if (!trackingUrl || typeof trackingUrl !== 'string') return null
  const reasons = []
  for (const p of PLACEHOLDER_SUBSTRINGS) {
    if (trackingUrl.includes(p)) reasons.push(`contains placeholder "${p}"`)
  }
  if (BARE_EQ_REGEX.test(trackingUrl)) reasons.push('utm_content has bare "=" with no value')
  else if (HALF_FORMED_REGEX.test(trackingUrl)) reasons.push('utm_content is type-only (no _<8 chars> suffix)')
  return reasons.length > 0 ? reasons : null
}

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local${COLORS.reset}`)
    process.exit(1)
  }

  // Use @supabase/supabase-js dynamically so the script doesn't break if the
  // package layout changes; falls back to a clean error if missing.
  let createClient
  try {
    ;({ createClient } = require('@supabase/supabase-js'))
  } catch {
    console.error(`${COLORS.red}@supabase/supabase-js not installed. Run "npm install" first.${COLORS.reset}`)
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data: rows, error } = await supabase
    .from('content_calendar')
    .select(
      'id, platform, tracking_url, status, posted_at, campaign_asset_id, created_at',
    )
    .not('tracking_url', 'is', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(`${COLORS.red}Query failed:${COLORS.reset}`, error.message)
    process.exit(2)
  }

  const total = rows?.length ?? 0
  const affected = []
  for (const r of rows ?? []) {
    const reasons = isAffected(r.tracking_url)
    if (reasons) affected.push({ row: r, reasons })
  }

  console.log()
  console.log(`${COLORS.bold}Phase 14H.1 — Tracking URL Diagnostic${COLORS.reset}`)
  console.log(`${COLORS.dim}content_calendar rows with non-null tracking_url:${COLORS.reset} ${total}`)
  console.log(`${COLORS.dim}Affected rows (placeholder or half-formed):${COLORS.reset} ${affected.length}`)
  console.log()

  if (affected.length === 0) {
    console.log(`${COLORS.green}${COLORS.bold}✓ No bad rows. No repair UPDATE needed.${COLORS.reset}`)
    return
  }

  // Pull asset + campaign details for each affected row so the report is self-contained.
  const assetIds = [...new Set(affected.map(a => a.row.campaign_asset_id).filter(Boolean))]
  let assetsById = {}
  let campaignsById = {}
  if (assetIds.length > 0) {
    const { data: assetRows, error: assetErr } = await supabase
      .from('campaign_assets')
      .select('id, asset_type, wave, campaign_id')
      .in('id', assetIds)
    if (assetErr) {
      console.error(`${COLORS.yellow}(could not enrich with asset details: ${assetErr.message})${COLORS.reset}`)
    } else {
      assetsById = Object.fromEntries((assetRows ?? []).map(a => [a.id, a]))
      const campaignIds = [...new Set((assetRows ?? []).map(a => a.campaign_id))]
      if (campaignIds.length > 0) {
        const { data: campRows, error: campErr } = await supabase
          .from('event_campaigns')
          .select('id, event_name, event_year, cta_url')
          .in('id', campaignIds)
        if (campErr) {
          console.error(`${COLORS.yellow}(could not enrich with campaign details: ${campErr.message})${COLORS.reset}`)
        } else {
          campaignsById = Object.fromEntries((campRows ?? []).map(c => [c.id, c]))
        }
      }
    }
  }

  console.log(`${COLORS.bold}Affected rows:${COLORS.reset}`)
  for (const { row, reasons } of affected) {
    const asset = row.campaign_asset_id ? assetsById[row.campaign_asset_id] : null
    const campaign = asset?.campaign_id ? campaignsById[asset.campaign_id] : null
    console.log(`  ${COLORS.yellow}calendar_id:${COLORS.reset} ${row.id}`)
    console.log(`    platform:     ${row.platform}`)
    console.log(`    status:       ${row.status}`)
    console.log(`    tracking_url: ${row.tracking_url}`)
    console.log(`    asset_id:     ${row.campaign_asset_id ?? '(none)'}`)
    if (asset) {
      console.log(`    asset_type:   ${asset.asset_type}`)
      console.log(`    wave:         ${asset.wave ?? '(none)'}`)
    }
    if (campaign) {
      console.log(`    event_name:   ${campaign.event_name}`)
      console.log(`    event_year:   ${campaign.event_year}`)
      console.log(`    cta_url:      ${campaign.cta_url ?? '(none)'}`)
    }
    console.log(`    ${COLORS.red}reasons:${COLORS.reset}      ${reasons.join('; ')}`)
    console.log()
  }

  console.log(
    `${COLORS.bold}Next step:${COLORS.reset} review the rows above, then apply Step 2 of the SQL repair from PROJECT_STATE_CURRENT.md.`,
  )
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(3)
})
