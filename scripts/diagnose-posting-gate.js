#!/usr/bin/env node
/**
 * Phase 14J — read-only posting gate diagnostic.
 *
 * Verifies:
 *   1. Migration 029 columns exist on content_calendar.
 *   2. Counts content_calendar rows by posting_status.
 *   3. Counts gate-approved rows.
 *   4. Lists gate-approved rows that are missing tracking_url despite
 *      campaign_asset_id being set (data anomaly — should be empty).
 *   5. Confirms no auto-posting was triggered by the gate (read-only check —
 *      reports the count of rows that became `status='posted'` since the
 *      newest queued_for_posting_at; if any exist, surface them for review).
 *
 * Pulls only — never writes. Run from project root:
 *   node scripts/diagnose-posting-gate.js
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

const REQUIRED_COLUMNS = [
  'posting_status',
  'posting_gate_approved',
  'posting_gate_approved_at',
  'posting_gate_approved_by',
  'posting_gate_notes',
  'queued_for_posting_at',
  'manual_posting_only',
  'posting_block_reason',
]

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
  console.log(`${COLORS.bold}Phase 14J — Posting Gate Diagnostic${COLORS.reset}`)
  console.log()

  // 1. Schema check
  console.log(`${COLORS.bold}1. Schema check${COLORS.reset}`)
  const { error: schemaErr } = await supabase
    .from('content_calendar')
    .select(REQUIRED_COLUMNS.join(', '))
    .limit(1)

  if (schemaErr) {
    console.log(`   ${COLORS.red}✗ Migration 029 not yet applied:${COLORS.reset} ${schemaErr.message}`)
    console.log(`   ${COLORS.dim}Apply supabase/migrations/029_add_posting_gate_fields_to_content_calendar.sql to proceed.${COLORS.reset}`)
    process.exit(2)
  }
  console.log(`   ${COLORS.green}✓ All Phase 14J columns present on content_calendar.${COLORS.reset}`)
  console.log()

  // 2. Posting-status distribution
  console.log(`${COLORS.bold}2. Rows by posting_status${COLORS.reset}`)
  const { data: rows, error: rowsErr } = await supabase
    .from('content_calendar')
    .select('id, status, posting_status, posting_gate_approved, queued_for_posting_at, posted_at, campaign_asset_id, tracking_url, posting_block_reason')
    .limit(2000)

  if (rowsErr) {
    console.error(`   ${COLORS.red}Query failed:${COLORS.reset} ${rowsErr.message}`)
    process.exit(3)
  }

  const counts = { idle: 0, ready: 0, blocked: 0, null: 0, other: 0 }
  for (const r of rows ?? []) {
    const ps = r.posting_status ?? 'null'
    if (ps in counts) counts[ps]++
    else counts.other++
  }
  console.log(`   ${COLORS.dim}idle:${COLORS.reset}    ${counts.idle}`)
  console.log(`   ${COLORS.green}ready:${COLORS.reset}   ${counts.ready}`)
  console.log(`   ${COLORS.yellow}blocked:${COLORS.reset} ${counts.blocked}`)
  console.log(`   ${COLORS.dim}null:${COLORS.reset}    ${counts.null}`)
  if (counts.other > 0) console.log(`   ${COLORS.red}other:${COLORS.reset}   ${counts.other} (unexpected)`)
  console.log()

  // 3. Gate-approved row count
  const gateApproved = (rows ?? []).filter(r => r.posting_gate_approved === true)
  console.log(`${COLORS.bold}3. Gate-approved rows${COLORS.reset}`)
  console.log(`   Total: ${gateApproved.length}`)
  if (gateApproved.length > 0) {
    for (const r of gateApproved.slice(0, 10)) {
      console.log(
        `   ${COLORS.dim}-${COLORS.reset} ${r.id} | status=${r.status} | queued_at=${r.queued_for_posting_at ?? '(null)'}`,
      )
    }
    if (gateApproved.length > 10) console.log(`   ${COLORS.dim}…and ${gateApproved.length - 10} more${COLORS.reset}`)
  }
  console.log()

  // 4. Anomaly: gate-approved rows missing tracking_url despite campaign_asset_id
  console.log(`${COLORS.bold}4. Gate-approved rows missing tracking_url (campaign-originated)${COLORS.reset}`)
  const anomalies = gateApproved.filter(r => r.campaign_asset_id && !r.tracking_url)
  if (anomalies.length === 0) {
    console.log(`   ${COLORS.green}✓ None.${COLORS.reset}`)
  } else {
    console.log(`   ${COLORS.red}✗ ${anomalies.length} row(s) violate the gate's tracking_url rule:${COLORS.reset}`)
    for (const r of anomalies) {
      console.log(`     - ${r.id} (campaign_asset_id=${r.campaign_asset_id})`)
    }
    console.log(`   ${COLORS.dim}These rows should not have been queued. Re-push from the campaign dashboard, then unqueue and re-queue.${COLORS.reset}`)
  }
  console.log()

  // 5. No-auto-post sanity check — has any row become status='posted' AFTER
  //    being queued? If yes, those were posted via the manual dashboard buttons
  //    (expected) — we report them as informational so an operator can confirm.
  console.log(`${COLORS.bold}5. Posted-after-queued cross-check${COLORS.reset}`)
  const postedAfterQueue = (rows ?? []).filter(r => {
    if (r.status !== 'posted') return false
    if (!r.queued_for_posting_at || !r.posted_at) return false
    return new Date(r.posted_at).getTime() >= new Date(r.queued_for_posting_at).getTime()
  })
  if (postedAfterQueue.length === 0) {
    console.log(`   ${COLORS.green}✓ No rows have transitioned to posted after being queued. Gate is purely manual.${COLORS.reset}`)
  } else {
    console.log(`   ${COLORS.dim}${postedAfterQueue.length} row(s) were posted after being marked ready (expected when an admin clicks Post-to-IG/FB/X manually):${COLORS.reset}`)
    for (const r of postedAfterQueue.slice(0, 5)) {
      console.log(`     - ${r.id} | queued=${r.queued_for_posting_at} | posted=${r.posted_at}`)
    }
    if (postedAfterQueue.length > 5) console.log(`     ${COLORS.dim}…and ${postedAfterQueue.length - 5} more${COLORS.reset}`)
  }
  console.log()
  console.log(`${COLORS.dim}Diagnostic read-only — no rows written.${COLORS.reset}`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
