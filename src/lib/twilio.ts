import type { SupabaseClient } from '@supabase/supabase-js'

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!
// When set, sends route through the approved A2P Messaging Service /
// campaign. When unset, sendSMS() falls back to the legacy From-number.
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID

// Global SMS kill switch — reads site_settings.sms_send_enabled.
// FAIL-SAFE: returns false (SMS OFF) on a missing row, a query error, a
// thrown exception, or any value other than the exact string 'true'.
async function readSmsKillSwitch(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'sms_send_enabled')
      .maybeSingle()
    if (error || !data) return false
    return data.value === 'true'
  } catch {
    return false
  }
}

export async function sendSMS(
  to: string,
  body: string,
  supabase?: SupabaseClient,
): Promise<{ sid: string } | { skipped: true; reason: string }> {
  // When a Supabase client is supplied, the global kill switch is checked
  // first. Default state (no row, or value != 'true') means SMS is OFF.
  if (supabase) {
    const enabled = await readSmsKillSwitch(supabase)
    if (!enabled) {
      console.log(`[sendSMS] skipped — kill switch off — to=${to}`)
      return { skipped: true, reason: 'kill-switch-off' }
    }
  }

  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    throw new Error('Twilio environment variables not configured')
  }
  if (!MESSAGING_SERVICE_SID && !FROM_NUMBER) {
    throw new Error('Twilio sender not configured — set TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER')
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`
  const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')

  const params = new URLSearchParams()
  params.append('To', to)
  if (MESSAGING_SERVICE_SID) {
    // Routes through the approved A2P campaign automatically.
    params.append('MessagingServiceSid', MESSAGING_SERVICE_SID)
  } else {
    console.warn('[sendSMS] using legacy From-number — A2P routing may be unreliable. Set TWILIO_MESSAGING_SERVICE_SID.')
    params.append('From', FROM_NUMBER)
  }
  params.append('Body', body)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Twilio error ${res.status}: ${err.message}`)
  }

  const data = await res.json()
  return { sid: data.sid }
}

export const SMS_TEMPLATES = {
  leadDay0: (firstName: string) =>
    `Hey ${firstName}! This is Leo from VortexTrips. You just signed up for exclusive travel savings — I'll be calling you in a moment with your personalized savings breakdown. Reply STOP to opt out. Msg & data rates may apply.`,

  leadDay2: (firstName: string) =>
    `Hi ${firstName}, Leo from VortexTrips here. Members save $1,200+ per trip on average. Ready to book? Use code LEOSP at checkout: vortextrips.com/book — Reply STOP to opt out.`,

  leadDay7: (firstName: string) =>
    `${firstName}, exclusive alert from VortexTrips: hotel rates are dropping this week. Your free savings account is waiting — create it now: vortextrips.com/free — Reply STOP to opt out.`,

  leadDay12: (firstName: string) =>
    `Last chance, ${firstName}! Don't leave savings on the table. Your free VortexTrips account takes 30 seconds: vortextrips.com/free — Or join our SBA program to earn: signup.surge365.com/leosp — Reply STOP to opt out.`,

  sbaDay0: (firstName: string) =>
    `Welcome to the VortexTrips team, ${firstName}! Create your free savings account now: vortextrips.com/free — Then share your link to start earning commissions. Reply HELP for help, STOP to cancel.`,

  sbaDay7: (firstName: string) =>
    `Hey ${firstName}! Quick check-in from VortexTrips. Booking trips? Use code LEOSP at vortextrips.com/book — Ready to grow your team? signup.surge365.com/leosp — Reply STOP to cancel.`,

  reviewRequestSms: (firstName: string, destination?: string) =>
    `Hey ${firstName}! Hope your${destination ? ` ${destination}` : ''} trip was amazing! We'd love a quick review — it takes 60 seconds and helps other travelers. ${process.env.NEXT_PUBLIC_APP_URL}/reviews — Reply STOP to opt out.`,
}
