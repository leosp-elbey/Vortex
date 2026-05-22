#!/usr/bin/env tsx
/**
 * Phase 19.2 — Fix D: backfill existing content_calendar captions.
 *
 * Regenerates the CAPTION TEXT + HASHTAGS of queued rows through the Phase
 * 19.1 generator path (gpt-4o + SOCIAL_SYSTEM) and the deterministic
 * enforcer (enforceCaptionRules), so the existing queue gets the new
 * HOOK -> CONTRAST -> PROOF -> CTA template, a guaranteed vortextrips.com/free
 * link, the 2-hashtag cap, and "up to 75% off" framing.
 *
 * SCOPE — what changes and what does NOT:
 *   - WRITES only `caption` and `hashtags`, via UPDATE ... WHERE id=<id>.
 *   - Every other column (week_of, queued_for_posting_at, image_url,
 *     video_url, video_script, image_prompt, media_metadata, status,
 *     posting_gate_*, tracking_url, ...) is preserved BY CONSTRUCTION —
 *     the script never names it in the SET clause.
 *   - Touches ONLY rows with status IN ('approved','draft'). 'posted' and
 *     'rejected' rows are never selected and never written.
 *
 * MODES:
 *   DRY-RUN (default) — prints a before/after for the first 3 eligible rows
 *                       and the count of rows that WOULD be updated. To keep
 *                       a dry-run free, gpt-4o is called for those 3 sample
 *                       rows only; the would-update count comes from the
 *                       SELECT, not from generating all rows.
 *   APPLY (--apply)   — regenerates every eligible row and performs the
 *                       UPDATE one row at a time.
 *
 * SAFETY:
 *   - Each row's gpt-4o call + update is wrapped in try/catch; on error the
 *     row id is logged and the batch CONTINUES.
 *   - 300ms delay between gpt-4o calls to stay under OpenAI rate limits.
 *   - The apply UPDATE is guarded with `.in('status', ['approved','draft'])`
 *     so a row that flipped to 'posted' mid-run is refused.
 *   - posted_at row count is snapshotted before and after as a
 *     no-mutation cross-check.
 *
 * Run from the project root:
 *   npx tsx scripts/backfill-captions.ts            # dry-run (default)
 *   npx tsx scripts/backfill-captions.ts --apply    # write changes
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { SOCIAL_SYSTEM } from '../src/lib/ai-prompts'
import { enforceCaptionRules } from '../src/lib/caption-format'
import { generateCompletion } from '../src/lib/openai'

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

/** Number of rows to generate + show a before/after for in dry-run mode. */
const DRY_RUN_SAMPLE = 3
/** Delay between gpt-4o calls so a 100+ row batch stays under rate limits. */
const CALL_DELAY_MS = 300
/** Statuses eligible for backfill. 'posted' / 'rejected' are never touched. */
const ELIGIBLE_STATUSES = ['approved', 'draft'] as const

interface CalendarRow {
  id: string
  platform: string
  status: string
  caption: string | null
  hashtags: string[] | null
  image_prompt: string | null
  media_metadata: Record<string, unknown> | null
}

interface RegenResult {
  caption: string
  hashtags: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Hand-rolled .env.local parser (no dotenv dependency), mirroring the
 *  pattern in scripts/cleanup-legacy-caption-links.js. */
function loadEnvLocal(): Record<string, string> {
  const envPath = join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) {
    console.error(`${COLORS.red}.env.local not found at ${envPath} — run from the project root.${COLORS.reset}`)
    process.exit(1)
  }
  const text = readFileSync(envPath, 'utf8')
  const out: Record<string, string> = {}
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
 * Pick a topic seed so the regenerated caption stays on-topic for the
 * media this row has already been paired with. Priority:
 *   image_prompt -> media_metadata.on_screen_hook (TikTok) -> existing caption.
 */
function topicSeed(row: CalendarRow): string {
  const meta = row.media_metadata
  const hook = meta && typeof meta === 'object' ? meta['on_screen_hook'] : null
  const candidate =
    (row.image_prompt && row.image_prompt.trim()) ||
    (typeof hook === 'string' && hook.trim() ? hook.trim() : '') ||
    (row.caption && row.caption.trim()) ||
    'travel savings'
  return candidate.slice(0, 400)
}

function buildUserPrompt(platform: string, seed: string): string {
  return `Rewrite the social media caption for ONE existing ${platform} post.

This post's image/video is already produced — the new caption MUST stay on-topic for this theme so it still matches the visual:
"${seed}"

Follow the SOCIAL_SYSTEM caption template exactly: HOOK (specific number) -> CONTRAST -> PROOF -> CTA, ending with the literal URL vortextrips.com/free. Frame savings as "up to 75% off". Use a MAXIMUM of 2 hashtags.

Return ONLY a single JSON object — no markdown, no code fences, no prose:
{"caption":"<the full caption text, including the vortextrips.com/free link>","hashtags":["tag1","tag2"]}`
}

/** Call gpt-4o for one row, parse the JSON, and run enforceCaptionRules. */
async function regenerateRow(row: CalendarRow): Promise<RegenResult> {
  const userPrompt = buildUserPrompt(row.platform, topicSeed(row))
  const { content } = await generateCompletion({
    systemPrompt: `${SOCIAL_SYSTEM}

OUTPUT FORMAT (this call only): Return ONLY a single valid JSON object — no markdown, no code fences, no surrounding prose.`,
    userPrompt,
    temperature: 0.8,
    maxTokens: 700,
  })

  let parsed: { caption?: unknown; hashtags?: unknown }
  try {
    parsed = JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('model output was not parseable as JSON')
    parsed = JSON.parse(match[0])
  }

  if (typeof parsed.caption !== 'string' || parsed.caption.trim().length === 0) {
    throw new Error('model output missing a non-empty caption')
  }
  const rawHashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.filter((h): h is string => typeof h === 'string')
    : []

  // Deterministic guarantee: link present + 2-hashtag cap.
  return enforceCaptionRules(parsed.caption, rawHashtags)
}

function short(text: string | null | undefined, max = 160): string {
  const s = (text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

async function main(): Promise<void> {
  const env = loadEnvLocal()
  // generateCompletion reads process.env.OPENAI_API_KEY directly, so make
  // the .env.local values visible on process.env without clobbering any
  // value the shell already exported.
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error(`${COLORS.red}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local${COLORS.reset}`)
    process.exit(1)
  }
  if (!openaiKey) {
    console.error(`${COLORS.red}Missing OPENAI_API_KEY in .env.local${COLORS.reset}`)
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  console.log()
  console.log(`${COLORS.bold}Phase 19.2 — Caption Backfill [${MODE}]${COLORS.reset}`)
  console.log()

  // posted_at snapshot BEFORE — no-mutation cross-check.
  const { count: postedBefore } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)

  // SELECT eligible rows. status IN ('approved','draft') only.
  const { data, error } = await supabase
    .from('content_calendar')
    .select('id, platform, status, caption, hashtags, image_prompt, media_metadata')
    .in('status', ELIGIBLE_STATUSES as unknown as string[])
    .order('created_at', { ascending: true })

  if (error) {
    console.error(`${COLORS.red}Query failed:${COLORS.reset} ${error.message}`)
    process.exit(2)
  }

  const rows = (data ?? []) as CalendarRow[]
  console.log(`${COLORS.bold}1. Eligible rows (status IN approved, draft)${COLORS.reset}`)
  console.log(`   ${COLORS.cyan}total:${COLORS.reset} ${rows.length}`)
  const byStatus: Record<string, number> = {}
  const byPlatform: Record<string, number> = {}
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1
  }
  console.log(`   ${COLORS.dim}by status:${COLORS.reset}   ${JSON.stringify(byStatus)}`)
  console.log(`   ${COLORS.dim}by platform:${COLORS.reset} ${JSON.stringify(byPlatform)}`)
  console.log()

  if (rows.length === 0) {
    console.log(`${COLORS.green}✓ Nothing to backfill.${COLORS.reset}`)
    return
  }

  // ── DRY-RUN ──────────────────────────────────────────────────────────────
  if (!APPLY) {
    const sample = rows.slice(0, DRY_RUN_SAMPLE)
    console.log(`${COLORS.bold}2. Before/after preview (first ${sample.length} of ${rows.length})${COLORS.reset}`)
    console.log(`   ${COLORS.dim}(gpt-4o is called for these sample rows only — a dry-run never generates all ${rows.length})${COLORS.reset}`)
    console.log()

    for (const row of sample) {
      try {
        const next = await regenerateRow(row)
        console.log(`   ${COLORS.dim}id=${row.id} platform=${row.platform} status=${row.status}${COLORS.reset}`)
        console.log(`     ${COLORS.red}old caption:${COLORS.reset} ${short(row.caption)}`)
        console.log(`     ${COLORS.green}new caption:${COLORS.reset} ${short(next.caption)}`)
        console.log(`     ${COLORS.red}old hashtags:${COLORS.reset} ${JSON.stringify(row.hashtags ?? [])}`)
        console.log(`     ${COLORS.green}new hashtags:${COLORS.reset} ${JSON.stringify(next.hashtags)}`)
        console.log()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`   ${COLORS.red}✗ id=${row.id}: ${msg}${COLORS.reset}`)
        console.log()
      }
      await sleep(CALL_DELAY_MS)
    }

    console.log(`${COLORS.bold}3. Summary${COLORS.reset}`)
    console.log(`   ${COLORS.cyan}rows that WOULD be updated:${COLORS.reset} ${rows.length}`)
    console.log()
    console.log(`${COLORS.yellow}DRY-RUN — no rows were modified. Re-run with --apply to write changes.${COLORS.reset}`)
    if (postedBefore !== null && postedBefore !== undefined) {
      console.log(`${COLORS.green}✓ posted_at row count (unchanged in dry-run): ${postedBefore}.${COLORS.reset}`)
    }
    return
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  console.log(`${COLORS.bold}2. Applying updates (caption + hashtags only)${COLORS.reset}`)
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    try {
      const next = await regenerateRow(row)
      const { error: updErr, count } = await supabase
        .from('content_calendar')
        .update({ caption: next.caption, hashtags: next.hashtags }, { count: 'exact' })
        .eq('id', row.id)
        // Race-condition guard: refuse a row that left approved/draft mid-run.
        .in('status', ELIGIBLE_STATUSES as unknown as string[])

      if (updErr) {
        failed++
        console.log(`   ${COLORS.red}✗ ${row.id} (${row.platform}): ${updErr.message}${COLORS.reset}`)
      } else if ((count ?? 0) !== 1) {
        skipped++
        console.log(`   ${COLORS.yellow}- ${row.id} (${row.platform}): skipped — UPDATE matched ${count ?? 0} rows (status changed?)${COLORS.reset}`)
      } else {
        updated++
        console.log(`   ${COLORS.green}✓ ${row.id} (${row.platform}): updated${COLORS.reset}`)
      }
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`   ${COLORS.red}✗ ${row.id} (${row.platform}): ${msg}${COLORS.reset}`)
    }
    await sleep(CALL_DELAY_MS)
  }

  console.log()
  console.log(`${COLORS.bold}3. Summary${COLORS.reset}`)
  console.log(`   ${COLORS.green}updated:${COLORS.reset} ${updated}`)
  console.log(`   ${COLORS.yellow}skipped:${COLORS.reset} ${skipped}`)
  console.log(`   ${COLORS.red}failed:${COLORS.reset}  ${failed}`)
  console.log()

  // posted_at snapshot AFTER — must be unchanged (script never touches posted rows).
  const { count: postedAfter } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .not('posted_at', 'is', null)
  if (postedBefore === postedAfter) {
    console.log(`${COLORS.green}✓ posted_at row count unchanged (${postedBefore ?? 0}).${COLORS.reset}`)
  } else {
    console.log(`${COLORS.red}✗ posted_at row count changed: ${postedBefore} → ${postedAfter}. Investigate.${COLORS.reset}`)
  }
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
