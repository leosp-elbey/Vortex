// AI Verifier — Claude reviews AI output against the VortexTrips brand/safety rubric.
// Uses Anthropic SDK directly (not OpenRouter) for adaptive thinking + structured outputs.
// Logs every verification to ai_verification_logs and updates the parent ai_jobs row.

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createAdminClient } from '@/lib/supabase/admin'

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

const VERIFIER_MODEL = envTrim('AI_VERIFIER_MODEL').replace(/^anthropic\//, '') || 'claude-opus-4-7'

const VerificationSchema = z.object({
  status: z.enum(['approved', 'needs_revision', 'rejected']),
  overall_score: z.number().int().min(0).max(100),
  checks: z.object({
    hallucinations: z.object({ passed: z.boolean(), note: z.string() }),
    broken_links: z.object({ passed: z.boolean(), note: z.string() }),
    missing_cta: z.object({ passed: z.boolean(), note: z.string() }),
    off_brand_tone: z.object({ passed: z.boolean(), note: z.string() }),
    duplicate_content: z.object({ passed: z.boolean(), note: z.string() }),
    unsafe_claims: z.object({ passed: z.boolean(), note: z.string() }),
  }),
  recommendations: z.array(z.string()),
})

export type VerificationResult = z.infer<typeof VerificationSchema>

const SYSTEM_PROMPT = `You are a quality reviewer for VortexTrips, a travel affiliate marketing platform that sells a travel membership and an affiliate program (called Smart Business Affiliate, or "SBA"). Review AI-generated content against this checklist and produce a structured verification result.

## Brand rules

NEVER use these terms (they trigger automatic failure on off_brand_tone):
- "Travel Team Perks" — old brand name, discontinued; the brand is VortexTrips only
- "MLM" / "downline" / "network marketing" — replace with "affiliate program" or "travel savings club"

ALWAYS prefer:
- "Travel membership", "affiliate program", "Smart Business Affiliate (SBA)", "travel savings club"

Tone: warm, helpful, results-focused. Avoid hype, exclamation-stuffed clickbait, or aggressive scarcity.

## Checks to perform

1. **hallucinations** — Does the content state facts that can't be verified or are likely fabricated (fake statistics, made-up partners, invented testimonials)?
   - Pass: claims are conservative, sourceable, or appropriately hedged with "average", "up to", "typically"
   - Fail: invented data, fake numbers, fabricated quotes from non-existent members

2. **broken_links** — Are URLs well-formed and pointing to legitimate destinations?
   - Pass: URLs use vortextrips.com or known legitimate domains, syntax is correct
   - Fail: typo'd domains, malformed URLs (missing protocol, broken paths), links to competitors

3. **missing_cta** — Does the content have a clear call-to-action where one is expected?
   - CTA expected for: emails, landing-copy, social-pack, blog, video-script, email-sequence
   - CTA NOT expected for: code, security-review, compliance, ideas, hashtags, captions, outlines
   - Pass: appropriate CTA present (or correctly absent for the job type)
   - Fail: email/landing-page content with no clear next step

4. **off_brand_tone** — Off-voice or uses forbidden brand terms?
   - Pass: matches VortexTrips voice, uses approved terminology
   - Fail: contains any forbidden term, or feels overly hypey/spammy/aggressive

5. **duplicate_content** — Within this single piece, is the writing repetitive or formulaic?
   - Pass: fresh, varied phrasing and structure
   - Fail: repetitive sentences, paragraphs that say the same thing in different words
   - (Cross-content duplicate detection across the database is a separate check — not your job here)

6. **unsafe_claims** — Income guarantees, medical claims, or unsupported specific dollar amounts?
   - Pass: modest, hedged claims; income examples accompanied by appropriate disclaimers
   - Fail: "guaranteed" income, specific dollar earnings without disclaimers, medical/health benefits from travel, time-bound income promises ("make $X in N days")

## Scoring rubric

- **90-100 → approved**: clean, ready to publish, minor or no issues
- **70-89 → needs_revision**: clear issues that are fixable; not ready as-is
- **0-69 → rejected**: significant problems requiring major rework

Hard fails (any one of these → rejected regardless of overall score):
- Forbidden brand term present (Travel Team Perks, MLM, downline, network marketing)
- Income guarantee or specific dollar earnings without disclaimer
- Medical/health claim about travel benefits

## Recommendations

Provide 0 to 5 specific, actionable recommendations. Empty array if everything passes cleanly. Each recommendation should reference a specific issue and how to fix it.`

export async function verifyAIOutput(opts: {
  jobId: string
  output: string
  jobType: string
}): Promise<VerificationResult> {
  if (!opts.jobId) throw new Error('jobId required')
  if (!opts.output?.trim()) throw new Error('output required')
  if (!opts.jobType) throw new Error('jobType required')
  if (!envTrim('ANTHROPIC_API_KEY')) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey: envTrim('ANTHROPIC_API_KEY') })
  const userMessage = `Job type: ${opts.jobType}\n\nOutput to review:\n---\n${opts.output}\n---`

  let result: VerificationResult
  let modelUsed = VERIFIER_MODEL
  let rawText = ''

  try {
    const response = await client.messages.parse({
      model: VERIFIER_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive', display: 'summarized' },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      output_config: { format: zodOutputFormat(VerificationSchema) },
    })

    if (!response.parsed_output) {
      throw new Error('Verifier returned no parsed output (model may have refused)')
    }
    result = response.parsed_output
    modelUsed = response.model
    rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Verifier API error ${err.status}: ${err.message}`)
    }
    throw err
  }

  const supabase = createAdminClient()

  await supabase.from('ai_verification_logs').insert({
    job_id: opts.jobId,
    verification_status: result.status,
    overall_score: result.overall_score,
    checks: result.checks,
    recommendations: result.recommendations,
    model_used: modelUsed,
    raw_response: rawText.slice(0, 50_000),
  })

  const requireApproval = envTrim('AI_REQUIRE_HUMAN_APPROVAL') !== 'false'
  const newJobStatus = requireApproval
    ? 'pending_review'
    : result.status === 'approved'
      ? 'approved'
      : 'pending_review'

  await supabase
    .from('ai_jobs')
    .update({
      verification_status: result.status,
      verified_by: 'claude',
      status: newJobStatus,
    })
    .eq('id', opts.jobId)

  return result
}
