# VortexTrips — Project Status

## Infrastructure
| Service | Status | Details |
|---|---|---|
| GitHub | ✅ Live | https://github.com/leosp-elbey/Vortex |
| Vercel | ✅ Live | https://www.vortextrips.com |
| Supabase | ✅ Connected | Project: mufpiphjddpacbxlbpqi |
| Bland.ai | ✅ Key added | API key in .env.local + Vercel |
| OpenAI | ✅ Key added | API key in .env.local + Vercel |
| Resend | ✅ Key added | Replaced Mailgun |
| Stripe | ❌ Removed | Manual enrollment for now — add back later |

## Build Phases

### ✅ Phase 1 — Foundation
- Next.js 16 project with TypeScript + Tailwind CSS
- .gitignore, .env.example, .env.local configured
- Supabase project connected
- All 5 SQL migrations run (contacts, opportunities, ai_actions_log, content_calendar, admin_users)
- RLS policies applied including public insert on contacts

### ✅ Phase 2 — API Wrappers
- `src/lib/supabase/` — client, server, admin clients
- `src/lib/bland.ts` — voice call trigger
- `src/lib/openai.ts` — GPT-4o completions
- `src/lib/resend.ts` — email delivery (replaced Mailgun)
- `src/lib/utils.ts` — shared helpers

### ✅ Phase 3 — Automations
- `POST /api/webhooks/lead-created` — saves contact, creates opportunity, triggers Bland.ai call
- `POST /api/webhooks/bland` — call completion callback, updates pipeline stage
- `POST /api/automations/quote-email` — OpenAI quote generation + Resend delivery
- `GET /api/cron/weekly-content` — Monday 8AM content generation (Vercel cron)
- `GET/PATCH /api/contacts` — contact CRUD
- `GET/PATCH /api/pipeline` — pipeline stage management

### ✅ Phase 4 — Public Pages
- `/` — Landing page with lead capture form (fixed typing bug)
- `/thank-you` — Post-signup confirmation
- `/quote` — Trip quote request form
- `/join` — Membership page (manual enrollment, Stripe removed)

### ✅ Phase 5 — Admin Dashboard
- `/login` — Supabase Auth login
- `/reset-password` — Password reset page
- `/auth/confirm` — Auth callback route
- `/dashboard` — KPI overview + activity feed
- `/dashboard/leads` — Contacts table
- `/dashboard/members` — Active members table
- `/dashboard/pipeline` — Kanban board
- `/dashboard/calls` — Bland.ai call logs
- `/dashboard/content` — AI content calendar
- `/dashboard/settings` — API key status + config

### ✅ Phase 6 — Deployment
- Pushed to GitHub (private repo)
- Deployed to Vercel
- Custom domain: vortextrips.com connected
- All env vars added to Vercel dashboard

---

## ❌ Pending / In Progress

### 🔴 Blocker — Admin Login
- Password reset email flow works but redirect goes to wrong Supabase project URL
- Two Supabase project URLs detected (mufpiphjddpacbxlbpqi vs omtkaljjkmlknudiabfw) — needs investigation
- SQL password update attempted but login still failing
- **Next step:** Confirm which Supabase project Vercel is pointing to, try SQL password reset again

### 🟡 Needs Testing
- [ ] Lead form submission → contact saved in DB
- [ ] Bland.ai voice call triggered on new lead
- [ ] Quote email flow (OpenAI + Resend)
- [ ] Dashboard loads real data after login
- [ ] Weekly content generation cron

### 🟡 Resend Setup
- [ ] Verify vortextrips.com domain in Resend dashboard
- [ ] Add DNS records in Cloudflare for Resend
- [ ] Test email delivery end-to-end

### 🟡 Supabase Auth Config
- [ ] Set Site URL to https://www.vortextrips.com in Supabase Auth settings
- [ ] Add https://www.vortextrips.com/reset-password to Redirect URLs
- [ ] Reset password email template updated (done) — confirm it works

### ⚪ Not Started
- [ ] Phase 7 — React Native mobile app (Expo)
- [ ] Stripe re-integration when ready
- [ ] Supabase Realtime on dashboard activity feed
- [ ] Push notifications (mobile)
- [ ] End-to-end flow test: lead → call → email → member

---

## Key Files
| File | Purpose |
|---|---|
| `src/app/page.tsx` | Landing page + lead form |
| `src/app/api/webhooks/lead-created/route.ts` | Main lead intake |
| `src/lib/bland.ts` | Bland.ai voice call |
| `src/lib/resend.ts` | Email sending |
| `src/lib/openai.ts` | AI content generation |
| `supabase/migrations/` | All 5 DB migration files |
| `.env.local` | Local API keys (never committed) |

## Env Vars Checklist (Vercel)
- [x] NEXT_PUBLIC_SUPABASE_URL
- [x] NEXT_PUBLIC_SUPABASE_ANON_KEY
- [x] SUPABASE_SERVICE_ROLE_KEY
- [x] BLAND_API_KEY
- [x] OPENAI_API_KEY
- [x] RESEND_API_KEY
- [x] NEXT_PUBLIC_APP_URL = https://www.vortextrips.com
- [x] ADMIN_NOTIFICATION_EMAIL = leoelbey@gmail.com
- [x] CRON_SECRET = vortextrips_cron_secret_2024
