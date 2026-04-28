-- AI Command Center: audit trail of Claude's verification of AI outputs.
-- One row per verification call. Parent ai_jobs row updated with verification_status.

CREATE TABLE IF NOT EXISTS ai_verification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('approved', 'needs_revision', 'rejected')),
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  checks JSONB DEFAULT '{}',
  recommendations JSONB DEFAULT '[]',
  model_used TEXT,
  raw_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_verification_job ON ai_verification_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_ai_verification_status ON ai_verification_logs(verification_status);
CREATE INDEX IF NOT EXISTS idx_ai_verification_created ON ai_verification_logs(created_at DESC);

ALTER TABLE ai_verification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access ai_verification_logs" ON ai_verification_logs;
CREATE POLICY "Admins full access ai_verification_logs" ON ai_verification_logs
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
