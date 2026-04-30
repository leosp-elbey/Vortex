// AI Router — single entrypoint for AI generation requests.
// Routes by job type to the right model via OpenRouter, logs everything to ai_jobs,
// enforces monthly + daily budget guardrails, retries on transient errors.
// Server-side only: imports process.env and createAdminClient.

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { estimateCost } from '@/lib/ai-models'

export type JobType =
  | 'ideas' | 'captions' | 'hashtags' | 'outlines'
  | 'scripts' | 'emails' | 'landing-copy' | 'blog'
  | 'code' | 'security-review' | 'compliance'
  | 'social-pack' | 'video-script' | 'email-sequence' | 'social-calendar'

export interface AIJobRequest {
  jobType: JobType
  title: string
  prompt: string
  systemPrompt?: string
  inputPayload?: Record<string, unknown>
  modelOverride?: string
  /** auth.users.id, or null for system/cron jobs */
  createdBy: string | null
}

export interface AIJobResult {
  jobId: string
  output: string
  modelUsed: string
  costEstimate: number
  inputTokens: number
  outputTokens: number
  status: 'completed' | 'failed' | 'pending_review'
  error?: string
}

const CHEAP_TYPES = new Set<JobType>(['ideas', 'captions', 'hashtags', 'outlines'])
const MEDIUM_TYPES = new Set<JobType>([
  'scripts', 'emails', 'landing-copy', 'blog',
  'social-pack', 'video-script', 'email-sequence', 'social-calendar',
])
const STRONG_TYPES = new Set<JobType>(['security-review', 'compliance'])

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

function selectModel(jobType: JobType, override?: string): string {
  if (override) return override.trim()
  if (jobType === 'code') return envTrim('AI_CODING_MODEL') || envTrim('AI_DEFAULT_MODEL')
  if (CHEAP_TYPES.has(jobType)) return envTrim('AI_CHEAP_MODEL') || envTrim('AI_DEFAULT_MODEL')
  if (MEDIUM_TYPES.has(jobType)) return envTrim('AI_MEDIUM_MODEL') || envTrim('AI_DEFAULT_MODEL')
  if (STRONG_TYPES.has(jobType)) return envTrim('AI_STRONG_MODEL') || envTrim('AI_DEFAULT_MODEL')
  return envTrim('AI_DEFAULT_MODEL')
}

interface BudgetCheckResult {
  ok: boolean
  monthlySpent: number
  dailySpent: number
  reason?: string
}

async function checkBudget(): Promise<BudgetCheckResult> {
  const monthlyLimit = parseFloat(envTrim('AI_MONTHLY_BUDGET_LIMIT') || '75')
  const dailyLimit = parseFloat(envTrim('AI_DAILY_BUDGET_LIMIT') || '5')

  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const supabase = createAdminClient()
  const [monthlyRes, dailyRes] = await Promise.all([
    supabase
      .from('ai_jobs')
      .select('cost_estimate')
      .gte('created_at', startOfMonth.toISOString())
      .not('cost_estimate', 'is', null),
    supabase
      .from('ai_jobs')
      .select('cost_estimate')
      .gte('created_at', startOfDay.toISOString())
      .not('cost_estimate', 'is', null),
  ])

  const monthlySpent = (monthlyRes.data ?? []).reduce(
    (sum: number, row: { cost_estimate: number | null }) => sum + (row.cost_estimate ?? 0),
    0,
  )
  const dailySpent = (dailyRes.data ?? []).reduce(
    (sum: number, row: { cost_estimate: number | null }) => sum + (row.cost_estimate ?? 0),
    0,
  )

  if (monthlySpent >= monthlyLimit) {
    return {
      ok: false,
      monthlySpent,
      dailySpent,
      reason: `Monthly budget exceeded ($${monthlyLimit.toFixed(2)} cap, spent $${monthlySpent.toFixed(2)})`,
    }
  }
  if (dailySpent >= dailyLimit) {
    return {
      ok: false,
      monthlySpent,
      dailySpent,
      reason: `Daily budget exceeded ($${dailyLimit.toFixed(2)} cap, spent $${dailySpent.toFixed(2)})`,
    }
  }
  return { ok: true, monthlySpent, dailySpent }
}

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { status?: number; code?: string; message?: string }
  if (e.status && (e.status >= 500 || e.status === 429)) return true
  if (e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET' || e.code === 'ENOTFOUND') return true
  if (e.message && /network|timeout|fetch failed/i.test(e.message)) return true
  return false
}

const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [0, 1000, 3000]

interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cost?: number
}

async function callOpenRouter(opts: {
  model: string
  systemPrompt?: string
  prompt: string
}): Promise<{ output: string; inputTokens: number; outputTokens: number; cost: number }> {
  const client = new OpenAI({
    apiKey: envTrim('OPENROUTER_API_KEY'),
    baseURL: envTrim('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': envTrim('NEXT_PUBLIC_APP_URL') || 'https://www.vortextrips.com',
      'X-Title': 'VortexTrips AI Command Center',
    },
  })

  const messages: { role: 'system' | 'user'; content: string }[] = []
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
  messages.push({ role: 'user', content: opts.prompt })

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]))
    }
    try {
      const res = await client.chat.completions.create({
        model: opts.model,
        messages,
      })
      const choice = res.choices?.[0]
      const output = choice?.message?.content ?? ''
      const usage = (res.usage ?? {}) as OpenRouterUsage
      const inputTokens = usage.prompt_tokens ?? 0
      const outputTokens = usage.completion_tokens ?? 0
      const cost = usage.cost ?? estimateCost(opts.model, inputTokens, outputTokens)
      return { output, inputTokens, outputTokens, cost }
    } catch (err) {
      lastError = err
      if (!isTransientError(err) || attempt === MAX_ATTEMPTS - 1) break
    }
  }
  throw lastError
}

export async function runAIJob(req: AIJobRequest): Promise<AIJobResult> {
  if (!req.jobType) throw new Error('jobType required')
  if (!req.title?.trim()) throw new Error('title required')
  if (!req.prompt?.trim()) throw new Error('prompt required')
  // createdBy may be null for system/cron jobs (anchored to NULL FK on ai_jobs.created_by)
  if (!envTrim('OPENROUTER_API_KEY')) throw new Error('OPENROUTER_API_KEY not configured')

  const supabase = createAdminClient()

  const budget = await checkBudget()
  if (!budget.ok) throw new Error(`Budget guardrail: ${budget.reason}`)

  const modelToUse = selectModel(req.jobType, req.modelOverride)
  if (!modelToUse) throw new Error('No model resolved — check AI_*_MODEL env vars')

  const { data: jobRow, error: insertError } = await supabase
    .from('ai_jobs')
    .insert({
      job_type: req.jobType,
      title: req.title.slice(0, 200),
      input_payload: {
        prompt: req.prompt,
        systemPrompt: req.systemPrompt ?? null,
        ...req.inputPayload,
      },
      model_requested: req.modelOverride ?? modelToUse,
      provider: 'openrouter',
      status: 'running',
      created_by: req.createdBy, // null allowed for cron / system jobs
    })
    .select('id')
    .single()

  if (insertError || !jobRow) {
    throw new Error(`Failed to create ai_jobs row: ${insertError?.message ?? 'unknown'}`)
  }
  const jobId = jobRow.id as string

  try {
    const { output, inputTokens, outputTokens, cost } = await callOpenRouter({
      model: modelToUse,
      systemPrompt: req.systemPrompt,
      prompt: req.prompt,
    })

    const requireApproval = envTrim('AI_REQUIRE_HUMAN_APPROVAL') !== 'false'
    const finalStatus: AIJobResult['status'] = requireApproval ? 'pending_review' : 'completed'

    await supabase
      .from('ai_jobs')
      .update({
        output_payload: { content: output },
        model_used: modelToUse,
        status: finalStatus,
        cost_estimate: cost,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    await supabase.from('ai_model_usage').insert({
      job_id: jobId,
      model: modelToUse,
      provider: 'openrouter',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_estimate: cost,
    })

    return {
      jobId,
      output,
      modelUsed: modelToUse,
      costEstimate: cost,
      inputTokens,
      outputTokens,
      status: finalStatus,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('ai_jobs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return {
      jobId,
      output: '',
      modelUsed: modelToUse,
      costEstimate: 0,
      inputTokens: 0,
      outputTokens: 0,
      status: 'failed',
      error: message,
    }
  }
}

export async function getBudgetStatus(): Promise<BudgetCheckResult> {
  return checkBudget()
}
