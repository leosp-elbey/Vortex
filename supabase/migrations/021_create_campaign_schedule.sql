-- Phase 14B: Destination/Event Campaign Engine — schedule.
-- Joins approved campaign_assets to a calendar slot. Phase 14F populates this from approved assets;
-- the existing posting routes (post-to-twitter, weekly-content, etc.) consume the rows when due.

CREATE TABLE IF NOT EXISTS campaign_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES event_campaigns(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES campaign_assets(id) ON DELETE CASCADE,

  -- Slot
  wave TEXT CHECK (wave IS NULL OR wave IN (
    'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'
  )),
  platform TEXT NOT NULL CHECK (platform IN (
    'instagram', 'facebook', 'tiktok', 'twitter', 'youtube',
    'threads', 'linkedin', 'email', 'sms', 'web'
  )),
  scheduled_for TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'queued', 'posted', 'skipped', 'failed', 'cancelled'
  )),
  posted_at TIMESTAMPTZ,
  post_url TEXT,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),

  -- Bridge to existing content_calendar (Phase 14F mirrors approved schedule entries here)
  content_calendar_id UUID REFERENCES content_calendar(id) ON DELETE SET NULL,

  -- Tracking URL for this specific slot (per-platform UTM-stamped)
  tracking_url TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_schedule_campaign ON campaign_schedule(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_schedule_asset ON campaign_schedule(asset_id);
CREATE INDEX IF NOT EXISTS idx_campaign_schedule_status ON campaign_schedule(status);
CREATE INDEX IF NOT EXISTS idx_campaign_schedule_scheduled_for ON campaign_schedule(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_campaign_schedule_platform ON campaign_schedule(platform);
CREATE INDEX IF NOT EXISTS idx_campaign_schedule_content_calendar ON campaign_schedule(content_calendar_id);

DROP TRIGGER IF EXISTS campaign_schedule_updated_at ON campaign_schedule;
CREATE TRIGGER campaign_schedule_updated_at
  BEFORE UPDATE ON campaign_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE campaign_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access campaign_schedule" ON campaign_schedule;
CREATE POLICY "Admins full access campaign_schedule" ON campaign_schedule
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
