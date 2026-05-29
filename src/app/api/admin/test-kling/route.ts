// Phase 21B — admin smoke test for Kling AI video generation.
//
// POST /api/admin/test-kling
//   Auth: admin_users only (mirrors test-elevenlabs / generate-sba-video).
//   Body: none (uses a fixed cinematic sample prompt).
//   Returns: { kling_job_id, status, prompt }
//
// Used by the operator after wiring PIAPI_API_KEY in
// Vercel env vars to confirm:
//   1. JWT signing works (no "invalid token" / 401).
//   2. The submission endpoint accepts the prompt + returns a task_id.
//   3. The check-kling-jobs cron will pick it up on its next */10 tick.
//
// No DB writes — this route never touches content_calendar. The returned
// kling_job_id is for the operator to verify the poll path manually via
// the cron (or by hitting Kling's status endpoint directly).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCinematicClip } from '@/lib/kling'

const SAMPLE_PROMPT = 'Aerial drone shot of turquoise Caribbean waters at golden hour, cinematic'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminUser } = await supabase.from('admin_users').select('id').eq('id', user.id).single()
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await generateCinematicClip({
    prompt: SAMPLE_PROMPT,
    duration: 5,
    aspectRatio: '16:9',
  })
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'kling submit failed' }, { status: 500 })
  }

  return NextResponse.json({
    kling_job_id: result.klingJobId,
    status: result.status,
    raw_status: result.rawStatus,
    prompt: SAMPLE_PROMPT,
  })
}
