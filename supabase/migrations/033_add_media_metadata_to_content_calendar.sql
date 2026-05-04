-- Phase 14L.2.2 — Clean home for media job-tracking metadata on
-- content_calendar (organic rows).
--
-- Why this column:
--   - campaign_assets already has video_source_metadata JSONB (migration
--     018) — the right home for HeyGen video_id on campaign-originated rows.
--   - content_calendar (organic rows) had no JSONB metadata column. The
--     Phase 14L.2.1 worker overloaded `media_error` with a
--     `heygen_video_id:<id>` sentinel as a stop-gap. That works (the
--     validator only reads media_error when media_status='failed'), but
--     it's semantically wrong and makes the polling script fragile.
--   - This migration adds `media_metadata JSONB` so the worker can store
--     job ids, provider responses, and provenance cleanly without
--     touching media_error.
--
-- Behavioral guarantees:
--   - Column is NULL-safe (DEFAULT '{}'::jsonb so reads never crash).
--   - No rows are mutated. The Phase 14L.2.1 polling script will
--     continue reading media_error as a fallback for the brief window
--     between deploy and any subsequent backfill — but at the time of
--     this migration there are 0 pending HeyGen jobs in production, so
--     no backfill is needed.
--   - Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS media_metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN content_calendar.media_metadata IS
  'Phase 14L.2.2: provider-specific metadata for the row''s media. Worker writes here (not into media_error). Examples: {"heygen_video_id":"...","queued_at":"..."} for an in-flight HeyGen render; {"pexels_photo_id":"..."} for a stored Pexels image. Validator never reads this — purely operational state.';

-- A GIN index keeps lookups by `heygen_video_id` cheap if the worker
-- queue grows. Partial — only rows that actually carry metadata.
CREATE INDEX IF NOT EXISTS idx_content_calendar_media_metadata
  ON content_calendar USING gin (media_metadata)
  WHERE media_metadata IS NOT NULL AND media_metadata <> '{}'::jsonb;
