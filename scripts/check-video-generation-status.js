#!/usr/bin/env node
/**
 * Phase 14L.2.1 — HeyGen polling script.
 *
 * The media-generation worker (scripts/generate-missing-media.js) starts
 * HeyGen renders asynchronously. HeyGen returns a video_id immediately;
 * the actual MP4 url only becomes available after a few minutes. This
 * script walks rows that are sitting at media_status='pending' with a
 * heygen video id and polls the status endpoint to land the final
 * video_url when complete.
 *
 * Modes:
 *   default                → DRY-RUN. Reads pending jobs + polls HeyGen
 *                             status, but does NOT write video_url back.
 *   --apply                → Polls AND writes video_url + media_status='ready'
 *                             when HeyGen reports completion.
 *
 * Read sources (where heygen video_ids live):
 *   - campaign_assets.video_source_metadata->>'heygen_video_id'   (preferred — clean JSONB home)
 *   - content_calendar.media_error LIKE 'heygen_video_id:%'       (fallback for organic rows;
 *                                                                   the worker uses this when
 *                                                                   the row isn't tied to a campaign_asset)
 *
 * Allowed writes (with --apply):
 *   campaign_assets.video_url
 *   campaign_assets.video_source_metadata
 *   content_calendar.video_url
 *   content_calendar.media_status
 *   content_calendar.media_source
 *   content_calendar.media_generated_at
 *   content_calendar.media_error
 *
 * NEVER writes:
 *   content_calendar.status / posted_at
 *   posting_status / posting_gate_approved / queued_for_posting_at
 *
 * Run from project root:
 *   node scripts/check-video-generation-status.js          # DRY-RUN
 *   node scripts/check-video-generation-status.js --apply  # writes results back
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
  }
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

  console.log()
  console.log(`${COLORS.bold}Phase 14L.2.2 — HeyGen Video Status Poll [${flags.apply ? 'APPLY (writes)' : 'DRY-RUN'}]${COLORS.reset}`)
  console.log(`${COLORS.dim}No platform calls. ${flags.apply ? 'May update media columns.' : 'No DB writes.'}${COLORS.reset}`)
  console.log()

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

  for (const job of jobs) {
    const result = await getHeyGenStatus(env, job.video_id)
    if (result.ok && result.status === 'completed' && result.url) {
      completed++
      console.log(`   ${COLORS.green}✓${COLORS.reset} ${job.source} ${job.id} → ${result.url}`)
      if (flags.apply) {
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
          }
          const { error } = await supabase.from('campaign_assets').update({
            video_url: result.url,
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
              status: 'completed',
              completed_at: new Date().toISOString(),
            }
          }
          const update = {
            video_url: result.url,
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
  console.log(`   completed:    ${completed}`)
  console.log(`   still pending: ${stillPending}`)
  console.log(`   failed:       ${failed}`)
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
