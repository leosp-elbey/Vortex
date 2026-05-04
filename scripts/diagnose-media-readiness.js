#!/usr/bin/env node
/**
 * Phase 14L — read-only media-readiness + caption-link diagnostic.
 *
 * Reports (no writes, no platform calls):
 *   1. number of unposted rows whose caption still contains the legacy
 *      myvortex365.com/leosp link (visible-link debt)
 *   2. number of unposted rows with a branded tracking_url
 *   3. number of Instagram unposted rows missing image AND video
 *   4. number of TikTok unposted rows missing video
 *   5. number of campaign-originated rows whose linked asset has a media
 *      prompt but no generated image/video URL ("media_prompt_pending")
 *   6. number of unposted rows that would be blocked by validateMediaReadiness
 *   7. posted_at row count cross-check (must be unchanged)
 *
 * Run from project root:
 *   node scripts/diagnose-media-readiness.js
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
const BRAND_PREFIX = 'https://www.vortextrips.com/t/'
const LEGACY_NEEDLE = 'myvortex365.com/leosp'

// Mirror of getRequiredMediaForPlatform from src/lib/media-readiness.ts.
// Kept in sync by hand. If the rules change, update this table too.
const PLATFORM_RULES = {
  instagram: { image: 'required',    video: 'required',    either_satisfies: true  },
  tiktok:    { image: 'none',        video: 'required',    either_satisfies: false },
  youtube:   { image: 'none',        video: 'required',    either_satisfies: false },
  facebook:  { image: 'recommended', video: 'recommended', either_satisfies: true  },
  twitter:   { image: 'recommended', video: 'recommended', either_satisfies: true  },
  threads:   { image: 'recommended', video: 'recommended', either_satisfies: true  },
  linkedin:  { image: 'recommended', video: 'recommended', either_satisfies: true  },
  email:     { image: 'none',        video: 'none',        either_satisfies: false },
  sms:       { image: 'none',        video: 'none',        either_satisfies: false },
  web:       { image: 'none',        video: 'none',        either_satisfies: false },
}

const NONE_RULE = { image: 'none', video: 'none', either_satisfies: false }

function getRule(platform) {
  if (!platform) return NONE_RULE
  return PLATFORM_RULES[String(platform).toLowerCase().trim()] ?? NONE_RULE
}

function nonEmpty(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function normalizeMediaStatus(input) {
  if (!input || typeof input !== 'string') return null
  const v = input.trim().toLowerCase()
  return ['pending', 'ready', 'failed', 'skipped'].includes(v) ? v : null
}

function validateMediaReadinessJs(row) {
  const rule = getRule(row.platform)
  const has_image = nonEmpty(row.image_url)
  const has_video = nonEmpty(row.video_url)
  const reasons = []
  const platformLabel = row.platform ? row.platform.toLowerCase().trim() : ''
  const media_status = normalizeMediaStatus(row.media_status)
  const platformRequiresMedia = rule.image === 'required' || rule.video === 'required'

  // Phase 14L.2 — media_status short-circuits.
  if (media_status === 'failed') {
    const detail = nonEmpty(row.media_error) ? `: ${row.media_error.trim()}` : ''
    reasons.push(`media generation failed${detail}`)
  } else if (media_status === 'skipped' && platformRequiresMedia && !has_image && !has_video) {
    reasons.push(`media_status='skipped' but platform ${platformLabel || 'this platform'} requires media`)
  }

  if (rule.either_satisfies) {
    if (platformRequiresMedia && !has_image && !has_video) {
      if (platformLabel === 'instagram') reasons.push('missing required image_url for Instagram')
      else reasons.push(`missing required image_url or video_url for ${platformLabel || 'this platform'}`)
    }
  } else {
    if (rule.image === 'required' && !has_image) {
      reasons.push(`missing required image_url for ${platformLabel || 'this platform'}`)
    }
    if (rule.video === 'required' && !has_video) {
      const label = platformLabel === 'tiktok' ? 'TikTok' : (platformLabel || 'this platform')
      reasons.push(`missing required video_url for ${label}`)
    }
  }
  if (row.media_required === true && !has_image && !has_video) {
    reasons.push('row marked media_required=true but neither image_url nor video_url is present')
  }
  if (nonEmpty(row.image_prompt) && !has_image) {
    reasons.push('campaign media prompt exists but generated media is missing')
  }
  if (nonEmpty(row.video_prompt) && !has_video) {
    if (!reasons.includes('campaign media prompt exists but generated media is missing')) {
      reasons.push('campaign media prompt exists but generated media is missing')
    }
  }
  if (media_status === 'ready' && platformRequiresMedia && !has_image && !has_video) {
    if (!reasons.some(r => r.startsWith('missing required'))) {
      reasons.push(`media_status='ready' but no image_url/video_url present`)
    }
  }
  if (reasons.length > 0) {
    const outcome = media_status === 'failed' ? 'failed' : 'missing'
    return { outcome, blocked: true, reasons, has_image, has_video, media_status }
  }
  if (has_image || has_video) return { outcome: 'ready', blocked: false, reasons: [], has_image, has_video, media_status }
  return { outcome: 'text-only-allowed', blocked: false, reasons: [], has_image, has_video, media_status }
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

function isUnposted(row) {
  if (row.posted_at) return false
  const s = (row.status ?? '').toLowerCase()
  if (TERMINAL_STATUSES.has(s)) return false
  return true
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
  console.log(`${COLORS.bold}Phase 14L — Media Readiness + Caption Link Diagnostic${COLORS.reset}`)
  console.log(`${COLORS.dim}Read-only. No writes. No platform API calls.${COLORS.reset}`)
  console.log()

  // posted_at snapshot BEFORE.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // Pull the joined rows. Phase 14L.2 — also try to read the row-level
  // image_url / video_url / media_status / media_error / media_generated_at
  // / media_source columns from migration 032. If migration 032 hasn't been
  // applied, retry with the legacy SELECT and flag the schema gap.
  let rows = null
  let migration032Applied = true
  {
    const res = await supabase
      .from('content_calendar')
      .select(
        'id, status, platform, caption, image_prompt, tracking_url, campaign_asset_id, posted_at, ' +
        'image_url, video_url, media_status, media_error, media_generated_at, media_source, ' +
        'campaign_asset:campaign_assets!campaign_asset_id(id, image_url, video_url, asset_type)'
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
            'id, status, platform, caption, image_prompt, tracking_url, campaign_asset_id, posted_at, image_url, ' +
            'campaign_asset:campaign_assets!campaign_asset_id(id, image_url, video_url, asset_type)'
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

  const all = (rows ?? []).map(r => {
    const ca = Array.isArray(r.campaign_asset) ? (r.campaign_asset[0] ?? null) : (r.campaign_asset ?? null)
    return {
      ...r,
      // Phase 14L.2 — campaign_asset URLs win when present (carry provenance);
      // row-level URLs from migration 032 are the fallback for organic rows.
      image_url: ca?.image_url ?? r.image_url ?? null,
      video_url: ca?.video_url ?? r.video_url ?? null,
      campaign_asset: ca,
    }
  })
  const unposted = all.filter(isUnposted)

  // 1. Captions with legacy link.
  const captionsWithLegacy = unposted.filter(r => typeof r.caption === 'string' && r.caption.includes(LEGACY_NEEDLE))
  // 2. Branded tracking_url present.
  const branded = unposted.filter(r => typeof r.tracking_url === 'string' && r.tracking_url.startsWith(BRAND_PREFIX))
  // 3. Instagram missing image+video.
  const igRows = unposted.filter(r => (r.platform ?? '').toLowerCase() === 'instagram')
  const igMissingMedia = igRows.filter(r => !nonEmpty(r.image_url) && !nonEmpty(r.video_url))
  // 4. TikTok missing video.
  const tiktokRows = unposted.filter(r => (r.platform ?? '').toLowerCase() === 'tiktok')
  const tiktokMissingVideo = tiktokRows.filter(r => !nonEmpty(r.video_url))
  // 5. Campaign-originated rows with prompt but no generated media.
  const promptPending = unposted.filter(r => {
    if (!r.campaign_asset_id) return false
    const hasPrompt = nonEmpty(r.image_prompt)
    const hasImage = nonEmpty(r.image_url)
    return hasPrompt && !hasImage
  })
  // 6. Rows that would be blocked by validateMediaReadiness.
  const blockedByMedia = unposted.filter(r => validateMediaReadinessJs(r).blocked)
  const blockedReasons = {}
  for (const r of blockedByMedia) {
    const reasons = validateMediaReadinessJs(r).reasons
    for (const reason of reasons) blockedReasons[reason] = (blockedReasons[reason] ?? 0) + 1
  }

  console.log(`${COLORS.bold}0. Migration 032 (content_calendar.video_url + media_status) status${COLORS.reset}`)
  if (migration032Applied) {
    console.log(`   ${COLORS.green}✓ applied — content_calendar.video_url + media_status columns present${COLORS.reset}`)
  } else {
    console.log(`   ${COLORS.yellow}· not applied — running with legacy SELECT (no row-level video_url)${COLORS.reset}`)
    console.log(`   ${COLORS.dim}Apply supabase/migrations/032_add_video_url_and_media_status_to_content_calendar.sql${COLORS.reset}`)
  }
  console.log()

  console.log(`${COLORS.bold}1. Caption legacy-link debt${COLORS.reset}`)
  console.log(`   ${COLORS.yellow}unposted rows containing 'myvortex365.com/leosp':${COLORS.reset} ${captionsWithLegacy.length}`)
  console.log()

  console.log(`${COLORS.bold}2. Branded tracking_url${COLORS.reset}`)
  console.log(`   ${COLORS.green}unposted rows with tracking_url starting ${BRAND_PREFIX}:${COLORS.reset} ${branded.length}`)
  console.log()

  console.log(`${COLORS.bold}3. Instagram media gap${COLORS.reset}`)
  console.log(`   total Instagram unposted: ${igRows.length}`)
  console.log(`   ${COLORS.yellow}missing both image and video:${COLORS.reset} ${igMissingMedia.length}`)
  console.log()

  console.log(`${COLORS.bold}4. TikTok video gap${COLORS.reset}`)
  console.log(`   total TikTok unposted: ${tiktokRows.length}`)
  console.log(`   ${COLORS.yellow}missing video:${COLORS.reset} ${tiktokMissingVideo.length}`)
  console.log()

  console.log(`${COLORS.bold}5. Campaign rows — prompt without generated media${COLORS.reset}`)
  console.log(`   ${COLORS.yellow}image_prompt set but image_url missing:${COLORS.reset} ${promptPending.length}`)
  console.log()

  console.log(`${COLORS.bold}6. Rows blocked by validateMediaReadiness${COLORS.reset}`)
  console.log(`   ${COLORS.cyan}total blocked:${COLORS.reset} ${blockedByMedia.length}`)
  for (const [reason, count] of Object.entries(blockedReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${COLORS.dim}${count}${COLORS.reset}  ${reason}`)
  }
  console.log()

  // Phase 14L.2 — distribution of media_status across unposted rows + count
  // of rows that pass the validator outright. Only meaningful when migration
  // 032 is applied; surface a "n/a" line otherwise.
  console.log(`${COLORS.bold}6b. media_status distribution (Phase 14L.2)${COLORS.reset}`)
  if (migration032Applied) {
    const byMediaStatus = { null: 0, pending: 0, ready: 0, failed: 0, skipped: 0 }
    for (const r of unposted) {
      const ms = normalizeMediaStatus(r.media_status)
      if (ms === null) byMediaStatus.null++
      else byMediaStatus[ms]++
    }
    console.log(`   ${COLORS.dim}null     :${COLORS.reset} ${byMediaStatus.null}`)
    console.log(`   ${COLORS.dim}pending  :${COLORS.reset} ${byMediaStatus.pending}`)
    console.log(`   ${COLORS.green}ready    :${COLORS.reset} ${byMediaStatus.ready}`)
    console.log(`   ${COLORS.red}failed   :${COLORS.reset} ${byMediaStatus.failed}`)
    console.log(`   ${COLORS.dim}skipped  :${COLORS.reset} ${byMediaStatus.skipped}`)
  } else {
    console.log(`   ${COLORS.dim}n/a — migration 032 not applied${COLORS.reset}`)
  }
  console.log()

  const readyAfterMedia = unposted.length - blockedByMedia.length
  console.log(`${COLORS.bold}6c. Rows ready after media (would pass validateMediaReadiness)${COLORS.reset}`)
  console.log(`   ${COLORS.green}ready / text-only-allowed:${COLORS.reset} ${readyAfterMedia} of ${unposted.length}`)
  console.log()

  // 7. posted_at snapshot AFTER.
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  console.log(`${COLORS.bold}7. No-mutation cross-check${COLORS.reset}`)
  if (postedBefore === postedAfter) {
    console.log(`   ${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`)
  } else {
    console.log(`   ${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`)
  }
  console.log()
  console.log(`${COLORS.dim}No platform API calls. No HTTP requests to manual post routes. Read-only.${COLORS.reset}`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
