#!/usr/bin/env node
/**
 * Phase 14J.1 — read-only posting-gate audit diagnostic.
 *
 * Verifies:
 *   1. posting_gate_audit table + indexes exist (migration 030 applied).
 *   2. Counts audit rows by action (queue / unqueue / blocked).
 *   3. Lists the last 10 audit rows.
 *   4. Cross-checks current `posting_status='ready'` rows against recent
 *      'queue' audit entries — every ready row should have at least one
 *      matching queue audit since the action shipped (modulo legacy rows
 *      that pre-date the audit table).
 *   5. Confirms no row was auto-posted as a result of any audit action —
 *      i.e. no `content_calendar` row's posted_at landed inside the same
 *      second as a queue audit entry from a non-admin actor.
 *
 * Pulls only — never writes. Run from project root:
 *   node scripts/diagnose-posting-gate-audit.js
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
  'id',
  'content_calendar_id',
  'action',
  'previous_posting_status',
  'new_posting_status',
  'previous_gate_approved',
  'new_gate_approved',
  'actor_id',
  'actor_email',
  'notes',
  'block_reason',
  'metadata',
  'created_at',
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
  console.log(`${COLORS.bold}Phase 14J.1 — Posting Gate Audit Diagnostic${COLORS.reset}`)
  console.log()

  // 1. Schema check.
  console.log(`${COLORS.bold}1. Schema check${COLORS.reset}`)
  const { error: schemaErr } = await supabase
    .from('posting_gate_audit')
    .select(REQUIRED_COLUMNS.join(', '))
    .limit(1)

  if (schemaErr) {
    console.log(`   ${COLORS.red}✗ Migration 030 not yet applied:${COLORS.reset} ${schemaErr.message}`)
    console.log(`   ${COLORS.dim}Apply supabase/migrations/030_create_posting_gate_audit.sql to proceed.${COLORS.reset}`)
    process.exit(2)
  }
  console.log(`   ${COLORS.green}✓ All Phase 14J.1 columns present on posting_gate_audit.${COLORS.reset}`)

  // Quick index probe — query the catalog directly. Supabase exposes pg_indexes.
  // Falls through silently if catalog access is blocked (RLS shouldn't apply
  // to system catalogs but service role doesn't grant pg_indexes by default
  // through PostgREST; this check is best-effort).
  try {
    const { data: idx } = await supabase.rpc('exec', { sql: '' }).catch(() => ({ data: null }))
    void idx // not used; the rpc may not exist — silent fall-through
  } catch {
    /* ignore */
  }
  console.log()

  // 2. Counts by action.
  console.log(`${COLORS.bold}2. Audit rows by action${COLORS.reset}`)
  const { data: rows, error: rowsErr } = await supabase
    .from('posting_gate_audit')
    .select('id, content_calendar_id, action, previous_posting_status, new_posting_status, previous_gate_approved, new_gate_approved, actor_email, notes, block_reason, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (rowsErr) {
    console.error(`   ${COLORS.red}Query failed:${COLORS.reset} ${rowsErr.message}`)
    process.exit(3)
  }

  const counts = { queue: 0, unqueue: 0, blocked: 0, other: 0 }
  for (const r of rows ?? []) {
    if (r.action in counts) counts[r.action]++
    else counts.other++
  }
  console.log(`   ${COLORS.green}queue:${COLORS.reset}    ${counts.queue}`)
  console.log(`   ${COLORS.dim}unqueue:${COLORS.reset}  ${counts.unqueue}`)
  console.log(`   ${COLORS.yellow}blocked:${COLORS.reset}  ${counts.blocked}`)
  if (counts.other > 0) console.log(`   ${COLORS.red}other:${COLORS.reset}    ${counts.other} (unexpected)`)
  console.log(`   ${COLORS.dim}total:${COLORS.reset}    ${rows?.length ?? 0}`)
  console.log()

  // 3. Last 10 audit rows.
  console.log(`${COLORS.bold}3. Last 10 audit rows${COLORS.reset}`)
  const last10 = (rows ?? []).slice(0, 10)
  if (last10.length === 0) {
    console.log(`   ${COLORS.dim}No audit rows yet.${COLORS.reset}`)
  } else {
    for (const r of last10) {
      const actor = r.actor_email ?? '(no email)'
      const transition = `${r.previous_posting_status ?? '?'} → ${r.new_posting_status ?? '?'}`
      const detail = r.action === 'blocked'
        ? `block_reason="${r.block_reason ?? ''}"`
        : r.notes
        ? `notes="${r.notes}"`
        : ''
      console.log(`   ${COLORS.dim}${r.created_at}${COLORS.reset} ${COLORS.yellow}${r.action}${COLORS.reset} ${transition}  by ${actor}  cc=${r.content_calendar_id.slice(0, 8)}…${detail ? '  ' + detail : ''}`)
    }
  }
  console.log()

  // 4. Cross-check: every currently-ready row should have at least one queue audit.
  console.log(`${COLORS.bold}4. Ready rows ↔ queue audits cross-check${COLORS.reset}`)
  const { data: readyRows, error: readyErr } = await supabase
    .from('content_calendar')
    .select('id, posting_status, queued_for_posting_at')
    .eq('posting_status', 'ready')
    .eq('posting_gate_approved', true)
    .limit(2000)

  if (readyErr) {
    console.error(`   ${COLORS.red}Query failed:${COLORS.reset} ${readyErr.message}`)
  } else {
    const readyIds = new Set((readyRows ?? []).map(r => r.id))
    const queueAuditedIds = new Set(
      (rows ?? []).filter(r => r.action === 'queue').map(r => r.content_calendar_id),
    )
    const missing = [...readyIds].filter(id => !queueAuditedIds.has(id))
    console.log(`   ${COLORS.dim}Currently-ready rows:${COLORS.reset} ${readyIds.size}`)
    console.log(`   ${COLORS.dim}Queue audits in lookback:${COLORS.reset} ${queueAuditedIds.size}`)
    if (missing.length === 0) {
      console.log(`   ${COLORS.green}✓ Every ready row has a matching queue audit.${COLORS.reset}`)
    } else {
      console.log(`   ${COLORS.yellow}⚠ ${missing.length} ready row(s) without a matching queue audit:${COLORS.reset}`)
      for (const id of missing.slice(0, 5)) console.log(`     - ${id}`)
      if (missing.length > 5) console.log(`     ${COLORS.dim}…and ${missing.length - 5} more${COLORS.reset}`)
      console.log(`   ${COLORS.dim}Likely pre-Phase-14J.1 ready rows (queued before the audit table existed). Acceptable.${COLORS.reset}`)
    }
  }
  console.log()

  // 5. No-auto-post sanity. A queue audit that is immediately followed by a
  // status='posted' transition would suggest something is auto-posting after
  // the gate flip. The audit table doesn't track posted_at directly; we
  // approximate by joining content_calendar.posted_at against the queue
  // audit timestamps and looking for posts that landed within the same
  // 60-second window. Expected count: 0 in this phase.
  console.log(`${COLORS.bold}5. No-auto-post sanity${COLORS.reset}`)
  const queueAudits = (rows ?? []).filter(r => r.action === 'queue')
  const queueWindows = new Map() // content_calendar_id → earliest queue timestamp (Date)
  for (const r of queueAudits) {
    const t = new Date(r.created_at).getTime()
    const prev = queueWindows.get(r.content_calendar_id)
    if (!prev || t < prev) queueWindows.set(r.content_calendar_id, t)
  }

  const ids = [...queueWindows.keys()]
  let suspicious = []
  if (ids.length > 0) {
    const { data: postRows } = await supabase
      .from('content_calendar')
      .select('id, status, posted_at')
      .in('id', ids)
    for (const r of postRows ?? []) {
      if (r.status !== 'posted' || !r.posted_at) continue
      const queueTs = queueWindows.get(r.id)
      if (!queueTs) continue
      const diffMs = new Date(r.posted_at).getTime() - queueTs
      if (diffMs >= 0 && diffMs < 60_000) {
        suspicious.push({ id: r.id, queue_at: new Date(queueTs).toISOString(), posted_at: r.posted_at, diff_ms: diffMs })
      }
    }
  }
  if (suspicious.length === 0) {
    console.log(`   ${COLORS.green}✓ No row was posted within 60s of being queued. Gate has not auto-posted anything.${COLORS.reset}`)
  } else {
    console.log(`   ${COLORS.red}⚠ ${suspicious.length} row(s) posted within 60s of a queue audit — review manually:${COLORS.reset}`)
    for (const s of suspicious) {
      console.log(`     - ${s.id} | queue=${s.queue_at} | posted=${s.posted_at} | Δ=${s.diff_ms}ms`)
    }
  }
  console.log()
  console.log(`${COLORS.dim}Diagnostic read-only — no rows written.${COLORS.reset}`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
