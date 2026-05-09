#!/usr/bin/env node
/**
 * Phase 14AG — Media generation worker (Pexels image + OpenAI fallback +
 * Pexels Video). HeyGen was excised in Phase 14AG: the avatar pipeline did
 * not match brand voice, was async-only (incompatible with the synchronous
 * weekly-content cron), and was expensive. Pexels Video Search returns
 * cinematic stock travel B-roll synchronously, free, at vertical HD —
 * exactly what TikTok / IG Reels want.
 *
 * SAFETY MODES:
 *   default                                    → DRY-RUN. No provider calls. No DB writes.
 *   --dry-run                                  → DRY-RUN. Same as default; explicit form.
 *   --generate                                 → Calls provider APIs. Prints fetched URLs. NO DB writes.
 *   --generate --apply                         → Calls provider APIs AND writes allowed media columns.
 *   --apply (without --generate)               → Refuses with a clear message — no input source for known URLs in this phase.
 *
 * Always allowed flags:
 *   --limit=N            cap rows processed (default 5; ceiling 50)
 *   --provider=pexels    force Pexels (image search; video defaults to Pexels regardless)
 *   --provider=openai    force OpenAI image generation (no video path)
 *   --provider=auto      pexels-then-openai for image; pexels-video for video (default)
 *   --images-only        only process rows that need image
 *   --videos-only        only process rows that need video
 *   --campaign-only      only process rows whose target_table is campaign_assets
 *   --content-only       only process rows whose target_table is content_calendar (organic)
 *   --id=<row_id>        process exactly one row by content_calendar.id or campaign_asset_id
 *
 * Allowed writes (with --generate --apply only):
 *   content_calendar.image_url
 *   content_calendar.video_url
 *   content_calendar.media_status
 *   content_calendar.media_source
 *   content_calendar.media_generated_at
 *   content_calendar.media_error
 *   content_calendar.media_metadata
 *   campaign_assets.image_url
 *   campaign_assets.video_url
 *   campaign_assets.image_source
 *   campaign_assets.image_source_metadata
 *   campaign_assets.video_source
 *   campaign_assets.video_source_metadata
 *
 * Forbidden (regardless of flags):
 *   content_calendar.status        (especially 'posted')
 *   content_calendar.posted_at
 *   posting_status / posting_gate_approved / queued_for_posting_at
 *   any platform publishing API (Facebook / Instagram / TikTok / X / email)
 *
 * Storage:
 *   Pexels image returns a CDN URL; we re-upload to Supabase Storage so
 *   the URL is durable. Pexels Video returns a stable CDN MP4 URL — we do
 *   NOT re-upload (5–30 MB MP4s, slower, and Pexels CDN URLs are months+
 *   stable). The cron uses the same pattern. If durability becomes a
 *   concern, a future hardening phase can add an async re-upload step.
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

const PLATFORM_RULES = {
  instagram: { image: 'required',    video: 'required',    either_satisfies: true  },
  tiktok:    { image: 'none',        video: 'required',    either_satisfies: false },
  youtube:   { image: 'none',        video: 'required',    either_satisfies: false },
  facebook:  { image: 'recommended', video: 'recommended', either_satisfies: true  },
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
 * Per-row recommendation (pure logic — no DB / provider calls).
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
      needs_image = true
    }
  } else {
    if (rule.image === 'required' && !has_image) needs_image = true
    if (rule.video === 'required' && !has_video) needs_video = true
  }

  if (!needs_image && nonEmpty(row.image_prompt) && !has_image) needs_image = true
  if (!needs_video && nonEmpty(row.video_prompt) && !has_video) needs_video = true

  if (!needs_image && !needs_video) return { needs: 'none', reason: 'media already present or not required' }

  const target_table = row.campaign_asset_id ? 'campaign_assets' : 'content_calendar'
  const target_id = row.campaign_asset_id ?? row.id

  const source_image = needs_image ? 'pexels (fallback: openai-image)' : null
  const source_video = needs_video ? 'pexels-video' : null

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
    target_id,
  }
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const flags = {
    apply: false,
    generate: false,
    explicitDryRun: false,
    limit: 5,
    provider: 'auto',
    imagesOnly: false,
    videosOnly: false,
    campaignOnly: false,
    contentOnly: false,
    id: null,
  }
  for (const a of args) {
    if (a === '--apply') flags.apply = true
    else if (a === '--generate') flags.generate = true
    else if (a === '--dry-run') flags.explicitDryRun = true
    else if (a === '--images-only') flags.imagesOnly = true
    else if (a === '--videos-only') flags.videosOnly = true
    else if (a === '--campaign-only') flags.campaignOnly = true
    else if (a === '--content-only') flags.contentOnly = true
    else if (a.startsWith('--limit=')) {
      const n = Number(a.split('=')[1])
      if (Number.isFinite(n) && n > 0) flags.limit = Math.min(Math.floor(n), 50)
    } else if (a.startsWith('--provider=')) {
      const p = a.split('=')[1]?.toLowerCase()
      if (['pexels', 'openai', 'auto'].includes(p)) flags.provider = p
    } else if (a.startsWith('--id=')) {
      const v = a.split('=')[1]?.trim()
      if (v) flags.id = v
    }
  }
  return flags
}

// ============================================================
// Provider helpers — JS mirrors of src/lib/media-providers.ts so this
// script can run standalone without a TS toolchain. Both must stay in
// sync; the TypeScript module is the source of truth for shape.
// ============================================================

function normalizeError(err) {
  if (!err) return 'unknown error'
  if (typeof err === 'string') return err.slice(0, 500)
  if (err instanceof Error) return err.message.slice(0, 500)
  if (typeof err === 'object') {
    const oe = err.error
    if (typeof oe === 'string') return oe.slice(0, 500)
    if (oe && typeof oe === 'object' && typeof oe.message === 'string') return oe.message.slice(0, 500)
    if (typeof err.message === 'string') return err.message.slice(0, 500)
  }
  try { return JSON.stringify(err).slice(0, 500) } catch { return 'unserializable error' }
}

async function fetchPexelsImage(env, { query, orientation }) {
  const key = env.PEXELS_API_KEY
  if (!key) return { success: false, provider: 'pexels', error: 'PEXELS_API_KEY not set' }
  if (!nonEmpty(query)) return { success: false, provider: 'pexels', error: 'query is required' }
  const params = new URLSearchParams({ query: query.slice(0, 200), per_page: '1' })
  if (orientation) params.set('orientation', orientation)
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: key },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, provider: 'pexels', error: normalizeError(data) || `pexels http ${res.status}` }
    const photo = data?.photos?.[0]
    const src = photo?.src?.large2x ?? photo?.src?.large ?? photo?.src?.original
    if (!src) return { success: false, provider: 'pexels', error: 'pexels returned no usable photo' }
    return { success: true, provider: 'pexels', url: src, external_id: photo?.id != null ? String(photo.id) : undefined, raw: photo }
  } catch (err) {
    return { success: false, provider: 'pexels', error: normalizeError(err) }
  }
}

async function generateOpenAIImage(env, { prompt, size }) {
  const key = env.OPENAI_API_KEY
  if (!key) return { success: false, provider: 'openai', error: 'OPENAI_API_KEY not set' }
  if (!nonEmpty(prompt)) return { success: false, provider: 'openai', error: 'prompt is required' }
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: `Photorealistic lifestyle travel photo. ${prompt}. Real people, candid and natural expressions, not posed or stock-photo stiff. Warm, vibrant colors. No text overlays, no logos. Shot on a professional camera, shallow depth of field.`,
        n: 1,
        size: size ?? '1024x1024',
        quality: 'standard',
        response_format: 'url',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, provider: 'openai', error: normalizeError(data) || `openai http ${res.status}` }
    const url = data?.data?.[0]?.url
    if (!url) return { success: false, provider: 'openai', error: 'openai returned no image url' }
    return { success: true, provider: 'openai', url, raw: data?.data?.[0] }
  } catch (err) {
    return { success: false, provider: 'openai', error: normalizeError(err) }
  }
}

/**
 * Phase 14AG — pick the best vertical HD MP4 from a Pexels video entry.
 * Same logic as `pickBestPortraitMp4` in src/lib/media-providers.ts.
 */
function pickBestPortraitMp4(entry) {
  const files = (entry.video_files ?? []).filter(f => typeof f.link === 'string' && f.link.length > 0)
  if (files.length === 0) return null
  const mp4 = files.filter(f => (f.file_type ?? 'video/mp4').toLowerCase().includes('mp4'))
  const pool = mp4.length > 0 ? mp4 : files
  const portrait = pool.filter(f => (f.height ?? 0) > (f.width ?? 0))
  const target = portrait.length > 0 ? portrait : pool
  const qualityRank = q => {
    const lower = (q ?? '').toLowerCase()
    if (lower === 'uhd') return 3
    if (lower === 'hd') return 2
    if (lower === 'sd') return 1
    return 0
  }
  return target.slice().sort((a, b) => {
    const dq = qualityRank(b.quality) - qualityRank(a.quality)
    if (dq !== 0) return dq
    return (b.height ?? 0) - (a.height ?? 0)
  })[0] ?? null
}

/**
 * Phase 14AH.1 — randomized Pexels Video fetcher. JS mirror of
 * `fetchAndStoreVideo` in src/lib/media-providers.ts. Picks a random page
 * 1–5 and a random unused candidate from that page, falling back to a
 * second random page and finally a last-resort duplicate. Optional
 * exclude sets layer extra dedup on top of the random pick (the
 * standalone script pre-queries the DB; the cron passes only an in-run
 * accumulator).
 */
function collectUsableVideos(videos, minDur, maxDur, exIds, exUrls, allowExcluded, enforceDuration) {
  const isExcluded = (entry, file) => {
    if (allowExcluded) return false
    const idStr = entry.id != null ? String(entry.id) : ''
    if (idStr && exIds.has(idStr)) return true
    if (file.link && exUrls.has(file.link)) return true
    return false
  }
  const out = []
  for (const entry of videos) {
    if (enforceDuration) {
      const dur = entry.duration ?? 0
      if (dur < minDur || dur > maxDur) continue
    }
    const file = pickBestPortraitMp4(entry)
    if (!file?.link) continue
    if (isExcluded(entry, file)) continue
    out.push({ entry, file })
  }
  return out
}

async function fetchPexelsVideo(env, { query, orientation, size, perPage, minDuration, maxDuration, excludePexelsIds, excludeUrls }) {
  const key = env.PEXELS_API_KEY
  if (!key) return { success: false, provider: 'pexels-video', error: 'PEXELS_API_KEY not set' }
  if (!nonEmpty(query)) return { success: false, provider: 'pexels-video', error: 'query is required' }
  const pp = String(Math.max(1, Math.min(perPage ?? 15, 80)))
  const ori = orientation ?? 'portrait'
  const sz = size ?? 'large'
  const minDur = Math.max(1, minDuration ?? 5)
  const maxDur = Math.max(minDur, maxDuration ?? 30)
  const exIds = excludePexelsIds ?? new Set()
  const exUrls = excludeUrls ?? new Set()

  const fetchRandomPage = async excludePages => {
    let page = 1 + Math.floor(Math.random() * 5)
    let attempts = 0
    while (excludePages.has(page) && attempts < 10) {
      page = 1 + Math.floor(Math.random() * 5)
      attempts++
    }
    const params = new URLSearchParams({ query: query.slice(0, 200), per_page: pp, orientation: ori, size: sz, page: String(page) })
    try {
      const res = await fetch(`https://api.pexels.com/videos/search?${params.toString()}`, {
        headers: { Authorization: key },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: normalizeError(data) || `pexels-video http ${res.status}` }
      return { ok: true, data, page }
    } catch (err) {
      return { ok: false, error: normalizeError(err) }
    }
  }

  const buildResult = (entry, file, duplicate, page) => ({
    success: true,
    provider: 'pexels-video',
    url: file.link,
    external_id: entry.id != null ? String(entry.id) : undefined,
    raw: {
      video_id: entry.id,
      duration: entry.duration,
      width: file.width,
      height: file.height,
      quality: file.quality,
      file_type: file.file_type,
      page_url: entry.url,
      pexels_page: page,
      ...(duplicate ? { duplicate_fallback: true } : {}),
    },
  })

  const tried = new Set()
  let lastData = null
  let lastPage = 1

  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetchRandomPage(tried)
    if (!r.ok) {
      if (attempt === 0) return { success: false, provider: 'pexels-video', error: r.error }
      break
    }
    tried.add(r.page)
    lastData = r.data
    lastPage = r.page
    const videos = r.data?.videos ?? []
    if (videos.length === 0) continue

    const candidates = collectUsableVideos(videos, minDur, maxDur, exIds, exUrls, false, true)
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)]
      return buildResult(pick.entry, pick.file, false, r.page)
    }
    const relaxed = collectUsableVideos(videos, minDur, maxDur, exIds, exUrls, false, false)
    if (relaxed.length > 0) {
      const pick = relaxed[Math.floor(Math.random() * relaxed.length)]
      return buildResult(pick.entry, pick.file, false, r.page)
    }
  }

  if (lastData) {
    const videos = lastData.videos ?? []
    const fallback = collectUsableVideos(videos, minDur, maxDur, exIds, exUrls, true, false)
    if (fallback.length > 0) {
      const pick = fallback[Math.floor(Math.random() * fallback.length)]
      return buildResult(pick.entry, pick.file, true, lastPage)
    }
  }
  return { success: false, provider: 'pexels-video', error: 'pexels-video returned no usable mp4' }
}

// ============================================================
// Storage helper — re-upload a remote URL to Supabase `media` bucket.
// Mirrors the pattern in src/app/api/cron/weekly-content/route.ts.
// Returns the final public URL or null on failure.
// ============================================================

async function downloadAndStoreImage(supabase, remoteUrl, prefix) {
  try {
    const res = await fetch(remoteUrl)
    if (!res.ok) return { ok: false, error: `download http ${res.status}` }
    const buf = await res.arrayBuffer()
    const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error: upErr } = await supabase.storage.from('media').upload(fileName, buf, {
      contentType: 'image/jpeg',
      upsert: false,
    })
    if (upErr) return { ok: false, error: `upload: ${upErr.message}` }
    const { data: pub } = supabase.storage.from('media').getPublicUrl(fileName)
    if (!pub?.publicUrl) return { ok: false, error: 'no public url returned' }
    return { ok: true, url: pub.publicUrl, fileName }
  } catch (err) {
    return { ok: false, error: normalizeError(err) }
  }
}

// ============================================================
// Per-row processor — decides which provider to call for the row, then
// optionally writes the resulting URL back to the right table+column.
// ============================================================

async function processImage(supabase, env, row, flags) {
  const query = buildImageQuery(row)
  let result
  if (flags.provider === 'pexels' || flags.provider === 'auto') {
    const orientation = imageOrientationFor(row.platform)
    result = await fetchPexelsImage(env, { query, orientation })
    if (!result.success && flags.provider === 'auto') {
      const promptText = nonEmpty(row.image_prompt) ? row.image_prompt : query
      const fallback = await generateOpenAIImage(env, { prompt: promptText })
      if (fallback.success) result = fallback
    }
  } else if (flags.provider === 'openai') {
    const promptText = nonEmpty(row.image_prompt) ? row.image_prompt : query
    result = await generateOpenAIImage(env, { prompt: promptText })
  } else {
    return { ok: false, error: `provider '${flags.provider}' is not an image provider` }
  }
  if (!result.success) return { ok: false, provider: result.provider, error: result.error }

  if (!flags.apply) {
    return { ok: true, provider: result.provider, url: result.url, external_id: result.external_id, durable: false }
  }
  const stored = await downloadAndStoreImage(supabase, result.url, `content/${row.platform || 'misc'}`)
  if (!stored.ok) return { ok: false, provider: result.provider, error: `storage: ${stored.error}` }
  return { ok: true, provider: result.provider, url: stored.url, external_id: result.external_id, durable: true }
}

/**
 * Phase 14AG/14AH — fetch a Pexels Video for the row. Synchronous —
 * Pexels returns the MP4 URL immediately, so the row can land at
 * media_status='ready' in a single pass. Search query priority:
 *   1. row.image_prompt   (preferred — already curated by the AI for this row)
 *   2. row.video_prompt
 *   3. row.caption        (truncated; last-resort)
 *
 * The caller passes `excludePexelsIds` and `excludeUrls` (built once at
 * script start from existing content_calendar rows + accumulated within
 * the work loop) so we never pick a duplicate Pexels video. The dedup
 * walker also retries with a randomized page 2–6 if page 1 is exhausted.
 * Returns { ok, url, external_id, raw } on success; raw.duplicate_fallback
 * is true when we shipped a duplicate as a last resort.
 */
async function processVideo(supabase, env, row, flags, excludePexelsIds, excludeUrls) {
  void supabase
  if (flags.provider !== 'pexels' && flags.provider !== 'auto') {
    return { ok: false, error: `provider '${flags.provider}' is not configured for video — only 'auto' or 'pexels' fetches Pexels Video` }
  }
  const query = buildVideoQuery(row)
  if (!nonEmpty(query)) {
    return { ok: false, error: 'no video search query available (no image_prompt / video_prompt / caption)', skipped: true }
  }
  const result = await fetchPexelsVideo(env, {
    query,
    orientation: 'portrait',
    size: 'large',
    perPage: 15,
    minDuration: 5,
    maxDuration: 30,
    excludePexelsIds,
    excludeUrls,
  })
  if (!result.success) return { ok: false, provider: 'pexels-video', error: result.error }
  return {
    ok: true,
    provider: 'pexels-video',
    url: result.url,
    external_id: result.external_id,
    raw: result.raw,
  }
}

function buildImageQuery(row) {
  if (nonEmpty(row.image_prompt)) return row.image_prompt.slice(0, 100)
  if (nonEmpty(row.campaign_event_name)) return `${row.campaign_event_name} travel`
  if (nonEmpty(row.caption)) return row.caption.slice(0, 60)
  return 'travel destination scenic'
}

function buildVideoQuery(row) {
  // Phase 14AG — prefer image_prompt because the new ai-prompts.ts asks the
  // AI to write the TikTok image_prompt as a Pexels Video search query.
  if (nonEmpty(row.image_prompt)) return row.image_prompt.slice(0, 100)
  if (nonEmpty(row.video_prompt)) return row.video_prompt.slice(0, 100)
  if (nonEmpty(row.campaign_event_name)) return `${row.campaign_event_name} travel cinematic`
  if (nonEmpty(row.caption)) return row.caption.slice(0, 60)
  return ''
}

function imageOrientationFor(platform) {
  const p = (platform || '').toLowerCase()
  if (p === 'instagram' || p === 'tiktok') return 'portrait'
  if (p === 'facebook' || p === 'linkedin') return 'landscape'
  return undefined
}

// ============================================================
// DB writers — only invoked with --generate --apply. Strictly limited to
// the allow-list of media columns; never touches status / posted_at /
// posting_status / posting_gate_approved / queued_for_posting_at.
// ============================================================

async function writeMediaToContentCalendar(supabase, contentId, payload) {
  const ALLOWED = new Set(['image_url', 'video_url', 'media_status', 'media_source', 'media_generated_at', 'media_error', 'media_metadata'])
  const safe = {}
  for (const [k, v] of Object.entries(payload)) {
    if (ALLOWED.has(k)) safe[k] = v
  }
  if (Object.keys(safe).length === 0) return { ok: false, error: 'empty payload' }
  const { error } = await supabase.from('content_calendar').update(safe).eq('id', contentId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function writeMediaToCampaignAsset(supabase, assetId, payload) {
  const ALLOWED = new Set([
    'image_url', 'video_url',
    'image_source', 'image_source_metadata',
    'video_source', 'video_source_metadata',
  ])
  const safe = {}
  for (const [k, v] of Object.entries(payload)) {
    if (ALLOWED.has(k)) safe[k] = v
  }
  if (Object.keys(safe).length === 0) return { ok: false, error: 'empty payload' }
  const { error } = await supabase.from('campaign_assets').update(safe).eq('id', assetId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ============================================================

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
  try { ;({ createClient } = require('@supabase/supabase-js')) }
  catch {
    console.error(`${COLORS.red}@supabase/supabase-js not installed. Run "npm install" first.${COLORS.reset}`)
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const mode = flags.apply
    ? (flags.generate ? 'GENERATE+APPLY (provider calls + DB writes)' : 'APPLY-ONLY (refused)')
    : flags.generate
      ? 'GENERATE (provider calls; NO writes)'
      : 'DRY-RUN'

  console.log()
  console.log(`${COLORS.bold}Phase 14AG — Media Generation Worker [${mode}]${COLORS.reset}`)
  if (!flags.generate) {
    console.log(`${COLORS.dim}No provider API calls. No platform calls. No mutations.${COLORS.reset}`)
  } else if (!flags.apply) {
    console.log(`${COLORS.yellow}May call provider APIs (Pexels image/video / OpenAI image fallback). DB writes are DISABLED.${COLORS.reset}`)
  } else {
    console.log(`${COLORS.red}May call provider APIs AND write media columns to DB. NEVER posts to platforms.${COLORS.reset}`)
  }
  console.log()

  if (flags.apply && !flags.generate) {
    console.log(`${COLORS.red}Refused: --apply without --generate has no input source for known URLs in this phase.${COLORS.reset}`)
    console.log(`${COLORS.dim}Pass --generate alongside --apply to fetch + persist; or drop --apply to dry-run.${COLORS.reset}`)
    process.exit(2)
  }

  // Phase 14AH.1 — pre-flight: refuse to run when PEXELS_API_KEY is empty
  // and the chosen provider needs it. Fails the run BEFORE any DB SELECT
  // or row update, so a config error never marks rows as media_status=
  // 'failed'. Only enforced under --generate (dry-run mode is allowed to
  // proceed for queue inspection without provider keys).
  if (flags.generate && (flags.provider === 'auto' || flags.provider === 'pexels')) {
    const k = env.PEXELS_API_KEY
    if (typeof k !== 'string' || k.trim().length === 0) {
      console.error(`${COLORS.red}Refused: PEXELS_API_KEY is missing or empty in .env.local.${COLORS.reset}`)
      console.error(`${COLORS.dim}provider='${flags.provider}' requires Pexels for image search and (since 14AG) video search.${COLORS.reset}`)
      console.error(`${COLORS.dim}Add a real key to .env.local line 37 (PEXELS_API_KEY="...") and re-run.${COLORS.reset}`)
      console.error(`${COLORS.dim}No DB rows touched.${COLORS.reset}`)
      process.exit(1)
    }
  }

  // 0. posted_at no-mutation snapshot.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // 1. Pull unposted rows + linked assets.
  const { data: rows, error: selErr } = await supabase
    .from('content_calendar')
    .select(
      'id, status, platform, week_of, caption, image_url, video_url, video_script, image_prompt, ' +
      'media_status, media_error, media_generated_at, media_source, media_metadata, ' +
      'campaign_asset_id, posted_at, ' +
      'campaign_asset:campaign_assets!campaign_asset_id(id, campaign_id, asset_type, image_url, video_url, image_source, video_source, body)'
    )
    .order('created_at', { ascending: false })
    .limit(5000)
  if (selErr) {
    console.error(`${COLORS.red}Query failed:${COLORS.reset} ${selErr.message}`)
    process.exit(2)
  }

  // 2. Resolve campaign event names for prompt/query building.
  const allRowsRaw = rows ?? []
  const campaignIds = [...new Set(
    allRowsRaw
      .map(r => Array.isArray(r.campaign_asset) ? r.campaign_asset[0]?.campaign_id : r.campaign_asset?.campaign_id)
      .filter(Boolean)
  )]
  let campaignMap = {}
  if (campaignIds.length > 0) {
    const { data: cs } = await supabase
      .from('event_campaigns')
      .select('id, event_name, event_year, event_slug')
      .in('id', campaignIds)
    campaignMap = Object.fromEntries((cs ?? []).map(c => [c.id, c]))
  }

  const all = allRowsRaw.map(r => {
    const ca = Array.isArray(r.campaign_asset) ? (r.campaign_asset[0] ?? null) : (r.campaign_asset ?? null)
    const camp = ca?.campaign_id ? campaignMap[ca.campaign_id] : null
    return {
      ...r,
      asset_image_url: ca?.image_url ?? null,
      asset_video_url: ca?.video_url ?? null,
      asset_type: ca?.asset_type ?? null,
      asset_body: ca?.body ?? null,
      asset_campaign_id: ca?.campaign_id ?? null,
      campaign_event_name: camp?.event_name ?? null,
      image_url: ca?.image_url ?? r.image_url ?? null,
      video_url: ca?.video_url ?? r.video_url ?? null,
      video_prompt: null,
    }
  })
  const unposted = all.filter(isUnposted)

  // 3. Build the candidate queue, applying flag filters.
  const queue = []
  for (const r of unposted) {
    if (flags.id && r.id !== flags.id && r.campaign_asset_id !== flags.id) continue
    const rec = recommend(r)
    if (rec.needs === 'none') continue
    if (flags.imagesOnly && rec.needs === 'video') continue
    if (flags.videosOnly && rec.needs === 'image') continue
    if (flags.campaignOnly && rec.target_table !== 'campaign_assets') continue
    if (flags.contentOnly && rec.target_table !== 'content_calendar') continue
    // Phase 14AG — skip rows that have no usable video search query when
    // the row needs a video. Prevents wasted Pexels-video calls.
    if ((rec.needs === 'video' || rec.needs === 'both') && !nonEmpty(buildVideoQuery(r))) continue
    queue.push({ row: r, rec })
  }

  console.log(`${COLORS.bold}Queue${COLORS.reset}`)
  console.log(`   total scanned (unposted):  ${unposted.length}`)
  console.log(`   matched filters:           ${queue.length}`)
  console.log(`   limit:                     ${flags.limit}`)
  console.log(`   provider preference:       ${flags.provider}`)
  console.log()

  const work = queue.slice(0, flags.limit)
  if (work.length === 0) {
    if (flags.id) {
      console.log(`${COLORS.yellow}No eligible row for --id=${flags.id}.${COLORS.reset}`)
      console.log(`${COLORS.dim}Either the id doesn't exist, the row is already posted, or it already has the media it needs.${COLORS.reset}`)
    } else {
      console.log(`${COLORS.dim}Nothing to do. (queue empty after filters)${COLORS.reset}`)
    }
    process.exit(0)
  }

  // Phase 14AH — pre-query existing video URLs and Pexels video ids so the
  // Pexels-video walker can skip duplicates. Also seeded with linked
  // campaign_assets video metadata. The accumulator grows as rows pick a
  // video — that prevents a multi-row run from picking the same MP4 twice.
  const existingUrls = new Set()
  const existingPexelsIds = new Set()
  for (const r of allRowsRaw) {
    if (typeof r.video_url === 'string' && r.video_url.length > 0) existingUrls.add(r.video_url)
    const meta = (r.media_metadata && typeof r.media_metadata === 'object') ? r.media_metadata : null
    const pid = meta?.pexels_video_id
    if (typeof pid === 'string' && pid.length > 0) existingPexelsIds.add(pid)
    else if (typeof pid === 'number') existingPexelsIds.add(String(pid))
  }
  // Also pull in campaign_assets video provenance to avoid cross-table dupes.
  {
    const { data: caRows } = await supabase
      .from('campaign_assets')
      .select('video_url, video_source_metadata')
      .not('video_url', 'is', null)
      .limit(2000)
    for (const r of caRows ?? []) {
      if (typeof r.video_url === 'string' && r.video_url.length > 0) existingUrls.add(r.video_url)
      const meta = (r.video_source_metadata && typeof r.video_source_metadata === 'object') ? r.video_source_metadata : null
      const pid = meta?.pexels_video_id
      if (typeof pid === 'string' && pid.length > 0) existingPexelsIds.add(pid)
      else if (typeof pid === 'number') existingPexelsIds.add(String(pid))
    }
  }
  console.log(`${COLORS.bold}Dedup state${COLORS.reset}`)
  console.log(`   existing video_url count:   ${existingUrls.size}`)
  console.log(`   existing pexels_video_id:   ${existingPexelsIds.size}`)
  console.log()

  // 4. Process each row.
  let succeeded = 0
  let failed = 0
  let skipped = 0
  const samples = []

  for (const { row, rec } of work) {
    const item = { id: row.id, platform: row.platform, target: rec.target_table, needs: rec.needs }

    if (!flags.generate) {
      samples.push({ ...item, action: 'dry-run', detail: 'no provider call' })
      continue
    }

    // Image path.
    if (rec.needs === 'image' || (rec.needs === 'both' && !flags.videosOnly)) {
      const r = await processImage(supabase, env, row, flags)
      if (!r.ok) {
        failed++
        samples.push({ ...item, action: 'image', success: false, error: r.error, provider: r.provider })
        if (flags.apply && rec.target_table === 'content_calendar') {
          await writeMediaToContentCalendar(supabase, row.id, {
            media_status: 'failed',
            media_source: r.provider ?? null,
            media_error: (r.error ?? 'image generation failed').slice(0, 1000),
          })
        }
      } else {
        samples.push({ ...item, action: 'image', success: true, provider: r.provider, url: r.url, durable: r.durable })
        succeeded++
        if (flags.apply) {
          if (rec.target_table === 'content_calendar') {
            await writeMediaToContentCalendar(supabase, row.id, {
              image_url: r.url,
              media_status: 'ready',
              media_source: r.provider,
              media_generated_at: new Date().toISOString(),
              media_error: null,
            })
          } else {
            await writeMediaToCampaignAsset(supabase, rec.target_id, {
              image_url: r.url,
              image_source: r.provider,
              image_source_metadata: {
                generated_by: 'scripts/generate-missing-media.js',
                phase: '14AG',
                external_id: r.external_id ?? null,
                generated_at: new Date().toISOString(),
              },
            })
          }
        }
      }
      // If row needed both, skip the video pass on the same row in this
      // limit slot — keep one provider call per row per run for safety.
      if (rec.needs === 'both') continue
    }

    // Video path — Pexels Video, synchronous, lands at media_status='ready'.
    if (rec.needs === 'video' || (rec.needs === 'both' && flags.videosOnly)) {
      const r = await processVideo(supabase, env, row, flags, existingPexelsIds, existingUrls)
      if (!r.ok) {
        if (r.skipped) {
          skipped++
          samples.push({ ...item, action: 'video', success: false, skipped: true, error: r.error })
        } else {
          failed++
          samples.push({ ...item, action: 'video', success: false, error: r.error, provider: r.provider })
          if (flags.apply && rec.target_table === 'content_calendar') {
            await writeMediaToContentCalendar(supabase, row.id, {
              media_status: 'failed',
              media_source: 'pexels',
              media_error: (r.error ?? 'pexels-video fetch failed').slice(0, 1000),
            })
          }
        }
      } else {
        succeeded++
        // Phase 14AH — accumulate the just-picked video into the dedup
        // sets so the next row in this run can't pick the same MP4.
        if (typeof r.url === 'string' && r.url.length > 0) existingUrls.add(r.url)
        if (typeof r.external_id === 'string' && r.external_id.length > 0) existingPexelsIds.add(r.external_id)
        const dupTag = r.raw && r.raw.duplicate_fallback ? ' (DUP)' : ''
        samples.push({ ...item, action: 'video' + dupTag, success: true, provider: 'pexels-video', url: r.url, external_id: r.external_id })
        if (flags.apply) {
          if (rec.target_table === 'campaign_assets') {
            await writeMediaToCampaignAsset(supabase, rec.target_id, {
              video_url: r.url,
              video_source: 'pexels',
              video_source_metadata: {
                pexels_video_id: r.external_id ?? null,
                generated_by: 'scripts/generate-missing-media.js',
                phase: '14AG',
                generated_at: new Date().toISOString(),
                ...(r.raw ?? {}),
              },
            })
          } else {
            // Phase 14AG — preserve existing media_metadata (e.g.
            // on_screen_hook from the cron) and merge Pexels-video provenance.
            const { data: cur } = await supabase
              .from('content_calendar')
              .select('media_metadata')
              .eq('id', row.id)
              .maybeSingle()
            const existing = (cur?.media_metadata && typeof cur.media_metadata === 'object') ? cur.media_metadata : {}
            await writeMediaToContentCalendar(supabase, row.id, {
              video_url: r.url,
              media_status: 'ready',
              media_source: 'pexels',
              media_generated_at: new Date().toISOString(),
              media_error: null,
              media_metadata: {
                ...existing,
                source: 'pexels-video',
                pexels_video_id: r.external_id ?? null,
                fetched_at: new Date().toISOString(),
                fetched_by: 'scripts/generate-missing-media.js',
                ...(r.raw ?? {}),
              },
            })
          }
        }
      }
    }
  }

  // 5. Print samples.
  console.log(`${COLORS.bold}Per-row outcomes${COLORS.reset}`)
  for (const s of samples) {
    const tag = s.success === true ? `${COLORS.green}ok${COLORS.reset}`
              : s.skipped         ? `${COLORS.yellow}skip${COLORS.reset}`
              : s.success === false ? `${COLORS.red}err${COLORS.reset}`
              : `${COLORS.dim}plan${COLORS.reset}`
    const url = s.url ? ` ${COLORS.dim}${s.url}${COLORS.reset}` : ''
    const ext = s.external_id ? ` ${COLORS.dim}(pexels_id=${s.external_id})${COLORS.reset}` : ''
    const err = s.error ? ` ${COLORS.dim}— ${s.error}${COLORS.reset}` : ''
    const dur = s.durable === false ? ` ${COLORS.yellow}[provider URL — not stored]${COLORS.reset}` : ''
    console.log(`   [${tag}] ${s.id} ${s.platform} ${s.action ?? 'plan'} → ${s.target}${url}${ext}${dur}${err}`)
  }
  console.log()
  console.log(`${COLORS.bold}Summary${COLORS.reset}`)
  console.log(`   succeeded: ${succeeded}`)
  console.log(`   failed:    ${failed}`)
  console.log(`   skipped:   ${skipped}`)
  console.log()

  // 6. Provider key presence.
  console.log(`${COLORS.bold}Provider key presence${COLORS.reset}`)
  for (const [name, role] of [
    ['PEXELS_API_KEY',  'image + video (primary)'],
    ['OPENAI_API_KEY',  'image (fallback)'],
  ]) {
    const present = !!(env[name] && env[name].length > 0)
    console.log(`   ${present ? COLORS.green + '✓' : COLORS.yellow + '·'} ${name}${COLORS.reset}  (${role}) ${present ? 'present' : 'MISSING'}`)
  }
  console.log()

  // 7. posted_at unchanged cross-check.
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  console.log(postedBefore === postedAfter
    ? `${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`
    : `${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`
  )
  console.log(`${COLORS.dim}No platform API calls. Live posting remains BLOCKED.${COLORS.reset}`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
