-- Phase 21A — columns for the cinematic YouTube video pipeline.
--
-- The pipeline runs:
--   1. ElevenLabs voiceover  → elevenlabs_audio_url
--   2. Kling AI video render → kling_job_id (then content_calendar.video_url
--                                            once the async job finalizes)
--   3. YouTube upload        → youtube_video_id, youtube_title, youtube_description
--
-- Why dedicated columns instead of more JSONB on media_metadata:
--   - youtube-once already stores youtube_video_id inside
--     content_calendar.media_metadata (Phase 14AS). That JSONB pathway is
--     fine for the existing TikTok-derived rows but indexed lookups on
--     youtube_video_id and overriding title/description per-row from the
--     new cinematic pipeline are both cleaner against typed columns.
--   - elevenlabs_audio_url and kling_job_id are new concerns with no
--     existing JSONB home — they get their own columns from the start.
--
-- Behavioral guarantees:
--   - All five columns are nullable. Existing FB / IG / TikTok / YouTube
--     rows are unaffected and no historical row is mutated.
--   - youtube-once continues to consume media_metadata.youtube_video_id;
--     a future phase can backfill the new column from JSONB once the
--     cinematic pipeline is the source of truth.
--   - Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS elevenlabs_audio_url  TEXT,
  ADD COLUMN IF NOT EXISTS kling_job_id          TEXT,
  ADD COLUMN IF NOT EXISTS youtube_video_id      TEXT,
  ADD COLUMN IF NOT EXISTS youtube_title         TEXT,
  ADD COLUMN IF NOT EXISTS youtube_description   TEXT;

COMMENT ON COLUMN content_calendar.elevenlabs_audio_url IS
  'Phase 21A: public URL of the ElevenLabs voiceover MP3 in Supabase Storage (path audio/vo/<id>.mp3). NULL on non-video rows or before VO generation.';
COMMENT ON COLUMN content_calendar.kling_job_id IS
  'Phase 21A: Kling AI video render job id. Polled async by a future worker; resulting video URL lands in content_calendar.video_url once the render finishes.';
COMMENT ON COLUMN content_calendar.youtube_video_id IS
  'Phase 21A: YouTube video id returned by the Data API upload. Denormalized from media_metadata.youtube_video_id for indexed lookups by future analytics queries.';
COMMENT ON COLUMN content_calendar.youtube_title IS
  'Phase 21A: title shown on YouTube. Overrides the caption-derived default in /api/cron/youtube-once when set. Capped at 100 chars by the YouTube Data API.';
COMMENT ON COLUMN content_calendar.youtube_description IS
  'Phase 21A: description shown on YouTube. Overrides the caption-derived default in /api/cron/youtube-once when set. Capped at 5000 chars by the YouTube Data API.';

-- Partial index for queue scans against pending Kling renders. Same pattern
-- as the media_status index in migration 032 — only rows with a job id ride
-- the index, keeping it cheap.
CREATE INDEX IF NOT EXISTS idx_content_calendar_kling_job_id
  ON content_calendar(kling_job_id)
  WHERE kling_job_id IS NOT NULL;

-- Partial index for YouTube analytics joins (looking up a row by its
-- platform-side video id).
CREATE INDEX IF NOT EXISTS idx_content_calendar_youtube_video_id
  ON content_calendar(youtube_video_id)
  WHERE youtube_video_id IS NOT NULL;
