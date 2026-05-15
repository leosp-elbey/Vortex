import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMS, SMS_TEMPLATES } from '@/lib/twilio'
import { sendEmail } from '@/lib/resend'
import { EMAIL_TEMPLATES, type EmailTemplateKey } from '@/lib/email-templates'
import { computeEmailHealth, renderHealthEmailHTML, type EmailHealthReport } from '@/lib/email-health'
import { isSuppressedContactStatus } from '@/lib/sequence-suppression'

async function runHealthCheck(): Promise<EmailHealthReport | null> {
  try {
    const report = await computeEmailHealth(24)
    const adminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL ?? '').trim()
    if (!adminEmail) return report

    // Phase 14AR — daily health report fires on ALL verdicts (including
    // GREEN). Previously the YELLOW/RED-only condition meant the operator
    // never saw a "system healthy" signal — silence was indistinguishable
    // from a broken cron. `total >= 10` filter retained so we don't email
    // a meaningless report on near-zero send volume.
    if (report.total >= 10) {
      const icon = report.verdict === 'RED' ? '🔴' : report.verdict === 'YELLOW' ? '🟡' : '✅'
      const subject = `${icon} VortexTrips Email Health: ${report.verdict} (${report.bounceRate.toFixed(1)}% bounce)`
      await sendEmail({ to: adminEmail, subject, html: renderHealthEmailHTML(report) })
    }
    return report
  } catch (err) {
    console.error('[health-check] failed:', err)
    return null
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Phase 14AQ — batch size lowered from 250 → 50 to spread sends across
  // multiple cron ticks (avoids burst-rate complaints at the email provider
  // and gives the per-row suppression check more headroom inside the
  // function timeout).
  const { data: items, error } = await supabase
    .from('sequence_queue')
    .select('*, contacts(first_name, email, phone, status, tags)')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length === 0) return NextResponse.json({ success: true, processed: 0 })

  let sent = 0, failed = 0, skipped = 0
  const now = new Date().toISOString()

  // Process in parallel chunks of 10 — keeps total wall time under 10s on Hobby
  // while drastically increasing throughput vs sequential execution.
  const CHUNK_SIZE = 10
  const chunks: Array<typeof items> = []
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    chunks.push(items.slice(i, i + CHUNK_SIZE))
  }

  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map(async item => {
      const contact = item.contacts as {
        first_name: string
        email: string
        phone: string | null
        status: string
        tags: string[]
      } | null

      // Phase 14AQ — widen the suppression check beyond 'churned' to also
      // skip unsubscribed, bounced, and rejected contacts. The list is
      // sourced from src/lib/sequence-suppression.ts so the cron + the
      // two queue-time entry points stay consistent.
      if (!contact || isSuppressedContactStatus(contact.status)) {
        await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: now }).eq('id', item.id)
        skipped++
        return
      }

      const smsOptedOut = contact.tags?.includes('sms-optout')

      try {
        if (item.channel === 'sms') {
          if (!contact.phone || smsOptedOut) {
            await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: now }).eq('id', item.id)
            skipped++
            return
          }

          const templateFn = SMS_TEMPLATES[item.template_key as keyof typeof SMS_TEMPLATES]
          if (!templateFn) {
            console.warn(`[send-sequences] Unknown template_key "${item.template_key}" for queue row ${item.id} — skipping`)
            await supabase.from('sequence_queue').update({ status: 'skipped' }).eq('id', item.id)
            skipped++
            return
          }

          await sendSMS(contact.phone, templateFn(contact.first_name))
          await supabase.from('ai_actions_log').insert({
            contact_id: item.contact_id,
            action_type: 'sms',
            service: 'twilio',
            status: 'success',
            request_payload: { template_key: item.template_key, sequence: item.sequence_name, step: item.step } as Record<string, unknown>,
          })

        } else if (item.channel === 'email') {
          if (!contact.email) {
            await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: now }).eq('id', item.id)
            skipped++
            return
          }

          const templateFn = EMAIL_TEMPLATES[item.template_key as EmailTemplateKey]
          if (!templateFn) {
            console.warn(`[send-sequences] Unknown template_key "${item.template_key}" for queue row ${item.id} — skipping`)
            await supabase.from('sequence_queue').update({ status: 'skipped' }).eq('id', item.id)
            skipped++
            return
          }

          const { subject, html } = templateFn(contact.first_name)
          await sendEmail({ to: contact.email, subject, html })
          await supabase.from('ai_actions_log').insert({
            contact_id: item.contact_id,
            action_type: 'onboarding-email',
            service: 'resend',
            status: 'success',
            request_payload: { template_key: item.template_key, sequence: item.sequence_name, step: item.step } as Record<string, unknown>,
          })
        }

        await supabase.from('sequence_queue').update({ status: 'sent', sent_at: now }).eq('id', item.id)
        await supabase.from('contacts').update({ last_ai_action: `${item.channel.toUpperCase()} sent: ${item.template_key}` }).eq('id', item.contact_id)
        sent++

      } catch (err) {
        console.error(`Sequence send failed [${item.channel}/${item.template_key}]:`, err)
        await supabase.from('sequence_queue').update({ status: 'failed' }).eq('id', item.id)
        failed++
      }
    }))
  }

  const health = await runHealthCheck()

  return NextResponse.json({
    success: true,
    processed: items.length,
    sent,
    failed,
    skipped,
    health: health
      ? {
          verdict: health.verdict,
          total: health.total,
          deliveryRate: Number(health.deliveryRate.toFixed(2)),
          bounceRate: Number(health.bounceRate.toFixed(2)),
          complaintRate: Number(health.complaintRate.toFixed(3)),
        }
      : null,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
