import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface SendEmailParams {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail({
  to,
  subject,
  html,
  from = 'VortexTrips Travel Team <info@vortextrips.com>',
}: SendEmailParams) {
  const { data, error } = await resend.emails.send({ from, to, subject, html })

  if (error) throw new Error(error.message)
  return data
}
