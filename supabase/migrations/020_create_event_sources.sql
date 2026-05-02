-- Phase 14B: Destination/Event Campaign Engine — source registry.
-- Tracks where event/destination data comes from: hand-curated seed lists, ICS feeds, partner APIs, etc.
-- The Phase 14C event-research cron iterates over enabled rows and pulls candidate events from each source.

CREATE TABLE IF NOT EXISTS event_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity
  source_name TEXT UNIQUE NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'manual_seed', 'ics_feed', 'api', 'scrape', 'partner_feed', 'rss', 'other'
  )),
  source_url TEXT,
  description TEXT,

  -- Operational state
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pull_frequency_days INTEGER NOT NULL DEFAULT 7 CHECK (pull_frequency_days >= 1),

  -- Last pull tracking
  last_pulled_at TIMESTAMPTZ,
  last_pull_status TEXT CHECK (last_pull_status IS NULL OR last_pull_status IN (
    'success', 'failed', 'pending', 'partial'
  )),
  last_pull_error TEXT,
  last_pull_count INTEGER,

  -- Optional metadata: header names, query params, license info — NEVER raw secrets.
  -- Real credentials live in Vercel env vars; this column is for non-sensitive integration shape.
  credentials_metadata JSONB DEFAULT '{}',

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_sources_enabled ON event_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_event_sources_type ON event_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_event_sources_last_pulled ON event_sources(last_pulled_at);

DROP TRIGGER IF EXISTS event_sources_updated_at ON event_sources;
CREATE TRIGGER event_sources_updated_at
  BEFORE UPDATE ON event_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE event_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access event_sources" ON event_sources;
CREATE POLICY "Admins full access event_sources" ON event_sources
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
