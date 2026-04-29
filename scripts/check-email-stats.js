#!/usr/bin/env node
/**
 * Email health check — reads RESEND_API_KEY from .env.local, fetches recent
 * email send stats from Resend, computes delivery / bounce / complaint rates,
 * and prints a clear go/throttle/panic verdict.
 *
 * Run from project root:
 *   node scripts/check-email-stats.js
 *
 * Requires Node 18+ for native fetch (Next.js 16 already requires this).
 */

const fs = require('fs')
const path = require('path')

const LOOKBACK_HOURS = 36

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error(`${COLORS.red}.env.local not found in ${process.cwd()}${COLORS.reset}`)
    console.error('Run this from your project root (where package.json lives).')
    process.exit(1)
  }
  const text = fs.readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    env[m[1]] = v
  }
  return env
}

async function fetchEmailsPage(apiKey, after) {
  const url = new URL('https://api.resend.com/emails')
  url.searchParams.set('limit', '100')
  if (after) url.searchParams.set('after', after)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend API ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

async function fetchAllEmails(apiKey, sinceISO) {
  const all = []
  let after = null
  for (let page = 0; page < 12; page++) {
    let data
    try {
      data = await fetchEmailsPage(apiKey, after)
    } catch (err) {
      if (page === 0) throw err
      console.error(`${COLORS.yellow}(pagination stopped at page ${page}: ${err.message})${COLORS.reset}`)
      break
    }
    const items = Array.isArray(data?.data) ? data.data : []
    all.push(...items)
    if (items.length < 100) break
    const oldest = items[items.length - 1]
    if (!oldest) break
    if (oldest.created_at && oldest.created_at < sinceISO) break
    after = oldest.id
    if (!after) break
  }
  return all
}

function bucketStatus(lastEvent) {
  switch (lastEvent) {
    case 'delivered':
    case 'opened':
    case 'clicked':
      return 'delivered'
    case 'bounced':
      return 'bounced'
    case 'complained':
      return 'complained'
    case 'send_failed':
    case 'undelivered':
    case 'dropped':
      return 'failed'
    case 'sent':
    case 'queued':
    case 'scheduled':
    case 'delivery_delayed':
      return 'in_flight'
    default:
      return 'other'
  }
}

;(async () => {
  const env = loadEnvLocal()
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    console.error(`${COLORS.red}RESEND_API_KEY not found in .env.local${COLORS.reset}`)
    process.exit(1)
  }

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000)
  const sinceISO = since.toISOString()
  console.log(`${COLORS.dim}Fetching emails since ${sinceISO} ...${COLORS.reset}`)

  const emails = await fetchAllEmails(apiKey, sinceISO)
  const inWindow = emails.filter(e => e.created_at && e.created_at >= sinceISO)

  if (inWindow.length === 0) {
    console.log(`\n${COLORS.yellow}No emails found in the last ${LOOKBACK_HOURS} hours.${COLORS.reset}`)
    console.log('The Day 0 batch may not have fired yet — the daily send-sequences cron runs at 10am UTC.')
    console.log('Try again after the next 10am UTC.')
    return
  }

  const counts = { delivered: 0, bounced: 0, complained: 0, failed: 0, in_flight: 0, other: 0 }
  const rawCounts = {}
  for (const e of inWindow) {
    const bucket = bucketStatus(e.last_event)
    counts[bucket]++
    rawCounts[e.last_event || 'unknown'] = (rawCounts[e.last_event || 'unknown'] || 0) + 1
  }

  const total = inWindow.length
  const finalized = total - counts.in_flight
  const denom = finalized > 0 ? finalized : total
  const deliveryRate = (counts.delivered / denom) * 100
  const bounceRate = (counts.bounced / denom) * 100
  const complaintRate = (counts.complained / denom) * 100

  let verdictColor, verdictLabel, action
  if (deliveryRate < 95 || bounceRate > 5 || complaintRate > 0.3) {
    verdictColor = COLORS.red
    verdictLabel = 'RED — STOP and throttle'
    action =
      'Pause the daily send-sequences cron (rename or disable in vercel.json), clean the bounce list, then resume with hourly batches of 50.'
  } else if (deliveryRate < 98 || bounceRate >= 2 || complaintRate >= 0.1) {
    verdictColor = COLORS.yellow
    verdictLabel = 'YELLOW — borderline, watch closely'
    action = 'Continue today but check again in 12 hours. If numbers worsen, throttle.'
  } else {
    verdictColor = COLORS.green
    verdictLabel = 'GREEN — healthy delivery'
    action = 'No action needed. Continue with the email sequence as planned.'
  }

  const pad = (s, n) => String(s).padEnd(n)
  console.log()
  console.log('═══════════════════════════════════════════════════════')
  console.log(`${COLORS.bold} VortexTrips Email Health Report${COLORS.reset}`)
  console.log('═══════════════════════════════════════════════════════')
  console.log(` Window:        last ${LOOKBACK_HOURS} hours`)
  console.log(` Total fetched: ${total}`)
  console.log(` Finalized:     ${finalized} (${counts.in_flight} still in flight)`)
  console.log()
  console.log(` ${pad('Delivered', 14)} ${counts.delivered.toString().padStart(5)}  (${deliveryRate.toFixed(1)}%)`)
  console.log(` ${pad('Bounced', 14)} ${counts.bounced.toString().padStart(5)}  (${bounceRate.toFixed(1)}%)`)
  console.log(` ${pad('Complaints', 14)} ${counts.complained.toString().padStart(5)}  (${complaintRate.toFixed(2)}%)`)
  console.log(` ${pad('Failed', 14)} ${counts.failed.toString().padStart(5)}`)
  console.log(` ${pad('In flight', 14)} ${counts.in_flight.toString().padStart(5)}  (queued/sent, no final status yet)`)
  console.log()
  console.log(`${COLORS.dim} Raw status breakdown:${COLORS.reset}`)
  for (const [k, v] of Object.entries(rawCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${pad(k, 22)} ${v}`)
  }
  console.log()
  console.log(`${verdictColor}${COLORS.bold} ${verdictLabel}${COLORS.reset}`)
  console.log(` ${COLORS.bold}Action:${COLORS.reset} ${action}`)
  console.log('═══════════════════════════════════════════════════════')
})().catch(err => {
  console.error(`${COLORS.red}Script failed:${COLORS.reset} ${err.message}`)
  process.exit(1)
})
