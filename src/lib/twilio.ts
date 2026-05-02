const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!

export async function sendSMS(to: string, body: string): Promise<{ sid: string }> {
  if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER) {
    throw new Error('Twilio environment variables not configured')
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`
  const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')

  const params = new URLSearchParams()
  params.append('To', to)
  params.append('From', FROM_NUMBER)
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
    `Hi ${firstName}, Leo from VortexTrips here. Members save $1,200+ per trip on average. Ready to book? Use code LEOSP at checkout: vortextrips.com/booking — Reply STOP to opt out.`,

  leadDay7: (firstName: string) =>
    `${firstName}, exclusive alert from VortexTrips: hotel rates are dropping this week. Your free savings account is waiting — create it now: myvortex365.com/leosp — Reply STOP to opt out.`,

  leadDay12: (firstName: string) =>
    `Last chance, ${firstName}! Don't leave savings on the table. Your free VortexTrips account takes 30 seconds: myvortex365.com/leosp — Or join our SBA program to earn: signup.surge365.com/leosp — Reply STOP to opt out.`,

  sbaDay0: (firstName: string) =>
    `Welcome to the VortexTrips team, ${firstName}! Create your free savings account now: myvortex365.com/leosp — Then share your link to start earning commissions. Reply HELP for help, STOP to cancel.`,

  sbaDay7: (firstName: string) =>
    `Hey ${firstName}! Quick check-in from VortexTrips. Booking trips? Use code LEOSP at vortextrips.com/booking — Ready to grow your team? signup.surge365.com/leosp — Reply STOP to cancel.`,

  reviewRequestSms: (firstName: string, destination?: string) =>
    `Hey ${firstName}! Hope your${destination ? ` ${destination}` : ''} trip was amazing! We'd love a quick review — it takes 60 seconds and helps other travelers. ${process.env.NEXT_PUBLIC_APP_URL}/reviews — Reply STOP to opt out.`,
}
