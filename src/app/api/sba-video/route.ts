import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_KEYS = ['sba_video_url', 'sba_youtube_url', 'youtube_refresh_token']

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') ?? 'sba_video_url'
  if (!ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ video_url: null })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .single()

  // For refresh token, only return whether it exists (not the value)
  if (key === 'youtube_refresh_token') {
    return NextResponse.json({ video_url: data?.value ? 'connected' : null })
  }

  return NextResponse.json({ video_url: data?.value ?? null })
}
