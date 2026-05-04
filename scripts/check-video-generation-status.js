#!/usr/bin/env node
/**
 * Phase 14L.2.3 — HeyGen polling + permanent video storage hardening.
 *
 * The media-generation worker (scripts/generate-missing-media.js) starts
 * HeyGen renders asynchronously. HeyGen returns a video_id immediately;
 * the actual MP4 url only becomes available after a few minutes. This
 * script walks rows that are sitting at media_status='pending' with a
 * heygen video id and polls the status endpoint to land the final
 * video_url when complete.
 *
 * Phase 14L.2.3 — when HeyGen reports completion, we now download the
 * MP4 and re-upload it to Supabase Storage (`media` bucket), so the URL
 * stored in `video_url` is permanent and self-hosted. The HeyGen-hosted
 * URL (typically https://files2.heygen.ai/...) is signed and expires
 * after ~24h, which would break Instagram/TikTok at post time.
 *
 * Modes:
 *   default                → DRY-RUN. Reads pending jobs + polls HeyGen
 *                             status, but does NOT write video_url back.
 *   --apply                → Polls AND writes video_url + media_status='ready'
 *                             when HeyGen reports completion. Downloads
 *                             the MP4 to Supabase Storage first; if the
 *                             storage step fails, leaves the row at
 *                             media_status='pending' (so a re-run can
 *                             retry).
 *   --repair-temp-urls     → Scans rows where video_url is still a
 *                             HeyGen temp URL (heygen.ai host) and
 *                             reports them. Default DRY-RUN.
 *   --repair-temp-urls --apply → Downloads each temp-URL video and
 *                             re-uploads to Supabase Storage; replaces
 *                             video_url with the permanent Supabase URL.
 *
 * Read sources (where heygen video_ids live):
 *   - campaign_assets.video_source_metadata->>'heygen_video_id'   (preferred — clean JSONB home)
 *   - content_calendar.media_metadata->>'heygen_video_id'         (Phase 14L.2.2 — clean home)
 *   - content_calendar.media_error LIKE 'heygen_video_id:%'       (legacy fallback for Phase 14L.2.1 rows)
 *
 * Allowed writes (with --apply):
 *   campaign_assets.video_url
 *   campaign_assets.video_source_metadata
 *   content_calendar.video_url
 *   content_calendar.media_status
 *   content_calendar.media_source
 *   content_calendar.media_generated_at
 *   content_calendar.media_error
 *   content_calendar.media_metadata
 *
 * NEVER writes:
 *   content_calendar.status / posted_at
 *   posting_status / posting_gate_approved / queued_for_posting_at
 *
 * Run from project root:
 *   node scripts/check-video-generation-status.js                              # DRY-RUN poll
 *   node scripts/check-video-generation-status.js --apply                      # poll + write permanent URL
 *   node scripts/check-video-generation-status.js --repair-temp-urls           # DRY-RUN repair scan
 *   node scripts/check-video-generation-status.js --repair-temp-urls --apply   # repair temp URLs
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
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
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0 }

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

async function getHeyGenStatus(env, videoId) {
  const key = env.HEYGEN_API_KEY
  if (!key) return { ok: false, error: 'HEYGEN_API_KEY not set' }
  try {
    const res = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      { headers: { 'X-Api-Key': key } },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: normalizeError(data) || `heygen status http ${res.status}` }
    const status = data?.data?.status ?? 'queued'
    const url = data?.data?.video_url ?? null
    if (status === 'completed' && url) return { ok: true, status: 'completed', url, raw: data?.data }
    if (status === 'failed') return { ok: false, status: 'failed', error: normalizeError(data?.data?.error) || 'heygen reported failure' }
    return { ok: false, status, error: `heygen status: ${status}` }
  } catch (err) {
    return { ok: false, error: normalizeError(err) }
  }
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    repairTempUrls: argv.includes('--repair-temp-urls'),
  }
}

/**
 * Phase 14L.2.3 — detect HeyGen-hosted temporary URLs.
 * HeyGen's CDN currently uses files2.heygen.ai for completed renders
 * (signed URLs that expire). Match the broader heygen.ai host so a
 * future subdomain change still flags correctly.
 */
function isHeyGenTempUrl(url) {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.hostname.endsWith('heygen.ai')
  } catch {
    return false
  }
}

/**
 * Phase 14L.2.3 — download an MP4 from `remoteUrl` and re-upload to the
 * Supabase `media` bucket under a deterministic path. Returns either
 * `{ ok: true, url, fileName, size }` or `{ ok: false, error }`.
 *
 * Path scheme:
 *   - content_calendar (organic): media/content/<platform>/<row_id>-<heygen_video_id>.mp4
 *   - campaign_assets:            media/campaigns/video/<asset_id>-<heygen_video_id>.mp4
 *
 * Caller passes the already-built `objectPath` so this helper stays
 * dumb. `upsert: true` is used so re-runs (e.g. an interrupted
 * --apply) overwrite any partial upload.
 */
async function downloadAndStoreVideo(supabase, remoteUrl, objectPath) {
  try {
    const res = await fetch(remoteUrl)
    if (!res.ok) return { ok: false, error: `download http ${res.status}` }
    const buf = await res.arrayBuffer()
    const size = buf.byteLength
    const { error: upErr } = await supabase.storage.from('media').upload(objectPath, buf, {
      contentType: 'video/mp4',
      upsert: true,
    })
    if (upErr) return { ok: false, error: `upload: ${upErr.message}` }
    const { data: pub } = supabase.storage.from('media').getPublicUrl(objectPath)
    if (!pub?.publicUrl) return { ok: false, error: 'no public url returned' }
    return { ok: true, url: pub.publicUrl, fileName: objectPath, size }
  } catch (err) {
    return { ok: false, error: normalizeError(err) }
  }
}

function buildVideoObjectPath({ source, rowId, platform, videoId }) {
  // Sanitize the dynamic segments — only [a-zA-Z0-9-] survives, so a stray
  // platform/video_id can't escape the bucket prefix.
  const safeRow = String(rowId ?? 'unknown').replace(/[^a-zA-Z0-9-]/g, '')
  const safeVid = String(videoId ?? 'unknown').replace(/[^a-zA-Z0-9-]/g, '')
  if (source === 'campaign_assets') {
    return `campaigns/video/${safeRow}-${safeVid}.mp4`
  }
  const safePlatform = String(platform ?? 'misc').toLowerCase().replace(/[^a-z0-9]/g, '') || 'misc'
  return `content/${safePlatform}/${safeRow}-${safeVid}.mp4`
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local${COLORS.reset}`)
    process.exit(1)
  }
  if (!env.HEYGEN_API_KEY) {
    console.error(`${COLORS.red}HEYGEN_API_KEY missing in .env.local${COLORS.reset}`)
    process.exit(1)
  }

  let createClient
  try { ;({ createClient } = require('@supabase/supabase-js')) }
  catch {
    console.error(`${COLORS.red}@supabase/supabase-js not installed.${COLORS.reset}`)
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const mode = flags.repairTempUrls
    ? `REPAIR TEMP URLS [${flags.apply ? 'APPLY (writes)' : 'DRY-RUN'}]`
    : `HeyGen Video Status Poll [${flags.apply ? 'APPLY (writes)' : 'DRY-RUN'}]`
  console.log()
  console.log(`${COLORS.bold}Phase 14L.2.3 — ${mode}${COLORS.reset}`)
  console.log(`${COLORS.dim}No platform calls. ${flags.apply ? 'May update media columns and Supabase Storage.' : 'No DB writes. No Storage writes.'}${COLORS.reset}`)
  console.log()

  if (flags.repairTempUrls) {
    await runRepairTempUrls(supabase, flags)
    return
  }

  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // 1. Pull pending HeyGen jobs from campaign_assets (preferred home).
  const { data: ca, error: caErr } = await supabase
    .from('campaign_assets')
    .select('id, asset_type, video_url, video_source, video_source_metadata, status')
    .eq('video_source', 'heygen')
    .is('video_url', null)
    .neq('status', 'posted')
    .neq('status', 'rejected')
    .neq('status', 'archived')
    .limit(500)
  if (caErr) {
    console.error(`${COLORS.red}campaign_assets query failed:${COLORS.reset} ${caErr.message}`)
    process.exit(2)
  }
  const campaignJobs = (ca ?? []).map(r => ({
    source: 'campaign_assets',
    id: r.id,
    video_id: r.video_source_metadata?.heygen_video_id ?? null,
  })).filter(j => nonEmpty(j.video_id))

  // 2. Pull pending HeyGen jobs from content_calendar.
  //    Phase 14L.2.2 — preferred home is `media_metadata.heygen_video_id`
  //    (migration 033). Legacy fallback: `media_error` with a
  //    `heygen_video_id:<id>` sentinel from Phase 14L.2.1 runs. We try
  //    the new column first, retry without it if migration 033 hasn't
  //    landed yet, and union the results.
  let cc = []
  let migration033Applied = true
  {
    const res = await supabase
      .from('content_calendar')
      .select('id, platform, media_status, media_source, media_error, media_metadata, posted_at')
      .eq('media_source', 'heygen')
      .eq('media_status', 'pending')
      .is('posted_at', null)
      .limit(500)
    if (res.error) {
      const msg = res.error.message ?? String(res.error)
      if (msg.includes('media_metadata')) {
        migration033Applied = false
        const fallback = await supabase
          .from('content_calendar')
          .select('id, platform, media_status, media_source, media_error, posted_at')
          .eq('media_source', 'heygen')
          .eq('media_status', 'pending')
          .is('posted_at', null)
          .limit(500)
        if (fallback.error) {
          console.error(`${COLORS.red}content_calendar fallback query failed:${COLORS.reset} ${fallback.error.message}`)
          process.exit(2)
        }
        cc = fallback.data ?? []
      } else {
        console.error(`${COLORS.red}content_calendar query failed:${COLORS.reset} ${msg}`)
        process.exit(2)
      }
    } else {
      cc = res.data ?? []
    }
  }
  if (!migration033Applied) {
    console.log(`${COLORS.yellow}⚠ migration 033 (content_calendar.media_metadata) not yet applied — reading legacy media_error fallback only.${COLORS.reset}`)
  }
  const contentJobs = cc.flatMap(r => {
    const fromMetadata = r.media_metadata?.heygen_video_id
    if (nonEmpty(fromMetadata)) {
      return [{ source: 'content_calendar', id: r.id, video_id: fromMetadata, storage: 'media_metadata' }]
    }
    const m = typeof r.media_error === 'string' ? r.media_error.match(/^heygen_video_id:(\S+)$/) : null
    if (!m) return []
    return [{ source: 'content_calendar', id: r.id, video_id: m[1], storage: 'media_error' }]
  })

  const jobs = [...campaignJobs, ...contentJobs]
  console.log(`${COLORS.bold}Pending HeyGen jobs${COLORS.reset}`)
  console.log(`   campaign_assets: ${campaignJobs.length}`)
  console.log(`   content_calendar: ${contentJobs.length}`)
  console.log(`   total:           ${jobs.length}`)
  console.log()

  if (jobs.length === 0) {
    console.log(`${COLORS.dim}Nothing pending — exit clean.${COLORS.reset}`)
    process.exit(0)
  }

  let completed = 0
  let stillPending = 0
  let failed = 0
  let storageFailed = 0

  // Pull platform per content_calendar id so the storage path can be built
  // deterministically. (We didn't ask for it in the SELECT above.)
  const ccIds = contentJobs.map(j => j.id)
  const platformById = {}
  if (ccIds.length > 0) {
    const { data: rows } = await supabase
      .from('content_calendar')
      .select('id, platform')
      .in('id', ccIds)
    for (const r of rows ?? []) platformById[r.id] = r.platform
  }

  for (const job of jobs) {
    const result = await getHeyGenStatus(env, job.video_id)
    if (result.ok && result.status === 'completed' && result.url) {
      console.log(`   ${COLORS.green}✓${COLORS.reset} ${job.source} ${job.id} → ${result.url}`)
      // Phase 14L.2.3 — copy the HeyGen MP4 to Supabase Storage so the
      // URL we persist is permanent. In DRY-RUN we just announce it.
      const objectPath = buildVideoObjectPath({
        source: job.source,
        rowId: job.id,
        platform: job.source === 'content_calendar' ? platformById[job.id] : null,
        videoId: job.video_id,
      })
      let storageOutcome = { ok: false, error: 'dry-run', url: null, fileName: objectPath }
      if (flags.apply) {
        storageOutcome = await downloadAndStoreVideo(supabase, result.url, objectPath)
        if (!storageOutcome.ok) {
          storageFailed++
          console.log(`     ${COLORS.red}storage failed:${COLORS.reset} ${storageOutcome.error}`)
          console.log(`     ${COLORS.dim}leaving row at media_status='pending' so a re-run can retry${COLORS.reset}`)
          // Per spec: don't mark ready, don't mark failed. The HeyGen
          // render did succeed; only our storage step blew up. A re-run
          // re-attempts. Continue to next job.
          continue
        }
        console.log(`     ${COLORS.dim}stored:${COLORS.reset} ${storageOutcome.url}`)
      } else {
        console.log(`     ${COLORS.dim}would store at:${COLORS.reset} media/${objectPath}`)
      }
      completed++
      if (flags.apply) {
        const permanentUrl = storageOutcome.url
        if (job.source === 'campaign_assets') {
          // Preserve provenance metadata; just merge the completion fields.
          const { data: cur } = await supabase
            .from('campaign_assets')
            .select('video_source_metadata')
            .eq('id', job.id)
            .maybeSingle()
          const existing = cur?.video_source_metadata ?? {}
          const merged = {
            ...existing,
            status: 'completed',
            completed_at: new Date().toISOString(),
            heygen_video_id: existing.heygen_video_id ?? job.video_id,
            heygen_temp_url: result.url,         // remember the original signed URL for forensics
            storage_path: storageOutcome.fileName,
            public_url: permanentUrl,
          }
          const { error } = await supabase.from('campaign_assets').update({
            video_url: permanentUrl,
            video_source: 'heygen',
            video_source_metadata: merged,
          }).eq('id', job.id)
          if (error) console.log(`     ${COLORS.red}write failed:${COLORS.reset} ${error.message}`)
        } else {
          // Phase 14L.2.2 — preserve media_metadata provenance on success.
          // We merge `status: 'completed'` + `completed_at` into whatever
          // queue metadata the worker wrote earlier, and clear the legacy
          // media_error sentinel if this row was queued under Phase 14L.2.1.
          let metadataPatch = null
          if (migration033Applied) {
            const { data: cur } = await supabase
              .from('content_calendar')
              .select('media_metadata')
              .eq('id', job.id)
              .maybeSingle()
            const existing = (cur?.media_metadata && typeof cur.media_metadata === 'object') ? cur.media_metadata : {}
            metadataPatch = {
              ...existing,
              heygen_video_id: existing.heygen_video_id ?? job.video_id,
              heygen_temp_url: result.url,           // forensics
              storage_path: storageOutcome.fileName, // Phase 14L.2.3
              public_url: permanentUrl,
              status: 'completed',
              completed_at: new Date().toISOString(),
            }
          }
          const update = {
            video_url: permanentUrl,                 // permanent Supabase URL, NOT the temp HeyGen URL
            media_status: 'ready',
            media_source: 'heygen',
            media_generated_at: new Date().toISOString(),
            media_error: null,
          }
          if (metadataPatch) update.media_metadata = metadataPatch
          const { error } = await supabase.from('content_calendar').update(update).eq('id', job.id)
          if (error) console.log(`     ${COLORS.red}write failed:${COLORS.reset} ${error.message}`)
        }
      }
    } else if (result.status === 'failed') {
      failed++
      console.log(`   ${COLORS.red}✗${COLORS.reset} ${job.source} ${job.id} → failed (${result.error})`)
      if (flags.apply && job.source === 'content_calendar') {
        const update = {
          media_status: 'failed',
          media_source: 'heygen',
          media_error: (result.error ?? 'heygen render failed').slice(0, 1000),
        }
        if (migration033Applied) {
          const { data: cur } = await supabase
            .from('content_calendar')
            .select('media_metadata')
            .eq('id', job.id)
            .maybeSingle()
          const existing = (cur?.media_metadata && typeof cur.media_metadata === 'object') ? cur.media_metadata : {}
          update.media_metadata = {
            ...existing,
            heygen_video_id: existing.heygen_video_id ?? job.video_id,
            status: 'failed',
            failed_at: new Date().toISOString(),
            error: (result.error ?? 'heygen render failed').slice(0, 1000),
          }
        }
        await supabase.from('content_calendar').update(update).eq('id', job.id)
      }
      if (flags.apply && job.source === 'campaign_assets') {
        const { data: cur } = await supabase
          .from('campaign_assets')
          .select('video_source_metadata')
          .eq('id', job.id)
          .maybeSingle()
        const existing = cur?.video_source_metadata ?? {}
        await supabase.from('campaign_assets').update({
          video_source_metadata: {
            ...existing,
            status: 'failed',
            failed_at: new Date().toISOString(),
            error: (result.error ?? 'heygen render failed').slice(0, 1000),
          },
        }).eq('id', job.id)
      }
    } else {
      stillPending++
      console.log(`   ${COLORS.yellow}·${COLORS.reset} ${job.source} ${job.id} → still ${result.status ?? 'pending'}`)
    }
  }

  console.log()
  console.log(`${COLORS.bold}Summary${COLORS.reset}`)
  console.log(`   completed:       ${completed}`)
  console.log(`   still pending:   ${stillPending}`)
  console.log(`   failed:          ${failed}`)
  console.log(`   storage failed:  ${storageFailed}  ${COLORS.dim}(left at media_status='pending' for retry)${COLORS.reset}`)
  console.log()

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

/**
 * Phase 14L.2.3 — repair-temp-urls mode.
 *
 * Scans content_calendar and campaign_assets for rows whose video_url is
 * still a HeyGen-hosted temporary URL (heygen.ai host). HeyGen signs these
 * URLs with a short TTL — once they expire, social platforms can't fetch
 * the video and the post would fail. This mode copies each temp video into
 * Supabase Storage and replaces video_url with the permanent public URL.
 *
 * DRY-RUN by default — lists rows that need repair and where they would be
 * stored. Pass --apply to actually download + upload + rewrite.
 */
async function runRepairTempUrls(supabase, flags) {
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // 1. campaign_assets rows with HeyGen temp video_url. Filter posted/
  // rejected/archived out — historical record is preserved.
  const { data: caRows, error: caErr } = await supabase
    .from('campaign_assets')
    .select('id, platform, video_url, video_source, video_source_metadata, status')
    .not('video_url', 'is', null)
    .neq('status', 'posted')
    .neq('status', 'rejected')
    .neq('status', 'archived')
    .limit(500)
  if (caErr) {
    console.error(`${COLORS.red}campaign_assets scan failed:${COLORS.reset} ${caErr.message}`)
    process.exit(2)
  }
  const caTargets = (caRows ?? []).filter(r => isHeyGenTempUrl(r.video_url))

  // 2. content_calendar rows with HeyGen temp video_url. Try the new
  // schema first, fall back if migration 033 hasn't landed.
  let ccRows = []
  let migration033Applied = true
  {
    const res = await supabase
      .from('content_calendar')
      .select('id, platform, status, video_url, media_status, media_source, media_metadata, posted_at')
      .not('video_url', 'is', null)
      .is('posted_at', null)
      .limit(500)
    if (res.error) {
      const msg = res.error.message ?? String(res.error)
      if (msg.includes('media_metadata')) {
        migration033Applied = false
        const fb = await supabase
          .from('content_calendar')
          .select('id, platform, status, video_url, media_status, media_source, posted_at')
          .not('video_url', 'is', null)
          .is('posted_at', null)
          .limit(500)
        if (fb.error) {
          console.error(`${COLORS.red}content_calendar scan failed:${COLORS.reset} ${fb.error.message}`)
          process.exit(2)
        }
        ccRows = fb.data ?? []
      } else {
        console.error(`${COLORS.red}content_calendar scan failed:${COLORS.reset} ${msg}`)
        process.exit(2)
      }
    } else {
      ccRows = res.data ?? []
    }
  }
  const ccTargets = ccRows.filter(r =>
    isHeyGenTempUrl(r.video_url) &&
    !['posted', 'rejected', 'archived'].includes((r.status ?? '').toLowerCase())
  )

  console.log(`${COLORS.bold}Rows with HeyGen temporary URLs${COLORS.reset}`)
  console.log(`   campaign_assets:  ${caTargets.length}`)
  console.log(`   content_calendar: ${ccTargets.length}`)
  if (!migration033Applied) {
    console.log(`   ${COLORS.yellow}· migration 033 not applied — content_calendar.media_metadata won't be updated on repair${COLORS.reset}`)
  }
  console.log()

  if (caTargets.length === 0 && ccTargets.length === 0) {
    console.log(`${COLORS.green}✓ No HeyGen temporary URLs found. Nothing to repair.${COLORS.reset}`)
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

  let repaired = 0
  let skipped = 0
  let failed = 0

  for (const r of caTargets) {
    const videoId = r.video_source_metadata?.heygen_video_id ?? 'unknown'
    const objectPath = buildVideoObjectPath({ source: 'campaign_assets', rowId: r.id, videoId })
    if (!flags.apply) {
      console.log(`   ${COLORS.dim}plan${COLORS.reset} campaign_assets ${r.id}`)
      console.log(`     ${COLORS.dim}from:${COLORS.reset}  ${r.video_url}`)
      console.log(`     ${COLORS.dim}to:${COLORS.reset}    media/${objectPath}`)
      skipped++
      continue
    }
    const stored = await downloadAndStoreVideo(supabase, r.video_url, objectPath)
    if (!stored.ok) {
      failed++
      console.log(`   ${COLORS.red}✗${COLORS.reset} campaign_assets ${r.id} — storage: ${stored.error}`)
      continue
    }
    const existing = r.video_source_metadata ?? {}
    const merged = {
      ...existing,
      heygen_temp_url: r.video_url,
      storage_path: stored.fileName,
      public_url: stored.url,
      repaired_at: new Date().toISOString(),
      repaired_by: 'scripts/check-video-generation-status.js --repair-temp-urls',
    }
    const { error } = await supabase.from('campaign_assets').update({
      video_url: stored.url,
      video_source_metadata: merged,
    }).eq('id', r.id)
    if (error) {
      failed++
      console.log(`   ${COLORS.red}✗${COLORS.reset} campaign_assets ${r.id} — write: ${error.message}`)
      continue
    }
    repaired++
    console.log(`   ${COLORS.green}✓${COLORS.reset} campaign_assets ${r.id} → ${stored.url}`)
  }

  for (const r of ccTargets) {
    const videoId = r.media_metadata?.heygen_video_id ?? 'unknown'
    const objectPath = buildVideoObjectPath({
      source: 'content_calendar',
      rowId: r.id,
      platform: r.platform,
      videoId,
    })
    if (!flags.apply) {
      console.log(`   ${COLORS.dim}plan${COLORS.reset} content_calendar ${r.id}`)
      console.log(`     ${COLORS.dim}from:${COLORS.reset}  ${r.video_url}`)
      console.log(`     ${COLORS.dim}to:${COLORS.reset}    media/${objectPath}`)
      skipped++
      continue
    }
    const stored = await downloadAndStoreVideo(supabase, r.video_url, objectPath)
    if (!stored.ok) {
      failed++
      console.log(`   ${COLORS.red}✗${COLORS.reset} content_calendar ${r.id} — storage: ${stored.error}`)
      continue
    }
    const update = { video_url: stored.url }
    if (migration033Applied) {
      const existing = (r.media_metadata && typeof r.media_metadata === 'object') ? r.media_metadata : {}
      update.media_metadata = {
        ...existing,
        heygen_temp_url: r.video_url,
        storage_path: stored.fileName,
        public_url: stored.url,
        repaired_at: new Date().toISOString(),
        repaired_by: 'scripts/check-video-generation-status.js --repair-temp-urls',
      }
    }
    const { error } = await supabase.from('content_calendar').update(update).eq('id', r.id)
    if (error) {
      failed++
      console.log(`   ${COLORS.red}✗${COLORS.reset} content_calendar ${r.id} — write: ${error.message}`)
      continue
    }
    repaired++
    console.log(`   ${COLORS.green}✓${COLORS.reset} content_calendar ${r.id} → ${stored.url}`)
  }

  console.log()
  console.log(`${COLORS.bold}Repair summary${COLORS.reset}`)
  console.log(`   repaired: ${repaired}`)
  console.log(`   skipped:  ${skipped}  ${COLORS.dim}(dry-run plan only)${COLORS.reset}`)
  console.log(`   failed:   ${failed}`)
  console.log()

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
