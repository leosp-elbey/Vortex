# VortexTrips — Project Status
**Last updated: April 21, 2026**

---

## LIVE SITE
- **URL:** https://www.vortextrips.com
- **Repo:** https://github.com/leosp-elbey/Vortex (public)
- **Deployment:** Vercel (Hobby plan, auto-deploy from `main` branch)
- **Latest commit:** `d316bff` — Hero background photo

---

## TECH STACK

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Database + Auth | Supabase (PostgreSQL + RLS) |
| Email | Resend — FROM: bookings@vortextrips.com |
| AI Voice Calls | Bland.ai |
| AI Content / Emails | OpenAI GPT-4o |
| SMS | Twilio |
| Deployment | Vercel (Hobby plan) |

---

## EMAIL ADDRESSES (all forward to leoelbey@gmail.com)

| Address | Purpose |
|---|---|
| bookings@vortextrips.com | Outbound email FROM address (Resend) |
| leo@vortextrips.com | Personal |
| info@vortextrips.com | General inquiries |
| support@vortextrips.com | Customer support |

---

## ENVIRONMENT VARIABLES (set in Vercel)

| Variable | Notes |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | Admin client (server-side only) |
| OPENAI_API_KEY | GPT-4o |
| RESEND_API_KEY | Email delivery |
| BLAND_API_KEY | AI voice calls |
| TWILIO_ACCOUNT_SID | Set in Vercel (sensitive) |
| TWILIO_AUTH_TOKEN | Set in Vercel (sensitive) |
| TWILIO_PHONE_NUMBER | Twilio outbound SMS number |
| NEXT_PUBLIC_APP_URL | https://www.vortextrips.com |
| CRON_SECRET | Set in Vercel — authenticates cron job requests |

---

## PAGES BUILT

| Route | Description |
|---|---|
| `/` | Landing page — lead capture form, hero bg photo, testimonials, benefits |
| `/quote` | Quote request form — AI email + optional phone for call |
| `/thank-you` | Context-aware: `?from=lead` shows call messaging, `?from=quote` shows email messaging |
| `/privacy` | Privacy policy — includes A2P-compliant SMS data clause |
| `/terms` | Terms & Conditions — full TCR-required SMS disclosures |
| `/join` | Redirect → https://signup.surge365.com/signup |
| `/free` | Redirect → https://myvortex365.com/leosp |
| `/book` | Redirect → https://travmanity.com/Page/Home/wa=leosp?FpSubAffiliate |
| `/og` | Dynamic OG image (1200×630) — edge runtime, used for social sharing |
| `/dashboard` | Admin dashboard (auth required) |
| `/dashboard/leads` | Lead management — search, filter, bulk actions, slide panel |
| `/dashboard/members` | Member management — search, slide panel |
| `/dashboard/pipeline` | Kanban pipeline — drag-and-drop stage updates |
| `/dashboard/content` | Content calendar — approve/reject/post AI-generated social content |
| `/dashboard/settings` | Admin user management, API key status, cron info |

---

## API ROUTES BUILT

| Route | Method | Purpose |
|---|---|---|
| `/api/webhooks/lead-created` | POST | Create contact + opportunity, trigger Bland call, send Day 0 SMS, queue nurture sequence |
| `/api/automations/quote-email` | POST | Generate AI quote email via OpenAI, send via Resend, upsert contact |
| `/api/automations/trigger-sba` | POST | Enroll SBA into onboarding sequence (Steps 1 + 2 SMS) |
| `/api/pipeline` | PATCH | Update opportunity stage (drag-and-drop) |
| `/api/content` | PATCH | Update content_calendar status (approve/reject/posted) |
| `/api/admin-users` | GET/POST/DELETE | List/invite/remove admin users |
| `/api/cron/weekly-content` | GET | Generate 5 AI social posts, insert to content_calendar (Mondays 1pm UTC) |
| `/api/cron/send-sequences` | GET | Process sequence_queue — send pending SMS (daily 10am UTC) |

---

## LIBRARIES BUILT

| File | Purpose |
|---|---|
| `src/lib/supabase/server.ts` | Supabase client (server components) |
| `src/lib/supabase/admin.ts` | Supabase admin client (service role) |
| `src/lib/openai.ts` | OpenAI completions wrapper |
| `src/lib/resend.ts` | Resend email wrapper — FROM: bookings@vortextrips.com |
| `src/lib/bland.ts` | Bland.ai voice call trigger |
| `src/lib/twilio.ts` | Twilio SMS wrapper + 6 sequence templates |
| `src/lib/utils.ts` | Utilities |

---

## UI COMPONENTS BUILT

| Component | Purpose |
|---|---|
| `src/components/ui/slide-panel.tsx` | Full-height right slide panel (ESC + backdrop to close) |
| `src/components/ui/toast.tsx` | Toast notification hook + Toaster component |

---

## SMS SEQUENCE SYSTEM

### How it works
1. Lead submits form → `lead-created` webhook fires
2. Day 0 SMS sent **immediately** via Twilio
3. Steps 2–4 inserted into `sequence_queue` table with future `scheduled_at` dates
4. Daily cron at 10am UTC processes pending rows and sends SMS

### Lead Nurture Sequence (Sequence 1)
| Step | Timing | Template Key |
|---|---|---|
| 1 | Immediately on signup | `leadDay0` |
| 2 | Day 2 | `leadDay2` |
| 3 | Day 7 | `leadDay7` |
| 4 | Day 12 | `leadDay12` |

### SBA Onboarding Sequence (Sequence 2)
| Step | Timing | Template Key |
|---|---|---|
| 1 | Immediately on enrollment | `sbaDay0` |
| 2 | Day 7 | `sbaDay7` |

Trigger SBA onboarding: POST `/api/automations/trigger-sba` with `{ contact_id }` from dashboard.

---

## SUPABASE TABLES

| Table | Purpose |
|---|---|
| `contacts` | All leads and members |
| `opportunities` | Pipeline stages per contact |
| `ai_actions_log` | Log of all AI actions (calls, emails, SMS) |
| `content_calendar` | AI-generated social content queue |
| `admin_users` | Admin dashboard users |
| `sequence_queue` | Scheduled SMS/email drip queue |

### sequence_queue schema (run in Supabase SQL editor if not created)
```sql
CREATE TABLE IF NOT EXISTS sequence_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  sequence_name text NOT NULL,
  step integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  template_key text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sequence_queue_status_scheduled ON sequence_queue(status, scheduled_at);
```

### ai_actions_log service constraint (run if not yet updated)
```sql
ALTER TABLE ai_actions_log DROP CONSTRAINT IF EXISTS ai_actions_log_service_check;
ALTER TABLE ai_actions_log ADD CONSTRAINT ai_actions_log_service_check CHECK (service IN ('bland', 'openai', 'resend', 'twilio'));
```

---

## A2P SMS COMPLIANCE (completed)

All 4 TCR blockers resolved:
- [x] `/terms` page live with program name, HELP/STOP disclosures, message frequency
- [x] `/privacy` updated with "No mobile information or SMS opt-in data will be shared with third parties"
- [x] SMS consent checkbox on landing page lead form (required)
- [x] SMS disclosure + consent checkbox on quote page (required when phone entered)

---

## VERCEL CRON JOBS

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/weekly-content` | Mondays 1pm UTC | Generate 5 AI social posts |
| `/api/cron/send-sequences` | Daily 10am UTC | Process SMS sequence queue |

Note: Hobby plan supports 2 cron jobs, minimum daily frequency.

---

## PUBLIC ASSETS

| File | Purpose |
|---|---|
| `public/hero-background.jpg` | Hero section background (beach/sunset, 6.9MB) |
| `public/testimonials/testimonial-jessica.jpg` | Jessica T. photo |
| `public/testimonials/testimonial-michelle.jpg` | Michelle R. photo |
| `public/testimonials/testimonial-scott.jpg` | Scott L. photo |

---

## REDIRECT LINKS (use in all email/SMS copy)

| Short Link | Destination |
|---|---|
| vortextrips.com/join | surge365.com signup |
| vortextrips.com/free | myvortex365.com/leosp |
| vortextrips.com/book | travmanity.com booking page |

---

## ON HOLD (user decision)

- Stripe payment integration
- React Native / Expo mobile app

---

## KNOWN LIMITS / NOTES

- Vercel Hobby plan: max 2 cron jobs, minimum daily frequency (no sub-daily intervals)
- SMS Day 0 sent directly in the lead webhook to bypass cron limit
- Days 2/7/12 processed by daily 10am UTC cron (±24hr delivery window)
- TypeScript strict mode: always use `Array.from(set)` not `[...set]` for Set iteration
