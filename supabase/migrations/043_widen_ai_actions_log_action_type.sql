-- Phase 21H: Add bounce/complaint suppression action types to ai_actions_log
ALTER TABLE ai_actions_log DROP CONSTRAINT IF EXISTS ai_actions_log_action_type_check;
ALTER TABLE ai_actions_log ADD CONSTRAINT ai_actions_log_action_type_check
  CHECK (action_type IN (
    'voice-call',
    'quote-email',
    'onboarding-email',
    'content-generation',
    'admin-notification',
    'email_bounce_suppressed',
    'email_complaint_suppressed'
  ));
