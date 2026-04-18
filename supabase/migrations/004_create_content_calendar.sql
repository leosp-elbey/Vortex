CREATE TABLE content_calendar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_of DATE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'twitter')),
  caption TEXT NOT NULL,
  hashtags TEXT[],
  image_prompt TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted', 'rejected')),
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_week ON content_calendar(week_of);
