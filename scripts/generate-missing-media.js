#!/usr/bin/env node
/**
 * Phase 14L.2.6 — Media generation worker (controlled HeyGen batch unlock).
 *
 * Replaces the Phase 14L.2.2 hard-coded `--limit=1` HeyGen pilot guard with
 * a controlled batch cap:
 *   - default cap: 5 HeyGen renders per invocation
 *   - --allow-large-heygen-batch: lifts the cap to 10
 *   - absolute ceiling: 10 (--limit=11+ is refused even with the flag)
 *   - --videos-only --provider=auto follows the same caps (auto fans out to HeyGen)
 *
 * New flags:
 *   --allow-large-heygen-batch  lift the cap from 5 to 10
 *   --allow-when-pending        permit queueing while pending HeyGen jobs exist
 *
 * Pre-flight refusal contract for the HeyGen path (any provider=heygen run,
 * or videos-only + provider=auto):
 *   - refuses if --limit > the active cap
 *   - refuses if pending HeyGen jobs exist (override with --allow-when-pending)
 *   - refuses if any selected row is posted, has video_url, or has no script
 *   - all checks run BEFORE any provider call
 *
 * Original Phase 14L.2.1 docs follow.
 *
 * --- ORIGINAL ---
 *
 * Phase 14L.2.1 — Media generation worker.
 *
 * SAFETY MODES:
 *   default                                    → DRY-RUN. No provider calls. No DB writes.
 *   --dry-run                                  → DRY-RUN. Same as default; explicit form.
 *   --generate                                 → Calls provider APIs. Prints fetched/generated URLs. NO DB writes.
 *   --generate --apply                         → Calls provider APIs AND writes allowed media columns.
 *   --apply (without --generate)               → Refuses with a clear message — no input source for known URLs in this phase.
 *
 * Always allowed flags:
 *   --limit=N            cap rows processed (default 5)
 *   --provider=pexels    force a specific image provider (default 'pexels' with openai fallback when 'auto')
 *   --provider=openai
 *   --provider=heygen
 *   --provider=auto      pexels-then-openai for image; heygen for video
 *   --images-only        only process rows that need image
 *   --videos-only        only process rows that need video
 *   --campaign-only      only process rows whose target_table is campaign_assets
 *   --content-only       only process rows whose target_table is content_calendar (organic)
 *
 * Allowed writes (with --generate --apply only):
 *   content_calendar.image_url
 *   content_calendar.video_url
 *   content_calendar.media_status
 *   content_calendar.media_source
 *   content_calendar.media_generated_at
 *   content_calendar.media_error
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
 *   Pexels + OpenAI return temporary URLs. We download + re-upload to the
 *   Supabase Storage `media` bucket (same pattern as
 *   src/app/api/cron/weekly-content/route.ts) so the URL is durable. HeyGen
 *   is async; we DO NOT re-upload here — instead we store the video_id and
 *   let scripts/check-video-generation-status.js poll it later.
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
  let source_video = null
  if (needs_video) {
    if (nonEmpty(row.video_script) || nonEmpty(row.video_prompt)) source_video = 'heygen'
    else source_video = '⚠ blocked: video script missing'
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
    target_id,
  }
}

// Phase 14L.2.6 — batch caps for HeyGen. Default cap is 5 renders per
// invocation; lifting to up to 10 requires --allow-large-heygen-batch.
const HEYGEN_DEFAULT_BATCH_MAX = 5
const HEYGEN_ABSOLUTE_BATCH_MAX = 10

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
    /** Phase 14L.2.2 — single-row pilot pin. When set, only this row is
     *  considered for processing; matched against either content_calendar.id
     *  or campaign_asset_id. */
    id: null,
    /** Phase 14L.2.6 — lift the default HeyGen batch cap (5) up to the
     *  absolute cap (10). Required to use --limit > 5 with HeyGen. */
    allowLargeHeygenBatch: false,
    /** Phase 14L.2.6 — by default the HeyGen path refuses to queue when
     *  pending HeyGen jobs already exist (avoids stacking renders before
     *  the first batch lands). Set this flag to override. */
    allowWhenPending: false,
  }
  for (const a of args) {
    if (a === '--apply') flags.apply = true
    else if (a === '--generate') flags.generate = true
    else if (a === '--dry-run') flags.explicitDryRun = true
    else if (a === '--images-only') flags.imagesOnly = true
    else if (a === '--videos-only') flags.videosOnly = true
    else if (a === '--campaign-only') flags.campaignOnly = true
    else if (a === '--content-only') flags.contentOnly = true
    else if (a === '--allow-large-heygen-batch') flags.allowLargeHeygenBatch = true
    else if (a === '--allow-when-pending') flags.allowWhenPending = true
    else if (a.startsWith('--limit=')) {
      const n = Number(a.split('=')[1])
      if (Number.isFinite(n) && n > 0) flags.limit = Math.min(Math.floor(n), 50)
    } else if (a.startsWith('--provider=')) {
      const p = a.split('=')[1]?.toLowerCase()
      if (['pexels', 'openai', 'heygen', 'auto'].includes(p)) flags.provider = p
    } else if (a.startsWith('--id=')) {
      const v = a.split('=')[1]?.trim()
      if (v) flags.id = v
    }
  }
  return flags
}

/**
 * Phase 14L.2.2 — strip director cues so HeyGen does not speak them.
 * Removes bracketed direction blocks like `[VISUAL: …]`, `[B-ROLL: …]`,
 * `[CTA: …]`, plus stage-direction lines starting with "Hook:" / "Outro:".
 * The cleaned text is what HeyGen actually voices.
 */
function cleanScriptForHeyGen(raw) {
  if (typeof raw !== 'string') return ''
  let s = raw.replace(/\[[^\]]*\]/g, ' ')      // drop [VISUAL: ...] / [CTA:] / etc
  s = s.replace(/\s+(Hook|Outro|CTA|Intro|Pause)\s*:\s*/gi, ' ')   // drop labels
  s = s.replace(/^\s*(Hook|Outro|CTA|Intro|Pause)\s*:\s*/i, '')    // ditto at start
  s = s.replace(/\s{2,}/g, ' ').trim()
  return s
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

async function createHeyGenVideo(env, { script, title }) {
  const key = env.HEYGEN_API_KEY
  if (!key) return { success: false, provider: 'heygen', error: 'HEYGEN_API_KEY not set' }
  if (!nonEmpty(script)) return { success: false, provider: 'heygen', error: 'video script is empty' }
  const avatarId = env.HEYGEN_AVATAR_ID
  const voiceId = env.HEYGEN_VOICE_ID
  if (!avatarId) return { success: false, provider: 'heygen', error: 'HEYGEN_AVATAR_ID not set' }
  if (!voiceId)  return { success: false, provider: 'heygen', error: 'HEYGEN_VOICE_ID not set' }
  try {
    const res = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_inputs: [{
          character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
          voice: { type: 'text', input_text: script, voice_id: voiceId, speed: 1.0 },
        }],
        dimension: { width: 720, height: 1280 },
        title: title?.slice(0, 120),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, provider: 'heygen', error: normalizeError(data) || `heygen http ${res.status}` }
    const videoId = data?.data?.video_id
    if (!videoId) return { success: false, provider: 'heygen', error: 'heygen returned no video_id', raw: data }
    return { success: true, provider: 'heygen', external_id: videoId, status: 'queued', raw: data?.data }
  } catch (err) {
    return { success: false, provider: 'heygen', error: normalizeError(err) }
  }
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
      // Fall through to OpenAI fallback only when explicitly auto.
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

  // We have a remote URL. In --apply mode, re-upload to Supabase Storage so
  // the URL is durable; in --generate-only mode, hand back the provider URL
  // for the operator to inspect (no Storage write).
  if (!flags.apply) {
    return { ok: true, provider: result.provider, url: result.url, external_id: result.external_id, durable: false }
  }
  const stored = await downloadAndStoreImage(supabase, result.url, `content/${row.platform || 'misc'}`)
  if (!stored.ok) return { ok: false, provider: result.provider, error: `storage: ${stored.error}` }
  return { ok: true, provider: result.provider, url: stored.url, external_id: result.external_id, durable: true }
}

async function processVideo(supabase, env, row, flags) {
  void supabase
  const rawScript = pickVideoScript(row)
  if (!nonEmpty(rawScript)) {
    return { ok: false, error: 'video script missing — refusing to call HeyGen', skipped: true }
  }
  if (flags.provider !== 'heygen' && flags.provider !== 'auto') {
    return { ok: false, error: `provider '${flags.provider}' is not a video provider` }
  }
  // Phase 14L.2.2 — strip director cues so HeyGen doesn't speak them.
  const script = cleanScriptForHeyGen(rawScript)
  if (!nonEmpty(script)) {
    return { ok: false, error: 'video script became empty after stripping director cues', skipped: true }
  }
  const result = await createHeyGenVideo(env, { script, title: `${row.platform} ${row.id?.slice(0, 8) ?? ''}` })
  if (!result.success) return { ok: false, provider: 'heygen', error: result.error }
  // HeyGen returned a video_id — the URL is NOT yet available. We keep
  // status='queued' and return external_id; the apply-write path stores
  // it and the operator runs scripts/check-video-generation-status.js
  // later to land the final URL.
  return {
    ok: true,
    provider: 'heygen',
    pending: true,
    external_id: result.external_id,
  }
}

function buildImageQuery(row) {
  // Build a focused Pexels search string. Prefer explicit image_prompt
  // text if present (it's already curated). Fall back to the campaign /
  // event name + the platform.
  if (nonEmpty(row.image_prompt)) return row.image_prompt.slice(0, 100)
  if (nonEmpty(row.campaign_event_name)) return `${row.campaign_event_name} travel`
  if (nonEmpty(row.caption)) return row.caption.slice(0, 60)
  return 'travel destination scenic'
}

function pickVideoScript(row) {
  if (nonEmpty(row.video_script)) return row.video_script
  if (nonEmpty(row.video_prompt)) return row.video_prompt
  if (nonEmpty(row.caption))      return row.caption.slice(0, 600)
  return ''
}

function imageOrientationFor(platform) {
  const p = (platform || '').toLowerCase()
  if (p === 'instagram' || p === 'tiktok') return 'portrait'
  if (p === 'twitter' || p === 'facebook' || p === 'linkedin') return 'landscape'
  return undefined
}

// ============================================================
// DB writers — only invoked with --generate --apply. Strictly limited to
// the allow-list of media columns; never touches status / posted_at /
// posting_status / posting_gate_approved / queued_for_posting_at.
// ============================================================

async function writeMediaToContentCalendar(supabase, contentId, payload) {
  // Defensive guardrails — refuse to send a payload that includes any
  // forbidden key. Never use `as any`; explicit allow-list keeps the
  // surface small and reviewable.
  // Phase 14L.2.2 — `media_metadata` (migration 033) is the clean home
  // for HeyGen video_id storage on organic rows.
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
  console.log(`${COLORS.bold}Phase 14L.2.6 — Media Generation Worker [${mode}]${COLORS.reset}`)
  if (!flags.generate) {
    console.log(`${COLORS.dim}No provider API calls. No platform calls. No mutations.${COLORS.reset}`)
  } else if (!flags.apply) {
    console.log(`${COLORS.yellow}May call provider APIs (Pexels / OpenAI / HeyGen). DB writes are DISABLED.${COLORS.reset}`)
  } else {
    console.log(`${COLORS.red}May call provider APIs AND write media columns to DB. NEVER posts to platforms.${COLORS.reset}`)
  }
  console.log()

  if (flags.apply && !flags.generate) {
    console.log(`${COLORS.red}Refused: --apply without --generate has no input source for known URLs in this phase.${COLORS.reset}`)
    console.log(`${COLORS.dim}Pass --generate alongside --apply to fetch + persist; or drop --apply to dry-run.${COLORS.reset}`)
    process.exit(2)
  }

  // Phase 14L.2.6 — controlled HeyGen batch unlock.
  //
  // Replaces the Phase 14L.2.2 "must be --limit=1" pilot guard. HeyGen
  // calls are now allowed in small batches:
  //   - Default cap: 5 renders per invocation.
  //   - With --allow-large-heygen-batch: up to 10 renders per invocation.
  //   - --allow-large-heygen-batch CANNOT exceed 10 (hard ceiling).
  //   - --videos-only + --provider=auto follows the same caps because the
  //     auto path fans out to HeyGen for video rows.
  const heygenPath = flags.provider === 'heygen' || (flags.provider === 'auto' && flags.videosOnly)
  if (heygenPath) {
    const cap = flags.allowLargeHeygenBatch ? HEYGEN_ABSOLUTE_BATCH_MAX : HEYGEN_DEFAULT_BATCH_MAX
    if (flags.limit > cap) {
      console.log(`${COLORS.red}Refused: HeyGen batch cap exceeded.${COLORS.reset}`)
      console.log(`${COLORS.dim}--limit=${flags.limit} > ${cap}.${COLORS.reset}`)
      if (!flags.allowLargeHeygenBatch && flags.limit <= HEYGEN_ABSOLUTE_BATCH_MAX) {
        console.log(`${COLORS.dim}Pass --allow-large-heygen-batch to lift the cap from ${HEYGEN_DEFAULT_BATCH_MAX} to ${HEYGEN_ABSOLUTE_BATCH_MAX}.${COLORS.reset}`)
      } else {
        console.log(`${COLORS.dim}The absolute HeyGen batch ceiling is ${HEYGEN_ABSOLUTE_BATCH_MAX} renders per invocation. Re-run later for more.${COLORS.reset}`)
      }
      process.exit(2)
    }
  }

  // 0. posted_at no-mutation snapshot.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // 1. Pull unposted rows + linked assets. Phase 14L.2.1 trusts migration
  //    032 is applied (the prior phase verified it). No fallback path here
  //    because writes need the new columns; if the SELECT errors, abort.
  const { data: rows, error: selErr } = await supabase
    .from('content_calendar')
    .select(
      'id, status, platform, week_of, caption, image_url, video_url, video_script, image_prompt, ' +
      'media_status, media_error, media_generated_at, media_source, ' +
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
  // Phase 14L.2.2 — when --videos-only or --provider=heygen is in effect,
  // pre-filter rows that HeyGen can't (or shouldn't) render:
  //   - rows whose video_url is already populated  → already done
  //   - rows whose pickVideoScript() returns empty → no script to speak
  // The processVideo function ALSO refuses these, but pre-filtering at the
  // queue level keeps the printed queue counts honest.
  const queue = []
  for (const r of unposted) {
    if (flags.id && r.id !== flags.id && r.campaign_asset_id !== flags.id) continue
    const rec = recommend(r)
    if (rec.needs === 'none') continue
    if (flags.imagesOnly && rec.needs === 'video') continue
    if (flags.videosOnly && rec.needs === 'image') continue
    if (flags.campaignOnly && rec.target_table !== 'campaign_assets') continue
    if (flags.contentOnly && rec.target_table !== 'content_calendar') continue
    if (flags.provider === 'heygen' || flags.videosOnly) {
      if (nonEmpty(r.video_url) || nonEmpty(r.asset_video_url)) continue
      // Phase 14L.2.2 — strict pilot script check: only an explicit
      // video_script or video_prompt counts. caption-as-script (the legacy
      // pickVideoScript fallback) is too loose for HeyGen voice rendering.
      if (!nonEmpty(r.video_script) && !nonEmpty(r.video_prompt)) continue
    }
    queue.push({ row: r, rec })
  }

  // Phase 14L.2.6 — count pending HeyGen jobs (in-flight renders that
  // haven't been polled to completion yet) so the operator sees them
  // alongside the queue. By default the HeyGen path refuses to queue
  // when ANY pending jobs exist; --allow-when-pending overrides.
  let pendingHeygenJobs = 0
  if (heygenPath) {
    const { count: ccPending } = await supabase
      .from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .eq('media_source', 'heygen')
      .eq('media_status', 'pending')
    const { data: caRows } = await supabase
      .from('campaign_assets')
      .select('id, video_source_metadata')
      .eq('video_source', 'heygen')
      .is('video_url', null)
    const caPending = (caRows ?? []).filter(r => nonEmpty(r.video_source_metadata?.heygen_video_id)).length
    pendingHeygenJobs = (ccPending ?? 0) + caPending
  }

  const heygenCap = heygenPath
    ? (flags.allowLargeHeygenBatch ? HEYGEN_ABSOLUTE_BATCH_MAX : HEYGEN_DEFAULT_BATCH_MAX)
    : null

  console.log(`${COLORS.bold}Queue${COLORS.reset}`)
  console.log(`   total scanned (unposted):  ${unposted.length}`)
  console.log(`   matched filters:           ${queue.length}`)
  console.log(`   limit:                     ${flags.limit}`)
  console.log(`   provider preference:       ${flags.provider}`)
  if (heygenPath) {
    console.log(`   heygen batch cap:          ${heygenCap}  ${flags.allowLargeHeygenBatch ? COLORS.dim + '(--allow-large-heygen-batch)' + COLORS.reset : COLORS.dim + '(default; --allow-large-heygen-batch lifts to ' + HEYGEN_ABSOLUTE_BATCH_MAX + ')' + COLORS.reset}`)
    console.log(`   pending heygen jobs:       ${pendingHeygenJobs}  ${flags.allowWhenPending ? COLORS.dim + '(--allow-when-pending)' + COLORS.reset : ''}`)
  }
  console.log()

  // Phase 14L.2.6 — pre-flight refusals for the HeyGen path. These run
  // BEFORE any provider call. The queue pre-filter already drops
  // ineligible rows, but we also explicitly refuse the whole batch when
  // pending jobs exist (operator must clear them first or override).
  if (heygenPath && pendingHeygenJobs > 0 && !flags.allowWhenPending) {
    console.log(`${COLORS.red}Refused: ${pendingHeygenJobs} pending HeyGen job(s) already in flight.${COLORS.reset}`)
    console.log(`${COLORS.dim}Run scripts/check-video-generation-status.js --apply to land them, or pass --allow-when-pending to override.${COLORS.reset}`)
    process.exit(2)
  }

  const work = queue.slice(0, flags.limit)

  // Phase 14L.2.6 — per-row sanity verification of the pre-flight contract.
  // The pre-filter above already excludes these, but this defensive pass
  // guarantees the contract holds even if a future refactor loosens the
  // filter. Fails the run before any provider call if any selected row
  // violates an invariant.
  if (heygenPath && work.length > 0) {
    const violations = []
    for (const { row } of work) {
      if (row.posted_at) {
        violations.push({ id: row.id, reason: 'row is posted (has posted_at)' })
        continue
      }
      const status = (row.status ?? '').toLowerCase()
      if (TERMINAL_STATUSES.has(status)) {
        violations.push({ id: row.id, reason: `row status='${row.status}' is terminal` })
        continue
      }
      if (nonEmpty(row.video_url) || nonEmpty(row.asset_video_url)) {
        violations.push({ id: row.id, reason: 'row already has video_url' })
        continue
      }
      if (!nonEmpty(row.video_script) && !nonEmpty(row.video_prompt)) {
        violations.push({ id: row.id, reason: 'row has no video_script / video_prompt' })
        continue
      }
    }
    if (violations.length > 0) {
      console.log(`${COLORS.red}Refused: ${violations.length} selected row(s) violate the HeyGen pre-flight contract.${COLORS.reset}`)
      for (const v of violations.slice(0, 10)) {
        console.log(`   ${COLORS.dim}${v.id}${COLORS.reset} — ${v.reason}`)
      }
      if (violations.length > 10) console.log(`   ${COLORS.dim}… +${violations.length - 10} more${COLORS.reset}`)
      console.log(`${COLORS.dim}No provider calls were made.${COLORS.reset}`)
      process.exit(2)
    }
  }
  if (work.length === 0) {
    if (flags.provider === 'heygen' && flags.id) {
      console.log(`${COLORS.yellow}No eligible row for --id=${flags.id}.${COLORS.reset}`)
      console.log(`${COLORS.dim}Either the id doesn't exist, the row is already posted, the row already has video_url, or the row has no video script.${COLORS.reset}`)
    } else if (flags.provider === 'heygen') {
      console.log(`${COLORS.yellow}No eligible HeyGen rows.${COLORS.reset}`)
      console.log(`${COLORS.dim}Run scripts/inspect-heygen-pilot-candidates.js to see candidate ids.${COLORS.reset}`)
    } else {
      console.log(`${COLORS.dim}Nothing to do. (queue empty after filters)${COLORS.reset}`)
    }
    process.exit(0)
  }

  // Phase 14L.2.6 — DRY-RUN preview for the HeyGen path: list each row
  // that WOULD be queued, with its week_of and a short script preview.
  // No provider call. No write.
  if (heygenPath && !flags.generate) {
    console.log(`${COLORS.bold}HeyGen rows that would be queued (DRY-RUN; --generate not set)${COLORS.reset}`)
    for (const { row, rec } of work) {
      const script = nonEmpty(row.video_script) ? row.video_script
                   : nonEmpty(row.video_prompt) ? row.video_prompt
                   : ''
      const wc = script.trim().split(/\s+/).filter(Boolean).length
      const preview = script.replace(/\s+/g, ' ').slice(0, 90)
      console.log(`   ${COLORS.cyan}${row.id}${COLORS.reset}  platform=${row.platform}  week_of=${row.week_of}  status=${row.status}`)
      console.log(`     ${COLORS.dim}target:${COLORS.reset} ${rec.target_table}  ${COLORS.dim}script:${COLORS.reset} ${wc} words · ${COLORS.dim}${preview}${preview.length < script.length ? '…' : ''}${COLORS.reset}`)
    }
    console.log()
  }

  // 4. Process each row.
  let succeeded = 0
  let failed = 0
  let skipped = 0
  const samples = []

  for (const { row, rec } of work) {
    const item = { id: row.id, platform: row.platform, target: rec.target_table, needs: rec.needs }

    // DRY-RUN — describe only.
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
        if (flags.apply) {
          // Mark failed only when --apply explicitly requests writes.
          if (rec.target_table === 'content_calendar') {
            await writeMediaToContentCalendar(supabase, row.id, {
              media_status: 'failed',
              media_source: r.provider ?? null,
              media_error: (r.error ?? 'image generation failed').slice(0, 1000),
            })
          }
          // For campaign_assets we don't have a media_status column; record
          // provenance via image_source_metadata only on success. On
          // failure leave the asset alone so a re-run can try again.
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
                phase: '14L.2.1',
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

    // Video path.
    if (rec.needs === 'video' || (rec.needs === 'both' && flags.videosOnly)) {
      const r = await processVideo(supabase, env, row, flags)
      if (!r.ok) {
        if (r.skipped) {
          skipped++
          samples.push({ ...item, action: 'video', success: false, skipped: true, error: r.error })
          // Per spec — "do not write failed unless --apply explicitly requests"
          // For 'video script missing' we simply log and move on. Operator
          // can extend the upstream content generator to author scripts.
        } else {
          failed++
          samples.push({ ...item, action: 'video', success: false, error: r.error, provider: r.provider })
          if (flags.apply && rec.target_table === 'content_calendar') {
            await writeMediaToContentCalendar(supabase, row.id, {
              media_status: 'failed',
              media_source: 'heygen',
              media_error: (r.error ?? 'heygen call failed').slice(0, 1000),
            })
          }
        }
      } else if (r.pending) {
        // HeyGen returned a video_id — render in progress. Don't write a
        // URL; mark pending and persist the id where it can be polled.
        succeeded++
        samples.push({ ...item, action: 'video', success: true, provider: 'heygen', pending: true, external_id: r.external_id })
        if (flags.apply) {
          if (rec.target_table === 'campaign_assets') {
            // campaign_assets has video_source_metadata JSONB — clean home
            // for the heygen video_id.
            await writeMediaToCampaignAsset(supabase, rec.target_id, {
              video_source: 'heygen',
              video_source_metadata: {
                heygen_video_id: r.external_id,
                status: 'queued',
                queued_at: new Date().toISOString(),
                generated_by: 'scripts/generate-missing-media.js',
                phase: '14L.2.1',
              },
            })
          } else {
            // Phase 14L.2.2 — clean storage in content_calendar.media_metadata
            // (migration 033). Replaces the Phase 14L.2.1 media_error
            // overload. The polling script reads media_metadata first and
            // falls back to media_error for legacy in-flight jobs.
            await writeMediaToContentCalendar(supabase, row.id, {
              media_status: 'pending',
              media_source: 'heygen',
              media_metadata: {
                heygen_video_id: r.external_id,
                queued_at: new Date().toISOString(),
                generated_by: 'scripts/generate-missing-media.js',
                phase: '14L.2.2',
              },
              // Defensively clear any legacy media_error sentinel left over
              // from a Phase 14L.2.1 run on this row (no-op if absent).
              media_error: null,
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
    const ext = s.external_id ? ` ${COLORS.dim}(heygen_id=${s.external_id})${COLORS.reset}` : ''
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
    ['PEXELS_API_KEY',  'image (primary)'],
    ['OPENAI_API_KEY',  'image (fallback)'],
    ['HEYGEN_API_KEY',  'video'],
    ['HEYGEN_AVATAR_ID','video — avatar'],
    ['HEYGEN_VOICE_ID', 'video — voice'],
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
