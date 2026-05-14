// Phase 14AQ — single source of truth for contact statuses that should
// block sequence queueing AND sequence sending. Three call sites import
// from here, so widening the list later only touches one file.
//
// Statuses in this list will:
//   - Block new sequence_queue inserts at the lead-created webhook
//   - Block new sequence_queue inserts at the bulk import route
//   - Block sends from existing pending sequence_queue rows at the
//     send-sequences cron (rows are marked status='skipped')
//
// The list is intentionally generous — any of these states means the
// contact should not receive automated outreach.

export const SUPPRESSED_CONTACT_STATUSES = [
  'churned',
  'unsubscribed',
  'bounced',
  'rejected',
] as const

export type SuppressedContactStatus = typeof SUPPRESSED_CONTACT_STATUSES[number]

/**
 * True when the contact's current status means we should NOT send or
 * queue automated sequence messages. Defensive against null/undefined
 * + casing variants. Returns false for any unknown status — fail-open
 * so we don't accidentally suppress healthy contacts on schema drift.
 */
export function isSuppressedContactStatus(status: string | null | undefined): boolean {
  if (!status || typeof status !== 'string') return false
  const normalized = status.trim().toLowerCase()
  return (SUPPRESSED_CONTACT_STATUSES as readonly string[]).includes(normalized)
}
