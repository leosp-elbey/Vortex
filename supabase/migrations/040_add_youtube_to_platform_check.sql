ALTER TABLE content_calendar
DROP CONSTRAINT content_calendar_platform_check;

ALTER TABLE content_calendar
ADD CONSTRAINT content_calendar_platform_check
CHECK (platform = ANY (ARRAY['instagram'::text, 'facebook'::text, 'tiktok'::text, 'twitter'::text, 'youtube'::text]));
