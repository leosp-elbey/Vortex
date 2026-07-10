import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSMS, SMS_TEMPLATES } from '@/lib/twilio'
import { hasSmsConsent } from '@/lib/sms-consent'
import { sendEmail } from '@/lib/resend'
import { EMAIL_TEMPLATES, type EmailTemplateKey, vortexInviteEmail } from '@/lib/email-templates'
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
    .select('*, contacts(first_name, email, phone, status, tags, custom_fields)')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length === 0) return NextResponse.json({ success: true, processed: 0 })

  let sent = 0, failed = 0, skipped = 0
  const now = new Date().toISOString()

  // Phase 22A — sequential processing with per-item delay.
  // Replaces the earlier "parallel chunks of 10 with 2.5s between chunks" design
  // which produced ~10 simultaneous requests per chunk and blew past Resend's
  // 5 req/s free-tier limit (Promise.allSettled fires the .map callbacks in
  // parallel — the inter-chunk delay only spaced the *bursts*, not the calls
  // within each burst). 250ms inter-item delay = 4 req/s, safely under the cap.
  const INTER_ITEM_DELAY_MS = 250 // 250ms between items = 4 req/s, under Resend's 5 req/s limit

  for (const item of items) {
    await new Promise(resolve => setTimeout(resolve, INTER_ITEM_DELAY_MS));
    const contact = item.contacts as {
      first_name: string
      email: string
      phone: string | null
      status: string
      tags: string[]
      custom_fields: Record<string, unknown> | null
    } | null

    // Phase 14AQ — widen the suppression check beyond 'churned' to also
    // skip unsubscribed, bounced, and rejected contacts. The list is
    // sourced from src/lib/sequence-suppression.ts so the cron + the
    // two queue-time entry points stay consistent.
    if (!contact || isSuppressedContactStatus(contact.status)) {
      await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: now }).eq('id', item.id)
      skipped++
      continue
    }

    const smsOptedOut = contact.tags?.includes('sms-optout')

    try {
      if (item.channel === 'sms') {
        // Phase 18.1D — server-side consent gate, checked before the
        // opt-out tag. sequence_queue has no skipped_reason column, so the
        // 'no-consent-recorded' reason is recorded in the log line.
        if (!hasSmsConsent(contact)) {
          await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: now }).eq('id', item.id)
          console.log(`[send-sequences] SMS skipped — no-consent-recorded — queue row ${item.id}`)
          skipped++
          continue
        }
        if (!contact.phone || smsOptedOut) {
          await supabase.from('sequence_queue').update({ status: 'skipped', sent_at: now }).eq('id', item.id)
          skipped++
          continue
        }

        const templateFn = SMS_TEMPLATES[item.template_key as keyof typeof SMS_TEMPLATES]
        if (!templateFn) {
          console.warn(`[send-sequences] Unknown template_key "${item.template_key}" for queue row ${item.id} — skipping`)
          await supabase.from('sequence_queue').update({ status: 'skipped' }).eq('id', item.id)
          skipped++
          continue
        }

        await sendSMS(contact.phone, templateFn(contact.first_name), supabase)
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
          continue
        }

        const templateFn = EMAIL_TEMPLATES[item.template_key as EmailTemplateKey]
        if (!templateFn) {
          console.warn(`[send-sequences] Unknown template_key "${item.template_key}" for queue row ${item.id} — skipping`)
          await supabase.from('sequence_queue').update({ status: 'skipped' }).eq('id', item.id)
          skipped++
          continue
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
  }

  // Phase 23E — Vortex invite dispatch.
  //
  // Reads up to 50 pending rows from vortex_invite_queue, sends the branded
  // VortexTrips travel-savings invite email via Resend, and flips each row's
  // status to 'sent' / 'failed' / 'skipped'. Runs sequentially with the same
  // INTER_ITEM_DELAY_MS as the sequence_queue loop above so the combined
  // burst stays under Resend's 5 req/s cap.
  //
  // Suppression: LEFT JOIN contacts via contact_id. If the joined contact is
  // in SUPPRESSED_CONTACT_STATUSES (churned/unsubscribed/bounced/rejected),
  // mark the queue row 'skipped' and continue. If contact_id is null or the
  // joined row is missing, fall through and send using the queue's snapshot
  // email/first_name (fail-open — mirrors isSuppressedContactStatus semantics).
  //
  // Never halts the outer response. Individual send failures are logged and
  // marked 'failed' on the queue row; the loop continues.
  let vortexInvitesSent = 0
  let vortexInvitesFailed = 0
  let vortexInvitesSkipped = 0

  const { data: inviteRows, error: inviteFetchErr } = await supabase
    .from('vortex_invite_queue')
    .select('id, contact_id, first_name, email, contacts(status)')
    .eq('status', 'pending')
    .order('queued_at', { ascending: true })
    .limit(50)

  if (inviteFetchErr) {
    console.error('[send-sequences] vortex invite queue fetch failed:', inviteFetchErr.message)
  } else if (inviteRows && inviteRows.length > 0) {
    for (const invite of inviteRows) {
      await new Promise(resolve => setTimeout(resolve, INTER_ITEM_DELAY_MS))

      // Type shape from the embedded select. supabase-js types the joined row
      // as an array of one; runtime returns a single object OR null.
      const joinedContact = (invite as unknown as { contacts?: { status?: string | null } | { status?: string | null }[] | null }).contacts
      const contactStatus = Array.isArray(joinedContact)
        ? (joinedContact[0]?.status ?? null)
        : (joinedContact?.status ?? null)

      if (contactStatus && isSuppressedContactStatus(contactStatus)) {
        await supabase.from('vortex_invite_queue').update({ status: 'skipped', sent_at: now }).eq('id', invite.id)
        vortexInvitesSkipped++
        continue
      }

      if (!invite.email || !invite.first_name) {
        // Queue row missing required fields — can't render / send.
        await supabase.from('vortex_invite_queue').update({ status: 'skipped', sent_at: now }).eq('id', invite.id)
        vortexInvitesSkipped++
        continue
      }

      try {
        const { subject, html } = vortexInviteEmail(invite.first_name)
        await sendEmail({ to: invite.email, subject, html })
        await supabase.from('vortex_invite_queue').update({ status: 'sent', sent_at: now }).eq('id', invite.id)
        if (invite.contact_id) {
          await supabase.from('ai_actions_log').insert({
            contact_id: invite.contact_id,
            action_type: 'onboarding-email',
            service: 'resend',
            status: 'success',
            request_payload: { template_key: 'vortexInvite', sequence: 'vortex-invites' } as Record<string, unknown>,
          })
        }
        vortexInvitesSent++
      } catch (err) {
        console.error(`[send-sequences] vortex invite send failed (queue ${invite.id}):`, err)
        await supabase.from('vortex_invite_queue').update({ status: 'failed' }).eq('id', invite.id)
        vortexInvitesFailed++
      }
    }
  }

  const health = await runHealthCheck()

  return NextResponse.json({
    success: true,
    processed: items.length,
    sent,
    failed,
    skipped,
    vortex_invites_sent: vortexInvitesSent,
    vortex_invites_failed: vortexInvitesFailed,
    vortex_invites_skipped: vortexInvitesSkipped,
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
