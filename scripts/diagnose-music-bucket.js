#!/usr/bin/env node
// Phase 21C diagnostic — list any pre-existing audio in Supabase Storage.
// Read-only. Single-purpose: tell us whether we already have royalty-free
// music seeded before we wire FFmpeg assembly.

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

  for (const prefix of ['music', 'audio/music', 'audio', 'audio/vo']) {
    const { data, error } = await supabase.storage.from('media').list(prefix, { limit: 50 })
    console.log()
    console.log(`prefix: ${prefix}`)
    if (error) {
      console.log(`  error: ${error.message}`)
      continue
    }
    if (!data || data.length === 0) {
      console.log('  (empty)')
      continue
    }
    for (const o of data) {
      console.log(`  ${o.name} (${o.metadata?.size ?? '?'} bytes)`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(99)
})
