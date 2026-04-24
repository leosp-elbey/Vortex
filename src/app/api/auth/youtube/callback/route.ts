import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/videos?yt_error=access_denied`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/youtube/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()
  if (!tokens.refresh_token) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/videos?yt_error=no_refresh_token`)
  }

  const admin = createAdminClient()
  await admin.from('site_settings').upsert(
    { key: 'youtube_refresh_token', value: tokens.refresh_token, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  await admin.from('site_settings').upsert(
    { key: 'youtube_access_token', value: tokens.access_token, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/videos?yt_connected=1`)
}
