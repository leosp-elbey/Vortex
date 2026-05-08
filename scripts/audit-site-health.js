#!/usr/bin/env node
/**
 * Phase 14X — Public-route health audit. READ-ONLY production sweep.
 *
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │  ⚠ OPERATOR MANUAL REVIEW — DO THIS AFTER THE SCRIPT PASSES            │
 *   │                                                                        │
 *   │  This script verifies the SERVER returns the expected status code      │
 *   │  for every public-facing route. It cannot tell you whether the page    │
 *   │  *looks right* on a phone. After this script reports green:            │
 *   │                                                                        │
 *   │    1. Pull up vortextrips.com on your actual phone (not just the       │
 *   │       Chrome devtools mobile emulator) — Safari/iOS Mobile Safari      │
 *   │       and Chrome/Android both. Real devices catch issues emulators     │
 *   │       miss (touch targets, viewport quirks, font rendering).           │
 *   │    2. Walk the core funnel pages on the device:                        │
 *   │         /            → hero CTA tappable, scroll smooth                │
 *   │         /free        → redirect lands on the portal (now external)     │
 *   │         /book        → redirect lands on /traveler.html                │
 *   │         /join        → redirect lands on the SBA enrollment page       │
 *   │         /quote       → form fields don't overflow; keyboard works      │
 *   │         /quiz        → question flow advances; submit button visible   │
 *   │         /sba         → video plays; CTA below the fold reachable       │
 *   │         /thank-you   → next-steps CTAs all tappable                    │
 *   │    3. Verify all images load (no broken-image icons).                  │
 *   │    4. Verify the nav/footer links route correctly (no dead taps).      │
 *   │                                                                        │
 *   │  The script is the SAFETY NET. The human is the DESIGN EYE. Both       │
 *   │  are required before opening the floodgates.                           │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * What this script does:
 *   - HTTP GET each public route on https://www.vortextrips.com (or --base override)
 *   - Asserts each route returns its expected status code:
 *       Real pages       → 200 OK
 *       next.config.js   → 307 (redirects: /free, /book, /join configured to
 *       redirects          external portals or /traveler.html)
 *       /t/<slug>        → 302 (campaign tracking redirect; should land on
 *                            the campaign's cta_url or fallback)
 *   - Reports each route as [PASS] / [FAIL] with the actual status code,
 *     latency, and redirect target (when applicable).
 *   - Exits 0 if every route is healthy, 1 if any failed (CI-friendly).
 *
 * /t/<slug> testing strategy:
 *   - Reads .env.local for Supabase credentials (NEXT_PUBLIC_SUPABASE_URL +
 *     SUPABASE_SERVICE_ROLE_KEY).
 *   - Queries event_campaigns for any row with a non-null event_slug, prefers
 *     the most-recently-updated.
 *   - If a real slug is found → tests that. The visitor experience for a
 *     known-campaign tracking link is the actual production case worth
 *     verifying. Expects 302.
 *   - If no slug exists in the DB OR Supabase env is missing → skips the
 *     /t/ test with a yellow WARN (not a FAIL). The script still passes
 *     overall as long as the public pages are healthy. Document the skip
 *     so the operator knows /t/ wasn't tested this run.
 *
 * Per-route ?utm_source=audit&utm_medium=health_check params + a custom
 * User-Agent header let the operator filter audit traffic out of analytics
 * with a `WHERE utm_source != 'audit'` clause.
 *
 * Usage:
 *   node scripts/audit-site-health.js
 *   node scripts/audit-site-health.js --base=https://preview-deploy.vercel.app
 *   node scripts/audit-site-health.js --skip-tracking  (don't test /t/<slug>)
 *
 * Env vars: optional. Without Supabase creds the /t/ test is skipped with a
 * yellow warning; the public-page audit still runs end-to-end.
 */

const fs = require('fs')
const path = require('path')

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

const DEFAULT_BASE = 'https://www.vortextrips.com'
const USER_AGENT = 'VortexTrips-Audit-Script/14X (+https://www.vortextrips.com)'
// 15s per-request timeout. The /t/<slug> route does a Supabase lookup +
// page_view log before redirecting; on a cold function start that can push
// past Vercel Hobby's 10s function-execution budget once the cold-init
// overhead is added on top. 15s is generous enough to absorb the cold start
// without masking a genuinely broken route (a route that takes longer than
// 15s to respond IS broken from a visitor's perspective).
const PER_REQUEST_TIMEOUT_MS = 15_000

// Public-page route table — each entry declares the status the server SHOULD
// return for a healthy response. /free, /book, /join return 307 because they're
// configured as redirects in next.config.js (NOT App Router pages). Everything
// else is a real App Router page → 200. /t/<slug> is appended dynamically below
// after we look up a real campaign slug from event_campaigns.
const PAGE_ROUTES = [
  { path: '/',           expected: 200, label: 'Homepage' },
  { path: '/free',       expected: 307, label: 'Free portal redirect (→ myvortex365)' },
  { path: '/book',       expected: 307, label: 'Booking redirect (→ /traveler.html)' },
  { path: '/join',       expected: 307, label: 'SBA join redirect (→ surge365)' },
  { path: '/thank-you',  expected: 200, label: 'Generic thank-you' },
  { path: '/quote',      expected: 200, label: 'Quote form' },
  { path: '/quiz',       expected: 200, label: 'Travel quiz' },
  { path: '/sba',        expected: 200, label: 'SBA landing page' },
]

function parseArgs(argv) {
  const out = { base: DEFAULT_BASE, skipTracking: false }
  for (const a of argv) {
    if (a.startsWith('--base=')) {
      out.base = a.slice('--base='.length).replace(/\/$/, '')
    } else if (a === '--skip-tracking') {
      out.skipTracking = true
    }
  }
  return out
}

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return {}
  const text = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

/**
 * Try to find a real event_slug from event_campaigns. Returns null when:
 *   - Supabase env vars are missing (operator running outside the repo)
 *   - @supabase/supabase-js isn't installed (unlikely; package.json includes it)
 *   - no event_campaigns rows have a non-null event_slug yet
 *   - the query errors out for any reason
 *
 * In all "null" cases the audit skips the /t/ test with a yellow WARN rather
 * than failing — the public-page audit still runs end-to-end.
 */
async function findRealCampaignSlug() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { slug: null, reason: 'Supabase credentials missing from .env.local' }
  let createClient
  try {
    ;({ createClient } = require('@supabase/supabase-js'))
  } catch {
    return { slug: null, reason: '@supabase/supabase-js not installed' }
  }
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await supabase
      .from('event_campaigns')
      .select('event_slug')
      .not('event_slug', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { slug: null, reason: `query error: ${error.message}` }
    if (!data || !data.event_slug) return { slug: null, reason: 'no event_campaigns rows have an event_slug yet' }
    return { slug: String(data.event_slug).trim(), reason: null }
  } catch (err) {
    return { slug: null, reason: err instanceof Error ? err.message : 'unknown' }
  }
}

function statusName(code) {
  const map = {
    200: 'OK',
    301: 'Moved Permanently',
    302: 'Found',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  }
  return map[code] ?? ''
}

async function checkRoute(base, route) {
  const url = `${base}${route.path}${route.path.includes('?') ? '&' : '?'}utm_source=audit&utm_medium=health_check`
  const startedAt = Date.now()

  // AbortController for per-request timeout. 10s is generous for a static
  // route; production cold-starts on Vercel are typically <2s.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'GET',
      // Don't follow redirects — we want to assert the redirect status itself,
      // not the destination's status.
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const elapsedMs = Date.now() - startedAt
    return {
      ok: res.status === route.expected,
      actual: res.status,
      expected: route.expected,
      location: res.headers.get('location'),
      url,
      elapsedMs,
      error: null,
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const elapsedMs = Date.now() - startedAt
    return {
      ok: false,
      actual: null,
      expected: route.expected,
      location: null,
      url,
      elapsedMs,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function pad(s, n) {
  if (s.length >= n) return s
  return s + ' '.repeat(n - s.length)
}

function formatLine(route, result) {
  const tag = result.ok
    ? `${COLORS.green}[PASS]${COLORS.reset}`
    : `${COLORS.red}[FAIL]${COLORS.reset}`
  const path = pad(route.path, 28)
  const elapsed = `${result.elapsedMs}ms`.padStart(7)

  if (result.error) {
    return `  ${tag} ${path} ${COLORS.red}ERROR${COLORS.reset} ${COLORS.dim}${elapsed}${COLORS.reset}  ${COLORS.dim}${result.error}${COLORS.reset}`
  }

  const codeName = statusName(result.actual) || ''
  const codeColor = result.ok ? COLORS.green : COLORS.red
  const code = `${codeColor}${result.actual}${COLORS.reset} ${COLORS.dim}${codeName}${COLORS.reset}`

  let detail = ''
  if (!result.ok) {
    detail = `  ${COLORS.red}(expected ${result.expected})${COLORS.reset}`
  } else if (result.location) {
    // Truncate long redirect targets so the table stays readable.
    const loc = result.location.length > 60 ? result.location.slice(0, 57) + '…' : result.location
    detail = `  ${COLORS.dim}→ ${loc}${COLORS.reset}`
  }

  return `  ${tag} ${path} ${pad(code, 36)} ${COLORS.dim}${elapsed}${COLORS.reset}${detail}`
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))

  console.log()
  console.log(`${COLORS.bold}Phase 14X — Public-route health audit${COLORS.reset}`)
  console.log(`${COLORS.dim}Base: ${flags.base}${COLORS.reset}`)
  console.log(`${COLORS.dim}Started: ${new Date().toISOString()}${COLORS.reset}`)
  console.log(`${COLORS.dim}User-Agent: ${USER_AGENT}${COLORS.reset}`)
  console.log()

  // Build the final route list: page routes always; /t/<slug> only when we
  // found a real slug AND the operator didn't pass --skip-tracking.
  const routes = [...PAGE_ROUTES]
  let trackingSkipReason = null
  if (flags.skipTracking) {
    trackingSkipReason = 'operator passed --skip-tracking'
  } else {
    const { slug, reason } = await findRealCampaignSlug()
    if (slug) {
      routes.push({
        path: `/t/${encodeURIComponent(slug)}`,
        expected: 302,
        label: `Tracking redirect (real slug: ${slug})`,
      })
    } else {
      trackingSkipReason = reason ?? 'unknown'
    }
  }

  console.log(`${COLORS.bold}Routes${COLORS.reset} ${COLORS.dim}(${routes.length} checks; per-route expected status shown on FAIL)${COLORS.reset}`)
  console.log()

  // Run all checks in parallel — small concurrent burst against our own
  // infrastructure; total wall-time bounded by the slowest route.
  const results = await Promise.all(routes.map(r => checkRoute(flags.base, r)))

  for (let i = 0; i < routes.length; i++) {
    console.log(formatLine(routes[i], results[i]))
  }

  if (trackingSkipReason) {
    // Truncate noisy reasons (e.g. supabase 522 HTML error page dumped into
    // error.message). The full reason is logged via debug below for diagnostics.
    const cleanReason = trackingSkipReason.replace(/\s+/g, ' ').trim()
    const shortReason = cleanReason.length > 120 ? cleanReason.slice(0, 117) + '…' : cleanReason
    console.log(`  ${COLORS.yellow}[WARN]${COLORS.reset} ${pad('/t/<slug>', 28)} ${COLORS.yellow}SKIPPED${COLORS.reset}                              ${COLORS.dim}${shortReason}${COLORS.reset}`)
  }

  const passCount = results.filter(r => r.ok).length
  const failCount = results.length - passCount
  const maxMs = results.length > 0 ? Math.max(...results.map(r => r.elapsedMs)) : 0
  const totalMs = results.reduce((s, r) => s + r.elapsedMs, 0)

  console.log()
  console.log(`${COLORS.bold}Summary${COLORS.reset}`)
  if (failCount === 0) {
    const skipNote = trackingSkipReason ? `, /t/<slug> skipped` : ''
    console.log(`  ${COLORS.green}✓ All ${passCount} routes healthy${COLORS.reset}  ${COLORS.dim}(slowest ${maxMs}ms, ${totalMs}ms total wall-time${skipNote})${COLORS.reset}`)
  } else {
    console.log(`  ${COLORS.red}✗ ${failCount} route(s) unhealthy${COLORS.reset} of ${results.length} total  ${COLORS.dim}(${passCount} pass, slowest ${maxMs}ms)${COLORS.reset}`)
  }
  console.log()

  if (failCount === 0) {
    console.log(`${COLORS.dim}Reminder: this script is the safety net. The human is the design eye.${COLORS.reset}`)
    console.log(`${COLORS.dim}See the header comment for the manual mobile-review checklist.${COLORS.reset}`)
    console.log()
  } else {
    console.log(`${COLORS.red}One or more routes returned an unexpected status. Investigate before opening traffic.${COLORS.reset}`)
    console.log()
  }

  process.exit(failCount === 0 ? 0 : 1)
}

main().catch(err => {
  console.error(`${COLORS.red}Unexpected error:${COLORS.reset}`, err)
  process.exit(99)
})
