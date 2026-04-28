-- AI Command Center: per-call token + cost tracking for budget guardrails.
-- Aggregated to enforce AI_MONTHLY_BUDGET_LIMIT and AI_DAILY_BUDGET_LIMIT.

CREATE TABLE IF NOT EXISTS ai_model_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES ai_jobs(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  provider TEXT CHECK (provider IN ('openrouter', 'anthropic', 'openai')),
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cost_estimate NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_model_usage_job ON ai_model_usage(job_id);
CREATE INDEX IF NOT EXISTS idx_ai_model_usage_model ON ai_model_usage(model);
CREATE INDEX IF NOT EXISTS idx_ai_model_usage_created ON ai_model_usage(created_at DESC);

ALTER TABLE ai_model_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access ai_model_usage" ON ai_model_usage;
CREATE POLICY "Admins full access ai_model_usage" ON ai_model_usage
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
