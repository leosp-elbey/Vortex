CREATE TABLE admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_actions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Admin users can read/write everything
CREATE POLICY "Admins full access contacts" ON contacts
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

CREATE POLICY "Admins full access opportunities" ON opportunities
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

CREATE POLICY "Admins full access ai_actions" ON ai_actions_log
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

CREATE POLICY "Admins full access content" ON content_calendar
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

CREATE POLICY "Admins full access admin_users" ON admin_users
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );
