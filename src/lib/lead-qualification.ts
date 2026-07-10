// Phase LE-1 — lead qualification + channel normalization.
//
// Single source of truth for the VortexTrips Qualified-Lead definition.
// Called at intake (lead_channel) and on qualification triggers (qualified_at).
//
// Qualified when ANY of:
//   A. status manually/automatically = 'qualified'         (unconditional)
//   B. lead_score >= 40 AND Minimum Qualified Standard      (score + MQS)
//   C. qualifying action (book/join/reply/free/quote) AND MQS
// qualified_at is write-once and never overwritten.

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

const TEST_EMAIL_RE = /@(example|test)\.com$|^test@|\+test@/i
const QUALIFYING_EVENTS = new Set([
  'book_link_click', 'join_link_click', 'sms_reply', 'free_link_click', 'quote_form_start',
])

/** Normalize a free-text source / utm_source into a known organic channel. */
export function normalizeLeadChannel(input: {
  source?: string | null
  utm_source?: string | null
}): string {
  const raw = (input.utm_source || input.source || '').toLowerCase().trim()
  if (!raw) return 'unknown'
  if (raw.includes('facebook') || raw === 'fb') return 'facebook'
  if (raw.includes('instagram') || raw === 'ig') return 'instagram'
  if (raw.includes('tiktok')) return 'tiktok'
  if (raw.includes('youtube') || raw === 'yt') return 'youtube'
  if (raw.includes('linkedin')) return 'linkedin'
  if (raw.includes('google')) return 'google'
  if (raw.includes('referral') || raw.includes('partner')) return 'referral'
  if (raw.includes('quiz')) return 'quiz'
  if (raw.includes('newsletter') || raw === 'email') return 'email'
  if (raw === 'sms') return 'sms'
  if (raw === 'manual') return 'manual'
  if (raw === 'landing-page' || raw === 'webhook' || raw === 'organic') return 'organic'
  return 'other'
}

export interface QualifiableContact {
  id: string
  first_name?: string | null
  email?: string | null
  phone?: string | null
  source?: string | null
  lead_channel?: string | null
  status?: string | null
  lead_score?: number | null
  qualified_at?: string | null
  custom_fields?: Record<string, unknown> | null
  tags?: string[] | null
}

/** The 6-point Minimum Qualified Standard. `hasQualifyingEvent` satisfies the
 *  "interest reasonably inferred" clause (#4). Consent is record-only (#5). */
export function meetsMinimumStandard(
  c: QualifiableContact,
  opts?: { hasQualifyingEvent?: boolean },
): boolean {
  if (!c.first_name || !c.first_name.trim()) return false
  const hasContact = !!(c.email && c.email.trim()) || !!(c.phone && c.phone.trim())
  if (!hasContact) return false
  const channel = (c.lead_channel || c.source || '').trim().toLowerCase()
  if (!channel || channel === 'unknown' || channel === 'test') return false
  const interest = String((c.custom_fields?.interest ?? '')).toLowerCase()
  const interestKnown =
    ['save', 'earn', 'both'].includes(interest) ||
    (c.tags || []).some((t) => /travel|family|cruise|vacation|member|save|earn/i.test(t)) ||
    !!opts?.hasQualifyingEvent
  if (!interestKnown) return false
  if (c.email && TEST_EMAIL_RE.test(c.email)) return false
  if (c.status && ['rejected', 'bounced'].includes(c.status.toLowerCase())) return false
  return true
}

/** Write-once stamp of qualified_at. Returns true only if it flipped this call. */
export async function maybeSetQualifiedAt(
  admin: Admin,
  contactId: string,
  opts: { trigger: 'status' | 'score' | 'action'; event?: string },
): Promise<boolean> {
  const { data: c } = await admin
    .from('contacts')
    .select('id,first_name,email,phone,source,lead_channel,status,lead_score,qualified_at,custom_fields,tags')
    .eq('id', contactId)
    .maybeSingle<QualifiableContact>()
  if (!c || c.qualified_at) return false

  let qualifies = false
  if (opts.trigger === 'status' && String(c.status ?? '').toLowerCase() === 'qualified') {
    qualifies = true
  } else if (opts.trigger === 'score' && (c.lead_score ?? 0) >= 40 && meetsMinimumStandard(c)) {
    qualifies = true
  } else if (
    opts.trigger === 'action' &&
    opts.event &&
    QUALIFYING_EVENTS.has(opts.event) &&
    meetsMinimumStandard(c, { hasQualifyingEvent: true })
  ) {
    qualifies = true
  }
  if (!qualifies) return false

  const { error, count } = await admin
    .from('contacts')
    .update({ qualified_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', contactId)
    .is('qualified_at', null)
  return !error && (count ?? 0) === 1
}
