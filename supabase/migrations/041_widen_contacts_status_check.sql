-- Phase 21G: Widen contacts_status_check to match SUPPRESSED_CONTACT_STATUSES
-- Adds: bounced, unsubscribed, rejected
-- Existing values preserved: lead, qualified, quoted, member, churned

ALTER TABLE contacts
  DROP CONSTRAINT contacts_status_check;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_status_check
  CHECK (status IN (
    'lead',
    'qualified',
    'quoted',
    'member',
    'churned',
    'unsubscribed',
    'bounced',
    'rejected'
  ));
