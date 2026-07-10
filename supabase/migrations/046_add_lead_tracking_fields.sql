-- Phase LE-1 — additive lead-engine tracking fields.
--
-- Enables per-day tracking of "20 qualified organic leads/day". ALL columns are
-- nullable and additive. No CHECK constraint is tightened, no column is dropped
-- or renamed, no data is mutated. Trivially reversible (rollback block below).
--
--   lead_channel   — normalized organic channel (facebook/instagram/tiktok/
--                    youtube/linkedin/google/referral/email/sms/quiz/organic/
--                    manual/other/unknown). Populated at intake.
--   qualified_at   — set the FIRST time a lead meets the Qualified Standard;
--                    write-once (never overwritten).
--   booked_at      — set the first time the lead books / clicks /book.
--   social_profile — optional social handle/URL.
--
-- ⚠️ DEPLOY ORDER: apply this migration to production BEFORE deploying the
-- code that writes these columns (lead-created / contacts / track-event),
-- otherwise those writes fail with 42703.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_channel   TEXT,
  ADD COLUMN IF NOT EXISTS qualified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booked_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS social_profile TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_created_at   ON contacts(created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_qualified_at ON contacts(qualified_at) WHERE qualified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_lead_channel ON contacts(lead_channel) WHERE lead_channel IS NOT NULL;

-- ============================================================
-- ROLLBACK (run only if reverting; drops only the 4 new additive columns):
-- ALTER TABLE contacts
--   DROP COLUMN IF EXISTS lead_channel,
--   DROP COLUMN IF EXISTS qualified_at,
--   DROP COLUMN IF EXISTS booked_at,
--   DROP COLUMN IF EXISTS social_profile;
-- DROP INDEX IF EXISTS idx_contacts_created_at;
-- DROP INDEX IF EXISTS idx_contacts_qualified_at;
-- DROP INDEX IF EXISTS idx_contacts_lead_channel;
-- ============================================================
