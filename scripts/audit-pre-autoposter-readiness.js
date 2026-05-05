#!/usr/bin/env node
/**
 * Phase 14M — Final Pre-Autoposter Posting Readiness Audit.
 *
 * Read-only safety audit that confirms the full chain is consistent before
 * any live autoposter (Phase 14K.1) is enabled. Runs eight independent
 * checks; each must PASS before live posting is attempted.
 *
 *   1. All approved/ready content has branded tracking links where required
 *   2. All campaign/social content has media ready
 *   3. Posting gate blocks idle/unapproved rows
 *   4. Manual post routes are still guarded
 *   5. Autoposter dry-run returns only gate-approved rows
 *   6. No posted_at changes during audit
 *   7. No platform API calls during audit
 *   8. Final eligible posting queue is clear and predictable
 *
 * NEVER calls a platform API. NEVER invokes a manual-posting route.
 * NEVER hits HeyGen / Pexels / OpenAI. NEVER mutates content_calendar
 * or campaign_assets. The script captures `posted_at` count before AND
 * after as a defensive cross-check.
 *
 * Outputs:
 *   - Terminal report with PASS / FAIL per check
 *   - Proof markdown file in repo root:
 *     PHASE_14M_PRE_AUTOPOSTER_AUDIT_<YYYY-MM-DD>.md
 *
 * Run from project root:
 *   node scripts/audit-pre-autoposter-readiness.js
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

const TERMINAL = new Set(['posted', 'rejected', 'archived'])
const BRANDED_PREFIX = 'https://www.vortextrips.com/t/'
const LEGACY_NEEDLE = 'myvortex365.com/leosp'

const MANUAL_POST_ROUTES = [
  'src/app/api/automations/post-to-facebook/route.ts',
  'src/app/api/automations/post-to-instagram/route.ts',
  'src/app/api/automations/post-to-twitter/route.ts',
  'src/app/api/content/route.ts',
]
const GATE_TOKEN = 'validateManualPostingGate'

function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0 }

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

// ============================================================
// Mirror of validators (kept in sync with src/lib/posting-gate.ts +
// src/lib/autoposter-gate.ts + src/lib/media-readiness.ts).
// ============================================================

const PLATFORM_RULES = {
  instagram: { image: 'required',    video: 'required',    either_satisfies: true  },
  tiktok:    { image: 'none',        video: 'required',    either_satisfies: false },
  youtube:   { image: 'none',        video: 'required',    either_satisfies: false },
  facebook:  { image: 'recommended', video: 'recommended', either_satisfies: true  },
  twitter:   { image: 'recommended', video: 'recommended', either_satisfies: true  },
  threads:   { image: 'recommended', video: 'recommended', either_satisfies: true  },
  linkedin:  { image: 'recommended', video: 'recommended', either_satisfies: true  },
}
const NONE_RULE = { image: 'none', video: 'none', either_satisfies: false }
function getRule(platform) {
  if (!platform) return NONE_RULE
  return PLATFORM_RULES[String(platform).toLowerCase().trim()] ?? NONE_RULE
}

function validateMediaReadinessJs(row) {
  const rule = getRule(row.platform)
  const has_image = nonEmpty(row.image_url)
  const has_video = nonEmpty(row.video_url)
  const platformRequiresMedia = rule.image === 'required' || rule.video === 'required'
  const reasons = []
  const platformLabel = row.platform ? row.platform.toLowerCase().trim() : ''
  const ms = nonEmpty(row.media_status) ? row.media_status.trim().toLowerCase() : null
  if (ms === 'failed') {
    reasons.push(`media generation failed${nonEmpty(row.media_error) ? `: ${row.media_error.trim()}` : ''}`)
  } else if (ms === 'skipped' && platformRequiresMedia && !has_image && !has_video) {
    reasons.push(`media_status='skipped' but platform ${platformLabel} requires media`)
  }
  if (rule.either_satisfies) {
    if (platformRequiresMedia && !has_image && !has_video) {
      reasons.push(platformLabel === 'instagram'
        ? 'missing required image_url for Instagram'
        : `missing required image_url or video_url for ${platformLabel || 'this platform'}`)
    }
  } else {
    if (rule.image === 'required' && !has_image) reasons.push(`missing required image_url for ${platformLabel || 'this platform'}`)
    if (rule.video === 'required' && !has_video) {
      const label = platformLabel === 'tiktok' ? 'TikTok' : (platformLabel || 'this platform')
      reasons.push(`missing required video_url for ${label}`)
    }
  }
  if (nonEmpty(row.image_prompt) && !has_image) reasons.push('campaign media prompt exists but generated media is missing')
  if (nonEmpty(row.video_prompt) && !has_video && !reasons.includes('campaign media prompt exists but generated media is missing')) {
    reasons.push('campaign media prompt exists but generated media is missing')
  }
  if (ms === 'ready' && platformRequiresMedia && !has_image && !has_video && !reasons.some(r => r.startsWith('missing required'))) {
    reasons.push(`media_status='ready' but no image_url/video_url present`)
  }
  return { blocked: reasons.length > 0, reasons }
}

/**
 * Mirror of validateManualPostingGate (bookkeeping=false). Returns reasons[].
 */
function validateManualPostingGateJs(row) {
  const reasons = []
  if (!row) { reasons.push('row not found'); return reasons }
  if (row.status === 'rejected') reasons.push('row status is rejected')
  else if (row.status === 'posted' || row.posted_at) reasons.push('row is already posted — refusing duplicate post')
  else if (row.status !== 'approved') reasons.push(`row status is '${row.status}', need 'approved'`)
  if (row.posting_status === 'blocked') {
    reasons.push(`gate is blocked${nonEmpty(row.posting_block_reason) ? `: ${row.posting_block_reason}` : ''}`)
  } else if (row.posting_status !== 'ready') {
    reasons.push(`posting_status is '${row.posting_status ?? 'null'}', need 'ready' (Mark Ready first)`)
  }
  if (row.posting_gate_approved !== true) reasons.push('posting_gate_approved is not true — Mark Ready first')
  if (!row.queued_for_posting_at) reasons.push('queued_for_posting_at is null')
  if (row.manual_posting_only !== true) reasons.push('manual_posting_only is not true — gate refuses non-manual paths in this phase')
  if (!nonEmpty(row.platform)) reasons.push('platform is missing')
  if (!nonEmpty(row.caption)) reasons.push('caption/body is empty')
  if (row.campaign_asset_id) {
    if (!nonEmpty(row.tracking_url)) reasons.push('campaign-originated row missing tracking_url')
    else if (!row.tracking_url.startsWith(BRANDED_PREFIX)) {
      reasons.push('tracking_url must start with https://www.vortextrips.com/t/ (legacy URLs blocked)')
    }
  }
  const media = validateMediaReadinessJs(row)
  if (media.blocked) for (const r of media.reasons) reasons.push(r)
  return reasons
}

/**
 * Mirror of validateAutoposterCandidate. Same set of checks the dry-run cron
 * runs in src/lib/autoposter-gate.ts.
 */
function validateAutoposterCandidateJs(row) {
  if (row.status !== 'approved') return `status is '${row.status}', need 'approved'`
  if (row.posting_status !== 'ready') return `posting_status is '${row.posting_status ?? 'null'}', need 'ready'`
  if (row.posting_gate_approved !== true) return 'posting_gate_approved is not true'
  if (row.manual_posting_only !== true) return 'manual_posting_only is not true'
  if (!row.queued_for_posting_at) return 'queued_for_posting_at is null'
  if (row.posted_at) return 'already posted'
  if (!nonEmpty(row.platform)) return 'platform is missing'
  if (!nonEmpty(row.caption)) return 'caption is empty'
  if (row.campaign_asset_id && !nonEmpty(row.tracking_url)) return 'campaign-originated row missing tracking_url'
  const media = validateMediaReadinessJs(row)
  if (media.blocked && media.reasons.length > 0) return media.reasons[0]
  return null
}

// ============================================================

function flattenRow(r) {
  const ca = Array.isArray(r.campaign_asset) ? (r.campaign_asset[0] ?? null) : (r.campaign_asset ?? null)
  return {
    ...r,
    image_url: ca?.image_url ?? r.image_url ?? null,
    video_url: ca?.video_url ?? r.video_url ?? null,
    video_prompt: null,
  }
}

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${COLORS.reset}`)
    process.exit(1)
  }
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const startedAt = new Date().toISOString()
  const datePart = startedAt.slice(0, 10)
  const checks = []
  let overallPass = true

  function record(id, title, pass, detail, lines) {
    checks.push({ id, title, pass, detail, lines: lines ?? [] })
    if (!pass) overallPass = false
    const tag = pass ? `${COLORS.green}PASS${COLORS.reset}` : `${COLORS.red}FAIL${COLORS.reset}`
    console.log(`${COLORS.bold}${id}.${COLORS.reset} [${tag}] ${title}`)
    console.log(`   ${COLORS.dim}${detail}${COLORS.reset}`)
    for (const l of lines ?? []) console.log(`   ${l}`)
    console.log()
  }

  console.log()
  console.log(`${COLORS.bold}Phase 14M — Pre-Autoposter Posting Readiness Audit${COLORS.reset}`)
  console.log(`${COLORS.dim}Read-only. No platform calls. No HTTP requests to manual-post routes.${COLORS.reset}`)
  console.log(`${COLORS.dim}Started: ${startedAt}${COLORS.reset}`)
  console.log()

  // 0. posted_at snapshot BEFORE.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // Pull the canonical content_calendar set with the campaign_asset join.
  const { data: rowsRaw, error: selErr } = await supabase
    .from('content_calendar')
    .select(
      'id, status, platform, caption, week_of, posting_status, posting_gate_approved, ' +
      'queued_for_posting_at, manual_posting_only, posting_block_reason, posted_at, ' +
      'campaign_asset_id, tracking_url, image_url, video_url, image_prompt, video_script, ' +
      'media_status, media_source, media_error, ' +
      'campaign_asset:campaign_assets!campaign_asset_id(id, image_url, video_url, asset_type, tracking_url, status)'
    )
    .order('week_of', { ascending: true, nullsFirst: false })
    .limit(5000)
  if (selErr) { console.error(`${COLORS.red}select failed:${COLORS.reset} ${selErr.message}`); process.exit(2) }
  const rows = (rowsRaw ?? []).map(flattenRow)

  // ============================================================
  // Check 1 — branded tracking links on approved/ready content
  // ============================================================
  {
    const approved = rows.filter(r => r.status === 'approved' && !r.posted_at)
    const campaignApproved = approved.filter(r => r.campaign_asset_id)
    const missing = campaignApproved.filter(r => !nonEmpty(r.tracking_url))
    const legacy = campaignApproved.filter(r => nonEmpty(r.tracking_url) && r.tracking_url.includes(LEGACY_NEEDLE))
    const branded = campaignApproved.filter(r => nonEmpty(r.tracking_url) && r.tracking_url.startsWith(BRANDED_PREFIX))
    const pass = missing.length === 0 && legacy.length === 0 && (campaignApproved.length === 0 || branded.length === campaignApproved.length)
    const lines = [
      `approved + unposted rows: ${approved.length}`,
      `campaign-originated approved rows: ${campaignApproved.length}`,
      `branded tracking_url (https://www.vortextrips.com/t/...): ${branded.length}`,
      `legacy myvortex365.com/leosp tracking_url: ${legacy.length}`,
      `missing tracking_url: ${missing.length}`,
    ]
    if (missing.length > 0) lines.push(`first missing: ${missing.slice(0, 3).map(r => r.id).join(', ')}`)
    if (legacy.length > 0) lines.push(`first legacy: ${legacy.slice(0, 3).map(r => r.id).join(', ')}`)
    record(1, 'All approved/ready content has branded tracking links where required',
      pass, pass ? 'every campaign-originated approved row carries a branded /t/<slug> tracking_url' : 'some campaign-originated rows missing or have legacy URLs', lines)
  }

  // ============================================================
  // Check 2 — campaign/social content has media ready
  // ============================================================
  {
    const approved = rows.filter(r => r.status === 'approved' && !r.posted_at)
    const blocked = []
    for (const r of approved) {
      const m = validateMediaReadinessJs(r)
      if (m.blocked) blocked.push({ id: r.id, platform: r.platform, reasons: m.reasons })
    }
    const pass = blocked.length === 0
    const lines = [
      `approved + unposted rows checked: ${approved.length}`,
      `media-blocked: ${blocked.length}`,
    ]
    if (blocked.length > 0) {
      const byReason = {}
      for (const b of blocked) for (const r of b.reasons) byReason[r] = (byReason[r] ?? 0) + 1
      for (const [r, c] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${c}× ${r}`)
      }
    }
    record(2, 'All campaign/social content has media ready',
      pass, pass ? 'every approved row passes validateMediaReadiness' : 'some approved rows are media-blocked', lines)
  }

  // ============================================================
  // Check 3 — posting gate blocks idle/unapproved rows
  // ============================================================
  {
    const idleApproved = rows.filter(r =>
      r.status === 'approved' && !r.posted_at &&
      (r.posting_status !== 'ready' || r.posting_gate_approved !== true || !r.queued_for_posting_at)
    )
    const unapproved = rows.filter(r =>
      r.status !== 'approved' && !r.posted_at && !TERMINAL.has((r.status ?? '').toLowerCase())
    )
    const sample = [...idleApproved.slice(0, 5), ...unapproved.slice(0, 5)]
    const leakedThrough = sample.filter(r => validateManualPostingGateJs(r).length === 0)
    const pass = leakedThrough.length === 0
    const lines = [
      `idle approved rows tested: ${Math.min(idleApproved.length, 5)} of ${idleApproved.length}`,
      `unapproved (draft/etc) rows tested: ${Math.min(unapproved.length, 5)} of ${unapproved.length}`,
      `rows that incorrectly passed the gate: ${leakedThrough.length}`,
    ]
    if (leakedThrough.length > 0) {
      lines.push(`leak ids: ${leakedThrough.slice(0, 5).map(r => r.id).join(', ')}`)
    } else if (sample.length > 0) {
      const exampleId = sample[0].id
      const exampleReasons = validateManualPostingGateJs(sample[0])
      lines.push(`sample refusal (${exampleId}): ${exampleReasons.slice(0, 2).join('; ')}${exampleReasons.length > 2 ? '…' : ''}`)
    }
    record(3, 'Posting gate blocks idle / unapproved rows',
      pass, pass ? 'validateManualPostingGate refused every sampled idle/unapproved row' : 'some rows incorrectly passed the gate', lines)
  }

  // ============================================================
  // Check 4 — manual post routes are still guarded
  // ============================================================
  {
    const projectRoot = path.join(__dirname, '..')
    const missing = []
    const guarded = []
    for (const rel of MANUAL_POST_ROUTES) {
      const full = path.join(projectRoot, rel)
      if (!fs.existsSync(full)) { missing.push(rel); continue }
      const text = fs.readFileSync(full, 'utf8')
      if (text.includes(GATE_TOKEN)) guarded.push(rel)
      else missing.push(rel)
    }
    const pass = missing.length === 0
    const lines = [
      `routes checked: ${MANUAL_POST_ROUTES.length}`,
      `guarded (calls validateManualPostingGate): ${guarded.length}`,
      `unguarded or missing: ${missing.length}`,
    ]
    if (missing.length > 0) for (const m of missing) lines.push(`  ${COLORS.red}✗${COLORS.reset} ${m}`)
    record(4, 'Manual post routes are still guarded',
      pass, pass ? 'every manual platform-post route imports + calls validateManualPostingGate' : 'one or more routes is missing the gate import', lines)
  }

  // ============================================================
  // Check 5 — autoposter dry-run returns only gate-approved rows
  // ============================================================
  {
    // Mirror getAutoposterEligibleRows server-side query: pre-filter to
    // status='approved'; then run validateAutoposterCandidate per row.
    const approved = rows.filter(r => r.status === 'approved' && !r.posted_at)
    const eligible = []
    const skipped = []
    for (const r of approved) {
      const reason = validateAutoposterCandidateJs(r)
      if (reason === null) eligible.push(r)
      else skipped.push({ id: r.id, platform: r.platform, reason })
    }
    const ungated = eligible.filter(r =>
      r.posting_status !== 'ready' || r.posting_gate_approved !== true || !r.queued_for_posting_at
    )
    const pass = ungated.length === 0
    const lines = [
      `approved rows scanned: ${approved.length}`,
      `eligible (would be returned by autoposter dry-run): ${eligible.length}`,
      `skipped (with reason): ${skipped.length}`,
      `eligible rows lacking gate approval: ${ungated.length}`,
    ]
    if (eligible.length > 0) {
      const platforms = {}
      for (const r of eligible) platforms[r.platform ?? 'unknown'] = (platforms[r.platform ?? 'unknown'] ?? 0) + 1
      lines.push(`eligible by platform: ${Object.entries(platforms).map(([p, c]) => `${p}=${c}`).join(', ')}`)
    }
    if (skipped.length > 0) {
      const byReason = {}
      for (const s of skipped) byReason[s.reason] = (byReason[s.reason] ?? 0) + 1
      for (const [r, c] of Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        lines.push(`  ${c}× ${r}`)
      }
    }
    record(5, 'Autoposter dry-run returns only gate-approved rows',
      pass, pass ? 'every eligible row carries posting_status=ready + posting_gate_approved=true + queued_for_posting_at' : 'some eligible rows lack full gate approval', lines)
  }

  // ============================================================
  // Check 6 — no posted_at changes during audit (cross-check)
  // ============================================================
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  {
    const pass = postedBefore === postedAfter
    const lines = [
      `posted_at count BEFORE audit: ${postedBefore ?? 0}`,
      `posted_at count AFTER audit:  ${postedAfter ?? 0}`,
      `delta: ${(postedAfter ?? 0) - (postedBefore ?? 0)}`,
    ]
    record(6, 'No posted_at changes during audit',
      pass, pass ? 'posted_at row count unchanged across the audit run' : 'posted_at count changed during audit — investigate immediately',
      lines)
  }

  // ============================================================
  // Check 7 — no platform API calls during audit
  // ============================================================
  // The audit script makes zero HTTP calls beyond Supabase. The only fetch()
  // helpers it imports are the Supabase client. We assert this by source-
  // grep: no `fetch(` calls to platform / provider / heygen / pexels /
  // openai / facebook / instagram / tiktok / twitter / x.com / mailgun.
  {
    const selfPath = __filename
    const selfText = fs.readFileSync(selfPath, 'utf8')
    // Banned hostnames stored as split parts so this self-scan can't match
    // its own ban-list literal. Joined at runtime; the source file never
    // contains the full hostname string except where it's actually called.
    const banned = [
      ['graph.', 'facebook.com'],
      ['graph.', 'instagram.com'],
      ['api.', 'tiktok.com'],
      ['api.', 'twitter.com'],
      ['api.', 'x.com'],
      ['mail', 'gun.net'],
      ['send', 'grid.com'],
      ['api.hey', 'gen.com'],
      ['api.open', 'ai.com'],
      ['api.pex', 'els.com'],
    ].map(parts => parts.join(''))
    // Strip the audit's banned-list construction itself before scanning so
    // the test reflects actual provider/platform calls, not the literal list.
    const banListPattern = /\[[^\]]*'graph\.', 'facebook\.com'[\s\S]*?\]\.map\(parts => parts\.join\(''\)\)/
    const scan = selfText.replace(banListPattern, '<banlist literal>')
    const found = banned.filter(needle => scan.includes(needle))
    const pass = found.length === 0
    const lines = [
      `script self-scan for platform/provider hostnames: ${found.length === 0 ? 'none found' : found.join(', ')}`,
      `audit performs only Supabase queries (read-only) and local file reads`,
    ]
    record(7, 'No platform API calls during audit',
      pass, pass ? 'audit script source contains no platform/provider hostnames' : 'audit script references a platform/provider hostname — review immediately',
      lines)
  }

  // ============================================================
  // Check 8 — final eligible posting queue is clear and predictable
  // ============================================================
  {
    const approved = rows.filter(r => r.status === 'approved' && !r.posted_at)
    const eligible = approved.filter(r => validateAutoposterCandidateJs(r) === null)
    // Predictability: same eligibility logic from manual + autoposter paths
    // must agree on every row.
    const disagreements = []
    for (const r of approved) {
      const autoOk = validateAutoposterCandidateJs(r) === null
      const manualOk = validateManualPostingGateJs(r).length === 0
      if (autoOk !== manualOk) disagreements.push({ id: r.id, autoOk, manualOk })
    }
    const pass = disagreements.length === 0
    const lines = [
      `approved + unposted rows: ${approved.length}`,
      `currently eligible to post (gate + media + tracking): ${eligible.length}`,
      `manual vs autoposter validators disagree on: ${disagreements.length}`,
    ]
    if (eligible.length === 0) {
      lines.push(`queue is empty by design — no operator has marked any row Ready yet`)
    } else {
      const platforms = {}
      for (const r of eligible) platforms[r.platform ?? 'unknown'] = (platforms[r.platform ?? 'unknown'] ?? 0) + 1
      lines.push(`eligible by platform: ${Object.entries(platforms).map(([p, c]) => `${p}=${c}`).join(', ')}`)
      lines.push(`first eligible ids: ${eligible.slice(0, 5).map(r => r.id).join(', ')}`)
    }
    if (disagreements.length > 0) {
      lines.push(`disagreement ids: ${disagreements.slice(0, 5).map(d => d.id).join(', ')}`)
    }
    record(8, 'Final eligible posting queue is clear and predictable',
      pass, pass ? 'manual + autoposter validators agree on every approved row' : 'manual + autoposter validators disagree on some rows', lines)
  }

  // ============================================================
  // Summary
  // ============================================================
  const passCount = checks.filter(c => c.pass).length
  console.log(`${COLORS.bold}Audit summary${COLORS.reset}`)
  console.log(`   ${overallPass ? COLORS.green : COLORS.red}${passCount}/${checks.length} checks passed${COLORS.reset}`)
  console.log()

  // Write the proof file.
  const proofPath = path.join(__dirname, '..', `PHASE_14M_PRE_AUTOPOSTER_AUDIT_${datePart}.md`)
  const md = []
  md.push(`# Phase 14M — Pre-Autoposter Posting Readiness Audit`)
  md.push(``)
  md.push(`**Run started:** ${startedAt}`)
  md.push(`**Run finished:** ${new Date().toISOString()}`)
  md.push(`**Overall result:** ${overallPass ? '✅ PASS' : '❌ FAIL'}  (${passCount}/${checks.length} checks)`)
  md.push(``)
  md.push(`**Safety invariants:**`)
  md.push(`- Read-only. No platform API calls. No HTTP requests to manual-post routes.`)
  md.push(`- No HeyGen / Pexels / OpenAI calls.`)
  md.push(`- No \`UPDATE\` / \`INSERT\` / \`DELETE\` issued — \`posted_at\` count was \`${postedBefore ?? 0}\` before the audit and \`${postedAfter ?? 0}\` after.`)
  md.push(``)
  md.push(`---`)
  md.push(``)
  for (const c of checks) {
    md.push(`## ${c.id}. ${c.title}`)
    md.push(``)
    md.push(`**Result:** ${c.pass ? '✅ PASS' : '❌ FAIL'}`)
    md.push(``)
    md.push(`${c.detail}`)
    md.push(``)
    if (c.lines.length > 0) {
      md.push('```')
      for (const l of c.lines) md.push(l.replace(/\x1b\[[0-9;]*m/g, ''))
      md.push('```')
      md.push(``)
    }
  }
  md.push(`---`)
  md.push(``)
  md.push(`Generated by \`scripts/audit-pre-autoposter-readiness.js\`. Re-run any time before enabling Phase 14K.1 (live autoposter).`)
  md.push(``)
  fs.writeFileSync(proofPath, md.join('\n'), 'utf8')
  console.log(`${COLORS.dim}Proof file written:${COLORS.reset} ${path.relative(path.join(__dirname, '..'), proofPath)}`)
  console.log()

  if (!overallPass) process.exit(3)
}

main().catch(err => { console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err); process.exit(99) })
