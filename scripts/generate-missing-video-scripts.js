#!/usr/bin/env node
/**
 * Phase 14L.2.5 — Backfill TikTok video_script via AI, no posting.
 *
 * Walks unposted, no-script TikTok rows and (with explicit flags) asks the
 * configured LLM to author a 30–45 second spoken video script that HeyGen
 * can voice as-is. The script intentionally has NO [VISUAL: ...] cue
 * blocks — those would be spoken aloud by HeyGen — and NO portal links
 * (myvortex365.com/leosp); we use the branded VortexTrips wording instead.
 *
 * SAFETY MODES:
 *   default                    → DRY-RUN. No AI call. No DB writes. Lists
 *                                 candidate rows + prompt preview only.
 *   --generate                 → Calls OpenAI. Prints the generated script
 *                                 for each row. NO DB writes.
 *   --generate --apply         → Calls OpenAI AND writes the result into
 *                                 content_calendar.video_script (and only
 *                                 that column).
 *   --apply (without --generate) → Refused with a clear message.
 *
 * Filter flags (any mode):
 *   --limit=N            cap rows processed (default 5; max 25).
 *   --provider=openai    explicit (default; only OpenAI is wired today).
 *   --id=<uuid>          pin to a single content_calendar row.
 *
 * Allowed writes (only with --generate --apply):
 *   content_calendar.video_script
 *
 * NEVER writes (regardless of flags — enforced via explicit allow-list):
 *   status / posted_at / posting_status / posting_gate_approved /
 *   queued_for_posting_at / media_status / media_source /
 *   media_generated_at / media_error / media_metadata /
 *   image_url / video_url / caption / image_prompt / hashtags /
 *   campaign_asset_id / tracking_url
 *
 * NEVER calls:
 *   HeyGen / Pexels / Facebook / Instagram / TikTok / X / email /
 *   any platform publishing API.
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

const TERMINAL = new Set(['posted', 'rejected', 'archived'])

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

function parseArgs(argv) {
  const flags = {
    apply: false,
    generate: false,
    limit: 5,
    provider: 'openai',
    id: null,
  }
  for (const a of argv.slice(2)) {
    if (a === '--apply') flags.apply = true
    else if (a === '--generate') flags.generate = true
    else if (a === '--dry-run') {/* explicit; same as default */}
    else if (a.startsWith('--limit=')) {
      const n = Number(a.split('=')[1])
      if (Number.isFinite(n) && n > 0) flags.limit = Math.min(Math.floor(n), 25)
    } else if (a.startsWith('--provider=')) {
      const p = a.split('=')[1]?.toLowerCase()
      if (p === 'openai') flags.provider = p
      else { console.error(`${COLORS.red}unsupported provider: ${p}${COLORS.reset}`); process.exit(2) }
    } else if (a.startsWith('--id=')) {
      const v = a.split('=')[1]?.trim()
      if (v) flags.id = v
    }
  }
  return flags
}

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

// ============================================================
// Prompt construction
// ============================================================

const SYSTEM_PROMPT = [
  'You write short spoken video scripts for HeyGen avatar videos.',
  'The brand is VortexTrips — a travel savings membership.',
  '',
  'Hard rules:',
  '- 70 to 110 words. Targets 30 to 45 seconds at normal speech.',
  '- Plain spoken English only. NO bracketed cues like [VISUAL: ...] or [B-ROLL: ...] — HeyGen will speak whatever you write.',
  '- NO speaker labels (no "Hook:", "Outro:", "CTA:" prefixes).',
  '- Natural conversational tone. Short sentences. No jargon.',
  '- Mention VortexTrips by name once, naturally.',
  '- End with a simple call to action that points the viewer to the link in the post caption / bio. Do NOT include a URL in the spoken text.',
  '- NEVER mention myvortex365.com or any other portal URL by name.',
  '- NEVER make hard income claims, MLM language, or guarantees. No "downline", "network marketing", "MLM".',
  '- No emojis (HeyGen would say them aloud).',
  '- No hashtags in the spoken text.',
  '',
  'Output exactly the spoken script. No preamble, no explanation, no quote marks around it.',
].join('\n')

function buildUserPrompt(row) {
  const lines = []
  lines.push(`Platform: TikTok`)
  if (row.week_of) lines.push(`Posting week: ${row.week_of}`)
  lines.push('')
  lines.push(`Caption (already on the post): ${row.caption ?? '(none)'}`)
  if (nonEmpty(row.image_prompt)) lines.push(`Visual subject: ${row.image_prompt}`)
  if (Array.isArray(row.hashtags) && row.hashtags.length > 0) {
    lines.push(`Hashtags (post-level, NOT spoken): ${row.hashtags.slice(0, 6).join(', ')}`)
  }
  lines.push('')
  lines.push('Write the 30-45 second spoken script now. Plain text only.')
  return lines.join('\n')
}

// ============================================================
// OpenAI call
// ============================================================

async function callOpenAI(env, { systemPrompt, userPrompt }) {
  const key = env.OPENAI_API_KEY
  if (!key) return { ok: false, error: 'OPENAI_API_KEY not set' }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.6,
        max_tokens: 350,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: normalizeError(data) || `openai http ${res.status}` }
    const content = data?.choices?.[0]?.message?.content
    if (!nonEmpty(content)) return { ok: false, error: 'openai returned empty content' }
    return { ok: true, content: content.trim(), usage: data.usage ?? null }
  } catch (err) {
    return { ok: false, error: normalizeError(err) }
  }
}

/**
 * Defensive sanitizer: strips bracketed cues, speaker labels, emojis, and
 * lone hashtags in case the model ignores its instructions. The result is
 * what HeyGen would actually voice.
 */
function sanitizeScript(raw) {
  if (typeof raw !== 'string') return ''
  let s = raw
  s = s.replace(/\[[^\]]*\]/g, ' ')                                 // [VISUAL: ...]
  s = s.replace(/^\s*(Hook|Outro|CTA|Intro|Pause|Voiceover|VO)\s*:\s*/gim, '')   // labels at line start
  s = s.replace(/(^|\s)#[A-Za-z0-9_]+/g, '$1')                      // lone hashtags
  // Strip emoji-range characters cheaply (U+1F000–U+1FFFF, U+2600–U+27BF).
  s = s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '')
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return s
}

function wordCount(s) {
  if (!nonEmpty(s)) return 0
  return s.trim().split(/\s+/).length
}

// ============================================================
// DB writer — strict allow-list. Only video_script.
// ============================================================

async function writeVideoScript(supabase, contentId, script) {
  const ALLOWED = new Set(['video_script'])
  const payload = { video_script: script }
  const safe = {}
  for (const [k, v] of Object.entries(payload)) if (ALLOWED.has(k)) safe[k] = v
  const { error } = await supabase.from('content_calendar').update(safe).eq('id', contentId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ============================================================

async function main() {
  const flags = parseArgs(process.argv)
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${COLORS.reset}`)
    process.exit(1)
  }
  let createClient
  try { ;({ createClient } = require('@supabase/supabase-js')) }
  catch { console.error(`${COLORS.red}@supabase/supabase-js not installed.${COLORS.reset}`); process.exit(1) }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const mode = flags.apply
    ? (flags.generate ? 'GENERATE+APPLY (AI calls + video_script writes)' : 'APPLY-ONLY (refused)')
    : flags.generate
      ? 'GENERATE (AI calls; NO writes)'
      : 'DRY-RUN'

  console.log()
  console.log(`${COLORS.bold}Phase 14L.2.5 — TikTok Video-Script Backfill [${mode}]${COLORS.reset}`)
  if (!flags.generate) {
    console.log(`${COLORS.dim}No AI calls. No platform calls. No mutations.${COLORS.reset}`)
  } else if (!flags.apply) {
    console.log(`${COLORS.yellow}May call OpenAI. DB writes are DISABLED.${COLORS.reset}`)
  } else {
    console.log(`${COLORS.red}May call OpenAI AND write content_calendar.video_script. NEVER posts to platforms. NEVER touches status/posting_status.${COLORS.reset}`)
  }
  console.log()

  if (flags.apply && !flags.generate) {
    console.log(`${COLORS.red}Refused: --apply without --generate has no source for new scripts.${COLORS.reset}`)
    console.log(`${COLORS.dim}Pass --generate alongside --apply to author + persist; or drop --apply for dry-run.${COLORS.reset}`)
    process.exit(2)
  }

  // posted_at no-mutation snapshot.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // Pull candidate rows.
  const { data, error } = await supabase
    .from('content_calendar')
    .select('id, platform, status, week_of, caption, hashtags, image_prompt, video_url, video_script, posted_at, campaign_asset_id, tracking_url')
    .eq('platform', 'tiktok')
    .is('posted_at', null)
    .is('video_url', null)
    .order('week_of', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) { console.error(`${COLORS.red}Query failed:${COLORS.reset} ${error.message}`); process.exit(2) }

  const candidates = (data ?? []).filter(r =>
    !TERMINAL.has((r.status ?? '').toLowerCase()) &&
    !nonEmpty(r.video_script)
  )

  // --id pin filter.
  const filtered = flags.id ? candidates.filter(r => r.id === flags.id) : candidates

  console.log(`${COLORS.bold}Queue${COLORS.reset}`)
  console.log(`   total TikTok candidates (no script, no video_url, unposted): ${candidates.length}`)
  console.log(`   matched filters:                                            ${filtered.length}`)
  console.log(`   limit:                                                      ${flags.limit}`)
  console.log(`   provider:                                                   ${flags.provider}`)
  console.log()

  const work = filtered.slice(0, flags.limit)
  if (work.length === 0) {
    if (flags.id) {
      console.log(`${COLORS.yellow}No candidate row for --id=${flags.id}.${COLORS.reset}`)
      console.log(`${COLORS.dim}Either the id doesn't exist, isn't a TikTok row, is already posted, has video_url, or already has a video_script.${COLORS.reset}`)
    } else {
      console.log(`${COLORS.dim}Nothing to do — no TikTok rows are missing video_script.${COLORS.reset}`)
    }
    process.exit(0)
  }

  // DRY-RUN — show prompt preview for the first row, then short summaries
  // for the rest. No AI call.
  if (!flags.generate) {
    const first = work[0]
    console.log(`${COLORS.bold}Prompt structure preview (row 1 of ${work.length})${COLORS.reset}`)
    console.log(`${COLORS.cyan}${first.id}${COLORS.reset}  week_of=${first.week_of}  status=${first.status}`)
    console.log(`${COLORS.dim}---- system prompt ----${COLORS.reset}`)
    console.log(SYSTEM_PROMPT)
    console.log(`${COLORS.dim}---- user prompt ------${COLORS.reset}`)
    console.log(buildUserPrompt(first))
    console.log()
    console.log(`${COLORS.bold}All planned rows${COLORS.reset}`)
    for (const r of work) {
      console.log(`   ${COLORS.dim}plan${COLORS.reset} ${r.id} week_of=${r.week_of} status=${r.status}  ${COLORS.dim}${nonEmpty(r.caption) ? r.caption.slice(0, 60) : '(no caption)'}${COLORS.reset}`)
    }
    console.log()
    finalize(supabase, postedBefore, flags)
    return
  }

  // --generate (and possibly --apply). Process one at a time — keeps the
  // OpenAI bill predictable per invocation.
  let succeeded = 0
  let failed = 0
  let written = 0
  const samples = []

  for (const row of work) {
    const userPrompt = buildUserPrompt(row)
    const result = await callOpenAI(env, { systemPrompt: SYSTEM_PROMPT, userPrompt })
    if (!result.ok) {
      failed++
      samples.push({ id: row.id, ok: false, error: result.error })
      continue
    }
    const cleaned = sanitizeScript(result.content)
    const wc = wordCount(cleaned)
    const sample = { id: row.id, ok: true, words: wc, script: cleaned }
    if (wc < 50 || wc > 140) {
      sample.warning = `word count ${wc} outside target 70-110`
    }
    samples.push(sample)
    succeeded++
    if (flags.apply) {
      const writeRes = await writeVideoScript(supabase, row.id, cleaned)
      if (!writeRes.ok) { sample.write_error = writeRes.error }
      else { written++; sample.written = true }
    }
  }

  // Print samples.
  console.log(`${COLORS.bold}Per-row outcomes${COLORS.reset}`)
  for (const s of samples) {
    if (!s.ok) {
      console.log(`   ${COLORS.red}err${COLORS.reset} ${s.id} — ${s.error}`)
      continue
    }
    const tag = s.written ? `${COLORS.green}written${COLORS.reset}` : `${COLORS.dim}generated (no write)${COLORS.reset}`
    const warn = s.warning ? ` ${COLORS.yellow}⚠ ${s.warning}${COLORS.reset}` : ''
    const wErr = s.write_error ? ` ${COLORS.red}write: ${s.write_error}${COLORS.reset}` : ''
    console.log(`   [${tag}] ${s.id}  ${s.words} words${warn}${wErr}`)
    console.log(`     ${COLORS.dim}${s.script.slice(0, 220).replace(/\s+/g, ' ')}${s.script.length > 220 ? '…' : ''}${COLORS.reset}`)
  }
  console.log()
  console.log(`${COLORS.bold}Summary${COLORS.reset}`)
  console.log(`   succeeded: ${succeeded}`)
  console.log(`   failed:    ${failed}`)
  console.log(`   written:   ${written}  ${COLORS.dim}${flags.apply ? '' : '(--apply not set)'}${COLORS.reset}`)
  console.log()

  finalize(supabase, postedBefore, flags)
}

async function finalize(supabase, postedBefore, flags) {
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  console.log(postedBefore === postedAfter
    ? `${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`
    : `${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}.${COLORS.reset}`
  )
  console.log(`${COLORS.dim}No platform API calls. ${flags.generate ? '' : 'No AI calls. '}Live posting remains BLOCKED.${COLORS.reset}`)
}

main().catch(err => { console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err); process.exit(99) })
