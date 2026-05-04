#!/usr/bin/env node
/**
 * Phase 14L — caption legacy-link cleanup.
 *
 * Replaces visible `https://myvortex365.com/leosp` (and host variants) inside
 * `content_calendar.caption` with the row's branded `tracking_url`, but ONLY
 * for rows that:
 *   - have status NOT IN ('posted', 'rejected')   (and not 'archived' if present)
 *   - have a non-empty tracking_url that starts with `https://www.vortextrips.com/t/`
 *   - currently contain a literal `myvortex365.com/leosp` substring in caption
 *
 * Hashtags, surrounding copy, and unrelated URLs are preserved — the regex
 * matches just the legacy link (with optional path / query string) and swaps
 * it for tracking_url. If a row contains the legacy link multiple times,
 * every occurrence is replaced with the same tracking_url.
 *
 * Modes:
 *   --dry-run (default) — prints what WOULD change, no writes.
 *   --apply             — performs the UPDATE for matched rows.
 *
 * Always prints a posted_at row count snapshot before and after as a no-mutation
 * cross-check (the script must never touch posted rows).
 *
 * Run from project root:
 *   node scripts/cleanup-legacy-caption-links.js          # dry-run
 *   node scripts/cleanup-legacy-caption-links.js --apply  # write changes
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

const APPLY = process.argv.includes('--apply')
const MODE = APPLY ? 'APPLY' : 'DRY-RUN'

const LEGACY_HOST_REGEX =
  /https?:\/\/(?:www\.)?myvortex365\.com\/leosp(?:\/[^\s)>"']*)?/gi
const BRAND_PREFIX = 'https://www.vortextrips.com/t/'
const TERMINAL_STATUSES = new Set(['posted', 'rejected', 'archived'])

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

function rewriteCaption(caption, trackingUrl) {
  if (typeof caption !== 'string' || caption.length === 0) return { changed: false, next: caption, hits: 0 }
  let hits = 0
  const next = caption.replace(LEGACY_HOST_REGEX, () => {
    hits++
    return trackingUrl
  })
  return { changed: hits > 0 && next !== caption, next, hits }
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
  console.log(`${COLORS.bold}Phase 14L — Caption Legacy-Link Cleanup [${MODE}]${COLORS.reset}`)
  console.log()

  // posted_at snapshot BEFORE.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // Pull all candidate rows. We over-fetch a bit (status filter alone) and
  // narrow client-side so the human can see all skipped reasons in the report.
  const { data: rows, error } = await supabase
    .from('content_calendar')
    .select('id, status, platform, caption, tracking_url, posted_at')
    .ilike('caption', '%myvortex365.com/leosp%')
    .limit(5000)

  if (error) {
    console.error(`${COLORS.red}Query failed:${COLORS.reset} ${error.message}`)
    process.exit(2)
  }

  const all = rows ?? []
  console.log(`${COLORS.bold}1. Candidate scan${COLORS.reset}`)
  console.log(`   ${COLORS.dim}rows containing 'myvortex365.com/leosp' in caption:${COLORS.reset} ${all.length}`)
  console.log()

  // Bucket rows.
  const skippedTerminal = []
  const skippedNoTrackingUrl = []
  const skippedLegacyTrackingUrl = []
  const eligible = []
  for (const r of all) {
    if (TERMINAL_STATUSES.has((r.status ?? '').toLowerCase())) {
      skippedTerminal.push(r)
      continue
    }
    if (r.posted_at) {
      // belt-and-suspenders even if status didn't match terminal
      skippedTerminal.push(r)
      continue
    }
    if (!r.tracking_url || !r.tracking_url.trim()) {
      skippedNoTrackingUrl.push(r)
      continue
    }
    if (!r.tracking_url.startsWith(BRAND_PREFIX)) {
      skippedLegacyTrackingUrl.push(r)
      continue
    }
    eligible.push(r)
  }

  console.log(`${COLORS.bold}2. Bucketing${COLORS.reset}`)
  console.log(`   ${COLORS.green}eligible:${COLORS.reset} ${eligible.length}`)
  console.log(`   ${COLORS.dim}skipped — posted/rejected/archived:${COLORS.reset} ${skippedTerminal.length}`)
  console.log(`   ${COLORS.yellow}skipped — no tracking_url (re-push from campaigns):${COLORS.reset} ${skippedNoTrackingUrl.length}`)
  console.log(`   ${COLORS.yellow}skipped — tracking_url not branded (must start with ${BRAND_PREFIX}):${COLORS.reset} ${skippedLegacyTrackingUrl.length}`)
  console.log()

  if (eligible.length === 0) {
    console.log(`${COLORS.green}✓ Nothing to rewrite.${COLORS.reset}`)
    console.log()
    const { count: postedAfter } = await supabase
      .from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .not('posted_at', 'is', null)
    if (postedBefore === postedAfter) {
      console.log(`   ${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`)
    } else {
      console.log(`   ${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`)
    }
    return
  }

  // 3. Compute previews + build update plan.
  const updates = []
  let totalHits = 0
  for (const r of eligible) {
    const result = rewriteCaption(r.caption, r.tracking_url)
    if (!result.changed) continue
    totalHits += result.hits
    updates.push({ id: r.id, platform: r.platform, hits: result.hits, before: r.caption, after: result.next })
  }

  console.log(`${COLORS.bold}3. Rewrite preview${COLORS.reset}`)
  console.log(`   ${COLORS.cyan}rows to update:${COLORS.reset} ${updates.length}`)
  console.log(`   ${COLORS.cyan}total link occurrences replaced:${COLORS.reset} ${totalHits}`)
  console.log()
  for (const u of updates.slice(0, 5)) {
    console.log(`   ${COLORS.dim}id=${u.id} platform=${u.platform} hits=${u.hits}${COLORS.reset}`)
    console.log(`     ${COLORS.red}before:${COLORS.reset} ${u.before.slice(0, 140).replace(/\s+/g, ' ')}${u.before.length > 140 ? '…' : ''}`)
    console.log(`     ${COLORS.green}after :${COLORS.reset} ${u.after.slice(0, 140).replace(/\s+/g, ' ')}${u.after.length > 140 ? '…' : ''}`)
  }
  if (updates.length > 5) console.log(`   ${COLORS.dim}(${updates.length - 5} more not shown)${COLORS.reset}`)
  console.log()

  // 4. Apply or stop.
  if (!APPLY) {
    console.log(`${COLORS.yellow}DRY-RUN — re-run with --apply to perform the UPDATEs.${COLORS.reset}`)
    console.log()
    const { count: postedAfter } = await supabase
      .from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .not('posted_at', 'is', null)
    if (postedBefore === postedAfter) {
      console.log(`${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`)
    } else {
      console.log(`${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`)
    }
    return
  }

  console.log(`${COLORS.bold}4. Applying updates${COLORS.reset}`)
  let updated = 0
  let failed = 0
  for (const u of updates) {
    const { error: updErr } = await supabase
      .from('content_calendar')
      .update({ caption: u.after })
      .eq('id', u.id)
      // belt-and-suspenders — refuse to touch a row that flipped to a
      // terminal status mid-run (race-condition defense).
      .not('status', 'in', '(posted,rejected,archived)')
    if (updErr) {
      failed++
      console.log(`   ${COLORS.red}✗ ${u.id}: ${updErr.message}${COLORS.reset}`)
    } else {
      updated++
    }
  }
  console.log(`   ${COLORS.green}updated:${COLORS.reset} ${updated}`)
  if (failed > 0) console.log(`   ${COLORS.red}failed:${COLORS.reset}  ${failed}`)
  console.log()

  // 5. Post-apply no-mutation cross-check on posted_at.
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  if (postedBefore === postedAfter) {
    console.log(`${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`)
  } else {
    console.log(`${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}. Investigate.${COLORS.reset}`)
  }

  // 6. Verification SQL the operator can paste into the Supabase SQL editor.
  console.log()
  console.log(`${COLORS.bold}5. Verification SQL${COLORS.reset}`)
  console.log(`${COLORS.dim}-- Should return 0 after --apply (no remaining unposted rows containing legacy link)${COLORS.reset}`)
  console.log(`SELECT COUNT(*) FROM content_calendar`)
  console.log(`WHERE status NOT IN ('posted','rejected','archived')`)
  console.log(`  AND tracking_url LIKE 'https://www.vortextrips.com/t/%'`)
  console.log(`  AND caption ILIKE '%myvortex365.com/leosp%';`)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
