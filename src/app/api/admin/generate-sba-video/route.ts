import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const HEYGEN_API = 'https://api.heygen.com'

const SBA_SCRIPT = `Hey, I'm with VortexTrips — and this could change how you earn online.

Members save up to 60 percent on hotels and vacations. And we pay you to share the savings.

You get a personal booking link. When someone signs up, you earn. Simple.

Part-time affiliates pull 400 to one thousand two hundred dollars a month. Full-time team builders clear over ten thousand a month.

Hit the link below this video. Your welcome kit lands in minutes.`

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: adminUser } = await supabase.from('admin_users').select('id').eq('id', user.id).single()
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.HEYGEN_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: process.env.HEYGEN_AVATAR_ID!,
          avatar_style: 'normal',
        },
        voice: {
          type: 'text',
          input_text: SBA_SCRIPT,
          voice_id: process.env.HEYGEN_VOICE_ID!,
          speed: 1.05,
          emotion: 'Excited',
        },
      }],
      dimension: { width: 1280, height: 720 },
    }),
  })

  const data = await res.json()
  if (!res.ok || !data?.data?.video_id) {
    return NextResponse.json({ error: data?.message ?? 'HeyGen generation failed' }, { status: 500 })
  }

  const video_id = data.data.video_id

  const admin = createAdminClient()
  await admin.from('site_settings').upsert(
    { key: 'sba_video_id', value: video_id, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  await admin.from('site_settings').upsert(
    { key: 'sba_video_url', value: null, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )

  return NextResponse.json({ video_id })
}
