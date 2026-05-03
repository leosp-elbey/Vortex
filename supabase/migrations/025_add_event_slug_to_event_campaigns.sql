-- Phase 14H.2 — Persist a stable event_slug on event_campaigns.
--
-- Why: the attribution view and tracking-URL helper currently derive the slug from
-- `event_name` at query time / build time. If an operator (or a future seed-file
-- rename) changes `event_name`, every historical UTM tag built from the old slug
-- stops matching this row. Persisting the slug locks attribution to the slug
-- chosen at insert time.
--
-- Three things happen here:
--   1. Add the nullable `event_slug TEXT` column (no default — backfill below).
--   2. Backfill existing rows from `event_name` using the same slug rule the JS
--      helper uses (`slugifyEventName` in `src/lib/campaign-tracking-url.ts`):
--      lower → non-alnum→dash → trim leading/trailing dashes.
--   3. Index `event_slug` (partial — skip NULLs).
--
-- A conditional UNIQUE INDEX is attempted at the end. It is only created when
-- the existing data has no duplicate `(event_slug, event_year, destination_city)`
-- triples — if the data has natural duplicates, we leave the column unindexed
-- on uniqueness and document the gap. This makes the migration safe to apply
-- against any prior state.
--
-- Idempotent: every operation guards with IF NOT EXISTS / WHERE clauses.

-- 1. Add the column
ALTER TABLE event_campaigns
  ADD COLUMN IF NOT EXISTS event_slug TEXT;

COMMENT ON COLUMN event_campaigns.event_slug IS
  'Phase 14H.2: stable slug derived from event_name at insert time. Used by `event_campaign_attribution_summary` view and the tracking-URL helper to keep historical UTMs matching this campaign even if event_name is later edited. NULL only on rows that predate the column AND were never touched by the cron/backfill since.';

-- 2. Backfill existing rows
UPDATE event_campaigns
SET event_slug = regexp_replace(
  regexp_replace(lower(event_name), '[^a-z0-9]+', '-', 'g'),
  '^-+|-+$', '', 'g'
)
WHERE event_slug IS NULL
  AND event_name IS NOT NULL
  AND length(trim(event_name)) > 0;

-- 3. Lookup index (partial — only non-null slugs)
CREATE INDEX IF NOT EXISTS idx_event_campaigns_event_slug
  ON event_campaigns(event_slug)
  WHERE event_slug IS NOT NULL;

-- 4. Conditional UNIQUE constraint on (event_slug, event_year, destination_city).
--    Only created when no existing duplicate triple exists. Wrapped in DO so a
--    natural duplicate doesn't fail the entire migration — operators can resolve
--    duplicates in a follow-up phase if it ever matters.
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT lower(event_slug) AS slug, event_year AS year, lower(destination_city) AS city
    FROM event_campaigns
    WHERE event_slug IS NOT NULL
    GROUP BY 1, 2, 3
    HAVING count(*) > 1
  ) dup;

  IF duplicate_count = 0 THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_event_campaigns_slug_year_city
               ON event_campaigns(lower(event_slug), event_year, lower(destination_city))
               WHERE event_slug IS NOT NULL';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'unique index creation skipped: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'unique index NOT created: % duplicate (slug, year, city) tuples present', duplicate_count;
  END IF;
END $$;
