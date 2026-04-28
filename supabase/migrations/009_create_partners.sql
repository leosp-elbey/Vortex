-- Retroactive migration for an existing prod table.
-- Affiliate partners for lead routing. Lead distribution scores by destinations + budgets match.
-- Schema verified against src/app/api/partners/route.ts (Partner interface + queries).

CREATE TABLE IF NOT EXISTS partners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  destinations TEXT[] DEFAULT '{}',
  budgets TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_active ON partners(active);
CREATE INDEX IF NOT EXISTS idx_partners_created ON partners(created_at DESC);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access partners" ON partners;
CREATE POLICY "Admins full access partners" ON partners
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
