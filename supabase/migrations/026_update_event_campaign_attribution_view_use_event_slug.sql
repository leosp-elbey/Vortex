-- Phase 14H.2 — Recreate event_campaign_attribution_summary so UTM matching uses
-- the persisted event_slug (migration 025) when present, falling back to the
-- regex-derived slug from event_name only when event_slug is null.
--
-- Why a new migration instead of editing 023:
--   Migration 023 is already applied to prod. Editing it in place would not
--   change the deployed view. CREATE OR REPLACE VIEW is idempotent and safe
--   to re-apply, so this migration takes the same approach as 023.
--
-- View shape: identical column list to migration 023. Only the WITH-CTE's
-- `~*` regex pattern differs — it now reads from
-- COALESCE(event_slug, derived_from_event_name).
--
-- Backwards compatibility:
--   - Old rows with NULL event_slug fall through to the same regex as before,
--     so they keep matching the same UTMs they matched under migration 023.
--   - Backfilled rows from migration 025 should produce identical slug strings
--     to the regex fallback (the UPDATE in 025 uses the same regex), so the
--     fallback path is functionally redundant for those rows but kept for
--     belt-and-suspenders safety.
--   - Rows where an operator persists a custom event_slug different from the
--     derived form will start using the persisted value — this is the whole
--     point of the migration.

CREATE OR REPLACE VIEW event_campaign_attribution_summary AS
WITH utm_match AS (
  -- One row per event_campaign with aggregated lead totals from contacts whose
  -- custom_fields.utm_medium = 'event_campaign' AND utm_campaign starts with
  -- (persisted event_slug OR derived slug from event_name) + '_' + event_year.
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
  'Phase 14H.2: same shape as migration 023, but UTM matching now reads COALESCE(event_slug, derived_from_event_name). Persisted slug wins; legacy NULL slugs fall through to the original regex behavior. See PROJECT_STATE_CURRENT.md Phase 14H.2 entry.';
