// Cron safety net: poll HeyGen for any pending video_id and update site_settings.sba_video_url
// when render completes. This catches videos whose admin closed the dashboard before manual
// polling finished. Runs once daily on Hobby plan — see vercel.json.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const HEYGEN_STATUS = 'https://api.heygen.com/v1/video_status.get'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const [idRes, urlRes] = await Promise.all([
    admin.from('site_settings').select('value').eq('key', 'sba_video_id').maybeSingle(),
    admin.from('site_settings').select('value').eq('key', 'sba_video_url').maybeSingle(),
  ])

  const videoId = (idRes.data?.value ?? null) as string | null
  const currentUrl = (urlRes.data?.value ?? null) as string | null

  if (!videoId) return NextResponse.json({ ok: true, status: 'no pending video' })
  if (currentUrl) return NextResponse.json({ ok: true, status: 'already completed' })

  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json({ error: 'HEYGEN_API_KEY not configured' }, { status: 500 })
  }

  const res = await fetch(`${HEYGEN_STATUS}?video_id=${encodeURIComponent(videoId)}`, {
    headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY },
  })
  const data = await res.json()

  if (!res.ok) {
    console.error('[heygen-check] status request failed', { status: res.status, body: data })
    return NextResponse.json({ error: data?.message ?? 'HeyGen status request failed' }, { status: 502 })
  }

  const status = data?.data?.status
  const videoUrl = data?.data?.video_url ?? null
  const thumbnailUrl = data?.data?.thumbnail_url ?? null

  if (status === 'completed' && videoUrl) {
    await admin.from('site_settings').upsert(
      { key: 'sba_video_url', value: videoUrl, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    if (thumbnailUrl) {
      await admin.from('site_settings').upsert(
        { key: 'sba_video_thumbnail', value: thumbnailUrl, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    }
    console.log('[heygen-check] video completed', { videoId, videoUrl })
    return NextResponse.json({ ok: true, status: 'completed', url: videoUrl })
  }

  if (status === 'failed') {
    console.error('[heygen-check] video failed at HeyGen', { videoId, data })
    return NextResponse.json({ ok: true, status: 'failed', error: data?.data?.error ?? null })
  }

  // Still processing — nothing to do
  return NextResponse.json({ ok: true, status, video_id: videoId })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
