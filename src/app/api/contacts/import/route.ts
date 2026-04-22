import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface ImportRow {
  first_name: string
  last_name?: string
  email: string
  phone?: string
  source?: string
  notes?: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { contacts, sequence = 'mlm-outreach' }: { contacts: ImportRow[]; sequence?: string } = body

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: 'contacts array is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const results = { inserted: 0, skipped: 0, errors: [] as string[] }

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

      const { data: contact, error } = await admin.from('contacts').insert({
        first_name: row.first_name.trim(),
        last_name: row.last_name?.trim() || null,
        email,
        phone: row.phone?.trim() || null,
        source: row.source || 'import',
        status: 'lead',
        lead_score: 10,
        tags: ['mlm-import'],
        custom_fields: {
          ...(row.notes ? { notes: row.notes } : {}),
          imported: 'true',
          import_sequence: sequence,
        },
        last_ai_action: 'Imported via bulk upload',
      }).select('id, first_name').single()

      if (error) {
        if (error.code === '23505') {
          results.skipped++
        } else {
          results.errors.push(`${email}: ${error.message}`)
        }
        continue
      }

      // Create opportunity
      await admin.from('opportunities').insert({
        contact_id: contact.id,
        name: `${contact.first_name} — MLM Pipeline`,
        pipeline: 'mlm',
        stage: 'new-lead',
      })

      // Enroll in MLM email sequence (email-only — no SMS without consent)
      const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000).toISOString()
      const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600000).toISOString()

      await admin.from('sequence_queue').insert([
        // Immediate 7-email sequence
        { contact_id: contact.id, sequence_name: sequence, step: 1, channel: 'email', template_key: 'mlmDay0', scheduled_at: hoursFromNow(0.5) },
        { contact_id: contact.id, sequence_name: sequence, step: 2, channel: 'email', template_key: 'mlmDay2', scheduled_at: daysFromNow(2) },
        { contact_id: contact.id, sequence_name: sequence, step: 3, channel: 'email', template_key: 'mlmDay4', scheduled_at: daysFromNow(4) },
        { contact_id: contact.id, sequence_name: sequence, step: 4, channel: 'email', template_key: 'mlmDay6', scheduled_at: daysFromNow(6) },
        { contact_id: contact.id, sequence_name: sequence, step: 5, channel: 'email', template_key: 'mlmDay9', scheduled_at: daysFromNow(9) },
        { contact_id: contact.id, sequence_name: sequence, step: 6, channel: 'email', template_key: 'mlmDay12', scheduled_at: daysFromNow(12) },
        { contact_id: contact.id, sequence_name: sequence, step: 7, channel: 'email', template_key: 'mlmDay15', scheduled_at: daysFromNow(15) },
        // Long-term monthly nurture (months 1–6)
        { contact_id: contact.id, sequence_name: sequence, step: 8, channel: 'email', template_key: 'mlmMonth1', scheduled_at: daysFromNow(30) },
        { contact_id: contact.id, sequence_name: sequence, step: 9, channel: 'email', template_key: 'mlmMonth2', scheduled_at: daysFromNow(60) },
        { contact_id: contact.id, sequence_name: sequence, step: 10, channel: 'email', template_key: 'mlmMonth3', scheduled_at: daysFromNow(90) },
        { contact_id: contact.id, sequence_name: sequence, step: 11, channel: 'email', template_key: 'mlmMonth4', scheduled_at: daysFromNow(120) },
        { contact_id: contact.id, sequence_name: sequence, step: 12, channel: 'email', template_key: 'mlmMonth5', scheduled_at: daysFromNow(150) },
        { contact_id: contact.id, sequence_name: sequence, step: 13, channel: 'email', template_key: 'mlmMonth6', scheduled_at: daysFromNow(180) },
      ])

      results.inserted++
    }
  }

  return NextResponse.json(results)
}
