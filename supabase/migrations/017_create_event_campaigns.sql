-- Phase 14B: Destination/Event Campaign Engine — root table.
-- One row per (event × year). Drives campaign_assets, campaign_scores, campaign_schedule.
-- Spec: VORTEX_EVENT_CAMPAIGN_SKILL.md (categories, waves, scoring, compliance).

CREATE TABLE IF NOT EXISTS event_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity
  campaign_name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_year INTEGER NOT NULL CHECK (event_year BETWEEN 2024 AND 2099),

  -- Geography (worldwide-friendly)
  destination_city TEXT NOT NULL,
  destination_country TEXT,
  destination_region TEXT,

  -- Audience and categories (skill §3 — array of category strings; validated in app code)
  categories TEXT[] DEFAULT '{}',
  audience TEXT[] DEFAULT '{}',

  -- Travel window (when bookings actually happen)
  event_start_date DATE,
  event_end_date DATE,
  travel_window_start DATE,
  travel_window_end DATE,

  -- Scoring (skill §9 — 1-100; full breakdown lives in campaign_scores)
  score INTEGER CHECK (score IS NULL OR (score BETWEEN 1 AND 100)),
  score_updated_at TIMESTAMPTZ,

  -- Lifecycle (user-requested status enum)
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN (
    'idea', 'draft', 'approved', 'scheduled', 'active', 'archived'
  )),

  -- Cruise add-on (skill §6)
  is_cruise BOOLEAN DEFAULT FALSE,
  departure_city TEXT,
  cruise_line TEXT,

  -- Campaign angles (skill §5)
  hotel_angle TEXT,
  cruise_angle TEXT,
  flight_angle TEXT,
  group_travel_angle TEXT,

  -- Top-of-funnel copy
  lead_magnet_idea TEXT,
  landing_page_headline TEXT,
  cta_text TEXT,
  cta_url TEXT,

  -- Tracking URL template (e.g. ?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event}_{year}_{wave})
  tracking_url_template TEXT,

  -- Yearly repeatability
  repeats_yearly BOOLEAN DEFAULT TRUE,
  parent_campaign_id UUID REFERENCES event_campaigns(id) ON DELETE SET NULL,

  -- Human approval gate (compliance §7)
  requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- AI generation + verification metadata
  generation_job_id UUID REFERENCES ai_jobs(id) ON DELETE SET NULL,
  verification_log_id UUID REFERENCES ai_verification_logs(id) ON DELETE SET NULL,
  generation_metadata JSONB DEFAULT '{}',
  verification_metadata JSONB DEFAULT '{}',

  -- Free-form notes (compliance flags, manual edits, etc.)
  notes TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_campaigns_status ON event_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_event_campaigns_event_year ON event_campaigns(event_year);
CREATE INDEX IF NOT EXISTS idx_event_campaigns_event_start ON event_campaigns(event_start_date);
CREATE INDEX IF NOT EXISTS idx_event_campaigns_score ON event_campaigns(score DESC);
CREATE INDEX IF NOT EXISTS idx_event_campaigns_destination_city ON event_campaigns(destination_city);
CREATE INDEX IF NOT EXISTS idx_event_campaigns_categories ON event_campaigns USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_event_campaigns_parent ON event_campaigns(parent_campaign_id);
CREATE INDEX IF NOT EXISTS idx_event_campaigns_created ON event_campaigns(created_at DESC);

DROP TRIGGER IF EXISTS event_campaigns_updated_at ON event_campaigns;
CREATE TRIGGER event_campaigns_updated_at
  BEFORE UPDATE ON event_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE event_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access event_campaigns" ON event_campaigns;
CREATE POLICY "Admins full access event_campaigns" ON event_campaigns
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
