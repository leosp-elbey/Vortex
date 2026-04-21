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
    `Hi ${firstName}, Leo from VortexTrips here. Did you get a chance to see your savings breakdown? Members save $1,200+ per trip on average. Ready to book? vortextrips.com/book — Reply STOP to opt out.`,

  leadDay7: (firstName: string) =>
    `${firstName}, exclusive alert from VortexTrips: hotel rates for popular destinations are dropping this week. Lock in your savings before they're gone — vortextrips.com/free — Reply STOP to opt out.`,

  leadDay12: (firstName: string) =>
    `Last chance, ${firstName}! Your VortexTrips free access expires soon. Join now and save 40-60% on your next trip: vortextrips.com/join — Reply STOP to opt out. Msg & data rates may apply.`,

  sbaDay0: (firstName: string) =>
    `Welcome to the VortexTrips team, ${firstName}! Your SBA access is live. Start here: vortextrips.com/free — Your upline will reach out shortly. Reply HELP for help, STOP to cancel.`,

  sbaDay7: (firstName: string) =>
    `Hey ${firstName}! Quick check-in from VortexTrips. How are your first bookings going? Need help? Reply here or email support@vortextrips.com. Ready to level up? vortextrips.com/join`,
}
