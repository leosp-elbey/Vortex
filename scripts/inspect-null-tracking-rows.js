#!/usr/bin/env node
// Phase 14L.1 — one-shot read-only inspection of unposted rows whose caption
// references the legacy host but tracking_url is NULL. Establishes ground
// truth before designing the backfill (delete after Phase 14L.1 lands).

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
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[t.slice(0, eq).trim()] = v
  }
  return out
}

async function main() {
  const env = loadEnv()
  const { createClient } = require('@supabase/supabase-js')
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const { data: rows, error } = await sb
    .from('content_calendar')
    .select('id, week_of, platform, status, caption, tracking_url, campaign_asset_id, image_prompt, posted_at, created_at')
    .ilike('caption', '%myvortex365.com/leosp%')
    .is('tracking_url', null)
    .not('status', 'in', '(posted,rejected,archived)')
    .is('posted_at', null)
    .order('created_at', { ascending: false })

  if (error) { console.error(error); process.exit(2) }
  console.log(`Found ${rows.length} unposted rows with legacy link + tracking_url IS NULL:\n`)
  for (const r of rows) {
    console.log(`---`)
    console.log(`id:                ${r.id}`)
    console.log(`platform:          ${r.platform}`)
    console.log(`status:            ${r.status}`)
    console.log(`week_of:           ${r.week_of}`)
    console.log(`created_at:        ${r.created_at}`)
    console.log(`campaign_asset_id: ${r.campaign_asset_id ?? '(null — organic row)'}`)
    console.log(`image_prompt:      ${r.image_prompt ? r.image_prompt.slice(0, 80) + (r.image_prompt.length > 80 ? '…' : '') : '(null)'}`)
    const captionSnippet = (r.caption ?? '').slice(0, 200).replace(/\s+/g, ' ')
    console.log(`caption (200ch):   ${captionSnippet}${(r.caption ?? '').length > 200 ? '…' : ''}`)
  }
  console.log()

  // For campaign-originated rows, follow the FK chain to see what we can recover.
  const campaignRows = rows.filter(r => r.campaign_asset_id)
  if (campaignRows.length > 0) {
    console.log(`\n${campaignRows.length} are campaign-originated. Inspecting linked assets…\n`)
    const ids = campaignRows.map(r => r.campaign_asset_id)
    const { data: assets, error: aErr } = await sb
      .from('campaign_assets')
      .select('id, campaign_id, platform, wave, asset_type, tracking_url, image_url, video_url')
      .in('id', ids)
    if (aErr) { console.error(aErr); process.exit(3) }
    const byId = Object.fromEntries((assets ?? []).map(a => [a.id, a]))
    for (const r of campaignRows) {
      const a = byId[r.campaign_asset_id]
      console.log(`row ${r.id} -> asset ${r.campaign_asset_id}: ${a ? `campaign=${a.campaign_id} wave=${a.wave} platform=${a.platform} asset_tracking_url=${a.tracking_url ?? 'null'} image_url=${a.image_url ?? 'null'} video_url=${a.video_url ?? 'null'}` : '(asset missing)'}`)
    }

    // Resolve campaigns
    const campaignIds = [...new Set((assets ?? []).map(a => a.campaign_id).filter(Boolean))]
    if (campaignIds.length > 0) {
      const { data: campaigns } = await sb
        .from('event_campaigns')
        .select('id, event_name, event_year, event_slug, cta_url')
        .in('id', campaignIds)
      console.log(`\nCampaigns referenced:`)
      for (const c of campaigns ?? []) {
        console.log(`  ${c.id}: event_name=${c.event_name} year=${c.event_year} slug=${c.event_slug ?? '(null)'} cta_url=${c.cta_url ?? '(null)'}`)
      }
    }
  }

  const organic = rows.filter(r => !r.campaign_asset_id)
  if (organic.length > 0) {
    console.log(`\n${organic.length} are ORGANIC (no campaign_asset_id) — cannot derive a campaign tracking_url for these.`)
  }
}

main().catch(e => { console.error(e); process.exit(99) })
