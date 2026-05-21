-- Phase 18.1A — seed the global SMS kill switch.
--
-- sendSMS() in src/lib/twilio.ts consults site_settings.sms_send_enabled
-- before every send. The read FAILS SAFE: a missing row, a query error, or
-- any value other than the exact string 'true' is treated as OFF. So until
-- this row exists AND is flipped to 'true', no SMS is sent.
--
-- This script seeds the row in the OFF state. Enabling SMS later is a
-- deliberate manual step:
--   UPDATE site_settings SET value = 'true', updated_at = NOW()
--   WHERE key = 'sms_send_enabled';
--
-- ON CONFLICT (key) DO NOTHING keeps this idempotent — re-running it never
-- overwrites an operator's intentional value.
--
-- Run manually in the Supabase SQL editor. NOT executed from app code.

INSERT INTO site_settings (key, value, description, updated_at) VALUES
  ('sms_send_enabled', 'false', 'Global SMS kill switch. sendSMS() fails safe to OFF when this row is missing or value != ''true''. Flip to ''true'' manually to enable sending.', NOW())
ON CONFLICT (key) DO NOTHING;
