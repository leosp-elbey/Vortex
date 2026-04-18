# VortexTrips — Full-Stack Build Prompt

> Use this file as your prompt in Claude Code. It contains everything needed to scaffold, build, and deploy the VortexTrips travel savings membership platform.

---

## PROJECT OVERVIEW

**VortexTrips** is a travel savings membership platform (brand name: **Travel Team Perks / TTP**). Users discover VortexTrips through social media or ads, land on a lead capture page, opt in, receive an automated AI voice call within 60 seconds, get a personalized AI-written travel savings quote via email, and are nurtured through a pipeline toward becoming paid members. An admin dashboard tracks every lead, member, AI action, and pipeline stage in real time.

---

## TECH STACK

| Layer | Technology |
|---|---|
| Web Framework | **Next.js 14+ (App Router)** |
| Mobile Framework | **React Native (Expo)** |
| Language | **TypeScript** |
| Web Styling | **Tailwind CSS** |
| Mobile Styling | **NativeWind (Tailwind CSS for React Native)** |
| Database | **Supabase** (PostgreSQL + Auth + Realtime + Edge Functions) |
| Deployment (Web) | **Vercel** |
| Deployment (Mobile) | **Expo EAS Build** |
| Version Control | **GitHub** (push ONLY after local dev server is verified working) |
| AI Voice Calls | **Bland.ai API** |
| Email Delivery | **Mailgun API** (or Resend as fallback) |
| AI Generation | **OpenAI API (gpt-4o)** |
| Payments | **Stripe** (for TTP membership) |

### Platform Strategy
This is a **web-first + mobile companion** build:
- **Web (Next.js):** Landing page, quote form, checkout, full admin dashboard
- **Mobile (React Native/Expo):** Member-facing app — trip dashboard, savings tracker, push notifications, booking access, membership card
- **Shared:** Supabase backend, API wrappers, TypeScript types — both platforms read/write the same database

---

## REPOSITORY STRUCTURE

```
vortextrips/
├── .env.local                    # Local env vars (never committed)
├── .env.example                  # Template for env vars
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── supabase/
│   ├── migrations/               # SQL migration files
│   │   ├── 001_create_contacts.sql
│   │   ├── 002_create_opportunities.sql
│   │   ├── 003_create_ai_actions_log.sql
│   │   ├── 004_create_content_calendar.sql
│   │   └── 005_create_admin_users.sql
│   └── seed.sql                  # Test data
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Landing page (lead capture)
│   │   ├── thank-you/
│   │   │   └── page.tsx          # Post-opt-in thank you
│   │   ├── quote/
│   │   │   └── page.tsx          # Travel quote request form
│   │   ├── join/
│   │   │   └── page.tsx          # TTP membership checkout
│   │   ├── dashboard/
│   │   │   ├── layout.tsx        # Dashboard shell (sidebar + auth guard)
│   │   │   ├── page.tsx          # Dashboard overview / KPIs
│   │   │   ├── leads/
│   │   │   │   └── page.tsx      # Leads table + detail view
│   │   │   ├── members/
│   │   │   │   └── page.tsx      # Paid members table
│   │   │   ├── pipeline/
│   │   │   │   └── page.tsx      # Kanban-style pipeline board
│   │   │   ├── content/
│   │   │   │   └── page.tsx      # AI content calendar
│   │   │   ├── calls/
│   │   │   │   └── page.tsx      # Bland.ai call logs
│   │   │   └── settings/
│   │   │       └── page.tsx      # API keys, config, team
│   │   └── api/
│   │       ├── webhooks/
│   │       │   ├── lead-created/
│   │       │   │   └── route.ts  # Receives new lead → triggers voice call
│   │       │   ├── stripe/
│   │       │   │   └── route.ts  # Stripe payment webhook
│   │       │   └── bland/
│   │       │       └── route.ts  # Bland.ai call completion callback
│   │       ├── automations/
│   │       │   ├── voice-call/
│   │       │   │   └── route.ts  # Trigger Bland.ai call
│   │       │   ├── quote-email/
│   │       │   │   └── route.ts  # Generate + send AI quote email
│   │       │   ├── onboarding/
│   │       │   │   └── route.ts  # New member onboarding flow
│   │       │   └── content-engine/
│   │       │       └── route.ts  # Weekly content generation
│   │       ├── contacts/
│   │       │   └── route.ts      # CRUD for contacts
│   │       ├── pipeline/
│   │       │   └── route.ts      # Pipeline stage management
│   │       └── cron/
│   │           └── weekly-content/
│   │               └── route.ts  # Vercel cron for weekly content
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Browser Supabase client
│   │   │   ├── server.ts         # Server Supabase client
│   │   │   └── admin.ts          # Service role client (for automations)
│   │   ├── bland.ts              # Bland.ai API wrapper
│   │   ├── mailgun.ts            # Mailgun API wrapper
│   │   ├── openai.ts             # OpenAI API wrapper
│   │   ├── stripe.ts             # Stripe client + helpers
│   │   └── utils.ts              # Shared utilities
│   ├── components/
│   │   ├── ui/                   # Reusable UI primitives
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── table.tsx
│   │   │   ├── modal.tsx
│   │   │   ├── toast.tsx
│   │   │   └── kanban.tsx
│   │   ├── dashboard/
│   │   │   ├── sidebar.tsx
│   │   │   ├── stat-card.tsx
│   │   │   ├── activity-feed.tsx
│   │   │   └── pipeline-board.tsx
│   │   ├── forms/
│   │   │   ├── lead-capture-form.tsx
│   │   │   ├── quote-request-form.tsx
│   │   │   └── checkout-form.tsx
│   │   └── landing/
│   │       ├── hero.tsx
│   │       ├── benefits.tsx
│   │       ├── testimonials.tsx
│   │       └── cta.tsx
│   ├── hooks/
│   │   ├── use-contacts.ts
│   │   ├── use-pipeline.ts
│   │   └── use-realtime.ts       # Supabase realtime subscriptions
│   └── types/
│       └── index.ts              # All TypeScript types (shared with mobile)
├── vercel.json                   # Cron job config
│
├── mobile/                       # React Native (Expo) member app
│   ├── app.json                  # Expo config
│   ├── package.json
│   ├── tailwind.config.js        # NativeWind config
│   ├── tsconfig.json
│   ├── babel.config.js
│   ├── App.tsx                   # Entry point
│   ├── src/
│   │   ├── screens/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── HomeScreen.tsx         # Member dashboard home
│   │   │   ├── TripsScreen.tsx        # Saved trips + upcoming bookings
│   │   │   ├── SavingsScreen.tsx      # Savings tracker + history
│   │   │   ├── MemberCardScreen.tsx   # Digital membership card
│   │   │   ├── NotificationsScreen.tsx
│   │   │   └── ProfileScreen.tsx
│   │   ├── components/
│   │   │   ├── TripCard.tsx
│   │   │   ├── SavingsBadge.tsx
│   │   │   ├── MembershipCard.tsx
│   │   │   └── DealAlert.tsx
│   │   ├── navigation/
│   │   │   └── TabNavigator.tsx       # Bottom tab nav
│   │   ├── lib/
│   │   │   └── supabase.ts            # Supabase client for RN
│   │   ├── hooks/
│   │   │   ├── use-auth.ts
│   │   │   └── use-member-data.ts
│   │   └── types/
│   │       └── index.ts               # Re-export shared types
│   └── .env.local                     # Mobile env vars (NEVER committed)
│
└── shared/                       # Shared between web + mobile
    └── types.ts                  # Canonical TypeScript types used by both
```

---

## ENVIRONMENT VARIABLES — SECURITY FIRST

### CRITICAL SECURITY RULES
1. **ALL environment variables are stored LOCAL ONLY in `.env.local`** — NEVER in `.env`, never in code, never in comments, never in commits
2. **`.env.local` must be in `.gitignore` BEFORE the first commit** — verify this exists before ANY git push
3. **NEVER hardcode API keys, secrets, or tokens anywhere in source code** — always reference via `process.env.VARIABLE_NAME`
4. **NEVER log env vars to console** — not even in dev mode
5. **`.env.example` contains ONLY key names with placeholder values** — commit this so collaborators know what keys are needed
6. **Vercel environment variables are set ONLY through the Vercel dashboard** — never through CLI flags or config files
7. **Mobile `.env.local` (inside `/mobile/`) follows the same rules** — never committed, always local

### `.gitignore` must include (verify before first push):
```
.env
.env.local
.env.production
.env*.local
mobile/.env.local
```

### Web `.env.local` (root of project):
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Bland.ai
BLAND_API_KEY=your_bland_api_key

# Mailgun
MAILGUN_API_KEY=your_mailgun_api_key
MAILGUN_DOMAIN=mg.vortextrips.com

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_signing_secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_NOTIFICATION_EMAIL=admin@vortextrips.com

# Cron secret (for securing cron endpoints)
CRON_SECRET=a_random_secret_string
```

### Mobile `mobile/.env.local`:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_APP_URL=http://localhost:3000
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
```

### `.env.example` (committed to repo — NO real values):
```env
NEXT_PUBLIC_SUPABASE_URL=your_value_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_value_here
SUPABASE_SERVICE_ROLE_KEY=your_value_here
BLAND_API_KEY=your_value_here
MAILGUN_API_KEY=your_value_here
MAILGUN_DOMAIN=your_value_here
OPENAI_API_KEY=your_value_here
STRIPE_SECRET_KEY=your_value_here
STRIPE_WEBHOOK_SECRET=your_value_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_value_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_NOTIFICATION_EMAIL=your_value_here
CRON_SECRET=your_value_here
```

---

## SUPABASE DATABASE SCHEMA

### Table: `contacts`
This replaces the GHL CRM. Every lead and member lives here.

```sql
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  source TEXT DEFAULT 'landing-page',
  status TEXT DEFAULT 'lead' CHECK (status IN ('lead', 'qualified', 'quoted', 'member', 'churned')),
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  membership_status TEXT DEFAULT 'none' CHECK (membership_status IN ('none', 'active', 'cancelled', 'expired')),
  stripe_customer_id TEXT,
  joined_date TIMESTAMPTZ,
  last_ai_action TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_membership ON contacts(membership_status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table: `opportunities`
This is the pipeline. Tracks each contact's journey through stages.

```sql
CREATE TABLE opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pipeline TEXT DEFAULT 'main' CHECK (pipeline IN ('main', 'onboarding')),
  stage TEXT DEFAULT 'new-lead' CHECK (stage IN (
    'new-lead', 'call-completed', 'quote-sent', 'follow-up',
    'checkout', 'member', 'onboarding-started', 'onboarding-complete'
  )),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'abandoned')),
  value DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opportunities_contact ON opportunities(contact_id);
CREATE INDEX idx_opportunities_stage ON opportunities(stage);

CREATE TRIGGER opportunities_updated_at
  BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Table: `ai_actions_log`
Every AI action (calls, emails, content generation) is logged here.

```sql
CREATE TABLE ai_actions_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'voice-call', 'quote-email', 'onboarding-email',
    'content-generation', 'admin-notification'
  )),
  service TEXT NOT NULL CHECK (service IN ('bland', 'openai', 'mailgun')),
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
```

### Table: `content_calendar`
Stores AI-generated weekly social content.

```sql
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
```

### Table: `admin_users`
Dashboard access control. Uses Supabase Auth under the hood.

```sql
CREATE TABLE admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_actions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Admin users can read/write everything
CREATE POLICY "Admins full access contacts" ON contacts
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

CREATE POLICY "Admins full access opportunities" ON opportunities
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

CREATE POLICY "Admins full access ai_actions" ON ai_actions_log
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

CREATE POLICY "Admins full access content" ON content_calendar
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM admin_users)
  );

-- Service role bypasses RLS for API routes / automations
-- (This is automatic with supabase service role key)
```

---

## AUTOMATION FLOWS (Replaces Make.com)

All automations are Next.js API routes. No external orchestration.

### Automation 1: Lead → Voice Call

**Trigger:** New contact created (form submission hits `/api/webhooks/lead-created`)

**Flow:**
```
1. Receive form POST data
2. Insert contact into Supabase `contacts` table
3. Create opportunity in `opportunities` table (stage: new-lead)
4. POST to Bland.ai /v1/calls with:
   - phone_number: contact.phone
   - voice: "maya"
   - task: personalized script mentioning their name, 40-60% savings, email follow-up
   - first_sentence: "Hey {first_name}! This is Maya from VortexTrips..."
   - max_duration: 2 minutes
   - webhook_url: {APP_URL}/api/webhooks/bland (to receive call completion)
5. Log the action in ai_actions_log (status: pending)
6. When Bland.ai webhook fires back to /api/webhooks/bland:
   - Update ai_actions_log (status: success/failed, response data)
   - Update contact tags: add "bland-call-sent"
   - Update contact.last_ai_action: "Intro call completed"
   - Move opportunity stage to "call-completed"
```

### Automation 2: Quote Request → AI Email

**Trigger:** Quote form submission hits `/api/automations/quote-email`

**Flow:**
```
1. Receive quote form data (destination, dates, budget, travelers, notes)
2. Update contact in Supabase with quote details in custom_fields
3. POST to OpenAI /v1/chat/completions:
   - System prompt: travel savings email copywriter for VortexTrips
   - User prompt: include destination, dates, budget, traveler count
   - Model: gpt-4o, temperature: 0.7, max_tokens: 800
4. POST to Mailgun to send the generated email:
   - From: VortexTrips Travel Team <bookings@mg.vortextrips.com>
   - To: contact.email
   - Subject: "Your {destination} Trip — Here's How to Save Big, {first_name}!"
   - HTML body: styled email with AI content + CTA button
5. Log both actions in ai_actions_log
6. Update contact: add tags ["quote-sent", "ai-email-sent"]
7. Move opportunity stage to "quote-sent"
```

### Automation 3: Weekly Content Engine

**Trigger:** Vercel cron job every Monday at 8:00 AM EST

**Flow:**
```
1. POST to OpenAI /v1/chat/completions:
   - Generate 5 social media posts (1 per platform mix)
   - Each has: platform, caption, hashtags, image_prompt
   - Output: JSON array
2. Parse the JSON response
3. Insert 5 rows into content_calendar table (status: draft)
4. Log the action in ai_actions_log
```

**Vercel cron config (`vercel.json`):**
```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-content",
      "schedule": "0 13 * * 1"
    }
  ]
}
```
(13:00 UTC = 8:00 AM EST)

### Automation 4: New Member → Onboarding

**Trigger:** Stripe webhook confirms payment → `/api/webhooks/stripe`

**Flow:**
```
1. Verify Stripe webhook signature
2. On checkout.session.completed event:
   - Find contact by email (from Stripe session)
   - Update contact: membership_status = "active", joined_date = now, add tags ["ttp-member", "paid", "onboarding"]
   - Create or update opportunity: stage = "onboarding-started", pipeline = "onboarding"
3. Send onboarding welcome email via Mailgun:
   - Use OpenAI to personalize the welcome message
   - Include next steps, what to expect, how to book first trip
4. Send admin notification email:
   - To: ADMIN_NOTIFICATION_EMAIL
   - Subject: "New TTP Member: {first_name} {last_name}"
   - Body: contact details + membership info
5. Log all actions in ai_actions_log
```

---

## API WRAPPER SPECS

### `src/lib/bland.ts`
```typescript
// Export: triggerCall(phone, firstName, email, task?)
// POST to https://api.bland.ai/v1/calls
// Return: { callId, status }
// Handle errors gracefully, always log to ai_actions_log
```

### `src/lib/mailgun.ts`
```typescript
// Export: sendEmail({ to, subject, html, from? })
// POST to https://api.mailgun.net/v3/{DOMAIN}/messages
// Use form-urlencoded body
// Auth: Basic base64("api:" + MAILGUN_API_KEY)
// Return: { id, message }
```

### `src/lib/openai.ts`
```typescript
// Export: generateCompletion({ systemPrompt, userPrompt, temperature?, maxTokens? })
// POST to https://api.openai.com/v1/chat/completions
// Model: gpt-4o
// Return: { content, usage }
```

### `src/lib/stripe.ts`
```typescript
// Export: createCheckoutSession(contactEmail, priceId)
// Export: verifyWebhookSignature(body, signature)
// Use stripe npm package
```

---

## DASHBOARD PAGES

### Overview (`/dashboard`)
- Total leads (count from contacts where status = lead)
- Total members (count where membership_status = active)
- Calls made today (count from ai_actions_log where action_type = voice-call AND today)
- Emails sent today (count where action_type = quote-email AND today)
- Conversion rate (members / total contacts)
- Recent activity feed (last 20 ai_actions_log entries, realtime via Supabase)
- Pipeline stage distribution (bar or donut chart)

### Leads (`/dashboard/leads`)
- Sortable, searchable, filterable table of all contacts
- Columns: Name, Email, Phone, Source, Status, Tags, Created, Last AI Action
- Click a row → slide-out detail panel showing full contact info, timeline of AI actions, opportunity stage
- Bulk actions: add tag, change status

### Members (`/dashboard/members`)
- Table of contacts where membership_status = active
- Columns: Name, Email, Phone, Joined Date, Pipeline Stage
- Click → detail panel with membership info, onboarding status

### Pipeline (`/dashboard/pipeline`)
- Kanban board with columns for each stage
- Drag-and-drop to move contacts between stages
- Cards show: Name, source, days in stage, last action
- Use Supabase realtime to update board live

### Calls (`/dashboard/calls`)
- Table of ai_actions_log where action_type = voice-call
- Columns: Contact Name, Phone, Status, Duration, Timestamp
- Expandable rows showing full request/response payload

### Content (`/dashboard/content`)
- Calendar or table view of content_calendar
- Filter by week, platform, status
- Click to edit caption, approve, or reject
- "Generate This Week" button to manually trigger content engine

### Settings (`/dashboard/settings`)
- API key management (show masked keys, test connection buttons)
- Bland.ai voice/script configuration
- Email template preview
- Admin user management

---

## LANDING PAGE DESIGN

The landing page at `/` should be a high-converting lead capture page.

**Brand identity:**
- Primary color: `#FF6B35` (warm orange)
- Secondary: `#1A1A2E` (deep navy)
- Accent: `#16C79A` (teal/green for savings callouts)
- Font: modern, bold, travel/adventure feeling

**Sections:**
1. **Hero**: Bold headline about saving 40-60% on travel. Subhead about exclusive membership. Lead capture form (first name, email, phone). CTA button: "Unlock Your Travel Savings"
2. **Social proof**: "Join 2,000+ members saving thousands on every trip"
3. **How it works**: 3 steps — Sign up, Get your personalized quote, Book and save
4. **Benefits**: Exclusive hotel rates, AI-powered deal matching, Personal travel consultant, Members-only pricing
5. **Testimonials**: 3 member quotes with photos
6. **Final CTA**: Repeat the lead capture form
7. **Footer**: Links, contact, social

**Form submission flow:**
- Form POSTs to `/api/webhooks/lead-created`
- On success, redirect to `/thank-you`
- Thank you page: "You're in! Maya from our team will call you in the next few minutes to help you start saving."

---

## QUOTE REQUEST PAGE

The quote form at `/quote` collects trip details.

**Fields:**
- First name (pre-filled if known)
- Email (pre-filled if known)
- Destination (text input)
- Travel dates (date range picker)
- Number of travelers (number input)
- Budget range (dropdown: Under $1k, $1k-$3k, $3k-$5k, $5k-$10k, $10k+)
- Additional notes (textarea)
- Submit button: "Get My Savings Quote"

**On submit:** POST to `/api/automations/quote-email`

---

## MEMBERSHIP CHECKOUT

The join page at `/join` handles TTP membership purchase.

**Display:**
- Membership benefits recap
- Price: configure in Stripe (e.g., $49/month or $399/year)
- Stripe Checkout integration (redirect to Stripe hosted checkout or embedded)
- On success: Stripe webhook fires → onboarding automation triggers

---

## BUILD ORDER

### CRITICAL DEPLOYMENT RULE
**Deploy and verify the local dev server FIRST. Do NOT push to GitHub or Vercel until the dev server is running, the database is connected, and at least one page renders correctly.** This prevents broken commits and wasted debugging on remote environments.

Execute in this order:

```
Phase 1 — Foundation (LOCAL ONLY — no git push yet)
  1. Initialize Next.js project with TypeScript + Tailwind CSS
  2. Create .gitignore immediately — include .env.local, .env, .env*.local, mobile/.env.local, node_modules
  3. Create .env.local with all keys (local only, never committed)
  4. Create .env.example with placeholder key names (this WILL be committed)
  5. Set up Supabase project and run all migrations
  6. Create Supabase client utilities (client.ts, server.ts, admin.ts)
  7. Set up Supabase Auth for admin dashboard login
  8. Run `npm run dev` — VERIFY dev server starts on localhost:3000
  9. VERIFY Supabase connection works (test a simple query)
  10. STOP HERE AND CONFIRM: "Dev server running, DB connected" before proceeding

Phase 2 — API Wrappers (still local)
  11. Build src/lib/bland.ts
  12. Build src/lib/mailgun.ts
  13. Build src/lib/openai.ts
  14. Build src/lib/stripe.ts
  15. Test each wrapper with a simple call to verify API keys work

Phase 3 — Automations (API Routes)
  16. Build /api/webhooks/lead-created (Automation 1: Lead → Voice Call)
  17. Build /api/webhooks/bland (call completion callback)
  18. Build /api/automations/quote-email (Automation 2: Quote → AI Email)
  19. Build /api/cron/weekly-content (Automation 3: Weekly Content Engine)
  20. Build /api/webhooks/stripe (Automation 4: Payment → Onboarding)
  21. Build /api/automations/onboarding
  22. Test each route locally with curl or Postman

Phase 4 — Public Pages
  23. Build landing page (/) with lead capture form
  24. Build thank you page (/thank-you)
  25. Build quote request page (/quote)
  26. Build membership checkout page (/join)
  27. Test full lead capture flow locally: form submit → DB insert → API trigger

Phase 5 — Dashboard
  28. Build dashboard layout with sidebar and auth guard
  29. Build overview page with KPI cards
  30. Build leads table page
  31. Build members table page
  32. Build pipeline kanban board
  33. Build calls log page
  34. Build content calendar page
  35. Build settings page

Phase 6 — FIRST GIT PUSH (only after local is fully working)
  36. VERIFY .gitignore is correct — run `cat .gitignore` and confirm .env.local is listed
  37. VERIFY no secrets in any source file — grep for API key patterns
  38. Initialize git repo: git init
  39. Create GitHub repo (private)
  40. git add . && git commit -m "Initial build — all features working locally"
  41. git remote add origin [repo-url] && git push -u origin main
  42. Connect repo to Vercel
  43. Add ALL env vars to Vercel dashboard (Settings → Environment Variables) — do NOT use .env files on Vercel
  44. Deploy to Vercel and verify production build works

Phase 7 — React Native Mobile App
  45. Initialize Expo project inside /mobile directory
  46. Install NativeWind (Tailwind CSS for React Native) and configure
  47. Set up Supabase client for React Native
  48. Build login screen (Supabase Auth)
  49. Build home screen (member dashboard)
  50. Build trips screen
  51. Build savings tracker screen
  52. Build digital membership card screen
  53. Build push notification integration
  54. Build tab navigation
  55. Create mobile/.env.local (local only, never committed)
  56. Test on Expo Go (iOS + Android)
  57. Configure Expo EAS Build for production

Phase 8 — Polish and Go Live
  58. Add Supabase realtime subscriptions to dashboard
  59. Add loading states, error handling, toast notifications
  60. Mobile responsive pass on all web pages
  61. Set up Vercel cron for weekly content
  62. Full end-to-end test: lead → call → email → payment → onboarding
  63. Security audit: check all env vars, RLS policies, auth guards
  64. Go live
```

---

## NOTES FOR THE LLM

### Stack Rules
- Do NOT use any no-code tools. Everything is coded.
- Do NOT use GoHighLevel or Make.com. Those are replaced by custom code.
- Use **React Native with Expo** for the mobile app. Use **NativeWind** for Tailwind CSS styling in React Native.
- Use **Tailwind CSS** for all web styling. No CSS modules, no styled-components, no inline styles unless absolutely necessary.
- All automations are Next.js API routes with direct API calls to Bland.ai, Mailgun, OpenAI, and Stripe.
- Supabase is the single source of truth for all data.
- Shared TypeScript types go in `/shared/types.ts` and are imported by both web and mobile.

### Security Rules
- **ALL env vars stay in `.env.local` — NEVER committed to git.**
- **NEVER hardcode any API key, secret, or token in source code.** Always use `process.env.VARIABLE_NAME`.
- **NEVER log env vars to console**, even in development.
- **Verify `.gitignore` includes `.env.local` BEFORE the first git add.**
- **Do NOT push to GitHub until the local dev server is running and verified.**
- Use Supabase RLS policies on every table. No public access without auth.

### Deployment Rules
- **Run `npm run dev` and verify localhost:3000 works BEFORE any git operations.**
- **Run `npx expo start` and verify mobile app loads BEFORE pushing mobile code.**
- First git push happens ONLY after Phase 5 is complete and locally verified.
- Vercel env vars are added through the Vercel dashboard, never through code or CLI.
- Production URL is set AFTER first successful Vercel deploy.

### Quality Rules
- The dashboard must be functional, not a mockup. Real data, real queries, real CRUD.
- Use Supabase realtime for the activity feed and pipeline board.
- Every external API call must be logged in `ai_actions_log` with request/response payloads.
- Every automation must have error handling — if Bland.ai fails, log it, tag the contact with "call-failed", and continue.
- The landing page must be production-quality, not a wireframe. Bold design, real copy, real form that works.
- Start Phase 1 immediately. Do not ask clarifying questions. Use reasonable defaults for anything not specified.
