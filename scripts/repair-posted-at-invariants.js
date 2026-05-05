#!/usr/bin/env node
/**
 * Phase 14M.2 — One-shot posted_at invariant repair.
 *
 * Two anomaly types possible in content_calendar:
 *   (a) status='posted' AND posted_at IS NULL
 *       Cause: pre-Phase-14M.2 `/api/content` PATCH route flipped status
 *       without stamping posted_at. Phase 14M.2 patches the route; this
 *       script back-fills posted_at on the row(s) that were affected.
 *
 *   (b) status != 'posted' AND posted_at IS NOT NULL
 *       Cause: historical artifact (e.g. row was posted earlier, then
 *       reset to draft/approved, leaving posted_at populated). Touching
 *       this requires explicit operator confirmation per the spec.
 *
 * Modes:
 *   default                              → DRY-RUN. Lists both anomaly types.
 *                                          No DB writes. No platform calls.
 *   --apply                              → Repairs anomaly (a) for the
 *                                          row id chosen by --id (default
 *                                          TIKTOK_PILOT_ID). Writes ONLY
 *                                          posted_at — never touches
 *                                          status, video_url, posting_*,
 *                                          or any other column.
 *   --id=<uuid>                          → Target a specific anomaly (a)
 *                                          row id. The id MUST currently
 *                                          satisfy anomaly (a) (status='posted'
 *                                          AND posted_at IS NULL); the
 *                                          script refuses otherwise. When
 *                                          omitted, defaults to the
 *                                          TikTok pilot id below.
 *   --timestamp=<ISO>                    → Override the posted_at value to
 *                                          stamp. Defaults to new Date()
 *                                          (current time) when not set.
 *   --apply --repair-legacy-id=<uuid>    → Clear posted_at on the
 *                                          specified anomaly (b) row. Will
 *                                          refuse if the id isn't currently
 *                                          in anomaly (b). Use only after
 *                                          you've reviewed the row's
 *                                          history and confirmed the
 *                                          posted_at is incorrect.
 *
 * NEVER:
 *   - calls a platform / provider API (Facebook, Instagram, TikTok, X, HeyGen, OpenAI, Pexels)
 *   - touches content_calendar.status / posting_status / posting_gate_approved /
 *     queued_for_posting_at / video_url / image_url / caption / image_prompt
 *   - enables or modifies cron / vercel.json
 *   - mutates campaign_assets
 *
 * Run from project root:
 *   node scripts/repair-posted-at-invariants.js
 *   node scripts/repair-posted-at-invariants.js --apply
 *   node scripts/repair-posted-at-invariants.js --apply --timestamp=2026-05-05T05:11:00Z
 *   node scripts/repair-posted-at-invariants.js --apply --repair-legacy-id=<uuid>
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

const TIKTOK_PILOT_ID = '9a9e2a52-941d-48bb-b9e7-db0f24f3bc69'

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error(`${COLORS.red}.env.local not found at ${envPath}${COLORS.reset}`)
    process.exit(1)
  }
  const text = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

function parseArgs(argv) {
  const flags = {
    apply: false,
    timestamp: null,
    id: null,                 // anomaly-(a) targeting; default TIKTOK_PILOT_ID
    repairLegacyId: null,     // anomaly-(b) targeting; explicit only
  }
  for (const a of argv.slice(2)) {
    if (a === '--apply') flags.apply = true
    else if (a === '--dry-run') {/* explicit; same as default */}
    else if (a.startsWith('--timestamp=')) flags.timestamp = a.split('=')[1]?.trim() || null
    else if (a.startsWith('--id=')) flags.id = a.split('=')[1]?.trim() || null
    else if (a.startsWith('--repair-legacy-id=')) flags.repairLegacyId = a.split('=')[1]?.trim() || null
  }
  return flags
}

function isValidIso(s) {
  if (typeof s !== 'string' || !s) return false
  const d = new Date(s)
  return !Number.isNaN(d.getTime())
}

async function main() {
  const flags = parseArgs(process.argv)
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${COLORS.reset}`)
    process.exit(1)
  }
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const mode = flags.apply ? 'APPLY (writes)' : 'DRY-RUN'
  console.log()
  console.log(`${COLORS.bold}Phase 14M.2 — Posted_at Invariant Repair [${mode}]${COLORS.reset}`)
  console.log(`${COLORS.dim}No platform calls. ${flags.apply ? 'May update content_calendar.posted_at only.' : 'No DB writes.'}${COLORS.reset}`)
  console.log()

  // posted_at no-mutation snapshot (audit cross-check).
  const { count: postedAtBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  const { count: statusPostedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted')

  // ============================================================
  // Anomaly (a): status='posted' AND posted_at IS NULL
  // ============================================================
  const { data: typeA, error: aErr } = await supabase
    .from('content_calendar')
    .select('id, platform, status, posted_at, queued_for_posting_at, posting_gate_approved_at, created_at')
    .eq('status', 'posted')
    .is('posted_at', null)
    .order('created_at', { ascending: false })
  if (aErr) { console.error(`${COLORS.red}query (a) failed:${COLORS.reset} ${aErr.message}`); process.exit(2) }

  console.log(`${COLORS.bold}1. status='posted' AND posted_at IS NULL  (FAIL on count > 0)${COLORS.reset}`)
  console.log(`   total: ${(typeA ?? []).length}`)
  for (const r of typeA ?? []) {
    const pinned = r.id === TIKTOK_PILOT_ID
    console.log(`   ${pinned ? COLORS.cyan + '[pilot]' + COLORS.reset : COLORS.dim + '[other]' + COLORS.reset} ${r.id}  platform=${r.platform}  queued_at=${r.queued_for_posting_at ?? 'null'}  approved_at=${r.posting_gate_approved_at ?? 'null'}`)
  }
  console.log()

  // ============================================================
  // Anomaly (b): status != 'posted' AND posted_at IS NOT NULL
  // ============================================================
  const { data: typeB, error: bErr } = await supabase
    .from('content_calendar')
    .select('id, platform, status, posted_at, created_at')
    .neq('status', 'posted')
    .not('posted_at', 'is', null)
    .order('posted_at', { ascending: false })
  if (bErr) { console.error(`${COLORS.red}query (b) failed:${COLORS.reset} ${bErr.message}`); process.exit(2) }

  console.log(`${COLORS.bold}2. status != 'posted' AND posted_at IS NOT NULL  (WARN — historical artifact)${COLORS.reset}`)
  console.log(`   total: ${(typeB ?? []).length}`)
  for (const r of typeB ?? []) {
    console.log(`   ${COLORS.yellow}[legacy]${COLORS.reset} ${r.id}  platform=${r.platform}  status=${r.status}  posted_at=${r.posted_at}`)
  }
  console.log()

  // ============================================================
  // Plan / write
  // ============================================================
  const targetStamp = flags.timestamp ?? new Date().toISOString()
  if (flags.timestamp && !isValidIso(flags.timestamp)) {
    console.error(`${COLORS.red}--timestamp=${flags.timestamp} is not a valid ISO date${COLORS.reset}`)
    process.exit(2)
  }

  // Plan A: stamp posted_at on the chosen anomaly-(a) row.
  // The chosen id is `--id=<uuid>` if supplied, otherwise the TikTok pilot.
  // The id MUST currently satisfy anomaly (a) — otherwise the script refuses.
  const chosenIdForA = flags.id ?? TIKTOK_PILOT_ID
  const chosenInTypeA = (typeA ?? []).find(r => r.id === chosenIdForA)
  const idLabel = flags.id ? '--id=' + flags.id : 'default TikTok pilot id'
  console.log(`${COLORS.bold}3. Repair plan${COLORS.reset}`)
  if (chosenInTypeA) {
    const tag = chosenIdForA === TIKTOK_PILOT_ID ? 'TikTok pilot' : 'operator-supplied id'
    console.log(`   ${COLORS.cyan}(a-1)${COLORS.reset} stamp posted_at on ${tag} ${chosenIdForA}`)
    console.log(`         → posted_at = ${targetStamp}  ${flags.timestamp ? '' : COLORS.dim + '(now() — pass --timestamp=<iso> to override)' + COLORS.reset}`)
  } else if (flags.id) {
    console.log(`   ${COLORS.red}(a-1) refused${COLORS.reset} — --id=${flags.id} is NOT currently in anomaly (a)`)
    console.log(`         ${COLORS.dim}(its current state is either status!='posted' or posted_at IS NOT NULL)${COLORS.reset}`)
  } else {
    console.log(`   ${COLORS.dim}(a-1) ${idLabel} ${TIKTOK_PILOT_ID} is NOT in anomaly (a) — nothing to do${COLORS.reset}`)
  }

  // Other anomaly (a) rows — list but refuse to repair without explicit
  // operator action. Each requires its own --id=<uuid> invocation.
  const otherTypeA = (typeA ?? []).filter(r => r.id !== chosenIdForA)
  if (otherTypeA.length > 0) {
    console.log(`   ${COLORS.yellow}(a-other)${COLORS.reset} ${otherTypeA.length} other status=posted/posted_at=null row(s) found — NOT repaired this run`)
    for (const r of otherTypeA) console.log(`      ${COLORS.dim}refused:${COLORS.reset} ${r.id} ${r.platform}  (re-run with --id=${r.id} to target)`)
  }

  // Plan B: clear posted_at on legacy id, ONLY when --repair-legacy-id matches.
  if (flags.repairLegacyId) {
    const legacyHit = (typeB ?? []).find(r => r.id === flags.repairLegacyId)
    if (!legacyHit) {
      console.log(`   ${COLORS.red}(b-1)${COLORS.reset} --repair-legacy-id=${flags.repairLegacyId} is NOT currently in anomaly (b) — refusing`)
    } else {
      console.log(`   ${COLORS.yellow}(b-1)${COLORS.reset} clear posted_at on legacy ${flags.repairLegacyId}  (status=${legacyHit.status}, currently posted_at=${legacyHit.posted_at})`)
    }
  }
  console.log()

  // ============================================================
  // Apply
  // ============================================================
  let writes = 0
  if (flags.apply) {
    if (chosenInTypeA) {
      const { error } = await supabase
        .from('content_calendar')
        .update({ posted_at: targetStamp })
        .eq('id', chosenIdForA)
        .eq('status', 'posted')          // defensive: refuse if status changed mid-run
        .is('posted_at', null)            // defensive: refuse if posted_at already set
      if (error) {
        console.log(`   ${COLORS.red}(a-1) write failed:${COLORS.reset} ${error.message}`)
      } else {
        console.log(`   ${COLORS.green}(a-1) wrote${COLORS.reset} posted_at=${targetStamp} on ${chosenIdForA}`)
        writes++
      }
    }
    if (flags.repairLegacyId) {
      const legacyHit = (typeB ?? []).find(r => r.id === flags.repairLegacyId)
      if (legacyHit) {
        const { error } = await supabase
          .from('content_calendar')
          .update({ posted_at: null })
          .eq('id', flags.repairLegacyId)
          .neq('status', 'posted')        // defensive: only clear when current status confirms anomaly (b)
          .not('posted_at', 'is', null)
        if (error) {
          console.log(`   ${COLORS.red}(b-1) write failed:${COLORS.reset} ${error.message}`)
        } else {
          console.log(`   ${COLORS.green}(b-1) cleared${COLORS.reset} posted_at on ${flags.repairLegacyId}`)
          writes++
        }
      }
    }
    console.log()
  } else {
    console.log(`${COLORS.dim}Pass --apply to write the repair plan above.${COLORS.reset}`)
    console.log()
  }

  // ============================================================
  // Cross-check
  // ============================================================
  const { count: postedAtAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  const { count: statusPostedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted')

  console.log(`${COLORS.bold}Summary${COLORS.reset}`)
  console.log(`   anomaly (a) status=posted/posted_at=null:  ${(typeA ?? []).length}`)
  console.log(`   anomaly (b) status!=posted/posted_at set:  ${(typeB ?? []).length}`)
  console.log(`   writes performed:                          ${writes}`)
  console.log(`   posted_at count: ${postedAtBefore ?? 0} → ${postedAtAfter ?? 0}  (delta ${(postedAtAfter ?? 0) - (postedAtBefore ?? 0)})`)
  console.log(`   status='posted' count: ${statusPostedBefore ?? 0} → ${statusPostedAfter ?? 0}  (delta ${(statusPostedAfter ?? 0) - (statusPostedBefore ?? 0)})`)
  console.log()
  if (flags.apply) {
    const expectedDelta = chosenInTypeA ? 1 : 0
    const actualDelta = (postedAtAfter ?? 0) - (postedAtBefore ?? 0)
    if (actualDelta === expectedDelta) {
      console.log(`${COLORS.green}✓ posted_at delta matches plan (expected ${expectedDelta}, got ${actualDelta}).${COLORS.reset}`)
    } else {
      console.log(`${COLORS.red}✗ posted_at delta mismatch: expected ${expectedDelta}, got ${actualDelta}.${COLORS.reset}`)
    }
    const statusDelta = (statusPostedAfter ?? 0) - (statusPostedBefore ?? 0)
    if (statusDelta === 0) {
      console.log(`${COLORS.green}✓ status='posted' count unchanged (${statusPostedBefore ?? 0}). Repair did not flip any status.${COLORS.reset}`)
    } else {
      console.log(`${COLORS.red}✗ status='posted' count changed by ${statusDelta} — investigate.${COLORS.reset}`)
    }
  }
  console.log(`${COLORS.dim}No platform API calls. No content posted. Cron unchanged.${COLORS.reset}`)
}

main().catch(err => { console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err); process.exit(99) })
