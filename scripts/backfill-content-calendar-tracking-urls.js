#!/usr/bin/env node
/**
 * Phase 14L.1 — Backfill content_calendar.tracking_url for unposted
 * campaign-originated rows that predate (or bypassed) Phase 14H.1 tracking
 * URL materialization.
 *
 * Resolution chain:
 *   content_calendar row
 *     → campaign_assets (via campaign_asset_id) for wave + asset_type
 *     → event_campaigns (via campaign_id) for event_name + event_year + event_slug + cta_url
 *
 * Built URL shape (mirrors src/lib/campaign-tracking-url.ts buildCampaignTrackingUrl):
 *   https://www.vortextrips.com/t/<event_slug>?utm_source=<platform>
 *     &utm_medium=event_campaign
 *     &utm_campaign=<event_slug>_<year>[_<wave>]
 *     [&utm_content=<asset_type>_<8charAssetIdSuffix>]
 *
 * Modes:
 *   --dry-run (default) — print proposed URLs, no writes
 *   --apply             — UPDATE content_calendar.tracking_url and (when null)
 *                         back-fill campaign_assets.tracking_url
 *
 * Hard skip rules (never written):
 *   - row.posted_at IS NOT NULL
 *   - row.status IN ('posted', 'rejected', 'archived')
 *   - row.tracking_url already non-null
 *   - row.campaign_asset_id IS NULL  (organic row — no campaign tracking)
 *   - linked campaign_asset row not found
 *   - linked campaign row not found
 *   - resolved tracking_url cannot start with the branded prefix (defensive)
 *
 * Read-only invariant: posted_at count is snapshot before/after the run.
 *
 * Run from project root:
 *   node scripts/backfill-content-calendar-tracking-urls.js
 *   node scripts/backfill-content-calendar-tracking-urls.js --apply
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

const APPLY = process.argv.includes('--apply')
const MODE = APPLY ? 'APPLY' : 'DRY-RUN'

const BRAND_TRACKING_BASE_URL = 'https://www.vortextrips.com/t'
const DEFAULT_BASE_URL = 'https://myvortex365.com/leosp'
const CAMPAIGN_UTM_MEDIUM = 'event_campaign'
const BRANDED_PREFIX = `${BRAND_TRACKING_BASE_URL}/`

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

// ---------------------------------------------------------------------------
// Mirror of src/lib/campaign-tracking-url.ts. Kept in sync by hand. If the
// helper changes (slug rules, UTM emission, asset-id short rules), update
// this too — there is a typecheck test in the diagnostic that compares output.
// ---------------------------------------------------------------------------

function slugifyEventName(name) {
  if (!name || typeof name !== 'string') return ''
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function buildCampaignUtmCampaign({ eventName, eventYear, wave, eventSlug }) {
  const persistedSlug = eventSlug && typeof eventSlug === 'string' ? eventSlug.trim() : ''
  const slug = persistedSlug || slugifyEventName(eventName)
  if (!slug || !eventYear || !Number.isFinite(eventYear)) return ''
  const parts = [slug, String(eventYear)]
  if (wave && String(wave).trim()) parts.push(String(wave).trim())
  return parts.join('_')
}

function shortAssetId(assetId) {
  if (!assetId || typeof assetId !== 'string') return ''
  const cleaned = assetId.replace(/[^a-z0-9]/gi, '').slice(0, 8)
  if (!/^[a-z0-9]{8}$/i.test(cleaned)) return ''
  return cleaned.toLowerCase()
}

function buildCampaignTrackingUrl(opts) {
  const persistedSlug = opts.eventSlug && typeof opts.eventSlug === 'string' ? opts.eventSlug.trim() : ''
  const resolvedSlug = persistedSlug || slugifyEventName(opts.eventName)

  let base
  if (resolvedSlug) {
    base = `${BRAND_TRACKING_BASE_URL}/${encodeURIComponent(resolvedSlug)}`
  } else {
    base = (opts.baseUrl && String(opts.baseUrl).trim()) || DEFAULT_BASE_URL
  }

  let url
  try {
    url = new URL(base)
  } catch {
    url = new URL(DEFAULT_BASE_URL)
  }

  const platform = (opts.platform ?? '').trim().toLowerCase()
  if (platform) url.searchParams.set('utm_source', platform)
  url.searchParams.set('utm_medium', CAMPAIGN_UTM_MEDIUM)

  const utmCampaign = buildCampaignUtmCampaign({
    eventName: opts.eventName,
    eventYear: opts.eventYear,
    wave: opts.wave,
    eventSlug: opts.eventSlug,
  })
  if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign)

  const assetType = (opts.assetType ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '-')
  const idShort = shortAssetId(opts.assetId)
  if (assetType && idShort) {
    url.searchParams.set('utm_content', `${assetType}_${idShort}`)
  }

  return url.toString()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
  console.log(`${COLORS.bold}Phase 14L.1 — Backfill content_calendar.tracking_url [${MODE}]${COLORS.reset}`)
  console.log()

  // posted_at snapshot BEFORE.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // 1. Pull candidate rows.
  const { data: rows, error } = await supabase
    .from('content_calendar')
    .select('id, status, platform, week_of, caption, tracking_url, campaign_asset_id, posted_at, created_at')
    .is('tracking_url', null)
    .is('posted_at', null)
    .not('status', 'in', '(posted,rejected,archived)')
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) {
    console.error(`${COLORS.red}Query failed:${COLORS.reset} ${error.message}`)
    process.exit(2)
  }

  const allCandidates = rows ?? []
  const organic = allCandidates.filter(r => !r.campaign_asset_id)
  const campaignRows = allCandidates.filter(r => !!r.campaign_asset_id)

  console.log(`${COLORS.bold}1. Candidate scan${COLORS.reset}`)
  console.log(`   ${COLORS.dim}unposted rows with tracking_url IS NULL:${COLORS.reset} ${allCandidates.length}`)
  console.log(`   ${COLORS.dim}  → organic (no campaign_asset_id, NOT backfillable):${COLORS.reset} ${organic.length}`)
  console.log(`   ${COLORS.cyan}  → campaign-linked (eligible for resolution):${COLORS.reset} ${campaignRows.length}`)
  console.log()

  if (campaignRows.length === 0) {
    console.log(`${COLORS.green}Nothing to backfill.${COLORS.reset}`)
    const { count: postedAfter } = await supabase
      .from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .not('posted_at', 'is', null)
    console.log(postedBefore === postedAfter
      ? `${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`
      : `${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`
    )
    return
  }

  // 2. Resolve linked assets and campaigns.
  const assetIds = [...new Set(campaignRows.map(r => r.campaign_asset_id))]
  const { data: assets, error: aErr } = await supabase
    .from('campaign_assets')
    .select('id, campaign_id, asset_type, platform, wave, tracking_url')
    .in('id', assetIds)
  if (aErr) {
    console.error(`${COLORS.red}campaign_assets lookup failed:${COLORS.reset} ${aErr.message}`)
    process.exit(3)
  }
  const assetById = Object.fromEntries((assets ?? []).map(a => [a.id, a]))

  const campaignIds = [...new Set((assets ?? []).map(a => a.campaign_id).filter(Boolean))]
  const { data: campaigns, error: cErr } = await supabase
    .from('event_campaigns')
    .select('id, event_name, event_year, event_slug, cta_url')
    .in('id', campaignIds)
  if (cErr) {
    console.error(`${COLORS.red}event_campaigns lookup failed:${COLORS.reset} ${cErr.message}`)
    process.exit(4)
  }
  const campaignById = Object.fromEntries((campaigns ?? []).map(c => [c.id, c]))

  // 3. Per-row resolution into a backfill plan.
  const plan = []           // [{ row, asset, campaign, proposed_url, also_backfill_asset }]
  const skipped = []        // [{ row, reason }]
  for (const r of campaignRows) {
    const asset = assetById[r.campaign_asset_id]
    if (!asset) { skipped.push({ row: r, reason: 'linked campaign_asset not found' }); continue }
    const campaign = campaignById[asset.campaign_id]
    if (!campaign) { skipped.push({ row: r, reason: 'parent event_campaign not found' }); continue }

    const proposed_url = buildCampaignTrackingUrl({
      baseUrl: campaign.cta_url,
      platform: r.platform,           // row platform — not asset.platform (push-to-calendar honors row override)
      eventName: campaign.event_name,
      eventYear: campaign.event_year,
      eventSlug: campaign.event_slug,
      wave: asset.wave,
      assetType: asset.asset_type,
      assetId: asset.id,
    })

    if (!proposed_url.startsWith(BRANDED_PREFIX)) {
      skipped.push({ row: r, reason: `resolved URL does not start with ${BRANDED_PREFIX} (slug missing on campaign?)` })
      continue
    }

    plan.push({
      row: r,
      asset,
      campaign,
      proposed_url,
      also_backfill_asset: !asset.tracking_url || !asset.tracking_url.trim(),
    })
  }

  console.log(`${COLORS.bold}2. Resolution${COLORS.reset}`)
  console.log(`   ${COLORS.green}eligible:${COLORS.reset} ${plan.length}`)
  console.log(`   ${COLORS.yellow}skipped:${COLORS.reset}  ${skipped.length}`)
  for (const s of skipped) console.log(`     ${s.row.id} (${s.row.platform}): ${s.reason}`)
  console.log()

  // 4. Preview.
  console.log(`${COLORS.bold}3. Backfill preview${COLORS.reset}`)
  for (const p of plan) {
    const tail = p.also_backfill_asset ? ` ${COLORS.dim}(also fills campaign_assets.tracking_url)${COLORS.reset}` : ''
    console.log(`   ${COLORS.cyan}${p.row.id}${COLORS.reset} ${p.row.platform} ${p.asset.wave ?? '?'} → ${p.proposed_url}${tail}`)
  }
  console.log()

  // 5. Apply or stop.
  if (!APPLY) {
    console.log(`${COLORS.yellow}DRY-RUN — re-run with --apply to perform the UPDATEs.${COLORS.reset}`)
    console.log()
    const { count: postedAfter } = await supabase
      .from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .not('posted_at', 'is', null)
    console.log(postedBefore === postedAfter
      ? `${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`
      : `${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`
    )
    return
  }

  // 6. APPLY path.
  console.log(`${COLORS.bold}4. Applying${COLORS.reset}`)
  let updated_calendar = 0
  let updated_assets = 0
  let failed = 0
  for (const p of plan) {
    // Belt-and-suspenders — the UPDATE refuses to touch a row that flipped to
    // a terminal status mid-run, OR whose tracking_url filled in via another
    // path between the SELECT above and this UPDATE.
    const { error: updErr, data } = await supabase
      .from('content_calendar')
      .update({ tracking_url: p.proposed_url })
      .eq('id', p.row.id)
      .is('tracking_url', null)
      .is('posted_at', null)
      .not('status', 'in', '(posted,rejected,archived)')
      .select('id')
      .maybeSingle()
    if (updErr) {
      failed++
      console.log(`   ${COLORS.red}✗ ${p.row.id}: ${updErr.message}${COLORS.reset}`)
      continue
    }
    if (!data) {
      // Row no longer matches the safety filter — skip silently.
      console.log(`   ${COLORS.yellow}~ ${p.row.id}: skipped (row state changed since dry-run)${COLORS.reset}`)
      continue
    }
    updated_calendar++

    if (p.also_backfill_asset) {
      const { error: assetErr } = await supabase
        .from('campaign_assets')
        .update({ tracking_url: p.proposed_url })
        .eq('id', p.asset.id)
        .is('tracking_url', null)
      if (assetErr) {
        console.log(`   ${COLORS.yellow}~ ${p.asset.id}: campaign_assets back-fill failed: ${assetErr.message}${COLORS.reset}`)
      } else {
        updated_assets++
      }
    }
  }
  console.log(`   ${COLORS.green}content_calendar updated:${COLORS.reset} ${updated_calendar}`)
  console.log(`   ${COLORS.green}campaign_assets back-filled:${COLORS.reset} ${updated_assets}`)
  if (failed > 0) console.log(`   ${COLORS.red}failed:${COLORS.reset} ${failed}`)
  console.log()

  // 7. No-mutation cross-check on posted_at.
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  console.log(postedBefore === postedAfter
    ? `${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`
    : `${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}. INVESTIGATE.${COLORS.reset}`
  )

  // 8. Verification SQL.
  console.log()
  console.log(`${COLORS.bold}Verification SQL${COLORS.reset}`)
  console.log(`${COLORS.dim}-- Should be 0 after --apply succeeds${COLORS.reset}`)
  console.log(`SELECT COUNT(*) FROM content_calendar`)
  console.log(`WHERE campaign_asset_id IS NOT NULL`)
  console.log(`  AND tracking_url IS NULL`)
  console.log(`  AND status NOT IN ('posted','rejected','archived')`)
  console.log(`  AND posted_at IS NULL;`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
