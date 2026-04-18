CREATE TABLE opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pipeline TEXT DEFAULT 'main' CHECK (pipeline IN ('main', 'onboarding')),
  stage TEXT DEFAULT 'new-lead' CHECK (stage IN (
    'new-lead', 'call-completed', 'quote-sent', 'follow-up',
    'checkout', 'member', 'onboarding-started', 'onboarding-complete'
  )),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'abandoned')),
  value DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opportunities_contact ON opportunities(contact_id);
CREATE INDEX idx_opportunities_stage ON opportunities(stage);

CREATE TRIGGER opportunities_updated_at
  BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
