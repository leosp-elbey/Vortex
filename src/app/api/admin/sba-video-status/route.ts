import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const video_id = request.nextUrl.searchParams.get('video_id')
  if (!video_id) return NextResponse.json({ error: 'video_id required' }, { status: 400 })

  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${video_id}`, {
    headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY! },
  })

  const data = await res.json()
  const status = data?.data?.status
  const video_url = data?.data?.video_url ?? null
  const thumbnail_url = data?.data?.thumbnail_url ?? null

  if (status === 'completed' && video_url) {
    const admin = createAdminClient()
    await admin.from('site_settings').upsert(
      { key: 'sba_video_url', value: video_url, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
    await admin.from('site_settings').upsert(
      { key: 'sba_video_thumbnail', value: thumbnail_url, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
  }

  return NextResponse.json({ status, video_url, thumbnail_url })
}
