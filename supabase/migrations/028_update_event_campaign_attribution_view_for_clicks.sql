-- Phase 14I — Recreate event_campaign_attribution_summary so click_count and
-- page_view_count come from real `contact_events` rows (migration 027 columns)
-- instead of the always-zero deferred slot the dashboard surfaced in Phase 14H.
--
-- Why a new migration instead of editing 023 / 026:
--   Migrations 023 and 026 are already applied to prod. The view is recreated
--   in place via CREATE OR REPLACE VIEW so this migration is idempotent and
--   safe to re-apply. Older migrations stay as historical record.
--
-- View shape: column list extends migration 026 with FOUR new columns at the
-- tail. All previous columns keep the same name + position so existing
-- consumers (helper, dashboard, future API consumers) read unchanged data.
-- New columns:
--   - campaign_click_count        BIGINT  (count of contact_events rows attributed
--                                          to the campaign, 0 by default)
--   - campaign_page_view_count    BIGINT  (subset where event = 'page_view')
--   - campaign_first_click_at     TIMESTAMPTZ
--   - campaign_latest_click_at    TIMESTAMPTZ
--
-- Click matching strategy:
--   1. PRIMARY — `contact_events.event_campaign_id = ec.id`. Set when the
--      track-event route resolved the UTM tag to a campaign (Phase 14I).
--   2. FALLBACK — for legacy rows / track-event versions that didn't yet
--      populate `event_campaign_id`, match by `utm_medium='event_campaign'`
--      AND `utm_campaign` substring against the same regex used for lead
--      attribution (`COALESCE(event_slug, derived_from_event_name)`).
-- The OR-join on these two predicates ensures the view returns real counts
-- both for fresh post-Phase-14I traffic and for any legacy rows that
-- accumulate before the deploy lands.

CREATE OR REPLACE VIEW event_campaign_attribution_summary AS
WITH utm_match AS (
  -- Lead-side attribution (unchanged from migration 026).
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
         || COALESCE(
              NULLIF(trim(ec.event_slug), ''),
              regexp_replace(
                regexp_replace(lower(ec.event_name), '[^a-z0-9]+', '-', 'g'),
                '^-+|-+$', '', 'g'
              )
            )
         || '_' || ec.event_year::text
         || '(_|$)'
       )
  GROUP BY ec.id
),
click_match AS (
  -- Click-side attribution. Counts contact_events that are either FK-linked to
  -- this campaign OR carry a UTM tag that matches the slug+year pattern.
  -- COUNT(ce.id) skips LEFT-JOIN nulls so campaigns with no clicks return 0.
  SELECT
    ec.id AS campaign_id,
    COUNT(ce.id) AS click_count,
    COUNT(ce.id) FILTER (WHERE ce.event = 'page_view') AS page_view_count,
    MIN(ce.created_at) AS first_click_at,
    MAX(ce.created_at) AS latest_click_at
  FROM event_campaigns ec
  LEFT JOIN contact_events ce
    ON (
      ce.event_campaign_id = ec.id
      OR (
        ce.event_campaign_id IS NULL
        AND ce.utm_medium = 'event_campaign'
        AND ce.utm_campaign ~* (
          '^'
          || COALESCE(
               NULLIF(trim(ec.event_slug), ''),
               regexp_replace(
                 regexp_replace(lower(ec.event_name), '[^a-z0-9]+', '-', 'g'),
                 '^-+|-+$', '', 'g'
               )
             )
          || '_' || ec.event_year::text
          || '(_|$)'
        )
      )
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

  -- Lead attribution (campaign-grain; duplicated across rows)
  COALESCE(um.lead_count,   0)   AS campaign_lead_count,
  COALESCE(um.member_count, 0)   AS campaign_member_count,
  um.first_lead_at               AS campaign_first_lead_at,
  um.latest_lead_at              AS campaign_latest_lead_at,

  -- Phase 14I click attribution (campaign-grain; duplicated across rows)
  COALESCE(cm.click_count,     0) AS campaign_click_count,
  COALESCE(cm.page_view_count, 0) AS campaign_page_view_count,
  cm.first_click_at              AS campaign_first_click_at,
  cm.latest_click_at             AS campaign_latest_click_at
FROM event_campaigns ec
LEFT JOIN campaign_assets ca
       ON ca.campaign_id = ec.id
      AND ca.status NOT IN ('archived', 'rejected')
LEFT JOIN content_calendar cc
       ON cc.id = ca.content_calendar_id
LEFT JOIN utm_match um
       ON um.campaign_id = ec.id
LEFT JOIN click_match cm
       ON cm.campaign_id = ec.id;

COMMENT ON VIEW event_campaign_attribution_summary IS
  'Phase 14I: extends migration 026''s shape with campaign_click_count, campaign_page_view_count, campaign_first_click_at, campaign_latest_click_at sourced from contact_events. Click matching prefers contact_events.event_campaign_id when set; falls back to utm_campaign substring match. Lead/member counts and all other columns are unchanged from migration 026.';
