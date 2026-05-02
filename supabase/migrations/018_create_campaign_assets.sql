-- Phase 14B: Destination/Event Campaign Engine — generated assets.
-- One row per piece of generated content (post, email, video script, image prompt, etc.).
-- Parent: event_campaigns. Optional bridge to existing content_calendar for scheduling/posting.

CREATE TABLE IF NOT EXISTS campaign_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES event_campaigns(id) ON DELETE CASCADE,

  -- Wave and asset taxonomy (skill §4 + §5)
  wave TEXT CHECK (wave IS NULL OR wave IN (
    'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'
  )),
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'social_post',
    'short_form_script',
    'email_subject',
    'email_body',
    'dm_reply',
    'hashtag_set',
    'image_prompt',
    'video_prompt',
    'landing_headline',
    'lead_magnet'
  )),

  -- Platform (only for distributable asset types)
  platform TEXT CHECK (platform IS NULL OR platform IN (
    'instagram', 'facebook', 'tiktok', 'twitter', 'youtube',
    'threads', 'linkedin', 'email', 'sms', 'web'
  )),

  -- Content
  body TEXT,
  hashtags TEXT[] DEFAULT '{}',

  -- Image source (Pexels-first, OpenAI fallback, manual override)
  image_url TEXT,
  image_source TEXT CHECK (image_source IS NULL OR image_source IN (
    'pexels', 'openai', 'heygen', 'manual', 'unsplash', 'other'
  )),
  image_source_metadata JSONB DEFAULT '{}',

  -- Video source (HeyGen-first; optional)
  video_url TEXT,
  video_source TEXT CHECK (video_source IS NULL OR video_source IN (
    'heygen', 'manual', 'openai', 'other'
  )),
  video_source_metadata JSONB DEFAULT '{}',

  -- Distribution
  tracking_url TEXT,
  scheduled_for TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  post_url TEXT,

  -- Lifecycle (matches event_campaigns enum + posted/rejected)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'idea', 'draft', 'approved', 'scheduled', 'posted', 'archived', 'rejected'
  )),
  requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- AI generation + verification metadata
  generation_job_id UUID REFERENCES ai_jobs(id) ON DELETE SET NULL,
  verification_log_id UUID REFERENCES ai_verification_logs(id) ON DELETE SET NULL,
  generation_metadata JSONB DEFAULT '{}',
  verification_metadata JSONB DEFAULT '{}',

  -- Bridge to existing content_calendar (Phase 14F will populate this)
  content_calendar_id UUID REFERENCES content_calendar(id) ON DELETE SET NULL,

  -- Engagement (post-publish)
  engagement_metrics JSONB DEFAULT '{}',

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_assets_campaign ON campaign_assets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_wave ON campaign_assets(wave);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_status ON campaign_assets(status);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_platform ON campaign_assets(platform);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_scheduled ON campaign_assets(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_asset_type ON campaign_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_content_calendar ON campaign_assets(content_calendar_id);

DROP TRIGGER IF EXISTS campaign_assets_updated_at ON campaign_assets;
CREATE TRIGGER campaign_assets_updated_at
  BEFORE UPDATE ON campaign_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE campaign_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access campaign_assets" ON campaign_assets;
CREATE POLICY "Admins full access campaign_assets" ON campaign_assets
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
