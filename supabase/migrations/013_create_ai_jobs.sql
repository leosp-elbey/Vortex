-- AI Command Center: tracks every AI generation request, output, verification, and approval.
-- Written by src/lib/ai-router.ts; read by /dashboard/ai-command-center.

CREATE TABLE IF NOT EXISTS ai_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'ideas', 'captions', 'hashtags', 'outlines',
    'scripts', 'emails', 'landing-copy', 'blog',
    'code', 'security-review', 'compliance',
    'social-pack', 'video-script', 'email-sequence', 'social-calendar'
  )),
  title TEXT NOT NULL,
  input_payload JSONB NOT NULL,
  output_payload JSONB,
  model_requested TEXT,
  model_used TEXT,
  provider TEXT CHECK (provider IN ('openrouter', 'anthropic', 'openai')),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed',
    'pending_review', 'approved', 'rejected', 'needs_revision'
  )),
  cost_estimate NUMERIC(10,4),
  error_message TEXT,
  verified_by TEXT CHECK (verified_by IN ('claude', 'human') OR verified_by IS NULL),
  verification_status TEXT CHECK (verification_status IN ('approved', 'needs_revision', 'rejected') OR verification_status IS NULL),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_created_by ON ai_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_job_type ON ai_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_created ON ai_jobs(created_at DESC);

DROP TRIGGER IF EXISTS ai_jobs_updated_at ON ai_jobs;
CREATE TRIGGER ai_jobs_updated_at
  BEFORE UPDATE ON ai_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access ai_jobs" ON ai_jobs;
CREATE POLICY "Admins full access ai_jobs" ON ai_jobs
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
