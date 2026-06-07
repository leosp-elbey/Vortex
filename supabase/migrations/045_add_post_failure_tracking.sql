-- Phase 23B — per-row failure tracking for the autoposter.
--
-- Before this migration, the autoposter's only failure handling was a global
-- kill switch: the first definitive platform-API failure on ANY row flipped
-- site_settings.autoposter_cron_enabled to 'false' and halted ALL future ticks.
-- A single bad row (broken image URL, banned hashtag, etc.) blocked the entire
-- queue.
--
-- Phase 23B adds per-row failure tracking so the cron can:
--   1. Count failures per row
--   2. Auto-reject (status='rejected') after 3 consecutive failures
--   3. Keep posting other rows in the queue
--
-- Eligibility query also gains a `post_failure_count < 3` filter so even
-- rows whose status didn't flip (e.g. DB write failed during rejection)
-- are excluded.

ALTER TABLE content_calendar 
ADD COLUMN IF NOT EXISTS post_failure_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_post_failure_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_post_failure_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_content_calendar_failure_count
ON content_calendar(post_failure_count)
WHERE post_failure_count > 0;
