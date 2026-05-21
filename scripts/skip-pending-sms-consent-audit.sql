-- Phase 18.1B — defensively skip pending SMS rows pending a consent audit.
--
-- Marks every still-pending SMS row as 'skipped' when its contact has no
-- recorded SMS consent (empty custom_fields, or neither the new
-- sms_transactional_consent nor the legacy sms_consent key present).
--
-- IDEMPOTENT: the WHERE clause matches only rows still in 'pending', so
-- re-running this is a no-op once the rows have already been skipped.
--
-- COLUMN NOTE — schema check against migration 006_create_sequence_queue.sql:
-- the table has NO `skipped_reason` and NO `skipped_at` columns. The
-- intended SET clauses for those were therefore OMITTED so this script runs
-- as-is. The `status` CHECK constraint already allows 'skipped'. If an audit
-- trail for the skip is wanted, that is a separate follow-up:
--     ALTER TABLE sequence_queue
--       ADD COLUMN IF NOT EXISTS skipped_reason TEXT,
--       ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;
-- Not done here — adding columns is left as an explicit operator decision.
--
-- Run manually in the Supabase SQL editor. NOT executed from app code.

UPDATE sequence_queue
SET status = 'skipped'
WHERE channel = 'sms'
  AND status = 'pending'
  AND contact_id IN (
    SELECT id FROM contacts
    WHERE custom_fields = '{}'::jsonb
       OR custom_fields->>'sms_transactional_consent' IS NULL
       OR custom_fields->>'sms_consent' IS NULL
  );
