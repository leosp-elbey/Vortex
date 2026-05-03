-- Phase 14J.2 — Rewrite legacy tracking URLs to the branded /t/<slug> form.
--
-- BEFORE running, review what will be touched. The two SELECTs at the top of
-- this file are the diagnostic — they list exactly which rows will change.
-- The two UPDATEs below are scoped to UNPOSTED rows only:
--   - content_calendar: status NOT IN ('posted', 'rejected')
--   - campaign_assets:  status NOT IN ('posted', 'rejected', 'archived')
-- Posted/rejected/archived rows are explicitly preserved as historical record.
--
-- New URL pattern (Phase 14J.2):
--   https://www.vortextrips.com/t/<event_slug>
--     ?utm_source=<lower(platform)>
--     &utm_medium=event_campaign
--     &utm_campaign=<event_slug>_<event_year>[_<wave>]
--     &utm_content=<asset_type>_<first 8 alnum chars of asset.id, lowercased>
--
-- Replaces the previous host (`myvortex365.com/leosp`) used as a visible
-- social link. The destination behind the redirect (`event_campaigns.cta_url`)
-- is unchanged — it's still typically `myvortex365.com/leosp`, but only
-- the `/t/<slug>` route sees it; the social-post viewer never does.
--
-- Idempotent at the DB level: re-running this migration after rows are
-- already on the branded host is a no-op (the LIKE filter excludes them).

-- ============================================================
-- Step 0 — DIAGNOSTIC (read-only). Run these to see what will change.
-- ============================================================

-- content_calendar rows that WILL be rewritten:
-- SELECT cc.id, cc.platform, cc.status, cc.tracking_url, ec.event_slug, ec.event_year
-- FROM content_calendar cc
-- JOIN campaign_assets   ca ON ca.id = cc.campaign_asset_id
-- JOIN event_campaigns   ec ON ec.id = ca.campaign_id
-- WHERE cc.tracking_url ILIKE '%myvortex365.com/leosp%'
--   AND cc.status NOT IN ('posted', 'rejected')
--   AND ec.event_slug IS NOT NULL;

-- content_calendar rows that will be SKIPPED (posted/rejected — preserved):
-- SELECT cc.id, cc.platform, cc.status, cc.tracking_url
-- FROM content_calendar cc
-- WHERE cc.tracking_url ILIKE '%myvortex365.com/leosp%'
--   AND cc.status IN ('posted', 'rejected');

-- campaign_assets rows that WILL be rewritten:
-- SELECT ca.id, ca.asset_type, ca.status, ca.tracking_url, ec.event_slug, ec.event_year
-- FROM campaign_assets ca
-- JOIN event_campaigns ec ON ec.id = ca.campaign_id
-- WHERE ca.tracking_url ILIKE '%myvortex365.com/leosp%'
--   AND ca.status NOT IN ('posted', 'rejected', 'archived')
--   AND ec.event_slug IS NOT NULL;

-- ============================================================
-- Step 1 — Rewrite content_calendar.tracking_url for unposted rows.
-- ============================================================

UPDATE content_calendar cc
SET tracking_url =
  'https://www.vortextrips.com/t/' || ec.event_slug
  || '?utm_source=' || lower(cc.platform)
  || '&utm_medium=event_campaign'
  || '&utm_campaign=' || ec.event_slug || '_' || ec.event_year::text
       || COALESCE('_' || ca.wave, '')
  || '&utm_content=' || ca.asset_type || '_'
       || lower(substring(regexp_replace(ca.id::text, '[^a-z0-9]', '', 'gi') from 1 for 8))
FROM campaign_assets ca, event_campaigns ec
WHERE cc.campaign_asset_id = ca.id
  AND ca.campaign_id = ec.id
  AND cc.tracking_url ILIKE '%myvortex365.com/leosp%'
  AND cc.status NOT IN ('posted', 'rejected')
  AND ec.event_slug IS NOT NULL
  AND ec.event_slug <> '';

-- ============================================================
-- Step 2 — Rewrite campaign_assets.tracking_url for unposted/active rows.
-- ============================================================

UPDATE campaign_assets ca
SET tracking_url =
  'https://www.vortextrips.com/t/' || ec.event_slug
  || '?utm_source=' || lower(COALESCE(NULLIF(ca.platform, ''), 'web'))
  || '&utm_medium=event_campaign'
  || '&utm_campaign=' || ec.event_slug || '_' || ec.event_year::text
       || COALESCE('_' || ca.wave, '')
  || '&utm_content=' || ca.asset_type || '_'
       || lower(substring(regexp_replace(ca.id::text, '[^a-z0-9]', '', 'gi') from 1 for 8))
FROM event_campaigns ec
WHERE ca.campaign_id = ec.id
  AND ca.tracking_url ILIKE '%myvortex365.com/leosp%'
  AND ca.status NOT IN ('posted', 'rejected', 'archived')
  AND ec.event_slug IS NOT NULL
  AND ec.event_slug <> '';

-- ============================================================
-- Step 3 — VERIFICATION (read-only). Run to confirm rewrite landed.
-- ============================================================

-- Should return 0 (or only posted/rejected rows that were intentionally skipped):
-- SELECT count(*) FROM content_calendar
-- WHERE tracking_url ILIKE '%myvortex365.com/leosp%' AND status NOT IN ('posted','rejected');

-- Should show all-branded URLs for unposted rows:
-- SELECT id, platform, status, tracking_url FROM content_calendar
-- WHERE tracking_url IS NOT NULL ORDER BY created_at DESC LIMIT 10;
