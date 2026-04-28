-- Retroactive migration for an existing prod table.
-- Trip history per contact. Triggers post-trip review request after return_date.
-- Schema verified against src/app/api/trips/route.ts insert.

CREATE TABLE IF NOT EXISTS trips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  departure_date DATE,
  return_date DATE NOT NULL,
  travelers INTEGER DEFAULT 1,
  booking_value NUMERIC(10,2) DEFAULT 0,
  review_requested BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_contact ON trips(contact_id);
CREATE INDEX IF NOT EXISTS idx_trips_return_date ON trips(return_date);
CREATE INDEX IF NOT EXISTS idx_trips_review_requested ON trips(review_requested);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access trips" ON trips;
CREATE POLICY "Admins full access trips" ON trips
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
