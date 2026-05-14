import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuppressedContactStatus } from '@/lib/sequence-suppression'

interface ImportRow {
  first_name: string
  last_name?: string
  email: string
  phone?: string
  source?: string
  notes?: string
  // Phase 14AQ — optional pre-existing status; if the upstream uploader
  // already knows a contact is churned/unsubscribed/bounced/rejected,
  // they can pass it here and the import will skip queueing automated
  // outreach (the contact row is still inserted for record-keeping).
  status?: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  // Phase 14AQ — default sequence name renamed from 'mlm-outreach' to
  // 'sba-outreach' to align with the brand-rule rename (Smart Business
  // Affiliate). Existing 'mlm-outreach' rows in sequence_queue continue
  // to work since this only sets the default for new imports.
  const { contacts, sequence = 'sba-outreach' }: { contacts: ImportRow[]; sequence?: string } = body

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: 'contacts array is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Phase 14AQ — `suppressed` tracks contacts that were inserted into the
  // contacts table but had their sequence_queue inserts skipped because
  // their status matched the suppression list. Surfaced in the response
  // so the operator knows the import didn't silently full-enroll a
  // known-bad contact.
  const results = { inserted: 0, skipped: 0, suppressed: 0, errors: [] as string[] }

  // Process in batches of 50
  const batchSize = 50
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize)

    for (const row of batch) {
      if (!row.first_name || !row.email) {
        results.skipped++
        continue
      }

      const email = row.email.trim().toLowerCase()
      // Default to 'lead' when no status is provided. Pass-through any
      // status the upstream caller supplied so the queue-time check
      // below can honor it.
      const incomingStatus = (row.status ?? 'lead').trim().toLowerCase()

      const { data: contact, error } = await admin.from('contacts').insert({
        first_name: row.first_name.trim(),
        last_name: row.last_name?.trim() || null,
        email,
        phone: row.phone?.trim() || null,
        source: row.source || 'import',
        status: incomingStatus,
        lead_score: 10,
        // Phase 14AQ — tag renamed from 'mlm-import' to 'sba-import' to
        // match the brand-rule rename (Smart Business Affiliate).
        tags: ['sba-import'],
        custom_fields: {
          ...(row.notes ? { notes: row.notes } : {}),
          imported: 'true',
          import_sequence: sequence,
        },
        last_ai_action: 'Imported via bulk upload',
      }).select('id, first_name, status').single()

      if (error) {
        if (error.code === '23505') {
          results.skipped++
        } else {
          results.errors.push(`${email}: ${error.message}`)
        }
        continue
      }

      // Phase 14AQ — pipeline renamed from 'mlm' to 'sba' to align with
      // the brand-rule rename. Existing pipeline='mlm' rows in
      // `opportunities` remain valid; this only changes the default for
      // newly-created opportunities.
      await admin.from('opportunities').insert({
        contact_id: contact.id,
        name: `${contact.first_name} — SBA Pipeline`,
        pipeline: 'sba',
        stage: 'new-lead',
      })

      // Phase 14AQ — queue-time suppression. If the contact was imported
      // with a status that means "do not contact" (churned, unsubscribed,
      // bounced, rejected), the contact row still gets inserted but no
      // sequence_queue rows are created. Surfaced in `results.suppressed`.
      if (isSuppressedContactStatus(contact.status)) {
        results.suppressed++
        results.inserted++
        continue
      }

      // Enroll in SBA email sequence (email-only — no SMS without consent)
      const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000).toISOString()
      const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600000).toISOString()

      // Phase 14AQ — template_key prefixes renamed from `mlm*` to `sba*`
      // to align with the brand-rule rename. The template definitions
      // in src/lib/email-templates.ts use the matching `sba*` keys.
      await admin.from('sequence_queue').insert([
        // 7-email immediate sequence — days 0, 1, 3, 5, 7, 10, 15
        { contact_id: contact.id, sequence_name: sequence, step: 1, channel: 'email', template_key: 'sbaDay0', scheduled_at: hoursFromNow(0.5) },
        { contact_id: contact.id, sequence_name: sequence, step: 2, channel: 'email', template_key: 'sbaDay2', scheduled_at: daysFromNow(1) },
        { contact_id: contact.id, sequence_name: sequence, step: 3, channel: 'email', template_key: 'sbaDay4', scheduled_at: daysFromNow(3) },
        { contact_id: contact.id, sequence_name: sequence, step: 4, channel: 'email', template_key: 'sbaDay6', scheduled_at: daysFromNow(5) },
        { contact_id: contact.id, sequence_name: sequence, step: 5, channel: 'email', template_key: 'sbaDay9', scheduled_at: daysFromNow(7) },
        { contact_id: contact.id, sequence_name: sequence, step: 6, channel: 'email', template_key: 'sbaDay12', scheduled_at: daysFromNow(10) },
        { contact_id: contact.id, sequence_name: sequence, step: 7, channel: 'email', template_key: 'sbaDay15', scheduled_at: daysFromNow(15) },
        // Long-term monthly nurture (months 1–6)
        { contact_id: contact.id, sequence_name: sequence, step: 8, channel: 'email', template_key: 'sbaMonth1', scheduled_at: daysFromNow(30) },
        { contact_id: contact.id, sequence_name: sequence, step: 9, channel: 'email', template_key: 'sbaMonth2', scheduled_at: daysFromNow(60) },
        { contact_id: contact.id, sequence_name: sequence, step: 10, channel: 'email', template_key: 'sbaMonth3', scheduled_at: daysFromNow(90) },
        { contact_id: contact.id, sequence_name: sequence, step: 11, channel: 'email', template_key: 'sbaMonth4', scheduled_at: daysFromNow(120) },
        { contact_id: contact.id, sequence_name: sequence, step: 12, channel: 'email', template_key: 'sbaMonth5', scheduled_at: daysFromNow(150) },
        { contact_id: contact.id, sequence_name: sequence, step: 13, channel: 'email', template_key: 'sbaMonth6', scheduled_at: daysFromNow(180) },
      ])

      results.inserted++
    }
  }

  return NextResponse.json(results)
}
