/**
 * Email health check — pulls recent send stats from Resend and computes
 * a delivery / bounce / complaint verdict. Used by the send-sequences cron
 * to alert the admin when delivery health degrades.
 */

const LOOKBACK_HOURS = 24

export type HealthVerdict = 'GREEN' | 'YELLOW' | 'RED'

export interface EmailHealthReport {
  verdict: HealthVerdict
  total: number
  finalized: number
  inFlight: number
  delivered: number
  bounced: number
  complained: number
  failed: number
  deliveryRate: number
  bounceRate: number
  complaintRate: number
  rawCounts: Record<string, number>
  sinceISO: string
  recommendedAction: string
}

interface ResendEmail {
  id?: string
  created_at?: string
  last_event?: string
}

interface ResendListResponse {
  data?: ResendEmail[]
}

function bucketStatus(lastEvent?: string): keyof EmailHealthReport | 'in_flight' | 'other' {
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

async function fetchRecentEmails(apiKey: string, sinceISO: string): Promise<ResendEmail[]> {
  const all: ResendEmail[] = []
  let after: string | null = null
  for (let page = 0; page < 12; page++) {
    const url = new URL('https://api.resend.com/emails')
    url.searchParams.set('limit', '100')
    if (after) url.searchParams.set('after', after)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      if (page === 0) throw new Error(`Resend API ${res.status}`)
      break
    }
    const data = (await res.json()) as ResendListResponse
    const items = Array.isArray(data?.data) ? data.data : []
    all.push(...items)
    if (items.length < 100) break
    const oldest = items[items.length - 1]
    if (!oldest?.created_at || oldest.created_at < sinceISO) break
    after = oldest.id ?? null
    if (!after) break
  }
  return all
}

export async function computeEmailHealth(
  lookbackHours: number = LOOKBACK_HOURS,
): Promise<EmailHealthReport> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  const since = new Date(Date.now() - lookbackHours * 3600 * 1000)
  const sinceISO = since.toISOString()

  const emails = await fetchRecentEmails(apiKey, sinceISO)
  const inWindow = emails.filter(e => e.created_at && e.created_at >= sinceISO)

  const counts = { delivered: 0, bounced: 0, complained: 0, failed: 0, in_flight: 0, other: 0 }
  const rawCounts: Record<string, number> = {}
  for (const e of inWindow) {
    const bucket = bucketStatus(e.last_event)
    if (bucket === 'delivered') counts.delivered++
    else if (bucket === 'bounced') counts.bounced++
    else if (bucket === 'complained') counts.complained++
    else if (bucket === 'failed') counts.failed++
    else if (bucket === 'in_flight') counts.in_flight++
    else counts.other++
    const k = e.last_event || 'unknown'
    rawCounts[k] = (rawCounts[k] || 0) + 1
  }

  const total = inWindow.length
  const finalized = total - counts.in_flight
  const denom = finalized > 0 ? finalized : Math.max(total, 1)
  const deliveryRate = (counts.delivered / denom) * 100
  const bounceRate = (counts.bounced / denom) * 100
  const complaintRate = (counts.complained / denom) * 100

  let verdict: HealthVerdict
  let recommendedAction: string

  if (total < 10) {
    verdict = 'GREEN'
    recommendedAction = `Volume too low (${total}) for a confident verdict — defaulting to GREEN.`
  } else if (deliveryRate < 95 || bounceRate > 5 || complaintRate > 0.3) {
    verdict = 'RED'
    recommendedAction =
      'STOP and throttle: pause the daily send-sequences cron, clean the bounce list, then resume with hourly batches of 50.'
  } else if (deliveryRate < 98 || bounceRate >= 2 || complaintRate >= 0.1) {
    verdict = 'YELLOW'
    recommendedAction = 'Continue today but monitor. If numbers worsen, throttle.'
  } else {
    verdict = 'GREEN'
    recommendedAction = 'No action needed. Sender reputation is healthy.'
  }

  return {
    verdict,
    total,
    finalized,
    inFlight: counts.in_flight,
    delivered: counts.delivered,
    bounced: counts.bounced,
    complained: counts.complained,
    failed: counts.failed,
    deliveryRate,
    bounceRate,
    complaintRate,
    rawCounts,
    sinceISO,
    recommendedAction,
  }
}

export function renderHealthEmailHTML(report: EmailHealthReport): string {
  const verdictColor =
    report.verdict === 'GREEN' ? '#10b981' : report.verdict === 'YELLOW' ? '#f59e0b' : '#ef4444'
  const verdictEmoji = report.verdict === 'GREEN' ? '🟢' : report.verdict === 'YELLOW' ? '🟡' : '🔴'

  const rawRows = Object.entries(report.rawCounts)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${k}</td><td style="padding:4px 0;font-weight:600;">${v}</td></tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1A1A2E;">
  <h1 style="margin:0 0 8px 0;">${verdictEmoji} VortexTrips Email Health — ${report.verdict}</h1>
  <p style="color:#6b7280;margin:0 0 24px 0;">Last ${LOOKBACK_HOURS} hours · since ${report.sinceISO}</p>

  <div style="background:${verdictColor};color:white;padding:16px;border-radius:8px;margin-bottom:24px;">
    <strong>Action:</strong> ${report.recommendedAction}
  </div>

  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Total fetched</td><td style="text-align:right;font-weight:600;">${report.total}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Delivered</td><td style="text-align:right;font-weight:600;color:#10b981;">${report.delivered} (${report.deliveryRate.toFixed(1)}%)</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Bounced</td><td style="text-align:right;font-weight:600;color:#ef4444;">${report.bounced} (${report.bounceRate.toFixed(1)}%)</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Complaints</td><td style="text-align:right;font-weight:600;color:#ef4444;">${report.complained} (${report.complaintRate.toFixed(2)}%)</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Failed</td><td style="text-align:right;font-weight:600;">${report.failed}</td></tr>
    <tr><td style="padding:8px 0;">In flight</td><td style="text-align:right;font-weight:600;color:#6b7280;">${report.inFlight}</td></tr>
  </table>

  <h3 style="margin-top:32px;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Raw status breakdown</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">${rawRows}</table>

  <p style="color:#9ca3af;font-size:12px;margin-top:32px;">Automated daily report from the send-sequences cron. To run on demand: <code>node scripts/check-email-stats.js</code></p>
</body></html>`
}
