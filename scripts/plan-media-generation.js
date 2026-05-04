#!/usr/bin/env node
/**
 * Phase 14L.1 — Media generation planner. DRY-RUN ONLY.
 *
 * Reports what media (image/video URLs) would need to be generated to unblock
 * unposted, gate-eligible content_calendar rows. Does NOT call Pexels, OpenAI,
 * HeyGen, or any other media API. Does NOT mutate campaign_assets or
 * content_calendar.
 *
 * Where generated media is stored (today's schema, verified at runtime):
 *
 *   content_calendar.image_url    ← legacy organic flow (generate-content route)
 *   content_calendar.video_script ← TikTok script TEXT (NOT a video URL)
 *   campaign_assets.image_url     ← campaign-flow image (Pexels / OpenAI / HeyGen-stored)
 *   campaign_assets.video_url     ← campaign-flow video (HeyGen / other)
 *
 * Recommended generation source (matches existing in-repo patterns):
 *
 *   image  → Pexels first (PEXELS_API_KEY) — see src/app/api/dashboard/generate-content/route.ts
 *            OpenAI Image fallback when Pexels has no usable result
 *   video  → HeyGen (HEYGEN_API_KEY) — see migration 018 image_source / video_source enums
 *
 * Output is grouped by (campaign, platform, asset_type) so a future worker can
 * batch generation for one campaign at a time.
 *
 * Run from project root:
 *   node scripts/plan-media-generation.js
 *
 * Optional env-var sanity check (presence only, no calls):
 *   PEXELS_API_KEY     — required for the image path
 *   OPENAI_API_KEY     — required for the image fallback
 *   HEYGEN_API_KEY     — required for the video path
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

const TERMINAL_STATUSES = new Set(['posted', 'rejected', 'archived'])

// Mirror of src/lib/media-readiness.ts platform rules. Update both when one
// changes.
const PLATFORM_RULES = {
  instagram: { image: 'required',    video: 'required',    either_satisfies: true  },
  tiktok:    { image: 'none',        video: 'required',    either_satisfies: false },
  youtube:   { image: 'none',        video: 'required',    either_satisfies: false },
  facebook:  { image: 'recommended', video: 'recommended', either_satisfies: true  },
  twitter:   { image: 'recommended', video: 'recommended', either_satisfies: true  },
  threads:   { image: 'recommended', video: 'recommended', either_satisfies: true  },
  linkedin:  { image: 'recommended', video: 'recommended', either_satisfies: true  },
}

function getRule(platform) {
  if (!platform) return null
  return PLATFORM_RULES[String(platform).toLowerCase().trim()] ?? null
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

function isUnposted(row) {
  if (row.posted_at) return false
  const s = (row.status ?? '').toLowerCase()
  if (TERMINAL_STATUSES.has(s)) return false
  return true
}

/**
 * Per-row recommendation. Returns { needs: 'image'|'video'|'both'|'none',
 * reason, source_image, source_video, target_table, target_id }. Pure logic
 * — no DB calls.
 */
function recommend(row) {
  const rule = getRule(row.platform)
  if (!rule) return { needs: 'none', reason: 'unknown / non-social platform' }
  const has_image = nonEmpty(row.image_url) || nonEmpty(row.asset_image_url)
  const has_video = nonEmpty(row.video_url) || nonEmpty(row.asset_video_url)

  let needs_image = false
  let needs_video = false
  if (rule.either_satisfies) {
    if ((rule.image === 'required' || rule.video === 'required') && !has_image && !has_video) {
      needs_image = true   // platform accepts either; image is the cheaper/faster default
    }
  } else {
    if (rule.image === 'required' && !has_image) needs_image = true
    if (rule.video === 'required' && !has_video) needs_video = true
  }

  // Prompt-without-resolution rule (mirrors media-readiness.ts).
  if (!needs_image && nonEmpty(row.image_prompt) && !has_image) needs_image = true
  if (!needs_video && nonEmpty(row.video_prompt) && !has_video) needs_video = true

  if (!needs_image && !needs_video) return { needs: 'none', reason: 'media already present or not required' }

  // Decide where the generated URL would land.
  const target_table = row.campaign_asset_id ? 'campaign_assets' : 'content_calendar'
  const target_id = row.campaign_asset_id ?? row.id
  const source_image = needs_image ? 'pexels (fallback: openai-image)' : null
  const source_video = needs_video ? 'heygen' : null

  let needs
  if (needs_image && needs_video) needs = 'both'
  else if (needs_image) needs = 'image'
  else needs = 'video'

  return { needs, reason: 'platform requires media', source_image, source_video, target_table, target_id }
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
  console.log(`${COLORS.bold}Phase 14L.1 — Media Generation Planner [DRY-RUN]${COLORS.reset}`)
  console.log(`${COLORS.dim}No platform calls. No image/video API calls. No mutations.${COLORS.reset}`)
  console.log()

  // 0. posted_at no-mutation snapshot.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // 1. Pull unposted rows + linked assets.
  const { data: rows, error } = await supabase
    .from('content_calendar')
    .select(
      'id, status, platform, week_of, image_url, video_script, image_prompt, ' +
      'campaign_asset_id, posted_at, ' +
      'campaign_asset:campaign_assets!campaign_asset_id(id, campaign_id, asset_type, image_url, video_url)'
    )
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) {
    console.error(`${COLORS.red}Query failed:${COLORS.reset} ${error.message}`)
    process.exit(2)
  }

  const all = (rows ?? []).map(r => {
    const ca = Array.isArray(r.campaign_asset) ? (r.campaign_asset[0] ?? null) : (r.campaign_asset ?? null)
    return {
      ...r,
      asset_image_url: ca?.image_url ?? null,
      asset_video_url: ca?.video_url ?? null,
      asset_type: ca?.asset_type ?? null,
      asset_campaign_id: ca?.campaign_id ?? null,
      // The validator-style fields:
      video_url: ca?.video_url ?? null,           // content_calendar has no video_url today
      video_prompt: null,
    }
  })
  const unposted = all.filter(isUnposted)

  // 2. Per-row recommendation.
  let need_image = 0, need_video = 0, need_both = 0, need_none = 0
  const groups = new Map()  // key=`${campaign_id}|${platform}|${asset_type}` → { count, target_table, source_image, source_video, ids: [] }
  const samples = []        // top-10 sample for the report

  for (const r of unposted) {
    const rec = recommend(r)
    if (rec.needs === 'none') { need_none++; continue }
    if (rec.needs === 'image') need_image++
    if (rec.needs === 'video') need_video++
    if (rec.needs === 'both') need_both++

    const campaignId = r.asset_campaign_id ?? '(organic)'
    const assetType = r.asset_type ?? '(organic)'
    const key = `${campaignId}|${r.platform}|${assetType}`
    if (!groups.has(key)) {
      groups.set(key, {
        campaign_id: campaignId,
        platform: r.platform,
        asset_type: assetType,
        target_table: rec.target_table,
        source_image: null,
        source_video: null,
        count_image: 0,
        count_video: 0,
        ids: [],
      })
    }
    const g = groups.get(key)
    if (rec.needs === 'image' || rec.needs === 'both') {
      g.count_image++
      if (!g.source_image && rec.source_image) g.source_image = rec.source_image
    }
    if (rec.needs === 'video' || rec.needs === 'both') {
      g.count_video++
      if (!g.source_video && rec.source_video) g.source_video = rec.source_video
    }
    g.ids.push(r.id)
    if (samples.length < 10) samples.push({ row: r, rec })
  }

  // 3. Resolve campaign names for nicer output.
  const campaignIds = [...new Set([...groups.values()].map(g => g.campaign_id).filter(c => c !== '(organic)'))]
  let campaignMap = {}
  if (campaignIds.length > 0) {
    const { data: cs } = await supabase
      .from('event_campaigns')
      .select('id, event_name, event_year, event_slug')
      .in('id', campaignIds)
    campaignMap = Object.fromEntries((cs ?? []).map(c => [c.id, c]))
  }

  // 3a. Detect organic-video schema gap.
  //
  // content_calendar at runtime has: id, week_of, platform, caption, hashtags,
  // image_prompt, image_url, video_script (TEXT, not URL), tracking_url,
  // campaign_asset_id, posting gate cols, posted_at, created_at, status.
  // It does NOT have a video_url column. Organic TikTok / YouTube rows
  // therefore have no place on content_calendar to land a generated video URL.
  // The planner surfaces this as a schema gap so a future phase can either
  // add the column or route organic rows through campaign_assets first.
  const organicVideoGap = [...groups.values()].some(g =>
    g.campaign_id === '(organic)' &&
    g.target_table === 'content_calendar' &&
    g.count_video > 0
  )

  // 4. Print summary.
  console.log(`${COLORS.bold}1. Per-row needs (unposted, gate-eligible candidates only)${COLORS.reset}`)
  console.log(`   total scanned:      ${unposted.length}`)
  console.log(`   ${COLORS.green}already covered:${COLORS.reset}    ${need_none}`)
  console.log(`   ${COLORS.yellow}need image only:${COLORS.reset}    ${need_image}`)
  console.log(`   ${COLORS.yellow}need video only:${COLORS.reset}    ${need_video}`)
  console.log(`   ${COLORS.red}need both:${COLORS.reset}          ${need_both}`)
  console.log()

  console.log(`${COLORS.bold}2. Groups by (campaign × platform × asset_type)${COLORS.reset}`)
  const sortedGroups = [...groups.values()].sort((a, b) => (b.count_image + b.count_video) - (a.count_image + a.count_video))
  for (const g of sortedGroups) {
    const c = campaignMap[g.campaign_id]
    const cName = c ? `${c.event_name} ${c.event_year} (${c.event_slug ?? '?'})` : g.campaign_id
    console.log(`   ${COLORS.cyan}${cName}${COLORS.reset}  platform=${g.platform}  asset_type=${g.asset_type}`)
    console.log(`     ${COLORS.dim}target table:${COLORS.reset}   ${g.target_table}.${g.source_image && g.source_video ? '{image_url, video_url}' : g.source_image ? 'image_url' : 'video_url'}`)
    if (g.count_image > 0) console.log(`     ${COLORS.yellow}image needed:${COLORS.reset}   ${g.count_image}  source: ${g.source_image}`)
    if (g.count_video > 0) console.log(`     ${COLORS.yellow}video needed:${COLORS.reset}   ${g.count_video}  source: ${g.source_video}`)
    console.log(`     ${COLORS.dim}content_calendar ids (first 3):${COLORS.reset} ${g.ids.slice(0, 3).join(', ')}${g.ids.length > 3 ? ` … (+${g.ids.length - 3})` : ''}`)
  }
  console.log()

  console.log(`${COLORS.bold}3. Sample rows (first ${samples.length})${COLORS.reset}`)
  for (const s of samples) {
    console.log(`   ${COLORS.dim}${s.row.id}${COLORS.reset} ${s.row.platform} ${s.row.week_of}  needs=${s.rec.needs}  → ${s.rec.target_table}`)
  }
  console.log()

  // 4a. Schema-gap warning. Organic rows that need video have no place on
  // content_calendar to land the URL — this is a pre-existing schema gap that
  // a follow-on phase must resolve.
  if (organicVideoGap) {
    console.log(`${COLORS.bold}${COLORS.yellow}⚠ Schema gap${COLORS.reset}`)
    console.log(`   content_calendar has no video_url column today.`)
    console.log(`   Organic rows that "need video" have nowhere to land a generated URL.`)
    console.log(`   A future phase must either add content_calendar.video_url`)
    console.log(`   OR route organic video rows through campaign_assets first.`)
    console.log()
  }

  // 5. Env presence sanity check (NO calls — just check the keys exist).
  console.log(`${COLORS.bold}4. Generation source key presence${COLORS.reset}`)
  const keyChecks = [
    ['PEXELS_API_KEY',  'image (primary)'],
    ['OPENAI_API_KEY',  'image (fallback)'],
    ['HEYGEN_API_KEY',  'video'],
  ]
  for (const [name, role] of keyChecks) {
    const val = env[name]
    const present = !!(val && val.length > 0)
    console.log(`   ${present ? COLORS.green + '✓' : COLORS.yellow + '·'} ${name}${COLORS.reset}  (${role}) ${present ? 'present' : 'MISSING — needed before generator runs'}`)
  }
  console.log()

  // 6. posted_at unchanged.
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  console.log(postedBefore === postedAfter
    ? `${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`
    : `${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`
  )
  console.log(`${COLORS.dim}No platform API calls. No image/video API calls. No mutations.${COLORS.reset}`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
