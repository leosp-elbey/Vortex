// Event campaign asset generator — Phase 14D.
// Loads an event_campaigns row, asks the OpenRouter medium-tier model for a full
// asset bundle (social posts, scripts, emails, DMs, hashtags, prompts, headline,
// lead magnet), parses the JSON response, runs an optional Claude verifier pass,
// and inserts every asset into campaign_assets as a draft requiring human approval.
//
// Per VORTEX_EVENT_CAMPAIGN_SKILL.md:
//   - §2 six-part formula (destination + event + audience + window + savings + cta)
//   - §5 output spec (10 posts / 3 scripts / 3 subjects / 3 bodies / 5 DMs / 10 hashtags / 3 image prompts / 3 video prompts / 1 headline / 1 lead magnet)
//   - §6 cruise add-on fields when is_cruise = true
//   - §7 hard compliance rules (no income/savings guarantees, banned vocab)
//
// Server-only — imports process.env via runAIJob and verifyAIOutput.

import { createAdminClient } from '@/lib/supabase/admin'
import { runAIJob } from '@/lib/ai-router'
import { verifyAIOutput } from '@/lib/ai-verifier'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

export const ALL_ASSET_TYPES = [
  'social_post',
  'short_form_script',
  'email_subject',
  'email_body',
  'dm_reply',
  'hashtag_set',
  'image_prompt',
  'video_prompt',
  'landing_headline',
  'lead_magnet',
] as const
export type AssetType = (typeof ALL_ASSET_TYPES)[number]

export const ALL_WAVES = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'] as const
export type Wave = (typeof ALL_WAVES)[number]

// Wave → offset in days from event_start_date (skill §4).
// Negative = before event; positive = after (W8 = next-year waitlist).
const WAVE_OFFSET_DAYS: Record<Wave, number> = {
  W1: -180,
  W2: -120,
  W3: -90,
  W4: -60,
  W5: -30,
  W6: -14,
  W7: -7,
  W8: 7,
}

// Banned terms per VORTEX_EVENT_CAMPAIGN_SKILL.md §7. Case-insensitive.
const BANNED_TERMS = [
  'mlm',
  'downline',
  'network marketing',
  'travel team perks',
  'guaranteed savings',
  'guaranteed income',
  'guaranteed earnings',
]

type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'twitter' | 'youtube' | 'threads' | 'linkedin'
type AssetPlatform = SocialPlatform | 'email' | 'sms' | 'web'

const KNOWN_PLATFORMS: SocialPlatform[] = [
  'instagram',
  'facebook',
  'tiktok',
  'twitter',
  'youtube',
  'threads',
  'linkedin',
]

interface EventCampaignRow {
  id: string
  campaign_name: string
  event_name: string
  event_year: number
  destination_city: string
  destination_country: string | null
  destination_region: string | null
  categories: string[] | null
  audience: string[] | null
  event_start_date: string | null
  event_end_date: string | null
  travel_window_start: string | null
  travel_window_end: string | null
  score: number | null
  is_cruise: boolean | null
  departure_city: string | null
  cruise_line: string | null
  hotel_angle: string | null
  cruise_angle: string | null
  flight_angle: string | null
  group_travel_angle: string | null
  lead_magnet_idea: string | null
  landing_page_headline: string | null
  cta_text: string | null
  cta_url: string | null
  tracking_url_template: string | null
}

export interface GenerateAssetsOptions {
  event_campaign_id: string
  model_override?: string
  asset_types?: AssetType[]
  force_regenerate?: boolean
  createdBy: string | null
}

export interface GenerateAssetsResult {
  ok: boolean
  campaign_id: string
  campaign_name: string
  generation_job_id: string | null
  asset_count: number
  asset_breakdown: Record<AssetType, number>
  schedule: Array<{ asset_id: string; asset_type: AssetType; wave: Wave | null; platform: AssetPlatform | null; scheduled_for: string | null }>
  archived_count: number
  verification: {
    status: string | null
    score: number | null
    skipped: boolean
    reason?: string
  }
  warnings: string[]
  message?: string
  /** Set when no work was done because assets already exist and force_regenerate=false. */
  already_exists?: boolean
  existing_count?: number
}

interface GeneratedSocialPost {
  platform: SocialPlatform
  wave: Wave | null
  body: string
  hashtags: string[]
}
interface GeneratedScript {
  platform: SocialPlatform
  wave: Wave | null
  body: string
}
interface GeneratedEmailItem {
  wave: Wave | null
  body: string
}
interface GeneratedShortItem {
  body: string
}
interface GeneratedBundle {
  social_posts: GeneratedSocialPost[]
  short_form_scripts: GeneratedScript[]
  email_subjects: GeneratedEmailItem[]
  email_bodies: GeneratedEmailItem[]
  dm_replies: GeneratedShortItem[]
  hashtags: string[]
  image_prompts: GeneratedShortItem[]
  video_prompts: GeneratedShortItem[]
  landing_headline: string | null
  lead_magnet: string | null
  schedule_notes: string | null
}

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

function detectBannedTerms(text: string): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  return BANNED_TERMS.filter(term => lower.includes(term))
}

function clampString(s: unknown, max: number): string {
  if (typeof s !== 'string') return ''
  return s.slice(0, max).trim()
}

function asPlatform(value: unknown): SocialPlatform | null {
  if (typeof value !== 'string') return null
  const v = value.toLowerCase().trim()
  const aliases: Record<string, SocialPlatform> = {
    x: 'twitter',
    'twitter/x': 'twitter',
    'x/twitter': 'twitter',
    ig: 'instagram',
    fb: 'facebook',
    yt: 'youtube',
  }
  if (aliases[v]) return aliases[v]
  return (KNOWN_PLATFORMS as string[]).includes(v) ? (v as SocialPlatform) : null
}

function asWave(value: unknown): Wave | null {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return (ALL_WAVES as readonly string[]).includes(upper) ? (upper as Wave) : null
}

/**
 * Robust JSON extractor — strips ```json fences, leading commentary, trailing
 * commentary. Returns null if no parseable JSON object can be recovered.
 */
function extractJsonObject(raw: string): unknown {
  if (!raw) return null
  let text = raw.trim()
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) text = fenceMatch[1].trim()
  // First brace to last brace heuristic
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  const candidate = text.slice(first, last + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isArr(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function parseBundle(raw: string): GeneratedBundle | null {
  const parsed = extractJsonObject(raw)
  if (!isObj(parsed)) return null

  const out: GeneratedBundle = {
    social_posts: [],
    short_form_scripts: [],
    email_subjects: [],
    email_bodies: [],
    dm_replies: [],
    hashtags: [],
    image_prompts: [],
    video_prompts: [],
    landing_headline: null,
    lead_magnet: null,
    schedule_notes: null,
  }

  const socialPosts = parsed.social_posts
  if (isArr(socialPosts)) {
    for (const item of socialPosts) {
      if (!isObj(item)) continue
      const platform = asPlatform(item.platform)
      const body = clampString(item.body ?? item.caption, 4000)
      if (!platform || !body) continue
      const hashtags = isArr(item.hashtags)
        ? item.hashtags.filter((h): h is string => typeof h === 'string').map(h => h.replace(/^#+/, '').slice(0, 60))
        : []
      out.social_posts.push({
        platform,
        wave: asWave(item.wave),
        body,
        hashtags,
      })
    }
  }

  const scripts = parsed.short_form_scripts
  if (isArr(scripts)) {
    for (const item of scripts) {
      if (!isObj(item)) continue
      const platform = asPlatform(item.platform) ?? 'tiktok'
      const body = clampString(item.body ?? item.script, 4000)
      if (!body) continue
      out.short_form_scripts.push({ platform, wave: asWave(item.wave), body })
    }
  }

  const subjects = parsed.email_subjects
  if (isArr(subjects)) {
    for (const item of subjects) {
      if (isObj(item)) {
        const body = clampString(item.body ?? item.subject, 200)
        if (body) out.email_subjects.push({ wave: asWave(item.wave), body })
      } else if (typeof item === 'string') {
        const body = clampString(item, 200)
        if (body) out.email_subjects.push({ wave: null, body })
      }
    }
  }

  const bodies = parsed.email_bodies
  if (isArr(bodies)) {
    for (const item of bodies) {
      if (isObj(item)) {
        const body = clampString(item.body, 4000)
        if (body) out.email_bodies.push({ wave: asWave(item.wave), body })
      } else if (typeof item === 'string') {
        const body = clampString(item, 4000)
        if (body) out.email_bodies.push({ wave: null, body })
      }
    }
  }

  const dms = parsed.dm_replies
  if (isArr(dms)) {
    for (const item of dms) {
      const body = isObj(item) ? clampString(item.body ?? item.reply, 1200) : clampString(item, 1200)
      if (body) out.dm_replies.push({ body })
    }
  }

  const tags = parsed.hashtags
  if (isArr(tags)) {
    for (const t of tags) {
      if (typeof t === 'string') {
        const cleaned = t.trim().replace(/^#+/, '').slice(0, 60)
        if (cleaned) out.hashtags.push(cleaned)
      }
    }
  }

  const images = parsed.image_prompts
  if (isArr(images)) {
    for (const item of images) {
      const body = isObj(item) ? clampString(item.body ?? item.prompt, 2000) : clampString(item, 2000)
      if (body) out.image_prompts.push({ body })
    }
  }

  const videos = parsed.video_prompts
  if (isArr(videos)) {
    for (const item of videos) {
      const body = isObj(item) ? clampString(item.body ?? item.prompt, 2000) : clampString(item, 2000)
      if (body) out.video_prompts.push({ body })
    }
  }

  out.landing_headline = clampString(parsed.landing_headline ?? parsed.landing_page_headline, 200) || null
  out.lead_magnet = clampString(parsed.lead_magnet ?? parsed.lead_magnet_idea, 1000) || null
  out.schedule_notes = clampString(parsed.schedule_notes ?? parsed.posting_schedule_notes, 4000) || null

  return out
}

function buildSystemPrompt(): string {
  return `You are the campaign asset generator for VortexTrips, a travel-membership and affiliate program brand.

Follow VORTEX_EVENT_CAMPAIGN_SKILL.md strictly:
- Six-part formula: Destination + Event + Audience + Travel Window + Savings Angle + CTA.
- Output the full asset bundle (10 posts / 3 scripts / 3 subjects / 3 bodies / 5 DMs / 10 hashtags / 3 image prompts / 3 video prompts / 1 headline / 1 lead magnet).
- Cruise campaigns must reference port city and pre/post-cruise hotel angle when applicable.

HARD compliance rules — never violate:
- Never guarantee income or savings. Use cautious wording: "may save", "members report", "check your member rate", "see if your rate is lower than public pricing".
- Tax / business travel copy must close with "ask your tax professional".
- Do not state active member counts, total dollars saved, or star ratings.
- BANNED VOCABULARY (auto-fail): MLM, downline, network marketing, "Travel Team Perks", "guaranteed savings", "guaranteed income".
- REQUIRED VOCABULARY: travel membership, affiliate program, travel savings club.
- No celebrity endorsements. No copyrighted event imagery references.
- No medical claims for wellness retreats.

Platform voice norms:
- Instagram: visual, emotional, hashtags allowed, ~150 words.
- Facebook: conversational, group/family friendly, ~120 words.
- Twitter / X: concise, urgency-driven, ≤ 270 chars.
- TikTok: short, hook-first, video-style, ≤ 80 words.
- Email: warm, trust-building, one clear CTA.
- DM: short, natural, end with a question.

Output format: a single JSON object. No prose before or after. No markdown fences.
Schema:
{
  "social_posts": [{"platform":"instagram|facebook|tiktok|twitter","wave":"W1..W8","body":"...","hashtags":["..."]}, x10],
  "short_form_scripts": [{"platform":"tiktok|instagram","wave":"W1..W8","body":"HOOK / BODY / CTA"}, x3],
  "email_subjects": [{"wave":"W1..W8","body":"≤60 chars"}, x3],
  "email_bodies": [{"wave":"W1..W8","body":"200-400 words ending in CTA"}, x3],
  "dm_replies": [{"body":"≤220 chars, ends in a question"}, x5],
  "hashtags": ["string", x10],
  "image_prompts": [{"body":"1-2 sentence Pexels search or AI image prompt"}, x3],
  "video_prompts": [{"body":"1-2 sentence short-form video concept"}, x3],
  "landing_headline": "≤80 chars",
  "lead_magnet": "1-2 sentence opt-in hook",
  "schedule_notes": "1-3 sentences explaining wave timing"
}

Ground every asset in the campaign data the user provides. Never invent attendance numbers, savings percentages, or prices.`
}

function buildUserPrompt(campaign: EventCampaignRow): string {
  const lines: string[] = []
  lines.push(`Campaign: ${campaign.campaign_name}`)
  lines.push(`Event: ${campaign.event_name} ${campaign.event_year}`)
  lines.push(`Destination: ${campaign.destination_city}${campaign.destination_country ? ', ' + campaign.destination_country : ''}${campaign.destination_region ? ' (' + campaign.destination_region + ')' : ''}`)
  if (campaign.event_start_date) lines.push(`Event start: ${campaign.event_start_date}`)
  if (campaign.event_end_date) lines.push(`Event end: ${campaign.event_end_date}`)
  if (campaign.travel_window_start && campaign.travel_window_end) {
    lines.push(`Travel booking window: ${campaign.travel_window_start} to ${campaign.travel_window_end}`)
  }
  if (campaign.categories?.length) lines.push(`Categories: ${campaign.categories.join(', ')}`)
  if (campaign.audience?.length) lines.push(`Audience: ${campaign.audience.join(', ')}`)
  if (campaign.score !== null && campaign.score !== undefined) lines.push(`Internal fit score: ${campaign.score}/100`)

  if (campaign.is_cruise) {
    lines.push('')
    lines.push('Cruise campaign — apply skill §6:')
    if (campaign.departure_city) lines.push(`- Departure port: ${campaign.departure_city}`)
    if (campaign.cruise_line) lines.push(`- Cruise line: ${campaign.cruise_line}`)
    lines.push('- Always pair with a 1-night pre-cruise hotel as the default upsell.')
    lines.push('- For US travelers, mention "passport-friendly closed-loop sailing" when applicable.')
  }

  lines.push('')
  lines.push('Factual angles (use as-is; do not invent extras):')
  if (campaign.hotel_angle) lines.push(`- Hotel: ${campaign.hotel_angle}`)
  if (campaign.cruise_angle) lines.push(`- Cruise: ${campaign.cruise_angle}`)
  if (campaign.flight_angle) lines.push(`- Flight: ${campaign.flight_angle}`)
  if (campaign.group_travel_angle) lines.push(`- Group: ${campaign.group_travel_angle}`)
  if (campaign.lead_magnet_idea) lines.push(`- Suggested lead magnet hook: ${campaign.lead_magnet_idea}`)
  if (campaign.landing_page_headline) lines.push(`- Suggested landing headline: ${campaign.landing_page_headline}`)

  lines.push('')
  lines.push('CTA targets — pick the right one per asset:')
  lines.push('- Free travel portal (default for top-of-funnel): https://myvortex365.com/leosp')
  lines.push('- SBA enrollment (affiliate program): https://signup.surge365.com/leosp')
  lines.push('- Booking site (use code LEOSP): https://vortextrips.com/booking')
  if (campaign.cta_text && campaign.cta_url) {
    lines.push(`- Campaign-specific CTA: "${campaign.cta_text}" → ${campaign.cta_url}`)
  }

  lines.push('')
  lines.push('Wave guidance (skill §4) — distribute social posts and emails across these waves so the campaign covers the full booking funnel:')
  lines.push('- W1 (180d before): "Save the date" awareness')
  lines.push('- W2 (120d before): "Time to plan", member-rate quote')
  lines.push('- W3 (90d before): hotel pressure, member rate vs public rate')
  lines.push('- W4 (60d before): urgency, group block, last good rooms')
  lines.push('- W5 (30d before): final pricing snapshot')
  lines.push('- W6 (14d before): overflow / satellite hotel options')
  lines.push('- W7 (7d before): last-minute member rate, ground transfer')
  lines.push('- W8 (post-event): next-year early-bird waitlist')

  lines.push('')
  lines.push('Return ONLY the JSON object described in the system prompt. No markdown fences, no preamble.')
  return lines.join('\n')
}

async function loadCampaign(supabase: SupabaseAdmin, id: string): Promise<EventCampaignRow | null> {
  const { data, error } = await supabase
    .from('event_campaigns')
    .select(
      'id, campaign_name, event_name, event_year, destination_city, destination_country, destination_region, categories, audience, event_start_date, event_end_date, travel_window_start, travel_window_end, score, is_cruise, departure_city, cruise_line, hotel_angle, cruise_angle, flight_angle, group_travel_angle, lead_magnet_idea, landing_page_headline, cta_text, cta_url, tracking_url_template',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`event_campaigns lookup failed: ${error.message}`)
  return (data as EventCampaignRow | null) ?? null
}

interface ExistingAssetCheck {
  liveCount: number
  draftIdsToArchive: string[]
}

async function inspectExistingAssets(
  supabase: SupabaseAdmin,
  campaignId: string,
): Promise<ExistingAssetCheck> {
  const { data, error } = await supabase
    .from('campaign_assets')
    .select('id, status')
    .eq('campaign_id', campaignId)
  if (error) throw new Error(`campaign_assets inspect failed: ${error.message}`)
  const rows = (data ?? []) as Array<{ id: string; status: string }>
  const live = rows.filter(r => r.status !== 'archived' && r.status !== 'rejected')
  const draftIds = rows.filter(r => r.status === 'draft').map(r => r.id)
  return { liveCount: live.length, draftIdsToArchive: draftIds }
}

async function archiveDrafts(supabase: SupabaseAdmin, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const { error, count } = await supabase
    .from('campaign_assets')
    .update({ status: 'archived' }, { count: 'exact' })
    .in('id', ids)
    .eq('status', 'draft') // belt-and-braces: never overwrite posted/scheduled/approved
  if (error) throw new Error(`archive drafts failed: ${error.message}`)
  return count ?? ids.length
}

function computeScheduledFor(eventStart: string | null, wave: Wave | null): string | null {
  if (!eventStart || !wave) return null
  const offset = WAVE_OFFSET_DAYS[wave]
  const base = new Date(eventStart + 'T13:00:00Z') // anchor mid-day UTC for posting slots
  if (Number.isNaN(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() + offset)
  // Don't schedule into the past — let humans reschedule manually if a wave already passed.
  if (base.getTime() < Date.now()) return null
  return base.toISOString()
}

interface AssetInsertRow {
  campaign_id: string
  wave: Wave | null
  asset_type: AssetType
  platform: AssetPlatform | null
  body: string
  hashtags: string[]
  status: 'draft'
  requires_human_approval: true
  generation_job_id: string | null
  scheduled_for: string | null
  generation_metadata: Record<string, unknown>
  verification_metadata: Record<string, unknown>
}

function buildInsertRows(
  campaign: EventCampaignRow,
  bundle: GeneratedBundle,
  jobId: string | null,
  modelUsed: string,
  selectedTypes: Set<AssetType>,
): { rows: AssetInsertRow[]; warnings: string[] } {
  const warnings: string[] = []
  const rows: AssetInsertRow[] = []

  function bannedFlag(text: string): Record<string, unknown> {
    const hits = detectBannedTerms(text)
    return hits.length > 0 ? { compliance_flag: 'banned_terms', terms: hits } : {}
  }

  function pushAsset(args: {
    asset_type: AssetType
    body: string
    wave?: Wave | null
    platform?: AssetPlatform | null
    hashtags?: string[]
  }): void {
    if (!selectedTypes.has(args.asset_type)) return
    if (!args.body) return
    const flag = bannedFlag(args.body)
    if (Object.keys(flag).length > 0) {
      warnings.push(`Banned term in ${args.asset_type}: ${(flag.terms as string[]).join(', ')}`)
    }
    rows.push({
      campaign_id: campaign.id,
      wave: args.wave ?? null,
      asset_type: args.asset_type,
      platform: args.platform ?? null,
      body: args.body,
      hashtags: args.hashtags ?? [],
      status: 'draft',
      requires_human_approval: true,
      generation_job_id: jobId,
      scheduled_for: computeScheduledFor(campaign.event_start_date, args.wave ?? null),
      generation_metadata: {
        source: 'event-campaign-asset-generator',
        model_used: modelUsed,
        seed_event_year: campaign.event_year,
      },
      verification_metadata: flag,
    })
  }

  for (const post of bundle.social_posts) {
    pushAsset({
      asset_type: 'social_post',
      body: post.body,
      wave: post.wave,
      platform: post.platform,
      hashtags: post.hashtags,
    })
  }
  for (const script of bundle.short_form_scripts) {
    pushAsset({
      asset_type: 'short_form_script',
      body: script.body,
      wave: script.wave,
      platform: script.platform,
    })
  }
  for (const subj of bundle.email_subjects) {
    pushAsset({
      asset_type: 'email_subject',
      body: subj.body,
      wave: subj.wave,
      platform: 'email',
    })
  }
  for (const body of bundle.email_bodies) {
    pushAsset({
      asset_type: 'email_body',
      body: body.body,
      wave: body.wave,
      platform: 'email',
    })
  }
  for (const dm of bundle.dm_replies) {
    pushAsset({ asset_type: 'dm_reply', body: dm.body })
  }
  if (selectedTypes.has('hashtag_set') && bundle.hashtags.length > 0) {
    pushAsset({
      asset_type: 'hashtag_set',
      body: `Hashtag bank for ${campaign.campaign_name}`,
      hashtags: bundle.hashtags.slice(0, 25),
    })
  }
  for (const img of bundle.image_prompts) {
    pushAsset({ asset_type: 'image_prompt', body: img.body })
  }
  for (const vid of bundle.video_prompts) {
    pushAsset({ asset_type: 'video_prompt', body: vid.body })
  }
  if (selectedTypes.has('landing_headline') && bundle.landing_headline) {
    pushAsset({ asset_type: 'landing_headline', body: bundle.landing_headline, platform: 'web' })
  }
  if (selectedTypes.has('lead_magnet') && bundle.lead_magnet) {
    pushAsset({ asset_type: 'lead_magnet', body: bundle.lead_magnet })
  }

  return { rows, warnings }
}

async function insertAssets(
  supabase: SupabaseAdmin,
  rows: AssetInsertRow[],
): Promise<Array<{ id: string; asset_type: AssetType; wave: Wave | null; platform: AssetPlatform | null; scheduled_for: string | null }>> {
  if (rows.length === 0) return []
  const { data, error } = await supabase
    .from('campaign_assets')
    .insert(rows)
    .select('id, asset_type, wave, platform, scheduled_for')
  if (error) throw new Error(`campaign_assets insert failed: ${error.message}`)
  return (data ?? []) as Array<{ id: string; asset_type: AssetType; wave: Wave | null; platform: AssetPlatform | null; scheduled_for: string | null }>
}

async function tryVerifier(
  jobId: string,
  bundle: GeneratedBundle,
): Promise<GenerateAssetsResult['verification']> {
  if (!envTrim('ANTHROPIC_API_KEY')) {
    return { status: null, score: null, skipped: true, reason: 'ANTHROPIC_API_KEY not configured' }
  }
  // Concatenate the readable text fields so the verifier can scan brand voice + banned terms.
  const review = [
    ...bundle.social_posts.map(p => `[${p.platform}/${p.wave ?? '-'}] ${p.body}`),
    ...bundle.short_form_scripts.map(s => `[${s.platform}/script] ${s.body}`),
    ...bundle.email_subjects.map(s => `[email-subject] ${s.body}`),
    ...bundle.email_bodies.map(b => `[email-body] ${b.body}`),
    ...bundle.dm_replies.map(d => `[dm] ${d.body}`),
    bundle.landing_headline ? `[headline] ${bundle.landing_headline}` : '',
    bundle.lead_magnet ? `[lead-magnet] ${bundle.lead_magnet}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  if (!review) {
    return { status: null, score: null, skipped: true, reason: 'no reviewable text' }
  }
  try {
    const result = await verifyAIOutput({ jobId, output: review.slice(0, 40_000), jobType: 'social-pack' })
    return { status: result.status, score: result.overall_score, skipped: false }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'verifier error'
    return { status: null, score: null, skipped: true, reason }
  }
}

export async function generateCampaignAssets(opts: GenerateAssetsOptions): Promise<GenerateAssetsResult> {
  if (!opts.event_campaign_id) throw new Error('event_campaign_id required')

  const requestedTypes = opts.asset_types && opts.asset_types.length > 0
    ? opts.asset_types.filter((t): t is AssetType => (ALL_ASSET_TYPES as readonly string[]).includes(t))
    : [...ALL_ASSET_TYPES]
  if (requestedTypes.length === 0) {
    throw new Error('asset_types must contain at least one valid asset type')
  }
  const selectedTypes = new Set<AssetType>(requestedTypes)

  const supabase = createAdminClient()

  const campaign = await loadCampaign(supabase, opts.event_campaign_id)
  if (!campaign) {
    return {
      ok: false,
      campaign_id: opts.event_campaign_id,
      campaign_name: '',
      generation_job_id: null,
      asset_count: 0,
      asset_breakdown: zeroBreakdown(),
      schedule: [],
      archived_count: 0,
      verification: { status: null, score: null, skipped: true, reason: 'campaign not found' },
      warnings: [],
      message: 'event_campaign_id not found',
    }
  }

  const existing = await inspectExistingAssets(supabase, campaign.id)
  if (existing.liveCount > 0 && !opts.force_regenerate) {
    return {
      ok: true,
      campaign_id: campaign.id,
      campaign_name: campaign.campaign_name,
      generation_job_id: null,
      asset_count: 0,
      asset_breakdown: zeroBreakdown(),
      schedule: [],
      archived_count: 0,
      verification: { status: null, score: null, skipped: true, reason: 'assets already exist' },
      warnings: [],
      already_exists: true,
      existing_count: existing.liveCount,
      message: `Campaign already has ${existing.liveCount} non-archived assets. Re-run with force_regenerate=true to replace drafts.`,
    }
  }

  let archivedCount = 0
  if (opts.force_regenerate && existing.draftIdsToArchive.length > 0) {
    archivedCount = await archiveDrafts(supabase, existing.draftIdsToArchive)
  }

  const job = await runAIJob({
    jobType: 'social-pack',
    title: `Event campaign assets: ${campaign.campaign_name}`.slice(0, 200),
    prompt: buildUserPrompt(campaign),
    systemPrompt: buildSystemPrompt(),
    inputPayload: {
      event_campaign_id: campaign.id,
      asset_types: requestedTypes,
      force_regenerate: !!opts.force_regenerate,
    },
    modelOverride: opts.model_override?.trim() || undefined,
    createdBy: opts.createdBy,
  })

  if (job.status === 'failed' || !job.output) {
    return {
      ok: false,
      campaign_id: campaign.id,
      campaign_name: campaign.campaign_name,
      generation_job_id: job.jobId,
      asset_count: 0,
      asset_breakdown: zeroBreakdown(),
      schedule: [],
      archived_count: archivedCount,
      verification: { status: null, score: null, skipped: true, reason: 'generation failed' },
      warnings: [],
      message: job.error ?? 'AI generation failed',
    }
  }

  const bundle = parseBundle(job.output)
  if (!bundle) {
    return {
      ok: false,
      campaign_id: campaign.id,
      campaign_name: campaign.campaign_name,
      generation_job_id: job.jobId,
      asset_count: 0,
      asset_breakdown: zeroBreakdown(),
      schedule: [],
      archived_count: archivedCount,
      verification: { status: null, score: null, skipped: true, reason: 'unparseable model output' },
      warnings: ['Model output could not be parsed as JSON. No assets inserted.'],
      message: 'AI returned an unparseable response. The job log preserves the raw text for review.',
    }
  }

  const { rows, warnings } = buildInsertRows(campaign, bundle, job.jobId, job.modelUsed, selectedTypes)
  const inserted = await insertAssets(supabase, rows)
  const verification = await tryVerifier(job.jobId, bundle)

  const breakdown = zeroBreakdown()
  for (const row of inserted) breakdown[row.asset_type] = (breakdown[row.asset_type] ?? 0) + 1

  return {
    ok: true,
    campaign_id: campaign.id,
    campaign_name: campaign.campaign_name,
    generation_job_id: job.jobId,
    asset_count: inserted.length,
    asset_breakdown: breakdown,
    schedule: inserted.map(r => ({
      asset_id: r.id,
      asset_type: r.asset_type,
      wave: r.wave,
      platform: r.platform,
      scheduled_for: r.scheduled_for,
    })),
    archived_count: archivedCount,
    verification,
    warnings,
  }
}

function zeroBreakdown(): Record<AssetType, number> {
  return {
    social_post: 0,
    short_form_script: 0,
    email_subject: 0,
    email_body: 0,
    dm_reply: 0,
    hashtag_set: 0,
    image_prompt: 0,
    video_prompt: 0,
    landing_headline: 0,
    lead_magnet: 0,
  }
}

