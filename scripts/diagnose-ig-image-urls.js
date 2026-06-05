#!/usr/bin/env node
// Phase 20.2 diagnostic — read-only inspection of Instagram image URLs in the queue.
// No writes. Purpose: confirm whether image_urls are raw Supabase Storage URLs
// (which Meta's crawler can't fetch) vs. proxied through vortextrips.com.

const fs = require('fs')
const path = require('path')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  const text = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

async function main() {
  const env = loadEnv()
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  console.log('=== A. Queued Instagram rows (approved, not yet posted) ===')
  const { data: igRows, error: igErr } = await supabase
    .from('content_calendar')
    .select('id, platform, image_url, media_status, media_error, posting_status, status, campaign_asset_id, posted_at, created_at')
    .eq('platform', 'instagram')
    .eq('status', 'approved')
    .is('posted_at', null)
    .order('created_at', { ascending: false })
    .limit(10)
  if (igErr) {
    console.error('query failed:', igErr.message)
    process.exit(1)
  }
  for (const r of igRows ?? []) {
    console.log()
    console.log(`id: ${r.id}`)
    console.log(`  image_url      : ${r.image_url ?? '(null)'}`)
    console.log(`  campaign_asset : ${r.campaign_asset_id ?? '(null)'}`)
    console.log(`  media_status   : ${r.media_status ?? '(null)'}`)
    console.log(`  media_error    : ${r.media_error ?? '(null)'}`)
    console.log(`  posting_status : ${r.posting_status ?? '(null)'}`)
    console.log(`  status         : ${r.status}`)
  }

  console.log()
  console.log('=== B. Campaign-asset image_urls for the above rows (joined) ===')
  const assetIds = (igRows ?? []).map(r => r.campaign_asset_id).filter(Boolean)
  if (assetIds.length > 0) {
    const { data: assets } = await supabase
      .from('campaign_assets')
      .select('id, image_url, video_url, asset_type')
      .in('id', assetIds)
    for (const a of assets ?? []) {
      console.log()
      console.log(`asset_id: ${a.id}`)
      console.log(`  image_url : ${a.image_url ?? '(null)'}`)
      console.log(`  video_url : ${a.video_url ?? '(null)'}`)
      console.log(`  asset_type: ${a.asset_type ?? '(null)'}`)
    }
  } else {
    console.log('(no campaign-asset-linked rows in the queue)')
  }

  console.log()
  console.log('=== C. Most recent Instagram rows with media_error (any status) ===')
  const { data: errRows } = await supabase
    .from('content_calendar')
    .select('id, status, posting_status, media_status, media_error, image_url, posted_at')
    .eq('platform', 'instagram')
    .not('media_error', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5)
  for (const r of errRows ?? []) {
    console.log()
    console.log(`id: ${r.id}`)
    console.log(`  status         : ${r.status}`)
    console.log(`  posting_status : ${r.posting_status}`)
    console.log(`  media_status   : ${r.media_status}`)
    console.log(`  media_error    : ${r.media_error}`)
    console.log(`  image_url      : ${r.image_url ?? '(null)'}`)
    console.log(`  posted_at      : ${r.posted_at ?? '(null)'}`)
  }

  console.log()
  console.log('=== D. Look for the Santorini row (caption LIKE %Santorini%) ===')
  const { data: santRows } = await supabase
    .from('content_calendar')
    .select('id, platform, status, posting_status, media_status, media_error, image_url, posted_at, caption, campaign_asset_id, created_at')
    .ilike('caption', '%santorini%')
    .order('created_at', { ascending: false })
    .limit(5)
  for (const r of santRows ?? []) {
    console.log()
    console.log(`id: ${r.id}`)
    console.log(`  platform       : ${r.platform}`)
    console.log(`  status         : ${r.status}`)
    console.log(`  posting_status : ${r.posting_status}`)
    console.log(`  media_status   : ${r.media_status}`)
    console.log(`  media_error    : ${r.media_error}`)
    console.log(`  image_url      : ${r.image_url ?? '(null)'}`)
    console.log(`  campaign_asset : ${r.campaign_asset_id ?? '(null)'}`)
    console.log(`  posted_at      : ${r.posted_at ?? '(null)'}`)
    console.log(`  caption (80c)  : ${(r.caption ?? '').slice(0, 80)}`)
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(99)
})
