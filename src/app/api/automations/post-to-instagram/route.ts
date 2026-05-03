import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateManualPostingGate } from '@/lib/posting-gate'

const IG_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
const IG_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const GRAPH_API = 'https://graph.facebook.com/v25.0'

async function createMediaContainer(caption: string, imageUrl?: string): Promise<string> {
  if (!imageUrl) throw new Error('Instagram requires an image — no image_url found on this post')

  const res = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: IG_ACCESS_TOKEN!,
      caption,
      image_url: imageUrl,
      media_type: 'IMAGE',
    }),
  })

  const data = await res.json()
  if (!res.ok || data.error) {
    console.error('[IG] createMediaContainer failed', { status: res.status, response: data, imageUrl })
    throw new Error(`Container creation failed: ${data.error?.message ?? 'unknown'} (code: ${data.error?.code ?? 'n/a'}, subcode: ${data.error?.error_subcode ?? 'n/a'})`)
  }
  if (!data.id) {
    console.error('[IG] createMediaContainer returned no id', data)
    throw new Error('Container creation returned no ID')
  }

  console.log('[IG] container created', { id: data.id, imageUrl })
  return data.id
}

async function waitForContainerReady(containerId: string): Promise<void> {
  // Meta needs time to fetch image_url and process the container before it's publishable.
  // Poll up to 6 times at 1s intervals (max 6s wait) — keeps us under Vercel Hobby's 10s function limit.
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1000))

    const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${IG_ACCESS_TOKEN}`)
    const data = await res.json()

    if (data.error) {
      console.error('[IG] container status check error', data)
      throw new Error(`Status check failed: ${data.error.message}`)
    }

    console.log(`[IG] container status check ${i + 1}/6:`, { status_code: data.status_code, status: data.status })

    if (data.status_code === 'FINISHED') return
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
      throw new Error(`Container failed processing: ${data.status_code} — ${data.status ?? 'no detail'}. Likely cause: Meta could not fetch the image URL.`)
    }
  }

  throw new Error('Container still IN_PROGRESS after 6 seconds. Image may be too large or the URL is slow/unreachable.')
}

async function publishContainer(creationId: string): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: IG_ACCESS_TOKEN }),
  })

  const data = await res.json()
  if (!res.ok || data.error) {
    console.error('[IG] publishContainer failed', { status: res.status, response: data, creationId })
    throw new Error(`Publish failed: ${data.error?.message ?? 'unknown'} (code: ${data.error?.code ?? 'n/a'}, subcode: ${data.error?.error_subcode ?? 'n/a'})`)
  }
  if (!data.id) {
    console.error('[IG] publishContainer returned no id', data)
    throw new Error('Publish returned no post ID')
  }

  console.log('[IG] published successfully', { ig_post_id: data.id })
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

  // Phase 14K.0.5 — manual-posting gate. Must pass BEFORE any platform call
  // or status mutation. Subsumes the legacy `status === 'approved'` check.
  const gate = validateManualPostingGate(post, { supportedPlatforms: ['instagram'] })
  if (!gate.allowed) {
    return NextResponse.json(
      { success: false, blocked_by_gate: true, reasons: gate.reasons },
      { status: 403 },
    )
  }

  try {
    const hashtags = post.hashtags?.map((h: string) => `#${h}`).join(' ') ?? ''
    const caption = `${post.caption}\n\n${hashtags}`.trim()

    const containerId = await createMediaContainer(caption, post.image_url ?? undefined)
    await waitForContainerReady(containerId)
    const igPostId = await publishContainer(containerId)

    await admin.from('content_calendar').update({
      status: 'posted',
      posted_at: new Date().toISOString(),
    }).eq('id', content_id)

    return NextResponse.json({ success: true, ig_post_id: igPostId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Instagram API error'
    console.error('[IG] post-to-instagram error', { content_id, image_url: post.image_url, error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
