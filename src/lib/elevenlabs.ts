// Phase 21A — ElevenLabs Text-to-Speech wrapper for the cinematic YouTube
// video pipeline. Generates an MP3 voiceover from a script + voice id, then
// re-hosts it in Supabase Storage under `audio/vo/<uuid>.mp3` so downstream
// steps (Kling render, YouTube upload) can reference a durable URL.
//
// HTTP-only — matches the house style for AI providers (see
// src/lib/media-providers.ts for Pexels / OpenAI). No SDK dependency.
//
// API reference:
//   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
//   Headers: xi-api-key, Content-Type: application/json, accept: audio/mpeg
//   Body: { text, model_id, voice_settings }
//   Response: audio/mpeg binary on success; JSON error envelope on failure.

import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'node:crypto'

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2'
const STORAGE_BUCKET = 'media'
const STORAGE_PATH_PREFIX = 'audio/vo/'

export interface ElevenLabsVoiceSettings {
  stability?: number
  similarity_boost?: number
  style?: number
  use_speaker_boost?: boolean
}

export interface GenerateVoiceoverOptions {
  /** Script text to narrate. Required. */
  script: string
  /** ElevenLabs voice id. Defaults to ELEVENLABS_VOICE_ID env. */
  voiceId?: string
  /** ElevenLabs model id. Defaults to eleven_multilingual_v2. */
  modelId?: string
  /** Optional voice fine-tuning passed straight to the API. */
  voiceSettings?: ElevenLabsVoiceSettings
}

export interface GenerateVoiceoverResult {
  success: boolean
  /** Public URL of the uploaded MP3 in Supabase Storage. */
  audioUrl?: string
  /** Object path inside the `media` bucket (audio/vo/<id>.mp3). */
  storagePath?: string
  /** ElevenLabs voice id used. */
  voiceId?: string
  /** ElevenLabs model id used. */
  modelId?: string
  /** Audio size in bytes. */
  byteLength?: number
  /** Normalized error message when success=false. */
  error?: string
}

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

/**
 * Returns true when both ELEVENLABS_API_KEY and a usable voice id are
 * configured (either via the override arg or ELEVENLABS_VOICE_ID env).
 * Defensive — never throws. Used by callers before attempting a generation
 * so a missing key surfaces as a clear refusal instead of a 401.
 */
export function isElevenLabsConfigured(voiceIdOverride?: string): boolean {
  const apiKey = envTrim('ELEVENLABS_API_KEY')
  const voiceId = (voiceIdOverride ?? envTrim('ELEVENLABS_VOICE_ID')).trim()
  return apiKey.length > 0 && voiceId.length > 0
}

/**
 * Generate a voiceover MP3 from a script, upload it to Supabase Storage,
 * and return the public URL. Caller is responsible for persisting the URL
 * into content_calendar.elevenlabs_audio_url — this function does no DB
 * writes besides the storage upload itself.
 *
 * Synchronous from the caller's perspective: a successful return has
 * `audioUrl` set immediately. ElevenLabs's TTS endpoint typically responds
 * in 2–6 seconds for a 10-second script, comfortably under Vercel Pro's
 * 60s function ceiling.
 */
export async function generateVoiceover(opts: GenerateVoiceoverOptions): Promise<GenerateVoiceoverResult> {
  const apiKey = envTrim('ELEVENLABS_API_KEY')
  const voiceId = (opts.voiceId ?? envTrim('ELEVENLABS_VOICE_ID')).trim()
  const modelId = (opts.modelId ?? DEFAULT_MODEL_ID).trim()
  const script = opts.script?.trim() ?? ''

  if (!apiKey) return { success: false, error: 'ELEVENLABS_API_KEY not set' }
  if (!voiceId) return { success: false, error: 'voiceId not provided (and ELEVENLABS_VOICE_ID not set)' }
  if (!script) return { success: false, error: 'script is required' }

  // 1. Call ElevenLabs Text-to-Speech.
  let audioBuffer: ArrayBuffer
  try {
    const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: script,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          ...(opts.voiceSettings ?? {}),
        },
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => `HTTP ${res.status}`)
      return { success: false, error: `ElevenLabs TTS failed: ${detail.slice(0, 300)}` }
    }
    audioBuffer = await res.arrayBuffer()
    if (audioBuffer.byteLength === 0) {
      return { success: false, error: 'ElevenLabs returned an empty audio body' }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'ElevenLabs fetch threw' }
  }

  // 2. Upload to Supabase Storage at audio/vo/<uuid>.mp3.
  const storagePath = `${STORAGE_PATH_PREFIX}${randomUUID()}.mp3`
  try {
    const supabase = createAdminClient()
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      })
    if (upErr) return { success: false, error: `Supabase storage upload failed: ${upErr.message}` }

    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
    if (!pub?.publicUrl) return { success: false, error: 'Supabase returned no public URL' }

    return {
      success: true,
      audioUrl: pub.publicUrl,
      storagePath,
      voiceId,
      modelId,
      byteLength: audioBuffer.byteLength,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Supabase upload threw' }
  }
}
