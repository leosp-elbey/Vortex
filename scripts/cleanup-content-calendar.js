// Bulk content calendar cleanup utility — dry-run by default, use --apply to execute
//
// One-off content_calendar cleanup pass.
//
// Usage:
//   node scripts/cleanup-content-calendar.js           # DRY-RUN (audit only)
//   node scripts/cleanup-content-calendar.js --apply   # destructive: deletes + approves
//
// Steps:
//   1. Audit: counts of Twitter/X rows, drafts-with-media, approved, posted,
//      and the oldest queued_for_posting_at still unposted.
//   2. (with --apply) DELETE all rows where platform IN ('twitter','x','Twitter','X').
//   3. (with --apply) UPDATE drafts with media attached:
//      SET status='approved', posting_status='ready', posting_gate_approved=true.
//   4. Print final platform/status breakdown + Twitter/X confirmation.
//
// Reads SUPABASE creds from .env.local (a minimal parser is inline so this
// script has zero extra dependencies beyond @supabase/supabase-js which the
// app already depends on).

const fs = require('fs')

// Minimal .env.local loader — no dotenv dependency required.
try {
  const envFile = fs.readFileSync('.env.local', 'utf8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
} catch (e) {
  console.error('Failed to load .env.local:', e.message)
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')

const APPLY = process.argv.includes('--apply')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TWITTER_PLATFORMS = ['twitter', 'x', 'Twitter', 'X']

// supabase-js v2 requires .select() before any filter chain — wrap so call
// sites can pass a builder fn that receives the pre-selected query.
async function countWhere(buildFilters) {
  const base = supabase.from('content_calendar').select('id', { count: 'exact', head: true })
  const { count, error } = await buildFilters(base)
  if (error) throw new Error(error.message)
  return count ?? 0
}

function hasNonEmptyJsonbObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will mutate)' : 'DRY-RUN (audit only)'}`)
  console.log('')

  // ============ AUDIT ============
  console.log('=== AUDIT (before any changes) ===')

  const twitterCountBefore = await countWhere(q => q.in('platform', TWITTER_PLATFORMS))
  console.log(`Q1. Twitter/X rows: ${twitterCountBefore}`)

  // Drafts with media — fetch and filter in JS so we can apply the "non-empty
  // jsonb" check accurately (Supabase JS doesn't express jsonb!='{}' cleanly).
  const { data: drafts, error: draftsErr } = await supabase
    .from('content_calendar')
    .select('id, image_url, video_url, media_metadata')
    .eq('status', 'draft')
  if (draftsErr) throw new Error(draftsErr.message)
  const draftsWithMedia = drafts.filter(r =>
    r.image_url || r.video_url || hasNonEmptyJsonbObject(r.media_metadata),
  )
  console.log(`Q2. Drafts WITH media: ${draftsWithMedia.length} (of ${drafts.length} total drafts)`)

  const approvedBefore = await countWhere(q => q.eq('status', 'approved'))
  console.log(`Q3. Approved (waiting to post): ${approvedBefore}`)

  const postedBefore = await countWhere(q => q.eq('status', 'posted'))
  console.log(`Q4. Posted: ${postedBefore}`)

  const { data: oldestQueued, error: oqErr } = await supabase
    .from('content_calendar')
    .select('id, queued_for_posting_at, platform, status')
    .is('posted_at', null)
    .not('queued_for_posting_at', 'is', null)
    .order('queued_for_posting_at', { ascending: true })
    .limit(1)
  if (oqErr) throw new Error(oqErr.message)
  const oldest = oldestQueued?.[0]
  console.log(`Q5. Oldest queued_for_posting_at still unposted: ${oldest?.queued_for_posting_at ?? 'NONE'}`)
  if (oldest) {
    console.log(`     (id=${oldest.id}, platform=${oldest.platform}, status=${oldest.status})`)
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] Pass --apply to execute Steps 1–3.')
    process.exit(0)
  }

  // ============ STEP 1: DELETE ============
  console.log('\n=== STEP 1: DELETE Twitter/X ===')
  const { error: delErr, count: deletedCount } = await supabase
    .from('content_calendar')
    .delete({ count: 'exact' })
    .in('platform', TWITTER_PLATFORMS)
  if (delErr) throw new Error(delErr.message)
  console.log(`Deleted: ${deletedCount}`)

  // ============ STEP 2: BULK APPROVE ============
  console.log('\n=== STEP 2: Bulk approve drafts with media ===')
  let approvedNowCount = 0
  if (draftsWithMedia.length > 0) {
    const ids = draftsWithMedia.map(r => r.id)
    const { error: updErr, count: c } = await supabase
      .from('content_calendar')
      .update(
        {
          status: 'approved',
          posting_status: 'ready',
          posting_gate_approved: true,
        },
        { count: 'exact' },
      )
      .in('id', ids)
    if (updErr) throw new Error(updErr.message)
    approvedNowCount = c ?? 0
  }
  console.log(`Approved: ${approvedNowCount}`)

  // ============ STEP 3: VERIFY ============
  console.log('\n=== STEP 3: Final platform/status breakdown ===')
  const { data: finalRows, error: finalErr } = await supabase
    .from('content_calendar')
    .select('platform, status')
  if (finalErr) throw new Error(finalErr.message)

  const breakdown = {}
  for (const r of finalRows) {
    const k = `${r.platform || '(null)'} / ${r.status || '(null)'}`
    breakdown[k] = (breakdown[k] || 0) + 1
  }
  for (const k of Object.keys(breakdown).sort()) {
    console.log(`  ${k}: ${breakdown[k]}`)
  }

  const twitterAfter = await countWhere(q => q.in('platform', TWITTER_PLATFORMS))
  console.log(`\nTwitter/X rows AFTER cleanup: ${twitterAfter} (expected 0)`)

  console.log('\n=== SUMMARY (JSON) ===')
  console.log(JSON.stringify({
    audit_before: {
      twitter_x_rows: twitterCountBefore,
      drafts_total: drafts.length,
      drafts_with_media: draftsWithMedia.length,
      approved_waiting: approvedBefore,
      posted: postedBefore,
      oldest_queued: oldest ?? null,
    },
    actions: {
      twitter_x_deleted: deletedCount,
      drafts_approved: approvedNowCount,
    },
    after: {
      total_rows: finalRows.length,
      breakdown,
      twitter_x_remaining: twitterAfter,
    },
  }, null, 2))
}

main().catch(err => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
