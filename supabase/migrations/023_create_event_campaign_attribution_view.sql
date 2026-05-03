-- Phase 14H — Conversion Tracking by Event Campaign.
--
-- Read-only attribution view that joins:
--   event_campaigns → campaign_assets → content_calendar
-- and best-effort matches contacts to campaigns by UTM substring.
--
-- Grain: ONE ROW per (event_campaign, campaign_asset, content_calendar) tuple.
-- LEFT JOINs throughout so a campaign with no assets, an asset with no calendar
-- row, or a campaign with no UTM-attributed contacts all still appear.
--
-- Lead attribution is best-effort because campaign asset bodies do not yet carry
-- a resolved tracking URL (see Phase 14H notes — `event_campaigns.tracking_url_template`
-- still has placeholders, `campaign_assets.tracking_url` is empty). The match below
-- assumes the UTM tag follows the canonical format from `VORTEX_EVENT_CAMPAIGN_SKILL.md`:
--   ?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event_slug}_{year}_{wave}
-- where event_slug is a sluggified event_name. Until that URL is materialized in
-- captions or post URLs, lead_count will be 0 for most campaigns. Once tracking
-- URLs land in published posts, this view starts returning real numbers without
-- any further code change.
--
-- Idempotent: uses CREATE OR REPLACE VIEW.
-- RLS: views inherit invoker security by default; the admin client (service role)
-- bypasses RLS, which matches every other admin-side query in this codebase.

CREATE OR REPLACE VIEW event_campaign_attribution_summary AS
WITH utm_match AS (
  -- One row per event_campaign with aggregated lead totals from contacts whose
  -- custom_fields.utm_medium = 'event_campaign' AND utm_campaign starts with the
  -- sluggified event_name + '_' + event_year (the canonical UTM prefix from §11
  -- of VORTEX_EVENT_CAMPAIGN_SKILL.md). Returns 0/NULL for campaigns with no UTM
  -- matches yet — most campaigns today, until tracking-URL resolution lands.
  SELECT
    ec.id AS campaign_id,
    COUNT(DISTINCT c.id) AS lead_count,
    COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'member') AS member_count,
    MIN(c.created_at) AS first_lead_at,
    MAX(c.created_at) AS latest_lead_at
  FROM event_campaigns ec
  LEFT JOIN contacts c
    ON c.custom_fields ->> 'utm_medium' = 'event_campaign'
   AND c.custom_fields ->> 'utm_campaign' ~* (
         '^'
         || regexp_replace(lower(ec.event_name), '[^a-z0-9]+', '-', 'g')
         || '_' || ec.event_year::text
         || '(_|$)'
       )
  GROUP BY ec.id
)
SELECT
  -- Campaign identity (denormalized — duplicated across asset/calendar rows)
  ec.id                          AS campaign_id,
  ec.campaign_name,
  ec.event_name,
  ec.event_year,
  ec.destination_city,
  ec.destination_country,
  ec.destination_region,
  ec.categories,
  ec.event_start_date,
  ec.score                       AS campaign_score,
  ec.status                      AS campaign_status,

  -- Asset grain
  ca.id                          AS campaign_asset_id,
  ca.asset_type,
  ca.platform,
  ca.wave,
  ca.status                      AS asset_status,
  ca.scheduled_for               AS asset_scheduled_for,

  -- Content_calendar grain
  cc.id                          AS content_calendar_id,
  cc.status                      AS calendar_status,
  cc.posted_at                   AS calendar_posted_at,
  cc.week_of                     AS calendar_week_of,

  -- Best-effort UTM lead attribution (campaign-grain; duplicated across rows)
  COALESCE(um.lead_count,   0)   AS campaign_lead_count,
  COALESCE(um.member_count, 0)   AS campaign_member_count,
  um.first_lead_at               AS campaign_first_lead_at,
  um.latest_lead_at              AS campaign_latest_lead_at
FROM event_campaigns ec
LEFT JOIN campaign_assets ca
       ON ca.campaign_id = ec.id
      AND ca.status NOT IN ('archived', 'rejected')
LEFT JOIN content_calendar cc
       ON cc.id = ca.content_calendar_id
LEFT JOIN utm_match um
       ON um.campaign_id = ec.id;

COMMENT ON VIEW event_campaign_attribution_summary IS
  'Phase 14H: per-(campaign × asset × calendar_row) attribution. Lead counts are best-effort UTM substring matches against contacts.custom_fields and will be 0 until campaign tracking URLs are materialized in published posts. See PROJECT_STATE_CURRENT.md Phase 14H entry.';
