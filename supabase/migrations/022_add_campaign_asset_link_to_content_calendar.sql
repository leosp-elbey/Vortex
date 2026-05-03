-- Phase 14F: bridge approved campaign_assets into the existing content_calendar.
--
-- Adds a nullable back-reference from content_calendar to campaign_assets so a calendar
-- row knows which generated asset produced it. The forward reference already exists on
-- campaign_assets.content_calendar_id (see migration 018, line 71). With both ends in
-- place, the Phase 14F push route can look up either direction safely.
--
-- Idempotent: column / FK / partial unique index all use IF NOT EXISTS.
--
-- Existing content_calendar rows are unaffected:
--   - column is nullable, defaults to NULL
--   - partial unique index ignores NULLs, so legacy rows never collide

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS campaign_asset_id UUID
    REFERENCES campaign_assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN content_calendar.campaign_asset_id IS
  'Phase 14F: optional back-link to the campaign_assets row that produced this calendar row. NULL for organic/legacy rows.';

-- Partial unique index: at most one content_calendar row per campaign_asset, but unlimited
-- NULLs (legacy rows still allowed). Doubles as a fast lookup index for the push route's
-- belt-and-suspenders dedup check.
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_calendar_campaign_asset_unique
  ON content_calendar(campaign_asset_id)
  WHERE campaign_asset_id IS NOT NULL;
