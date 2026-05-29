// Phase 21A — admin smoke test for ElevenLabs voiceover generation.
//
// POST /api/admin/test-elevenlabs
//   Auth: admin_users only (mirrors generate-sba-video / upload-to-youtube).
//   Body: none (uses a fixed 10-second on-brand sample script).
//   Returns: { audio_url, storage_path, voice_id, model_id, bytes, script }
//
// Used by the operator after wiring ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID
// in Vercel env vars to confirm:
//   1. The key works (no 401).
//   2. The voice id is valid (no 404 / "voice not found").
//   3. Supabase Storage uploads cleanly to audio/vo/<id>.mp3.
//   4. The returned URL is publicly playable.
//
// No DB writes besides the storage upload — this route never touches
// content_calendar. It is intentionally simple so a failure here points
// at exactly one of (auth, env, ElevenLabs API, Supabase Storage).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateVoiceover } from '@/lib/elevenlabs'

// ~24 words, ~10 seconds at normal narration pace. On-brand and within
// the language rules from MASTER_PROJECT.md (no MLM / downline phrasing).
const SAMPLE_SCRIPT =
  'Welcome to VortexTrips. Members save up to sixty percent on hotels worldwide. Get paid to share the savings — your free portal awaits.'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminUser } = await supabase.from('admin_users').select('id').eq('id', user.id).single()
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await generateVoiceover({ script: SAMPLE_SCRIPT })
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'voiceover generation failed' }, { status: 500 })
  }

  return NextResponse.json({
    audio_url: result.audioUrl,
    storage_path: result.storagePath,
    voice_id: result.voiceId,
    model_id: result.modelId,
    bytes: result.byteLength,
    script: SAMPLE_SCRIPT,
  })
}
