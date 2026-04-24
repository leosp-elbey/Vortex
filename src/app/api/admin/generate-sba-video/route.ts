import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const HEYGEN_API = 'https://api.heygen.com'

const SBA_SCRIPT = `Hey, I'm so glad you're here — because what I'm about to share with you could completely change the way you think about earning extra income.

I want to tell you about something called the VortexTrips Smart Business Affiliate program.

Here's the thing most people don't know — they're paying full retail price for hotels, resorts, and vacations. But VortexTrips members get access to the same wholesale rates that travel agents use. We're talking 40 to 60 percent off over 500,000 hotels worldwide.

Now here's where it gets exciting for you.

When you become a VortexTrips affiliate, you get a personal booking link. Every time someone signs up through your link — you earn a commission. It's that simple.

You're not selling anything nobody wants. Everyone travels. You're just showing them where to stop overpaying.

Part-time affiliates are earning 400 to 1,200 dollars every month. Full-time team builders are clearing over 10,000 dollars a month — and every single one of them started exactly where you are right now.

When you join, you get your own branded booking portal, a full AI follow-up system that contacts your leads automatically, social media content ready to post, and weekly commission payments directly to you.

No monthly fees. No inventory. No chasing people.

If you're ready to start earning by sharing something people genuinely love — travel — fill out the short form right below this video.

We'll send your welcome kit with your affiliate links and everything you need to get started within minutes.

I'll see you on the inside.`

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
          speed: 0.95,
          emotion: 'Friendly',
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
