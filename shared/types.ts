export type ContactStatus = 'lead' | 'qualified' | 'quoted' | 'member' | 'churned'
export type MembershipStatus = 'none' | 'active' | 'cancelled' | 'expired'
export type OpportunityStage =
  | 'new-lead'
  | 'call-completed'
  | 'quote-sent'
  | 'follow-up'
  | 'checkout'
  | 'member'
  | 'onboarding-started'
  | 'onboarding-complete'
export type OpportunityStatus = 'open' | 'won' | 'lost' | 'abandoned'
export type OpportunityPipeline = 'main' | 'onboarding'
export type AIActionType = 'voice-call' | 'quote-email' | 'onboarding-email' | 'content-generation' | 'admin-notification'
export type AIService = 'bland' | 'openai' | 'mailgun'
export type AIActionStatus = 'pending' | 'success' | 'failed'
export type ContentPlatform = 'instagram' | 'facebook' | 'tiktok' | 'twitter'
export type ContentStatus = 'draft' | 'approved' | 'posted' | 'rejected'
export type AdminRole = 'admin' | 'viewer'

export interface Contact {
  id: string
  first_name: string
  last_name?: string
  email: string
  phone?: string
  source?: string
  status: ContactStatus
  tags: string[]
  custom_fields: Record<string, unknown>
  membership_status: MembershipStatus
  stripe_customer_id?: string
  joined_date?: string
  last_ai_action?: string
  created_at: string
  updated_at: string
}

export interface Opportunity {
  id: string
  contact_id: string
  name: string
  pipeline: OpportunityPipeline
  stage: OpportunityStage
  status: OpportunityStatus
  value: number
  notes?: string
  created_at: string
  updated_at: string
  contact?: Contact
}

export interface AIActionLog {
  id: string
  contact_id?: string
  action_type: AIActionType
  service: AIService
  status: AIActionStatus
  request_payload?: Record<string, unknown>
  response_payload?: Record<string, unknown>
  error_message?: string
  duration_ms?: number
  created_at: string
  contact?: Pick<Contact, 'first_name' | 'last_name' | 'email'>
}

export interface ContentCalendarItem {
  id: string
  week_of: string
  platform: ContentPlatform
  caption: string
  hashtags?: string[]
  image_prompt?: string
  status: ContentStatus
  posted_at?: string
  created_at: string
}

export interface AdminUser {
  id: string
  email: string
  full_name?: string
  role: AdminRole
  created_at: string
}

export interface QuoteFormData {
  first_name: string
  email: string
  phone?: string
  destination: string
  travel_dates_start: string
  travel_dates_end: string
  travelers: number
  budget: string
  notes?: string
}

export interface LeadFormData {
  first_name: string
  email: string
  phone: string
}

export interface DashboardStats {
  totalLeads: number
  totalMembers: number
  callsToday: number
  emailsToday: number
  conversionRate: number
}
