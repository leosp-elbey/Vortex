import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return auth.error

  const keys = [
    'OPENROUTER_API_KEY',
    'OPENROUTER_BASE_URL',
    'ANTHROPIC_API_KEY',
    'AI_DEFAULT_MODEL',
    'AI_CHEAP_MODEL',
    'AI_MEDIUM_MODEL',
    'AI_VERIFIER_MODEL',
  ]

  const status: Record<string, { present: boolean; length: number; prefix: string }> = {}
  for (const k of keys) {
    const v = process.env[k] ?? ''
    status[k] = {
      present: v.length > 0,
      length: v.length,
      prefix: v.slice(0, 8),
    }
  }

  return NextResponse.json({
    deploymentUrl: process.env.VERCEL_URL ?? 'unknown',
    deploymentEnv: process.env.VERCEL_ENV ?? 'unknown',
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    status,
  })
}
