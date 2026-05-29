-- Phase 21D — seed Shotstack assembly cron kill switch.
--
-- Mirrors migrations 035 (autoposter), 037 (Kling poller), 038 (YouTube
-- orchestrator): the /api/cron/assemble-youtube-video route treats a
-- missing site_settings row as 'disabled' (safe default) and silently
-- skips every tick. Without this seed the assembler would never run.
--
-- Defaults to 'true'. The cron is cheap to run when the eligibility
-- query is empty (one DB read, no Shotstack call). It only costs
-- Shotstack render credit when a real Phase 21C row has all 4 Kling
-- clips ready — and at that point we WANT it to assemble immediately.
--
-- Idempotent: ON CONFLICT (key) DO NOTHING preserves any later 'false'
-- setting the operator may flip via the dashboard.

INSERT INTO site_settings (key, value, updated_at) VALUES
  ('youtube_video_assembly_cron_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
