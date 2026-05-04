#!/usr/bin/env node
/**
 * Phase 14L.2 — Media generation worker scaffold.
 *
 * DRY-RUN ONLY by default. Plans the work that would be done to populate
 * media URLs on rows that need them. Provider integrations are stubbed —
 * --apply / --generate prints a clear "not yet implemented" notice and
 * exits without calling any provider API. Real provider wiring is a
 * follow-up sub-phase (14L.2.1+) after the storage shape and migration 032
 * are reviewed and applied in production.
 *
 * What this script DOES today:
 *   - Walks unposted rows in content_calendar (joined to campaign_assets
 *     via campaign_asset_id) and identifies rows that need image / video.
 *   - Mirrors src/lib/media-readiness.ts platform rules + the prompt-
 *     without-resolution rule.
 *   - Groups the work by (campaign × platform × asset_type × source table).
 *   - Picks a recommended provider per group:
 *       image → Pexels (PEXELS_API_KEY) — fallback to OpenAI image (OPENAI_API_KEY)
 *       video → HeyGen (HEYGEN_API_KEY) when video_script / video_prompt exists,
 *               otherwise reports "video script missing".
 *   - Reports which provider keys are present (no calls).
 *   - Snapshots posted_at row count BEFORE and AFTER to prove zero mutations.
 *   - Refuses to run without --apply / --generate; the default is dry-run.
 *
 * What this script DOES NOT do:
 *   - Never calls Pexels / OpenAI / HeyGen / Supabase Storage upload APIs.
 *   - Never calls Facebook / Instagram / TikTok / X (Twitter) / email APIs.
 *   - Never mutates content_calendar.status, content_calendar.posted_at,
 *     campaign_assets.status, posting_status, or posting_gate_approved.
 *   - --apply mode is intentionally a stub. It prints what WOULD run and
 *     exits non-zero so the operator's CI cannot mistakenly enable
 *     generation by passing the flag.
 *
 * Run from project root:
 *   node scripts/generate-missing-media.js               # DRY-RUN (default)
 *   node scripts/generate-missing-media.js --dry-run     # explicit; same as default
 *   node scripts/generate-missing-media.js --apply       # stub: refuses to run real generation
 *   node scripts/generate-missing-media.js --generate    # alias of --apply
 *
 * Storage plan (when real generation is wired in):
 *   - Pexels & OpenAI image generation return a public URL. The worker
 *     SHOULD download the asset and re-upload to Supabase Storage's
 *     `media` bucket (already used by src/app/api/cron/weekly-content/
 *     route.ts). That gives us a stable URL we control + caches the asset.
 *   - HeyGen returns a hosted MP4 URL; same pattern — re-upload to the
 *     `media` bucket so retention is ours.
 *   - Generated URL lands in:
 *       campaign_assets.image_url / .video_url     (campaign-originated rows)
 *       content_calendar.image_url / .video_url    (organic rows; column
 *                                                   added by migration 032)
 *   - On success: media_status='ready', media_source set, media_generated_at
 *     set, media_error cleared.
 *   - On failure: media_status='failed', media_error set (truncated 1000 ch),
 *     image_url/video_url left untouched.
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
 * Per-row recommendation. Returns { needs, reason, source_image, source_video,
 * target_table, target_id, target_column_image, target_column_video }.
 * Pure logic — no DB calls, no provider calls.
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

  // Decide where the generated URL would land. Phase 14L.2: organic rows now
  // have content_calendar.image_url / .video_url (migration 032), so they
  // land on content_calendar; campaign rows still land on campaign_assets.
  const target_table = row.campaign_asset_id ? 'campaign_assets' : 'content_calendar'
  const target_id = row.campaign_asset_id ?? row.id

  const source_image = needs_image ? 'pexels (fallback: openai-image)' : null
  // Video provider depends on whether we have a script. HeyGen needs one.
  let source_video = null
  if (needs_video) {
    if (nonEmpty(row.video_script) || nonEmpty(row.video_prompt)) {
      source_video = 'heygen'
    } else {
      source_video = '⚠ blocked: video script missing'
    }
  }

  let needs
  if (needs_image && needs_video) needs = 'both'
  else if (needs_image) needs = 'image'
  else needs = 'video'

  return {
    needs,
    reason: 'platform requires media',
    source_image,
    source_video,
    target_table,
    target_column_image: needs_image ? `${target_table}.image_url` : null,
    target_column_video: needs_video ? `${target_table}.video_url` : null,
    target_id,
  }
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2))
  return {
    apply: args.has('--apply') || args.has('--generate'),
    dryRun: !(args.has('--apply') || args.has('--generate')),
    onlyDryRun: args.has('--dry-run'),
  }
}

async function main() {
  const flags = parseArgs(process.argv)
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
  console.log(`${COLORS.bold}Phase 14L.2 — Media Generation Worker [${flags.apply ? 'APPLY (stubbed)' : 'DRY-RUN'}]${COLORS.reset}`)
  console.log(`${COLORS.dim}No platform calls. No image/video provider API calls.${COLORS.reset}`)
  console.log()

  // 0. posted_at no-mutation snapshot.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // 1. Pull unposted rows + linked assets. Phase 14L.2 selects row-level
  //    columns added by migration 032 (video_url / media_status / etc).
  //    If migration 032 hasn't been applied yet, the SELECT returns 42703
  //    ("column does not exist"); we catch that and fall back to the legacy
  //    SELECT so the planner still produces useful output. The operator
  //    sees a clear "migration 032 not applied" banner so they know to
  //    apply it before generation can write back state.
  let rows
  let migration032Applied = true
  {
    const res = await supabase
      .from('content_calendar')
      .select(
        'id, status, platform, week_of, image_url, video_url, video_script, image_prompt, ' +
        'media_status, media_error, media_generated_at, media_source, ' +
        'campaign_asset_id, posted_at, ' +
        'campaign_asset:campaign_assets!campaign_asset_id(id, campaign_id, asset_type, image_url, video_url, image_source, video_source)'
      )
      .order('created_at', { ascending: false })
      .limit(5000)
    if (res.error) {
      const msg = res.error.message ?? String(res.error)
      const looksLikeSchemaGap =
        msg.includes('media_status') ||
        msg.includes('media_error') ||
        msg.includes('media_generated_at') ||
        msg.includes('media_source') ||
        msg.includes('content_calendar.video_url')
      if (looksLikeSchemaGap) {
        migration032Applied = false
        const fallback = await supabase
          .from('content_calendar')
          .select(
            'id, status, platform, week_of, image_url, video_script, image_prompt, ' +
            'campaign_asset_id, posted_at, ' +
            'campaign_asset:campaign_assets!campaign_asset_id(id, campaign_id, asset_type, image_url, video_url, image_source, video_source)'
          )
          .order('created_at', { ascending: false })
          .limit(5000)
        if (fallback.error) {
          console.error(`${COLORS.red}Fallback query failed:${COLORS.reset} ${fallback.error.message}`)
          process.exit(2)
        }
        rows = fallback.data
      } else {
        console.error(`${COLORS.red}Query failed:${COLORS.reset} ${msg}`)
        process.exit(2)
      }
    } else {
      rows = res.data
    }
  }

  if (!migration032Applied) {
    console.log(`${COLORS.yellow}⚠ Migration 032 (content_calendar.video_url + media_status) not yet applied.${COLORS.reset}`)
    console.log(`${COLORS.dim}Running with legacy SELECT — media_status distribution + organic video_url will be n/a.${COLORS.reset}`)
    console.log(`${COLORS.dim}Apply supabase/migrations/032_add_video_url_and_media_status_to_content_calendar.sql${COLORS.reset}`)
    console.log()
  }

  const all = (rows ?? []).map(r => {
    const ca = Array.isArray(r.campaign_asset) ? (r.campaign_asset[0] ?? null) : (r.campaign_asset ?? null)
    return {
      ...r,
      asset_image_url: ca?.image_url ?? null,
      asset_video_url: ca?.video_url ?? null,
      asset_type: ca?.asset_type ?? null,
      asset_campaign_id: ca?.campaign_id ?? null,
      // Validator-style fields. Prefer campaign_asset URLs (carry
      // provenance via image_source / video_source) and fall back to
      // row-level columns from migration 032.
      image_url: ca?.image_url ?? r.image_url ?? null,
      video_url: ca?.video_url ?? r.video_url ?? null,
      video_prompt: null,
    }
  })
  const unposted = all.filter(isUnposted)

  // 2. Per-row recommendation.
  let need_image = 0, need_video = 0, need_both = 0, need_none = 0
  let blockedVideoNoScript = 0
  const groups = new Map()  // key=`${campaign_id}|${platform}|${asset_type}|${target_table}`
  const samples = []

  for (const r of unposted) {
    const rec = recommend(r)
    if (rec.needs === 'none') { need_none++; continue }
    if (rec.needs === 'image') need_image++
    if (rec.needs === 'video') need_video++
    if (rec.needs === 'both') need_both++

    if (rec.source_video && rec.source_video.startsWith('⚠')) blockedVideoNoScript++

    const campaignId = r.asset_campaign_id ?? '(organic)'
    const assetType = r.asset_type ?? '(organic)'
    const groupKey = `${campaignId}|${r.platform}|${assetType}|${rec.target_table}`
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        campaign_id: campaignId,
        platform: r.platform,
        asset_type: assetType,
        target_table: rec.target_table,
        source_image: null,
        source_video: null,
        count_image: 0,
        count_video: 0,
        count_video_blocked_no_script: 0,
        ids: [],
      })
    }
    const g = groups.get(groupKey)
    if (rec.needs === 'image' || rec.needs === 'both') {
      g.count_image++
      if (!g.source_image && rec.source_image) g.source_image = rec.source_image
    }
    if (rec.needs === 'video' || rec.needs === 'both') {
      g.count_video++
      if (!g.source_video && rec.source_video) g.source_video = rec.source_video
      if (rec.source_video && rec.source_video.startsWith('⚠')) g.count_video_blocked_no_script++
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

  // 4. Per-row + per-status counts for the worker queue scope.
  const byMediaStatus = { null: 0, pending: 0, ready: 0, failed: 0, skipped: 0 }
  for (const r of unposted) {
    const ms = r.media_status ?? null
    if (ms === null || ms === undefined) byMediaStatus.null++
    else if (Object.prototype.hasOwnProperty.call(byMediaStatus, ms)) byMediaStatus[ms]++
  }

  console.log(`${COLORS.bold}1. Per-row needs (unposted, gate-eligible candidates only)${COLORS.reset}`)
  console.log(`   total scanned:      ${unposted.length}`)
  console.log(`   ${COLORS.green}already covered:${COLORS.reset}    ${need_none}`)
  console.log(`   ${COLORS.yellow}need image only:${COLORS.reset}    ${need_image}`)
  console.log(`   ${COLORS.yellow}need video only:${COLORS.reset}    ${need_video}`)
  console.log(`   ${COLORS.red}need both:${COLORS.reset}          ${need_both}`)
  if (blockedVideoNoScript > 0) {
    console.log(`   ${COLORS.red}video blocked (no script):${COLORS.reset} ${blockedVideoNoScript}`)
  }
  console.log()

  console.log(`${COLORS.bold}2. media_status distribution (unposted rows)${COLORS.reset}`)
  if (migration032Applied) {
    console.log(`   ${COLORS.dim}null     :${COLORS.reset} ${byMediaStatus.null}`)
    console.log(`   ${COLORS.dim}pending  :${COLORS.reset} ${byMediaStatus.pending}`)
    console.log(`   ${COLORS.green}ready    :${COLORS.reset} ${byMediaStatus.ready}`)
    console.log(`   ${COLORS.red}failed   :${COLORS.reset} ${byMediaStatus.failed}`)
    console.log(`   ${COLORS.dim}skipped  :${COLORS.reset} ${byMediaStatus.skipped}`)
  } else {
    console.log(`   ${COLORS.dim}n/a — migration 032 not applied${COLORS.reset}`)
  }
  console.log()

  console.log(`${COLORS.bold}3. Groups by (campaign × platform × asset_type × target table)${COLORS.reset}`)
  const sortedGroups = [...groups.values()].sort((a, b) => (b.count_image + b.count_video) - (a.count_image + a.count_video))
  for (const g of sortedGroups) {
    const c = campaignMap[g.campaign_id]
    const cName = c ? `${c.event_name} ${c.event_year} (${c.event_slug ?? '?'})` : g.campaign_id
    console.log(`   ${COLORS.cyan}${cName}${COLORS.reset}  platform=${g.platform}  asset_type=${g.asset_type}`)
    console.log(`     ${COLORS.dim}target table:${COLORS.reset}   ${g.target_table}`)
    if (g.count_image > 0) console.log(`     ${COLORS.yellow}image needed:${COLORS.reset}   ${g.count_image}  source: ${g.source_image}`)
    if (g.count_video > 0) console.log(`     ${COLORS.yellow}video needed:${COLORS.reset}   ${g.count_video}  source: ${g.source_video}`)
    if (g.count_video_blocked_no_script > 0) {
      console.log(`     ${COLORS.red}↳ video blocked (no script):${COLORS.reset} ${g.count_video_blocked_no_script}`)
    }
    console.log(`     ${COLORS.dim}content_calendar ids (first 3):${COLORS.reset} ${g.ids.slice(0, 3).join(', ')}${g.ids.length > 3 ? ` … (+${g.ids.length - 3})` : ''}`)
  }
  console.log()

  console.log(`${COLORS.bold}4. Sample rows (first ${samples.length})${COLORS.reset}`)
  for (const s of samples) {
    console.log(`   ${COLORS.dim}${s.row.id}${COLORS.reset} ${s.row.platform} ${s.row.week_of}  needs=${s.rec.needs}  → ${s.rec.target_table}`)
  }
  console.log()

  // 5. Env presence sanity check (NO calls — just check the keys exist).
  console.log(`${COLORS.bold}5. Generation source key presence${COLORS.reset}`)
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

  // 6. Apply / Generate guard. Stubbed for Phase 14L.2 — refuses to call
  //    real provider APIs; the operator must explicitly land provider
  //    integration code in a follow-up phase.
  if (flags.apply) {
    console.log()
    console.log(`${COLORS.bold}${COLORS.red}--apply / --generate is a stub in Phase 14L.2.${COLORS.reset}`)
    console.log(`${COLORS.dim}Provider integrations (Pexels / OpenAI image / HeyGen) are not yet wired.${COLORS.reset}`)
    console.log(`${COLORS.dim}Phase 14L.2 only ships the storage shape (migration 032), the validator${COLORS.reset}`)
    console.log(`${COLORS.dim}wiring (media-readiness reads media_status), and this dry-run scaffold.${COLORS.reset}`)
    console.log(`${COLORS.dim}Real generation lands in Phase 14L.2.1 with explicit operator approval.${COLORS.reset}`)
    console.log()
    console.log(`${COLORS.yellow}No mutation. No provider calls.${COLORS.reset}`)
    console.log()
  }

  // 7. posted_at unchanged.
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  console.log(postedBefore === postedAfter
    ? `${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`
    : `${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`
  )
  console.log(`${COLORS.dim}No platform API calls. No provider API calls. No mutations.${COLORS.reset}`)

  // Apply mode exits non-zero so a misconfigured CI pipeline can't claim
  // success without operator review.
  if (flags.apply) process.exit(3)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
