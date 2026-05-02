-- Phase 14B: Destination/Event Campaign Engine — score history.
-- One row per (campaign × scoring run). Tracks how the 1-100 score drifts as the event approaches.
-- Breakdown JSONB carries the 10 weighted dimensions defined in VORTEX_EVENT_CAMPAIGN_SKILL.md §9.

CREATE TABLE IF NOT EXISTS campaign_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES event_campaigns(id) ON DELETE CASCADE,

  -- When this score applies to (use week_of for cron-driven weekly scoring)
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  week_of DATE,

  -- Top-line score (1-100)
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 100),

  -- Per-dimension breakdown. Expected keys (each 0-15 weighted):
  --   travel_demand, hotel_pressure, group_travel, buying_intent,
  --   social_potential, commission_potential, urgency, competition_level,
  --   addon_opportunity, repeatability
  breakdown JSONB DEFAULT '{}',

  -- Provenance
  generated_by TEXT NOT NULL DEFAULT 'cron' CHECK (generated_by IN (
    'cron', 'manual', 'claude', 'openrouter', 'partner'
  )),
  model_used TEXT,
  generation_job_id UUID REFERENCES ai_jobs(id) ON DELETE SET NULL,

  -- Free-form analyst notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_scores_campaign ON campaign_scores(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_scores_scored_at ON campaign_scores(scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_scores_week_of ON campaign_scores(week_of);
CREATE INDEX IF NOT EXISTS idx_campaign_scores_score ON campaign_scores(score DESC);

ALTER TABLE campaign_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access campaign_scores" ON campaign_scores;
CREATE POLICY "Admins full access campaign_scores" ON campaign_scores
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
