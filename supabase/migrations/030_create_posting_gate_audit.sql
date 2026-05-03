-- Phase 14J.1 — Posting gate audit trail.
--
-- Records every Mark Ready / Remove from Queue / blocked-attempt action so
-- an operator can answer "who queued this row, when, and why was it pulled?"
-- before any future autoposter is introduced.
--
-- Idempotent: CREATE TABLE / INDEX / POLICY all guarded with IF NOT EXISTS
-- or DROP IF EXISTS. Re-running the migration is safe.
--
-- RLS pattern follows the project's existing convention (see migration 015 —
-- ai_verification_logs): admin_users full access, service-role bypasses RLS
-- for the helper to write rows from the API route.

CREATE TABLE IF NOT EXISTS posting_gate_audit (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_calendar_id      UUID NOT NULL REFERENCES content_calendar(id) ON DELETE CASCADE,

  -- Action taxonomy:
  --   'queue'    — admin clicked Mark Ready and the gate flipped to ready
  --   'unqueue'  — admin clicked Remove from Queue and the gate flipped to idle
  --   'blocked'  — admin clicked Mark Ready but the eligibility check failed
  --                (no state change; recorded so operators can see refused attempts)
  action                   TEXT NOT NULL CHECK (action IN ('queue', 'unqueue', 'blocked')),

  -- State snapshot — captured before/after the action so the row's history
  -- is reconstructable from this table alone.
  previous_posting_status  TEXT,
  new_posting_status       TEXT,
  previous_gate_approved   BOOLEAN,
  new_gate_approved        BOOLEAN,

  -- Actor: auth.users id when the request came through requireAdminUser().
  -- Email is denormalized at write time so the audit row keeps meaningful
  -- attribution even if the user account is later deleted (FK is SET NULL).
  actor_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email              TEXT,

  -- Free-text fields the dashboard surfaces.
  notes                    TEXT,
  block_reason             TEXT,

  -- Open-ended slot for future fields (e.g. ip / user_agent / autoposter run id).
  metadata                 JSONB DEFAULT '{}'::jsonb,

  created_at               TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE posting_gate_audit IS
  'Phase 14J.1: append-only audit trail for content_calendar posting-gate transitions. Written by src/lib/posting-gate.ts after every successful queue/unqueue and every refused (blocked) Mark Ready attempt.';

CREATE INDEX IF NOT EXISTS idx_posting_gate_audit_calendar
  ON posting_gate_audit(content_calendar_id);

CREATE INDEX IF NOT EXISTS idx_posting_gate_audit_action
  ON posting_gate_audit(action);

CREATE INDEX IF NOT EXISTS idx_posting_gate_audit_created
  ON posting_gate_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posting_gate_audit_actor
  ON posting_gate_audit(actor_id)
  WHERE actor_id IS NOT NULL;

ALTER TABLE posting_gate_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access posting_gate_audit" ON posting_gate_audit;
CREATE POLICY "Admins full access posting_gate_audit" ON posting_gate_audit
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
