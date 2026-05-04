#!/usr/bin/env node
/**
 * Phase 14K.0.5 — read-only diagnostic for manual posting gate consistency.
 *
 * Verifies:
 *   1. Every discovered manual platform-post route file imports + calls
 *      `validateManualPostingGate`. Files that don't are flagged.
 *   2. Approved-but-idle rows are correctly classified as blocked by the
 *      validator (never gate-eligible without posting_gate_approved=true +
 *      posting_status='ready').
 *   3. Approved-and-ready rows pass only when all gate fields are valid
 *      (campaign-originated rows must carry a branded /t/<slug> tracking_url).
 *   4. The `posted_at` count is unchanged across the run (read-only invariant).
 *
 * Never calls a platform API. Never invokes a platform-post route. Never
 * mutates content_calendar.
 *
 * Run from project root:
 *   node scripts/diagnose-manual-posting-gates.js
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

const ROUTES_TO_CHECK = [
  'src/app/api/automations/post-to-facebook/route.ts',
  'src/app/api/automations/post-to-instagram/route.ts',
  'src/app/api/automations/post-to-twitter/route.ts',
  // Phase 14K.0.6 — generic status PATCH gates the `→ posted` bookkeeping
  // transition. The grep below verifies the helper is imported + called;
  // the route's conditional gating (only when status === 'posted') is
  // verified by the runtime tests, not by static check.
  'src/app/api/content/route.ts',
]

const REQUIRED_GATE_TOKEN = 'validateManualPostingGate'

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

/**
 * Mirror of `validateManualPostingGate` from src/lib/posting-gate.ts. Kept in
 * sync by hand — when the helper rules change, update this one too.
 */
function validateManualPostingGateJs(row, options = {}) {
  const reasons = []
  if (!row) {
    return { allowed: false, reasons: ['content_calendar row not found'] }
  }
  if (row.status === 'rejected') reasons.push('row status is rejected')
  else if (row.status === 'posted' || row.posted_at) reasons.push('row is already posted')
  else if (row.status !== 'approved') reasons.push(`row status is '${row.status}', need 'approved'`)

  if (row.posting_status === 'blocked') {
    const detail = row.posting_block_reason ? `: ${row.posting_block_reason}` : ''
    reasons.push(`gate is blocked${detail}`)
  } else if (row.posting_status !== 'ready') {
    reasons.push(`posting_status is '${row.posting_status ?? 'null'}', need 'ready'`)
  }
  if (row.posting_gate_approved !== true) reasons.push('posting_gate_approved is not true')
  if (!row.queued_for_posting_at) reasons.push('queued_for_posting_at is null')
  if (row.manual_posting_only !== true) reasons.push('manual_posting_only is not true')

  if (!options.bookkeepingOnly) {
    if (!row.platform || !row.platform.trim()) reasons.push('platform is missing')
    else if (options.supportedPlatforms && !options.supportedPlatforms.includes(row.platform)) {
      reasons.push(`platform '${row.platform}' not in supportedPlatforms`)
    }
    if (!row.caption || !row.caption.trim()) reasons.push('caption/body is empty')
  }
  if (row.campaign_asset_id) {
    if (!row.tracking_url || !row.tracking_url.trim()) {
      reasons.push('campaign-originated row missing tracking_url')
    } else if (!row.tracking_url.startsWith('https://www.vortextrips.com/t/')) {
      reasons.push('tracking_url does not start with https://www.vortextrips.com/t/')
    }
  }
  return { allowed: reasons.length === 0, reasons }
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
  console.log(`${COLORS.bold}Phase 14K.0.5 — Manual Posting Gate Consistency Diagnostic${COLORS.reset}`)
  console.log()

  // 1. Source-code grep for the gate helper in each manual route.
  console.log(`${COLORS.bold}1. Manual posting routes — gate helper presence${COLORS.reset}`)
  const projectRoot = path.join(__dirname, '..')
  let allGated = true
  for (const rel of ROUTES_TO_CHECK) {
    const abs = path.join(projectRoot, rel)
    if (!fs.existsSync(abs)) {
      console.log(`   ${COLORS.yellow}? ${rel} (file not found — skipped)${COLORS.reset}`)
      continue
    }
    const src = fs.readFileSync(abs, 'utf8')
    const hasImport = src.includes(`from '@/lib/posting-gate'`) || src.includes(`from "@/lib/posting-gate"`)
    const hasCall = src.includes(REQUIRED_GATE_TOKEN)
    if (hasImport && hasCall) {
      console.log(`   ${COLORS.green}✓ ${rel}${COLORS.reset}  (imports + calls ${REQUIRED_GATE_TOKEN})`)
    } else {
      allGated = false
      console.log(`   ${COLORS.red}✗ ${rel}${COLORS.reset}  (missing ${hasImport ? 'call' : 'import'} of ${REQUIRED_GATE_TOKEN})`)
    }
  }
  if (!allGated) {
    console.log(`   ${COLORS.red}NOT ALL POST ROUTES ARE GATED — Phase 14K.0.5 incomplete.${COLORS.reset}`)
  }
  console.log()

  // 2. Snapshot posted_at count BEFORE the diagnostic.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // 3. Pull approved rows split by gate state.
  console.log(`${COLORS.bold}2. Approved rows split by gate state${COLORS.reset}`)
  const { data: approvedRows, error: rowsErr } = await supabase
    .from('content_calendar')
    .select('id, platform, status, caption, posting_status, posting_gate_approved, queued_for_posting_at, manual_posting_only, tracking_url, campaign_asset_id, posted_at, posting_block_reason')
    .eq('status', 'approved')
    .limit(2000)

  if (rowsErr) {
    console.error(`   ${COLORS.red}Query failed:${COLORS.reset} ${rowsErr.message}`)
    process.exit(3)
  }

  const idle = []
  const ready = []
  const blocked = []
  const other = []
  for (const r of approvedRows ?? []) {
    if (r.posting_status === 'idle' || r.posting_status === null) idle.push(r)
    else if (r.posting_status === 'ready') ready.push(r)
    else if (r.posting_status === 'blocked') blocked.push(r)
    else other.push(r)
  }
  console.log(`   ${COLORS.dim}idle:${COLORS.reset}    ${idle.length}`)
  console.log(`   ${COLORS.green}ready:${COLORS.reset}   ${ready.length}`)
  console.log(`   ${COLORS.yellow}blocked:${COLORS.reset} ${blocked.length}`)
  if (other.length > 0) console.log(`   ${COLORS.red}other:${COLORS.reset}   ${other.length} (unexpected)`)
  console.log()

  // 4. Idle rows must all be classified as blocked by the validator.
  console.log(`${COLORS.bold}3. Idle rows ↔ validator blocked-set agreement${COLORS.reset}`)
  let idleBlockMismatch = 0
  for (const r of idle) {
    const result = validateManualPostingGateJs(r)
    if (result.allowed) idleBlockMismatch++
  }
  if (idle.length === 0) {
    console.log(`   ${COLORS.dim}(no idle approved rows to test)${COLORS.reset}`)
  } else if (idleBlockMismatch === 0) {
    console.log(`   ${COLORS.green}✓ All ${idle.length} idle rows are correctly blocked by the validator.${COLORS.reset}`)
  } else {
    console.log(`   ${COLORS.red}✗ ${idleBlockMismatch} idle row(s) leaked through the validator. Investigate.${COLORS.reset}`)
  }
  console.log()

  // 5. Ready rows: per-row pass/fail breakdown.
  console.log(`${COLORS.bold}4. Ready rows ↔ validator${COLORS.reset}`)
  if (ready.length === 0) {
    console.log(`   ${COLORS.dim}(no ready approved rows to test)${COLORS.reset}`)
  } else {
    let passing = 0
    let failing = 0
    for (const r of ready) {
      const result = validateManualPostingGateJs(r)
      if (result.allowed) {
        passing++
      } else {
        failing++
        console.log(`   ${COLORS.yellow}${r.id} (${r.platform})${COLORS.reset}: ${result.reasons.join('; ')}`)
      }
    }
    console.log(`   ${COLORS.green}passing:${COLORS.reset} ${passing}`)
    if (failing > 0) console.log(`   ${COLORS.yellow}failing:${COLORS.reset} ${failing} (above)`)
  }
  console.log()

  // 6. Snapshot posted_at count AFTER. Must match before-snapshot.
  console.log(`${COLORS.bold}5. No-mutation cross-check${COLORS.reset}`)
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
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
