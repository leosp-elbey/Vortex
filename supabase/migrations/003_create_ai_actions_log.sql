CREATE TABLE ai_actions_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'voice-call', 'quote-email', 'onboarding-email',
    'content-generation', 'admin-notification'
  )),
  service TEXT NOT NULL CHECK (service IN ('bland', 'openai', 'resend')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_actions_contact ON ai_actions_log(contact_id);
CREATE INDEX idx_ai_actions_type ON ai_actions_log(action_type);
CREATE INDEX idx_ai_actions_created ON ai_actions_log(created_at DESC);
