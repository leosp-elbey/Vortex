import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triggerCall } from '@/lib/bland'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { first_name, email, phone, source = 'landing-page' } = body

    if (!first_name || !email || !phone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .insert({ first_name, email, phone, source })
      .select()
      .single()

    if (contactError) {
      if (contactError.code === '23505') {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
      }
      return NextResponse.json({ error: contactError.message || 'Database error saving contact' }, { status: 500 })
    }

    const { error: oppError } = await supabase.from('opportunities').insert({
      contact_id: contact.id,
      name: `${first_name} — Main Pipeline`,
      pipeline: 'main',
      stage: 'new-lead',
    })

    if (oppError) {
      console.error('Opportunity insert error:', oppError.message)
    }

    try {
      await triggerCall(phone, first_name, email, undefined, contact.id)
      await supabase
        .from('contacts')
        .update({ tags: ['bland-call-sent'], last_ai_action: 'Intro call triggered' })
        .eq('id', contact.id)
    } catch (callError) {
      console.error('Bland call error:', callError)
      await supabase
        .from('contacts')
        .update({ tags: ['call-failed'] })
        .eq('id', contact.id)
    }

    return NextResponse.json({ success: true, contactId: contact.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    console.error('lead-created error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
