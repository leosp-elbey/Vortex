-- Retroactive migration for an existing prod table.
-- Tracks events per contact for lead scoring (page views, CTA clicks, form submits).
-- Written by /api/webhooks/track-event.
-- Schema verified against src/app/api/webhooks/track-event/route.ts:69 insert.

CREATE TABLE IF NOT EXISTS contact_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  score_delta INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_events_contact ON contact_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_events_event ON contact_events(event);
CREATE INDEX IF NOT EXISTS idx_contact_events_created ON contact_events(created_at DESC);

ALTER TABLE contact_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access contact_events" ON contact_events;
CREATE POLICY "Admins full access contact_events" ON contact_events
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
