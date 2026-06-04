-- Phase 22F — Vortex invite tracking + queue.
--
-- Background: a daily cron at 09:30 UTC queues 50 contacts for invite into
-- the Vortex travel portal. The actual outbound send is performed by an
-- operator-driven Claude in Chrome automation against Surge365's
-- SendEmails web method (session-authed, not API-key-authed), so the cron
-- only STAGES the contacts into vortex_invite_queue. The queue row's
-- status flips from 'pending' to 'sent' after the automation runs.
--
-- Idempotency: the cron sets contacts.vortex_invited_at on queue insert
-- so the same contact is never re-queued (the cron filter is
-- `vortex_invited_at IS NULL`). If a send fails downstream, the operator
-- can manually clear vortex_invited_at on the affected rows to re-queue.

-- 1. Add the per-contact "in our invite pipeline" timestamp.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS vortex_invited_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index: only NULL rows are interesting for the cron's daily query.
-- Postgres stores nothing for rows where the predicate is false, so the
-- index stays small as the contacts table grows.
CREATE INDEX IF NOT EXISTS idx_contacts_vortex_invited
  ON contacts(vortex_invited_at)
  WHERE vortex_invited_at IS NULL;

-- 2. Staging table — one row per queued contact per cron tick.
CREATE TABLE IF NOT EXISTS vortex_invite_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID REFERENCES contacts(id),
  first_name  TEXT,
  last_name   TEXT,
  email       TEXT,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  queued_at   TIMESTAMPTZ DEFAULT NOW(),
  sent_at     TIMESTAMPTZ DEFAULT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Partial index for the dashboard's "what's pending now" query.
CREATE INDEX IF NOT EXISTS idx_vortex_queue_status
  ON vortex_invite_queue(status)
  WHERE status = 'pending';
