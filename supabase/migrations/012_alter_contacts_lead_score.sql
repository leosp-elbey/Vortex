-- Retroactive migration: ad-hoc ALTER applied in prod, formalized here.
-- Used by hot-lead branching cron (score-and-branch) and by lead-created webhook (default 20).

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contacts_lead_score ON contacts(lead_score);
