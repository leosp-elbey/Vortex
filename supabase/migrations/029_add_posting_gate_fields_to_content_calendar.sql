-- Phase 14J — Safe posting gate / manual publish controls.
--
-- Adds a parallel "gate" lifecycle to content_calendar so an explicit human
-- approval is required before any future automated poster can publish a row.
-- This phase does NOT itself post; the gate is a signal future cron-driven
-- posters must respect.
--
-- Why a separate posting_status column instead of reusing the existing `status`:
--   `content_calendar.status` (migration 004) is the canonical lifecycle —
--   draft → approved → posted/rejected. The dashboard's manual posting
--   buttons (`/api/automations/post-to-instagram` etc.) already check
--   `status='approved'` before publishing. Replacing it would break that
--   contract. The new `posting_status` lives alongside `status` and answers
--   a different question: "is this row queued for the (future) autoposter?"
--
-- All columns nullable / default-safe so existing rows continue to behave
-- exactly as before (gate sits at posting_status='idle' until an admin
-- explicitly marks ready).
--
-- Idempotent: every operation guards with IF NOT EXISTS / DROP IF EXISTS.

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS posting_status            TEXT,
  ADD COLUMN IF NOT EXISTS posting_gate_approved     BOOLEAN,
  ADD COLUMN IF NOT EXISTS posting_gate_approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posting_gate_approved_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS posting_gate_notes        TEXT,
  ADD COLUMN IF NOT EXISTS queued_for_posting_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_posting_only       BOOLEAN,
  ADD COLUMN IF NOT EXISTS posting_block_reason      TEXT;

-- Backfill defaults for existing rows. Done as separate UPDATEs so the schema
-- change runs even if the column-level DEFAULT was added too late to apply
-- to rows inserted before this migration.
UPDATE content_calendar SET posting_status        = 'idle' WHERE posting_status IS NULL;
UPDATE content_calendar SET posting_gate_approved = FALSE  WHERE posting_gate_approved IS NULL;
UPDATE content_calendar SET manual_posting_only   = TRUE   WHERE manual_posting_only IS NULL;

-- Now that backfills are done, set defaults for future inserts AND attach a
-- CHECK constraint on posting_status. CHECK is added separately so DROP IF
-- EXISTS works cleanly on re-run.
ALTER TABLE content_calendar
  ALTER COLUMN posting_status        SET DEFAULT 'idle',
  ALTER COLUMN posting_gate_approved SET DEFAULT FALSE,
  ALTER COLUMN manual_posting_only   SET DEFAULT TRUE;

ALTER TABLE content_calendar
  DROP CONSTRAINT IF EXISTS content_calendar_posting_status_check;

ALTER TABLE content_calendar
  ADD CONSTRAINT content_calendar_posting_status_check
    CHECK (posting_status IS NULL OR posting_status IN ('idle', 'ready', 'blocked'));

COMMENT ON COLUMN content_calendar.posting_status IS
  'Phase 14J: gate lifecycle — idle (default), ready (admin approved for posting), blocked (admin held). Distinct from `status` which tracks draft/approved/posted/rejected. Future autoposter will require posting_status=''ready''.';
COMMENT ON COLUMN content_calendar.posting_gate_approved IS
  'Phase 14J: TRUE when an admin explicitly clicked Mark Ready. The future autoposter must require this AND posting_status=''ready'' before calling any platform API.';
COMMENT ON COLUMN content_calendar.posting_gate_approved_at IS
  'Phase 14J: timestamp of the most recent Mark Ready action. Cleared on Remove from Queue.';
COMMENT ON COLUMN content_calendar.posting_gate_approved_by IS
  'Phase 14J: auth.users(id) of the admin who clicked Mark Ready. NULL when unqueued or never queued.';
COMMENT ON COLUMN content_calendar.posting_gate_notes IS
  'Phase 14J: optional free-text note left by the admin during queue/unqueue.';
COMMENT ON COLUMN content_calendar.queued_for_posting_at IS
  'Phase 14J: timestamp when posting_status flipped to ready. Identical to posting_gate_approved_at today; future cron may reset this when picking up a row without affecting the approval timestamp.';
COMMENT ON COLUMN content_calendar.manual_posting_only IS
  'Phase 14J: when TRUE (default), this row may only be posted via the manual dashboard buttons. Future autoposter must skip rows where this is TRUE. Inverting requires explicit operator action.';
COMMENT ON COLUMN content_calendar.posting_block_reason IS
  'Phase 14J: free-text reason set on Remove from Queue or by an automated guard. Surfaces in the dashboard so the operator knows why a row was unqueued.';

-- Indexes — partial WHERE clauses keep them small since the default row state
-- (idle, not approved, no queue timestamp) doesn't need indexing.
CREATE INDEX IF NOT EXISTS idx_content_calendar_posting_status
  ON content_calendar(posting_status)
  WHERE posting_status IS NOT NULL AND posting_status <> 'idle';

CREATE INDEX IF NOT EXISTS idx_content_calendar_posting_gate_approved
  ON content_calendar(posting_gate_approved)
  WHERE posting_gate_approved = TRUE;

CREATE INDEX IF NOT EXISTS idx_content_calendar_queued_for_posting_at
  ON content_calendar(queued_for_posting_at)
  WHERE queued_for_posting_at IS NOT NULL;
