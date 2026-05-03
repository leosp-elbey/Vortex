-- Phase 14H.1 — Tracking URL Materialization on content_calendar.
--
-- Adds a nullable `tracking_url` column so the push-to-calendar route can persist
-- the resolved campaign tracking URL alongside each calendar draft. The tracking URL
-- carries the canonical UTM tag from VORTEX_EVENT_CAMPAIGN_SKILL.md §11:
--   ?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event_slug}_{year}_{wave}
-- with placeholders resolved at push time.
--
-- Idempotent: column / index both use IF NOT EXISTS.
--
-- Existing content_calendar rows are unaffected:
--   - column is nullable, defaults to NULL
--   - legacy organic rows (no associated campaign asset) keep tracking_url = NULL
--   - non-functional / non-unique index — only there to make admin lookups by URL fast
--
-- Note on `campaign_assets.tracking_url`:
-- That column already exists per migration 018 (line 51) — this migration does NOT
-- recreate it. The Phase 14H.1 push-to-calendar route writes through to both columns
-- (the asset's column is filled lazily on push when it is currently NULL).

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS tracking_url TEXT;

COMMENT ON COLUMN content_calendar.tracking_url IS
  'Phase 14H.1: resolved campaign tracking URL with UTM tags. Written by /api/admin/campaigns/assets/[assetId]/push-to-calendar at push time. NULL for organic/legacy rows that did not originate from a campaign asset.';

-- Lookup index. Skips NULLs since organic rows do not need to be addressable by URL.
CREATE INDEX IF NOT EXISTS idx_content_calendar_tracking_url
  ON content_calendar(tracking_url)
  WHERE tracking_url IS NOT NULL;
