interface SendEmailParams {
  to: string
  subject: string
  html: string
  from?: string
}

interface MailgunResult {
  id: string
  message: string
}

export async function sendEmail({
  to,
  subject,
  html,
  from = `VortexTrips Travel Team <bookings@mg.vortextrips.com>`,
}: SendEmailParams): Promise<MailgunResult> {
  const domain = process.env.MAILGUN_DOMAIN!
  const apiKey = process.env.MAILGUN_API_KEY!

  const formBody = new URLSearchParams({
    from,
    to,
    subject,
    html,
  })

  const response = await fetch(
    `https://api.mailgun.net/v3/${domain}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || 'Mailgun send failed')
  }

  return { id: data.id, message: data.message }
}
