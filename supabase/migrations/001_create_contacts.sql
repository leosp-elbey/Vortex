CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  source TEXT DEFAULT 'landing-page',
  status TEXT DEFAULT 'lead' CHECK (status IN ('lead', 'qualified', 'quoted', 'member', 'churned')),
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  membership_status TEXT DEFAULT 'none' CHECK (membership_status IN ('none', 'active', 'cancelled', 'expired')),
  stripe_customer_id TEXT,
  joined_date TIMESTAMPTZ,
  last_ai_action TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_membership ON contacts(membership_status);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
