import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_settings')
    .select('value')
    .eq('key', 'sba_video_url')
    .single()

  return NextResponse.json({ video_url: data?.value ?? null })
}
