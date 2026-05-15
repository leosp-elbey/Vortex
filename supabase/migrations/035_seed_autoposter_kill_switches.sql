-- Phase 14AU — seed autoposter kill switches.
--
-- Without these rows in site_settings, the autoposter + youtube crons treat
-- a missing key as 'disabled' (safe default at first deploy) and silently
-- skip every tick. This was the root cause of the 6-day stale queue
-- discovered on 2026-05-15 — the autoposter_cron_enabled row never
-- existed, so 18+ cron ticks returned { skipped: true, reason: 'cron_disabled' }.
--
-- ON CONFLICT (key) DO NOTHING keeps this idempotent — running the migration
-- on a DB where these rows already exist (e.g., an operator already enabled
-- the kill switch via the dashboard or via the cron's auto-disable path)
-- is a no-op. We never overwrite an operator's intentional 'false' setting.

INSERT INTO site_settings (key, value, updated_at) VALUES
  ('autoposter_cron_enabled', 'true', NOW()),
  ('youtube_cron_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
