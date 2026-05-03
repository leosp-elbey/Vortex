-- Phase 14I — Click attribution via track-event.
--
-- Extends `contact_events` (migration 008) with UTM capture columns and three
-- nullable foreign-key references that let `event_campaign_attribution_summary`
-- count campaign clicks deterministically rather than via fuzzy regex matching.
--
-- All columns are nullable. Legacy rows (organic clicks, non-campaign tracking)
-- keep all UTM/FK columns NULL — the click_match CTE in migration 028 reads
-- only rows where `utm_medium = 'event_campaign'` (and/or `event_campaign_id`
-- is set), so legacy rows are correctly ignored.
--
-- Idempotent: every column / index / FK uses IF NOT EXISTS or guarded ALTER.

ALTER TABLE contact_events
  ADD COLUMN IF NOT EXISTS utm_source           TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium           TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign         TEXT,
  ADD COLUMN IF NOT EXISTS utm_content          TEXT,
  ADD COLUMN IF NOT EXISTS event_campaign_id    UUID REFERENCES event_campaigns(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_asset_id    UUID REFERENCES campaign_assets(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_calendar_id  UUID REFERENCES content_calendar(id) ON DELETE SET NULL;

COMMENT ON COLUMN contact_events.utm_source IS
  'Phase 14I: lower-cased platform from the inbound UTM tag (e.g. instagram, facebook). NULL for organic / non-campaign events.';
COMMENT ON COLUMN contact_events.utm_medium IS
  'Phase 14I: UTM medium. The attribution view counts clicks only when this equals ''event_campaign''.';
COMMENT ON COLUMN contact_events.utm_campaign IS
  'Phase 14I: raw utm_campaign tag — typically <event_slug>_<year>_<wave>. Indexed for substring scans by the view.';
COMMENT ON COLUMN contact_events.utm_content IS
  'Phase 14I: raw utm_content tag — typically <asset_type>_<asset_id_short>. Used for asset-level resolution in the route.';
COMMENT ON COLUMN contact_events.event_campaign_id IS
  'Phase 14I: resolved campaign FK when the route was able to map the UTM tag to a campaign. NULL when unresolvable; the view falls back to substring match.';
COMMENT ON COLUMN contact_events.campaign_asset_id IS
  'Phase 14I: resolved campaign_asset FK when utm_content yielded a unique asset match. NULL when not resolvable.';
COMMENT ON COLUMN contact_events.content_calendar_id IS
  'Phase 14I: content_calendar row this event came from, when known. Currently inherits from the matched campaign_asset.content_calendar_id.';

-- Indexes — partial (skip NULLs) since organic events outnumber campaign events.
CREATE INDEX IF NOT EXISTS idx_contact_events_utm_campaign
  ON contact_events(utm_campaign)
  WHERE utm_campaign IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_events_utm_medium
  ON contact_events(utm_medium)
  WHERE utm_medium IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_events_event_campaign
  ON contact_events(event_campaign_id)
  WHERE event_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_events_campaign_asset
  ON contact_events(campaign_asset_id)
  WHERE campaign_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_events_content_calendar
  ON contact_events(content_calendar_id)
  WHERE content_calendar_id IS NOT NULL;
