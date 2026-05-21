// Phase 18.1D — server-side SMS consent gate.
//
// A contact may be sent SMS only if their custom_fields carries an explicit
// consent flag. Accepts the current `sms_transactional_consent` key or the
// legacy `sms_consent` key, as either the string 'true' or boolean true.
//
// FAIL-CLOSED: null / empty / missing custom_fields, or both keys absent,
// returns false.

export function hasSmsConsent(contact: {
  custom_fields?: Record<string, unknown> | null
}): boolean {
  const cf = contact.custom_fields
  if (!cf) return false
  const transactional = cf.sms_transactional_consent
  const legacy = cf.sms_consent
  return (
    transactional === 'true' ||
    transactional === true ||
    legacy === 'true' ||
    legacy === true
  )
}
