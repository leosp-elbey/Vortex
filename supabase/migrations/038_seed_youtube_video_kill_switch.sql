-- Phase 21C — seed YouTube video orchestrator kill switch.
--
-- Mirrors migration 035 (autoposter kill switches) and 037 (Kling poller
-- kill switch): the /api/cron/generate-youtube-video route treats a missing
-- site_settings row as 'disabled' (safe default) and silently skips every
-- tick. Without this seed the cron would never produce a video.
--
-- Defaults to 'true'. The orchestrator is cheap to run when the queue is
-- empty (one short AI call to pick a destination) and only commits to the
-- expensive VO + Kling path when an actual row is in flight. Enabling early
-- is safe.
--
-- Idempotent: ON CONFLICT (key) DO NOTHING preserves any later 'false'
-- setting the operator may flip via the dashboard.

INSERT INTO site_settings (key, value, updated_at) VALUES
  ('youtube_video_cron_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
