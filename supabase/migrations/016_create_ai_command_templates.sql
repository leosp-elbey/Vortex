-- AI Command Center: reusable prompt templates seeded by admins.
-- Used by the Job Creator UI to populate prompts/system_prompts/default_models for common workflows.

CREATE TABLE IF NOT EXISTS ai_command_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'ideas', 'captions', 'hashtags', 'outlines',
    'scripts', 'emails', 'landing-copy', 'blog',
    'code', 'security-review', 'compliance',
    'social-pack', 'video-script', 'email-sequence', 'social-calendar'
  )),
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  default_model TEXT,
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_command_templates_job_type ON ai_command_templates(job_type);
CREATE INDEX IF NOT EXISTS idx_ai_command_templates_active ON ai_command_templates(is_active);

DROP TRIGGER IF EXISTS ai_command_templates_updated_at ON ai_command_templates;
CREATE TRIGGER ai_command_templates_updated_at
  BEFORE UPDATE ON ai_command_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ai_command_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access ai_command_templates" ON ai_command_templates;
CREATE POLICY "Admins full access ai_command_templates" ON ai_command_templates
  FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
