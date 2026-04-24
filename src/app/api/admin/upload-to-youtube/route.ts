import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getFreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to refresh YouTube access token')
  return data.access_token
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminUser } = await supabase.from('admin_users').select('id').eq('id', user.id).single()
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { video_url, title, description, tags } = await request.json()
  if (!video_url) return NextResponse.json({ error: 'video_url required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: tokenRow } = await admin
    .from('site_settings')
    .select('value')
    .eq('key', 'youtube_refresh_token')
    .single()

  if (!tokenRow?.value) {
    return NextResponse.json({ error: 'YouTube not connected — authorize first' }, { status: 503 })
  }

  const accessToken = await getFreshAccessToken(tokenRow.value)

  // Initiate resumable upload session
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify({
        snippet: {
          title: title ?? 'Get Paid to Share Travel Deals | VortexTrips Opportunity',
          description: description ?? `Want to earn money while other people go on vacation?\n\nVortexTrips affiliates earn commissions sharing wholesale travel deals — 40-60% off 500,000+ hotels worldwide.\n\nLearn more: https://www.vortextrips.com/sba`,
          tags: tags ?? ['travel affiliate', 'make money online', 'travel deals', 'vortextrips', 'work from home'],
          categoryId: '22',
          defaultLanguage: 'en',
        },
        status: { privacyStatus: 'public' },
      }),
    }
  )

  const uploadUrl = initRes.headers.get('Location')
  if (!uploadUrl) {
    const err = await initRes.text()
    return NextResponse.json({ error: `YouTube session init failed: ${err}` }, { status: 500 })
  }

  // Stream video from source URL directly to YouTube
  const videoRes = await fetch(video_url)
  if (!videoRes.ok || !videoRes.body) {
    return NextResponse.json({ error: 'Failed to fetch video from source' }, { status: 500 })
  }

  const contentLength = videoRes.headers.get('content-length')
  const uploadHeaders: Record<string, string> = { 'Content-Type': 'video/mp4' }
  if (contentLength) uploadHeaders['Content-Length'] = contentLength

  const ytRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: uploadHeaders,
    body: videoRes.body,
    // @ts-ignore — required for streaming body in Node
    duplex: 'half',
  })

  const ytData = await ytRes.json()
  if (!ytRes.ok || !ytData.id) {
    return NextResponse.json({ error: ytData?.error?.message ?? 'YouTube upload failed' }, { status: 500 })
  }

  const youtubeVideoId = ytData.id
  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`

  await admin.from('site_settings').upsert(
    { key: 'sba_youtube_url', value: youtubeUrl, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )

  return NextResponse.json({ success: true, youtube_url: youtubeUrl, video_id: youtubeVideoId })
}
