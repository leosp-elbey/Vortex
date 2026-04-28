-- Retroactive migration for an existing prod table.
-- Stores scheduled drip steps (email + SMS) for lead-nurture, sba-onboarding, mlm-outreach sequences.
-- Processed daily by /api/cron/send-sequences.

CREATE TABLE IF NOT EXISTS sequence_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  sequence_name TEXT NOT NULL CHECK (sequence_name IN ('lead-nurture', 'sba-onboarding', 'mlm-outreach')),
  step INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  template_key TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sequence_queue_contact ON sequence_queue(contact_id);
CREATE INDEX IF NOT EXISTS idx_sequence_queue_status_scheduled ON sequence_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sequence_queue_sequence ON sequence_queue(sequence_name);

ALTER TABLE sequence_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access sequence_queue" ON sequence_queue;
CREATE POLICY "Admins full access sequence_queue" ON sequence_queue
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
