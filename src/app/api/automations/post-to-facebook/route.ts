import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PAGE_ID = process.env.FACEBOOK_PAGE_ID
const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
const GRAPH_API = 'https://graph.facebook.com/v25.0'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!PAGE_ID || !PAGE_TOKEN) {
    return NextResponse.json({ error: 'Facebook Page credentials not configured' }, { status: 503 })
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
  if (post.platform !== 'facebook') return NextResponse.json({ error: 'This endpoint is for Facebook posts only' }, { status: 400 })

  try {
    const hashtags = post.hashtags?.map((h: string) => `#${h}`).join(' ') ?? ''
    const message = `${post.caption}\n\n${hashtags}`.trim()

    let fbPostId: string

    if (post.image_url) {
      // Try photo post; fall back to text-only if image URL is inaccessible
      const photoRes = await fetch(`${GRAPH_API}/${PAGE_ID}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: post.image_url, caption: message, access_token: PAGE_TOKEN }),
      })
      const photoData = await photoRes.json()
      if (!photoRes.ok || photoData.error) {
        // Fall back to text-only
        const feedRes = await fetch(`${GRAPH_API}/${PAGE_ID}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, access_token: PAGE_TOKEN }),
        })
        const feedData = await feedRes.json()
        if (!feedRes.ok || feedData.error) throw new Error(feedData.error?.message ?? 'Facebook feed post failed')
        fbPostId = feedData.id
      } else {
        fbPostId = photoData.id
      }
    } else {
      // Text-only post
      const res = await fetch(`${GRAPH_API}/${PAGE_ID}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, access_token: PAGE_TOKEN }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error?.message ?? 'Facebook feed post failed')
      fbPostId = data.id
    }

    await admin.from('content_calendar').update({
      status: 'posted',
      posted_at: new Date().toISOString(),
    }).eq('id', content_id)

    return NextResponse.json({ success: true, fb_post_id: fbPostId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Facebook API error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
