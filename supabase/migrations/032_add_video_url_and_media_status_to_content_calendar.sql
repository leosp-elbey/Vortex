-- Phase 14L.2 — Media generation storage on content_calendar.
--
-- Adds the columns needed for the media-generation worker (Phase 14L.2 +
-- future) to land generated media URLs and track per-row generation state
-- on organic rows that have no campaign_assets parent.
--
-- Why on content_calendar (and not only campaign_assets):
--   - campaign_assets already has image_url / video_url / image_source /
--     video_source (migration 018). Campaign-originated rows get their media
--     via the JOIN through content_calendar.campaign_asset_id.
--   - Organic rows (no campaign_asset_id) currently have NO place to land a
--     generated image/video URL beyond a legacy `image_url` column that was
--     attached out-of-band. There is also no way to record per-row generation
--     state ("we tried Pexels, it failed, here's why").
--   - Adding video_url + media_status* to content_calendar gives organic rows
--     the same media surface as campaign rows, without breaking the JOIN
--     (the dashboard / posting gate fall back to row-level fields when no
--     campaign_asset_id is set).
--
-- Behavioral guarantees:
--   - All columns are nullable / default-safe. Existing rows continue to
--     behave exactly as before — gate refusals are unchanged for rows with
--     `media_status` IS NULL (treated as "no opinion", platform rules apply
--     as today).
--   - No mutation of existing posted rows. No mutation of any rows with
--     posted_at set.
--   - Idempotent — every operation guards with IF NOT EXISTS / DROP IF EXISTS.

-- ============================================================
-- Step 1 — add the columns.
-- ============================================================

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS video_url            TEXT,
  ADD COLUMN IF NOT EXISTS media_status         TEXT,
  ADD COLUMN IF NOT EXISTS media_generated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_source         TEXT,
  ADD COLUMN IF NOT EXISTS media_error          TEXT;

-- ============================================================
-- Step 2 — backfill `media_status` on rows already carrying a media URL.
--
-- Rationale: the worker is the only writer in 14L.2 onward; for legacy rows
-- that already have an image_url or video_url (set out-of-band before this
-- migration), classify them as 'ready' so the posting gate's media check
-- passes the same as today. Posted/rejected rows are explicitly excluded so
-- historical state is preserved.
-- ============================================================

-- (Re-run safe: only touches rows where media_status IS NULL.)
UPDATE content_calendar
SET media_status = 'ready'
WHERE media_status IS NULL
  AND posted_at IS NULL
  AND status NOT IN ('posted', 'rejected')
  AND (
    (image_url IS NOT NULL AND length(trim(image_url)) > 0)
    OR (video_url IS NOT NULL AND length(trim(video_url)) > 0)
  );

-- ============================================================
-- Step 3 — defaults for future inserts + CHECK constraint.
-- ============================================================

ALTER TABLE content_calendar
  ALTER COLUMN media_status SET DEFAULT 'pending';

ALTER TABLE content_calendar
  DROP CONSTRAINT IF EXISTS content_calendar_media_status_check;

ALTER TABLE content_calendar
  ADD CONSTRAINT content_calendar_media_status_check
    CHECK (media_status IS NULL OR media_status IN (
      'pending',  -- worker has not run yet; platform rules decide refusal
      'ready',    -- worker (or backfill) populated image_url/video_url
      'failed',   -- worker tried and failed; media_error explains
      'skipped'   -- explicitly skipped (text-only intent or out-of-scope row)
    ));

COMMENT ON COLUMN content_calendar.video_url IS
  'Phase 14L.2: public URL of generated/attached video media for this row. NULL on rows that do not need video. Populated by the media-generation worker (HeyGen) or copied from a campaign_assets join. content_calendar previously had no video_url column — organic TikTok rows had no place to land a generated URL.';
COMMENT ON COLUMN content_calendar.media_status IS
  'Phase 14L.2: per-row media generation state. pending (default for new rows), ready (image_url/video_url populated), failed (worker errored — see media_error), skipped (text-only or explicitly bypassed). Posting gate consumes this when present; NULL is treated as no-opinion (platform rules apply).';
COMMENT ON COLUMN content_calendar.media_generated_at IS
  'Phase 14L.2: timestamp the media-generation worker last wrote a media URL to this row. NULL when the worker has not yet succeeded.';
COMMENT ON COLUMN content_calendar.media_source IS
  'Phase 14L.2: which provider produced the media. Free-text today (e.g. "pexels", "openai-image", "heygen", "manual") so the worker can label without a schema change. CHECK constraint deferred until the provider list stabilizes.';
COMMENT ON COLUMN content_calendar.media_error IS
  'Phase 14L.2: most recent failure reason from the media-generation worker. NULL on success / pending. Truncated to 1000 chars by the worker before insert.';

-- ============================================================
-- Step 4 — partial indexes for the worker queue.
--
-- The worker scans rows where media_status IS NULL or = 'pending' (work to
-- do) or = 'failed' (re-tryable). 'ready' / 'skipped' rows are filtered out
-- of every scan, so the partial index keeps it small.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_content_calendar_media_status
  ON content_calendar(media_status)
  WHERE media_status IS NULL OR media_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_content_calendar_media_generated_at
  ON content_calendar(media_generated_at)
  WHERE media_generated_at IS NOT NULL;
