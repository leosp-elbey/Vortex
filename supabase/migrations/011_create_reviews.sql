-- Retroactive migration for an existing prod table.
-- Public testimonials/reviews. Approved rows render on /reviews page (public read).
-- Schema verified against src/app/api/reviews/route.ts (select + insert).

CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  location TEXT,
  destination TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NOT NULL,
  saved_amount NUMERIC(10,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_contact ON reviews(contact_id);
CREATE INDEX IF NOT EXISTS idx_reviews_destination ON reviews(destination);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read approved reviews" ON reviews;
CREATE POLICY "Public read approved reviews" ON reviews
  FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS "Admins full access reviews" ON reviews;
CREATE POLICY "Admins full access reviews" ON reviews
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
