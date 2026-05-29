-- Phase 21B — seed Kling poller kill switch.
--
-- Mirrors the Phase 14AU pattern from migration 035: the check-kling-jobs
-- cron route treats a missing site_settings row as 'disabled' (safe default)
-- and silently skips every tick. Without this seed the operator would have
-- to manually INSERT the row before the cron starts working.
--
-- Defaults to 'true' because Phase 21B alone writes no kling_job_id values
-- yet (Phase 21C wires submission into the content generation flow). A
-- poller with nothing to poll is a no-op — no risk in enabling it early.
--
-- Idempotent: ON CONFLICT (key) DO NOTHING preserves an operator's later
-- 'false' setting if they ever flip the switch via the dashboard.

INSERT INTO site_settings (key, value, updated_at) VALUES
  ('kling_cron_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
