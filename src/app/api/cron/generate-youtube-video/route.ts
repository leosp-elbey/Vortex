// Phase 21C — Cinematic YouTube video orchestrator.
//
// GET /api/cron/generate-youtube-video
// Authorization: Bearer <CRON_SECRET>
//
// Runs Sundays at 10:00 UTC (per vercel.json: "0 10 * * 0"). Glues together
// the AI script writer (runAIJob via OpenRouter), the ElevenLabs voiceover
// (Phase 21A), and Kling AI text-to-video (Phase 21B) to produce one
// fully-prepared cinematic YouTube video per week.
//
// Pipeline (steps 1-4 only — assembly is deferred to Phase 21D):
//   1. Pick a target row from content_calendar (platform='youtube', not yet
//      voiced, not posted). If none, AI picks a seasonal destination and we
//      INSERT a new draft row.
//   2. runAIJob with AI_MEDIUM_MODEL writes a 90-second script + 4 cinematic
//      scene descriptions + YouTube title + description, returned as JSON.
//   3. ElevenLabs generates the voiceover MP3 → audio/vo/<uuid>.mp3 in
//      Supabase Storage → elevenlabs_audio_url.
//   4. Kling submits 4 text-to-video jobs (one per scene). Job ids land in
//      media_metadata.kling_clip_jobs[]. The /api/cron/check-kling-jobs
//      poller walks them to completion every 10 min (see Phase 21B + the
//      multi-clip update in this same commit).
//
// Phase 21D handles the assembly step: download 4 finished clips + the VO,
// run FFmpeg (likely via a managed service — WASM-on-Vercel was rejected as
// too risky), upload the final MP4, and set content_calendar.video_url.
// Until 21D ships, the operator can manually splice the 4 clips in
// DaVinci/CapCut and paste the result URL into the row.
//
// Kill switch: site_settings.youtube_video_cron_enabled
//   'true'        → cron orchestrates
//   anything else → returns { skipped: true, reason: 'cron_disabled' }
//   missing key   → treated as disabled (safe default; migration 038 seeds 'true').
//
// Allowed writes:
//   content_calendar.elevenlabs_audio_url
//   content_calendar.youtube_title
//   content_calendar.youtube_description
//   content_calendar.image_prompt        (overwritten with the picked destination)
//   content_calendar.caption             (first 200 chars of the script — dashboard preview)
//   content_calendar.media_metadata      (merged: youtube_script, youtube_scenes,
//                                          kling_clip_jobs[], youtube_orchestrator_run_at)
//   content_calendar.media_status        (set to 'pending' on new INSERT only)
//
// Forbidden writes:
//   content_calendar.video_url           (assembler's job — Phase 21D)
//   content_calendar.kling_job_id        (scalar column — reserved for non-multi-clip rows)
//   content_calendar.youtube_video_id    (youtube-once cron's job)
//   any campaign_assets column

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAIJob } from '@/lib/ai-router'
import { generateVoiceover } from '@/lib/elevenlabs'
import { generateCinematicClip } from '@/lib/kling'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// 300s ceiling — script gen (~10s) + VO (~10s) + 4 Kling submits (~20s
// sequential) is well under, but 300s gives headroom for OpenRouter / Kling
// slowness without truncating mid-pipeline.
export const maxDuration = 300

const KILL_SWITCH_KEY = 'youtube_video_cron_enabled'
const TARGET_PLATFORM = 'youtube'
const CLIP_COUNT = 18
const CLIP_DURATION_SECONDS: 5 | 10 = 5
const CLIP_ASPECT_RATIO: '16:9' | '9:16' | '1:1' = '16:9'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

async function readKillSwitch(supabase: SupabaseAdmin): Promise<'enabled' | 'disabled'> {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', KILL_SWITCH_KEY)
    .maybeSingle()
  const value = (data?.value as string | undefined)?.trim().toLowerCase()
  return value === 'true' ? 'enabled' : 'disabled'
}

/** Compute the upcoming Monday (or today if Monday) in UTC, ISO date. */
function nextMondayISODate(): string {
  const d = new Date()
  const dayOfWeek = d.getUTCDay()
  const daysUntilMon = (1 - dayOfWeek + 7) % 7
  d.setUTCDate(d.getUTCDate() + daysUntilMon)
  return d.toISOString().split('T')[0]
}

interface ChosenRow {
  id: string
  media_metadata: Record<string, unknown> | null
}

interface PickOrCreateResult {
  row: ChosenRow
  isNew: boolean
  destinationHint: string | null
}

// ============================================================
// Step 1 — pick or create the target row.
// ============================================================

const SCRIPT_SYSTEM = `You are a YouTube travel-video scriptwriter for VortexTrips, an affiliate travel membership.
House rules (mandatory — these come from the project's PKB language rules):
- NEVER say MLM, downline, or network marketing.
- ALWAYS frame the offer as a "travel membership", "affiliate program", or "travel savings club".
- ALWAYS end the script with a clear CTA pointing to https://www.vortextrips.com/free
Output STRICT JSON only. No prose around the JSON. No code fences.`

const PICK_DESTINATION_PROMPT = `Pick ONE popular travel destination for a VortexTrips YouTube video this week. Pick something seasonally on-trend right now. Avoid clichés already overused on YouTube travel channels (no "Bali", no "Paris" unless framed unusually). Return ONLY this JSON:
{"destination": "<City, Country>"}`

function buildScriptUserPrompt(destination: string): string {
  return `Write a 90-second YouTube video for the destination: ${destination}.

Constraints:
- "script": ~225 words. Spoken-voice cadence. No markdown. Open with a hook, build a vivid travel scene, land on the VortexTrips free portal CTA in the final sentence.
- "scenes": exactly 18 cinematic scene descriptions, each suitable as a Kling AI text-to-video prompt. ~30 words each. Visual-only — describe what the camera sees, not narration. Format: shot type + subject + lighting + mood. Example: "Aerial drone shot of turquoise Caribbean waters at golden hour, cinematic, golden light, soft motion blur."
- "title": <=100 chars. YouTube-optimized. No clickbait emojis.
- "description": <=2500 chars. First line is a one-sentence hook. Then 3-5 sentences. End with: "Get free access: https://www.vortextrips.com/free".

Output STRICT JSON only:
{
  "destination": "${destination}",
  "script": "...",
  "scenes": [
    // (provide exactly 18 scene objects in this array)
  ],
  "title": "...",
  "description": "..."
}`
}

interface ParsedScript {
  destination: string
  script: string
  scenes: string[]
  title: string
  description: string
}

/**
 * Defensive parser — AI may wrap JSON in code fences or add trailing prose.
 * Returns null if the output doesn't conform to the schema.
 */
function parseScriptOutput(raw: string | null | undefined): ParsedScript | null {
  if (!raw || typeof raw !== 'string') return null
  let candidate = raw.trim()
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (fenced) candidate = fenced[1].trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = parsed as Record<string, unknown>
  if (typeof p.destination !== 'string' || p.destination.length === 0) return null
  if (typeof p.script !== 'string' || p.script.length === 0) return null
  if (!Array.isArray(p.scenes) || p.scenes.length !== CLIP_COUNT) return null
  if (!p.scenes.every(s => typeof s === 'string' && (s as string).length > 0)) return null
  if (typeof p.title !== 'string' || p.title.length === 0) return null
  if (typeof p.description !== 'string' || p.description.length === 0) return null
  return {
    destination: p.destination.trim().slice(0, 200),
    script: p.script.trim(),
    scenes: (p.scenes as string[]).map(s => s.trim().slice(0, 800)),
    title: p.title.trim().slice(0, 100),
    description: p.description.trim().slice(0, 5000),
  }
}

/**
 * Defensive parser for the destination-only fallback call.
 */
function parseDestinationOnly(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  let candidate = raw.trim()
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (fenced) candidate = fenced[1].trim()
  try {
    const parsed = JSON.parse(candidate)
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as Record<string, unknown>).destination === 'string') {
      return ((parsed as Record<string, unknown>).destination as string).trim().slice(0, 200)
    }
  } catch {
    // fall through
  }
  return null
}

async function pickOrCreateYoutubeRow(supabase: SupabaseAdmin): Promise<PickOrCreateResult> {
  // (a) Existing queued YouTube row that hasn't been voiced yet.
  const { data: existing, error: existErr } = await supabase
    .from('content_calendar')
    .select('id, media_metadata, image_prompt, caption')
    .eq('platform', TARGET_PLATFORM)
    .is('elevenlabs_audio_url', null)
    .is('posted_at', null)
    .in('status', ['draft', 'approved'])
    .order('created_at', { ascending: true })
    .limit(1)
  if (existErr) throw new Error(`existing-row query failed: ${existErr.message}`)
  if (existing && existing.length > 0) {
    const r = existing[0]
    return {
      row: {
        id: r.id as string,
        media_metadata: (r.media_metadata as Record<string, unknown> | null) ?? null,
      },
      isNew: false,
      destinationHint: ((r.image_prompt as string | null) ?? (r.caption as string | null) ?? null)?.trim() ?? null,
    }
  }

  // (b) Fallback — AI picks a destination, INSERT a fresh draft row.
  // jobType: 'ideas' (CHEAP tier) — cheapest model fits the "pick one
  // destination" task; router uses AI_CHEAP_MODEL when the override is
  // omitted. The system prompt still gates the language rules.
  const destJob = await runAIJob({
    jobType: 'ideas',
    title: `YouTube video destination pick — ${nextMondayISODate()}`,
    prompt: PICK_DESTINATION_PROMPT,
    systemPrompt: SCRIPT_SYSTEM,
    inputPayload: { phase: '21C', step: 'pick_destination' },
    createdBy: null,
  })
  if (destJob.status === 'failed' || !destJob.output) {
    throw new Error(`destination AI job failed: ${destJob.error ?? 'no output'}`)
  }
  const destination = parseDestinationOnly(destJob.output) ?? 'Tulum, Mexico'

  const { data: inserted, error: insErr } = await supabase
    .from('content_calendar')
    .insert({
      platform: TARGET_PLATFORM,
      status: 'draft',
      week_of: nextMondayISODate(),
      caption: `${destination} — VortexTrips destination spotlight`,
      image_prompt: destination,
      media_status: 'pending',
    })
    .select('id, media_metadata')
    .single()
  if (insErr || !inserted) throw new Error(`new-row INSERT failed: ${insErr?.message ?? 'unknown'}`)
  return {
    row: {
      id: inserted.id as string,
      media_metadata: (inserted.media_metadata as Record<string, unknown> | null) ?? null,
    },
    isNew: true,
    destinationHint: destination,
  }
}

// ============================================================
// Main
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${envTrim('CRON_SECRET')}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const startedAt = new Date().toISOString()
  const supabase = createAdminClient()

  const switchState = await readKillSwitch(supabase)
  if (switchState === 'disabled') {
    console.log('[generate-youtube-video] cron disabled', { startedAt, kill_switch: KILL_SWITCH_KEY })
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'cron_disabled',
      message: `Cron is gated by site_settings.${KILL_SWITCH_KEY}. Set value='true' to enable.`,
      started_at: startedAt,
    })
  }

  let chosen: PickOrCreateResult
  try {
    chosen = await pickOrCreateYoutubeRow(supabase)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'pick/create failed'
    console.error('[generate-youtube-video] pick/create failed', { error: message })
    return NextResponse.json({ success: false, error: message, started_at: startedAt }, { status: 500 })
  }

  const destinationSeed = chosen.destinationHint ?? 'Cartagena, Colombia'

  // Step 2 — AI script + scenes + title + description.
  const scriptJob = await runAIJob({
    jobType: 'video-script',
    title: `YouTube cinematic script — ${destinationSeed}`,
    prompt: buildScriptUserPrompt(destinationSeed),
    systemPrompt: SCRIPT_SYSTEM,
    inputPayload: { phase: '21C', step: 'script', destination: destinationSeed, row_id: chosen.row.id },
    modelOverride: envTrim('AI_MEDIUM_MODEL') || undefined,
    createdBy: null,
  })
  if (scriptJob.status === 'failed' || !scriptJob.output) {
    console.error('[generate-youtube-video] script AI failed', { row_id: chosen.row.id, error: scriptJob.error })
    return NextResponse.json(
      { success: false, error: scriptJob.error ?? 'script AI failed', row_id: chosen.row.id, started_at: startedAt },
      { status: 500 },
    )
  }
  const parsed = parseScriptOutput(scriptJob.output)
  if (!parsed) {
    console.error('[generate-youtube-video] script JSON unparseable', {
      row_id: chosen.row.id,
      output_preview: scriptJob.output.slice(0, 400),
    })
    return NextResponse.json(
      {
        success: false,
        error: 'AI returned non-conforming JSON for the script payload',
        row_id: chosen.row.id,
        ai_job_id: scriptJob.jobId,
        output_preview: scriptJob.output.slice(0, 400),
        started_at: startedAt,
      },
      { status: 500 },
    )
  }

  // Step 3 — ElevenLabs VO.
  const voResult = await generateVoiceover({ script: parsed.script })
  if (!voResult.success || !voResult.audioUrl) {
    console.error('[generate-youtube-video] VO failed', { row_id: chosen.row.id, error: voResult.error })
    return NextResponse.json(
      {
        success: false,
        error: `VO generation failed: ${voResult.error ?? 'unknown'}`,
        row_id: chosen.row.id,
        started_at: startedAt,
      },
      { status: 500 },
    )
  }

  // Step 4 — Kling submission × 4 (sequential to avoid burst rate-limits).
  // Each clip is independently tracked in media_metadata.kling_clip_jobs[];
  // a per-clip submission failure doesn't abort the whole pipeline — it
  // lands in the array as status='failed' for the operator to retry.
  interface ClipJobEntry {
    scene_index: number
    scene_prompt: string
    job_id: string | null
    status: 'submitted' | 'processing' | 'failed' | 'unknown'
    video_url: string | null
    duration: number | null
    submit_error: string | null
  }
  const clipJobs: ClipJobEntry[] = []
  for (let i = 0; i < parsed.scenes.length; i++) {
    const scene = parsed.scenes[i]
    const kling = await generateCinematicClip({
      prompt: scene,
      duration: CLIP_DURATION_SECONDS,
      aspectRatio: CLIP_ASPECT_RATIO,
    })
    clipJobs.push({
      scene_index: i,
      scene_prompt: scene,
      job_id: kling.success && kling.klingJobId ? kling.klingJobId : null,
      status: kling.success ? (kling.status ?? 'submitted') as ClipJobEntry['status'] : 'failed',
      video_url: null,
      duration: null,
      submit_error: kling.success ? null : (kling.error ?? 'unknown submission error'),
    })
  }

  // Step 5 — persist everything to content_calendar.
  const existingMeta =
    chosen.row.media_metadata && typeof chosen.row.media_metadata === 'object'
      ? chosen.row.media_metadata
      : {}
  const newMeta: Record<string, unknown> = {
    ...existingMeta,
    youtube_destination: parsed.destination,
    youtube_script: parsed.script,
    youtube_scenes: parsed.scenes,
    kling_clip_jobs: clipJobs,
    youtube_orchestrator_run_at: new Date().toISOString(),
  }

  const updatePayload: Record<string, unknown> = {
    elevenlabs_audio_url: voResult.audioUrl,
    youtube_title: parsed.title,
    youtube_description: parsed.description,
    image_prompt: parsed.destination,
    caption: parsed.script.slice(0, 200),
    media_metadata: newMeta,
  }

  const { error: upErr } = await supabase
    .from('content_calendar')
    .update(updatePayload)
    .eq('id', chosen.row.id)
  if (upErr) {
    console.error('[generate-youtube-video] DB update failed', { row_id: chosen.row.id, error: upErr.message })
    return NextResponse.json(
      {
        success: false,
        error: `DB update failed: ${upErr.message}`,
        row_id: chosen.row.id,
        vo_audio_url: voResult.audioUrl,
        clips_submitted: clipJobs.filter(c => c.job_id != null).length,
        started_at: startedAt,
      },
      { status: 500 },
    )
  }

  const clipsSubmitted = clipJobs.filter(c => c.job_id != null).length
  const clipsFailedAtSubmit = CLIP_COUNT - clipsSubmitted

  console.log('[generate-youtube-video] orchestrator complete', {
    row_id: chosen.row.id,
    is_new_row: chosen.isNew,
    destination: parsed.destination,
    clips_submitted: clipsSubmitted,
    clips_failed_at_submit: clipsFailedAtSubmit,
    started_at: startedAt,
  })

  return NextResponse.json({
    success: true,
    row_id: chosen.row.id,
    is_new_row: chosen.isNew,
    destination: parsed.destination,
    title: parsed.title,
    vo_audio_url: voResult.audioUrl,
    vo_bytes: voResult.byteLength,
    clips_submitted: clipsSubmitted,
    clips_failed_at_submit: clipsFailedAtSubmit,
    ai_job_id: scriptJob.jobId,
    ai_model: scriptJob.modelUsed,
    ai_cost_estimate: scriptJob.costEstimate,
    started_at: startedAt,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
