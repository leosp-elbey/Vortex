#!/usr/bin/env node
/**
 * Phase 14K — read-only autoposter dry-run diagnostic.
 *
 * Verifies:
 *   1. Posting gate columns exist on content_calendar (migration 029).
 *   2. Lists currently eligible content_calendar rows by querying Supabase
 *      directly — same eligibility rules as src/lib/autoposter-gate.ts.
 *   3. Lists ineligible candidates (status='approved' but failing some other
 *      rule) with the specific reason for each.
 *   4. Hits /api/cron/autoposter-dry-run via fetch when CRON_SECRET +
 *      NEXT_PUBLIC_APP_URL are present in .env.local. Otherwise prints the
 *      exact curl command for manual invocation.
 *   5. Confirms the route's response includes `live_posting_blocked: true`.
 *   6. Confirms no rows mutated to `posted` since the script started (snapshot
 *      diff of `posted_at` counts before/after the dry-run call).
 *
 * Read-only — never writes. Run from project root:
 *   node scripts/diagnose-autoposter-dry-run.js
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

const REQUIRED_GATE_COLUMNS = [
  'posting_status',
  'posting_gate_approved',
  'queued_for_posting_at',
  'manual_posting_only',
  'tracking_url',
  'campaign_asset_id',
  'posted_at',
]

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

function reasonFor(row) {
  if (row.status !== 'approved') return `status is '${row.status}', need 'approved'`
  if (row.posting_status !== 'ready') return `posting_status is '${row.posting_status ?? 'null'}', need 'ready'`
  if (row.posting_gate_approved !== true) return 'posting_gate_approved is not true'
  if (row.manual_posting_only !== true) return 'manual_posting_only is not true'
  if (!row.queued_for_posting_at) return 'queued_for_posting_at is null'
  if (row.posted_at) return 'already posted'
  if (!row.platform || !row.platform.trim()) return 'platform is missing'
  if (!row.caption || !row.caption.trim()) return 'caption is empty'
  if (row.campaign_asset_id && !(row.tracking_url && row.tracking_url.trim())) {
    return 'campaign-originated row missing tracking_url'
  }
  return null
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
  console.log(`${COLORS.bold}Phase 14K — Autoposter Dry-Run Diagnostic${COLORS.reset}`)
  console.log()

  // 1. Schema check.
  console.log(`${COLORS.bold}1. Posting gate schema check${COLORS.reset}`)
  const { error: schemaErr } = await supabase
    .from('content_calendar')
    .select(REQUIRED_GATE_COLUMNS.join(', '))
    .limit(1)

  if (schemaErr) {
    console.log(`   ${COLORS.red}✗ Posting gate columns missing:${COLORS.reset} ${schemaErr.message}`)
    console.log(`   ${COLORS.dim}Apply migration 029 first.${COLORS.reset}`)
    process.exit(2)
  }
  console.log(`   ${COLORS.green}✓ All Phase 14J gate columns present.${COLORS.reset}`)
  console.log()

  // 2. + 3. Eligibility split.
  console.log(`${COLORS.bold}2. Approved rows — eligibility split${COLORS.reset}`)
  const { data: candidates, error: rowsErr } = await supabase
    .from('content_calendar')
    .select('id, platform, status, caption, posting_status, posting_gate_approved, queued_for_posting_at, manual_posting_only, tracking_url, campaign_asset_id, posted_at, created_at')
    .eq('status', 'approved')
    .order('queued_for_posting_at', { ascending: true, nullsFirst: false })
    .limit(500)

  if (rowsErr) {
    console.error(`   ${COLORS.red}Query failed:${COLORS.reset} ${rowsErr.message}`)
    process.exit(3)
  }

  const eligible = []
  const skipped = []
  for (const r of candidates ?? []) {
    const reason = reasonFor(r)
    if (reason === null) eligible.push(r)
    else skipped.push({ ...r, reason })
  }

  console.log(`   ${COLORS.green}eligible:${COLORS.reset} ${eligible.length}`)
  console.log(`   ${COLORS.yellow}skipped (approved but ungated):${COLORS.reset} ${skipped.length}`)
  console.log(`   ${COLORS.dim}total approved scanned:${COLORS.reset} ${(candidates ?? []).length}`)
  console.log()

  if (eligible.length > 0) {
    console.log(`${COLORS.bold}   Eligible (first 10):${COLORS.reset}`)
    for (const r of eligible.slice(0, 10)) {
      console.log(`     - ${r.id} | platform=${r.platform} | queued=${r.queued_for_posting_at ?? '(null)'} | tracking=${r.tracking_url ? 'yes' : 'no'}`)
    }
    if (eligible.length > 10) console.log(`     ${COLORS.dim}…and ${eligible.length - 10} more${COLORS.reset}`)
    console.log()
  }

  if (skipped.length > 0) {
    console.log(`${COLORS.bold}3. Why approved rows are NOT eligible${COLORS.reset}`)
    const reasonCounts = {}
    for (const r of skipped) reasonCounts[r.reason] = (reasonCounts[r.reason] ?? 0) + 1
    for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${count.toString().padStart(4)}  ${reason}`)
    }
    console.log()
    console.log(`${COLORS.bold}   Sample (first 5):${COLORS.reset}`)
    for (const r of skipped.slice(0, 5)) {
      console.log(`     - ${r.id} | platform=${r.platform ?? '(null)'} | reason=${r.reason}`)
    }
    console.log()
  }

  // 4. Hit the dry-run endpoint OR print the curl command.
  console.log(`${COLORS.bold}4. Dry-run endpoint${COLORS.reset}`)
  const cronSecret = env.CRON_SECRET
  const appUrl = env.NEXT_PUBLIC_APP_URL || 'https://www.vortextrips.com'
  const endpoint = `${appUrl.replace(/\/$/, '')}/api/cron/autoposter-dry-run`

  if (!cronSecret) {
    console.log(`   ${COLORS.yellow}CRON_SECRET not set in .env.local — skipping live call.${COLORS.reset}`)
    console.log(`   ${COLORS.dim}Manual curl invocation:${COLORS.reset}`)
    console.log(`     curl -sS -H "Authorization: Bearer <CRON_SECRET>" ${endpoint}`)
    console.log()
    console.log(`${COLORS.dim}Diagnostic read-only — no rows written.${COLORS.reset}`)
    return
  }

  // Snapshot: count of posted_at rows BEFORE the dry-run call.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  let dryRunResponse = null
  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
    const json = await res.json()
    dryRunResponse = { status: res.status, ok: res.ok, json }
  } catch (err) {
    console.log(`   ${COLORS.red}Fetch failed:${COLORS.reset} ${err instanceof Error ? err.message : String(err)}`)
    console.log(`   ${COLORS.dim}Manual curl invocation:${COLORS.reset}`)
    console.log(`     curl -sS -H "Authorization: Bearer <CRON_SECRET>" ${endpoint}`)
    return
  }

  if (!dryRunResponse.ok) {
    console.log(`   ${COLORS.red}HTTP ${dryRunResponse.status}:${COLORS.reset}`, JSON.stringify(dryRunResponse.json))
    return
  }

  const j = dryRunResponse.json
  console.log(`   ${COLORS.green}HTTP ${dryRunResponse.status} OK${COLORS.reset}`)
  console.log(`   ${COLORS.dim}dry_run:${COLORS.reset}              ${j.dry_run}`)
  console.log(`   ${COLORS.dim}live_posting_blocked:${COLORS.reset} ${j.live_posting_blocked}`)
  console.log(`   ${COLORS.dim}eligible_count:${COLORS.reset}       ${j.eligible_count}`)
  console.log(`   ${COLORS.dim}skipped_count:${COLORS.reset}        ${j.skipped_count}`)
  if (j.summary && j.summary.by_platform && Object.keys(j.summary.by_platform).length > 0) {
    console.log(`   ${COLORS.dim}by_platform:${COLORS.reset}`)
    for (const [p, n] of Object.entries(j.summary.by_platform)) {
      console.log(`     ${p}: ${n}`)
    }
  }
  console.log()

  // 5. Contract assertions.
  console.log(`${COLORS.bold}5. Contract assertions${COLORS.reset}`)
  const assertions = [
    { name: 'response is dry_run=true', ok: j.dry_run === true },
    { name: 'response is live_posting_blocked=true', ok: j.live_posting_blocked === true },
    { name: 'eligible_count matches direct query', ok: j.eligible_count === eligible.length },
  ]
  for (const a of assertions) {
    console.log(`   ${a.ok ? COLORS.green + '✓' : COLORS.red + '✗'} ${a.name}${COLORS.reset}`)
  }
  console.log()

  // 6. No-mutation cross-check.
  console.log(`${COLORS.bold}6. No-mutation cross-check${COLORS.reset}`)
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  if (postedBefore === postedAfter) {
    console.log(`   ${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`)
    console.log(`   ${COLORS.green}✓ The dry-run did not mutate any row to 'posted'.${COLORS.reset}`)
  } else {
    console.log(`   ${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`)
    console.log(`   ${COLORS.red}This SHOULD NOT happen for a dry-run. Investigate immediately.${COLORS.reset}`)
  }
  console.log()
  console.log(`${COLORS.dim}Diagnostic read-only — no rows written.${COLORS.reset}`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
