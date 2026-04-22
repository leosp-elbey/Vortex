import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const IG_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
const IG_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const GRAPH_API = 'https://graph.facebook.com/v19.0'

async function createMediaContainer(caption: string, imageUrl?: string): Promise<string> {
  const params: Record<string, string> = {
    access_token: IG_ACCESS_TOKEN!,
    caption,
  }

  if (imageUrl) {
    params.image_url = imageUrl
    params.media_type = 'IMAGE'
  } else {
    // Text-only not supported — use a branded default image
    params.image_url = `${process.env.NEXT_PUBLIC_APP_URL}/og`
    params.media_type = 'IMAGE'
  }

  const res = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message ?? 'Failed to create media container')
  return data.id
}

async function publishContainer(creationId: string): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: IG_ACCESS_TOKEN }),
  })

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message ?? 'Failed to publish media')
  return data.id
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!IG_ACCOUNT_ID || !IG_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Instagram credentials not configured' }, { status: 503 })
  }

  const { content_id } = await request.json()
  if (!content_id) return NextResponse.json({ error: 'content_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: post, error: fetchErr } = await admin
    .from('content_calendar')
    .select('*')
    .eq('id', content_id)
    .single()

  if (fetchErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.status !== 'approved') return NextResponse.json({ error: 'Post must be approved before publishing' }, { status: 400 })
  if (post.platform !== 'instagram') return NextResponse.json({ error: 'This endpoint is for Instagram posts only' }, { status: 400 })

  try {
    const hashtags = post.hashtags?.map((h: string) => `#${h}`).join(' ') ?? ''
    const caption = `${post.caption}\n\n${hashtags}`.trim()

    const containerId = await createMediaContainer(caption, post.image_url ?? undefined)
    const igPostId = await publishContainer(containerId)

    await admin.from('content_calendar').update({
      status: 'posted',
      posted_at: new Date().toISOString(),
    }).eq('id', content_id)

    return NextResponse.json({ success: true, ig_post_id: igPostId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Instagram API error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
