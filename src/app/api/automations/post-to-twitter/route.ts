import { NextRequest, NextResponse } from 'next/server'
import { TwitterApi } from 'twitter-api-v2'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TWITTER_MAX_LENGTH = 280

function envTrim(key: string): string {
  return (process.env[key] ?? '').trim()
}

function buildTweetText(caption: string, hashtags: string[] | null): string {
  const tags = (hashtags ?? []).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')
  const full = tags ? `${caption}\n\n${tags}` : caption
  if (full.length <= TWITTER_MAX_LENGTH) return full

  const ellipsis = '...'
  const room = TWITTER_MAX_LENGTH - ellipsis.length
  const captionRoom = tags ? room - tags.length - 2 : room
  if (captionRoom <= 20) return full.slice(0, TWITTER_MAX_LENGTH - 1) + '…'
  const trimmedCaption = caption.slice(0, captionRoom).trimEnd() + ellipsis
  return tags ? `${trimmedCaption}\n\n${tags}` : trimmedCaption
}

async function uploadImage(client: TwitterApi, imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl)
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const mimeType = contentType.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
    const mediaId = await client.v1.uploadMedia(buffer, { mimeType })
    return mediaId
  } catch (err) {
    console.error('[twitter] media upload failed, falling back to text-only:', err)
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = envTrim('TWITTER_API_KEY')
  const apiSecret = envTrim('TWITTER_API_SECRET')
  const accessToken = envTrim('TWITTER_ACCESS_TOKEN')
  const accessSecret = envTrim('TWITTER_ACCESS_SECRET')

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return NextResponse.json({ error: 'Twitter credentials not configured' }, { status: 503 })
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
  if (post.platform !== 'twitter') return NextResponse.json({ error: 'This endpoint is for Twitter posts only' }, { status: 400 })

  try {
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken,
      accessSecret,
    })

    const text = buildTweetText(post.caption ?? '', post.hashtags ?? null)

    let mediaId: string | null = null
    if (post.image_url) {
      mediaId = await uploadImage(client, post.image_url)
    }

    const tweet = await client.v2.tweet(
      text,
      mediaId ? { media: { media_ids: [mediaId] } } : undefined,
    )

    if (!tweet.data?.id) {
      throw new Error('Twitter API returned no tweet id')
    }

    await admin.from('content_calendar').update({
      status: 'posted',
      posted_at: new Date().toISOString(),
    }).eq('id', content_id)

    return NextResponse.json({
      success: true,
      tweet_id: tweet.data.id,
      tweet_url: `https://twitter.com/i/web/status/${tweet.data.id}`,
      had_media: !!mediaId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Twitter API error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
