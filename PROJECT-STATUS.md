# VortexTrips — Project Status

Last updated: April 18, 2026

## Infrastructure
| Service | Status | Details |
|---|---|---|
| GitHub | ✅ Live | https://github.com/leosp-elbey/Vortex |
| Vercel | ✅ Deployed | https://www.vortextrips.com |
| Supabase | ✅ Connected | Project: mufpiphjddpacbxlbpqi |
| Bland.ai | ✅ Key set | In Vercel + .env.local |
| OpenAI | ✅ Key set | In Vercel + .env.local |
| Resend | ✅ Key set | Replaced Mailgun |
| Stripe | ❌ Removed | Manual enrollment for now — add back later |

## Build Phases

### ✅ Phase 1 — Foundation
- Next.js 16 + TypeScript + Tailwind CSS scaffolded
- .gitignore, .env.example, .env.local configured
- Supabase connected, all 5 SQL migrations run
- RLS policies applied + public insert policy on contacts

### ✅ Phase 2 — API Wrappers
- `src/lib/supabase/` — client, server (async), admin clients
- `src/lib/bland.ts` — voice call trigger
- `src/lib/openai.ts` — GPT-4o completions
- `src/lib/resend.ts` — email delivery
- `src/lib/utils.ts` — shared helpers

### ✅ Phase 3 — Automations
- `POST /api/webhooks/lead-created` — saves contact, creates opportunity, triggers Bland.ai
- `POST /api/webhooks/bland` — call completion callback
- `POST /api/automations/quote-email` — AI quote + Resend email
- `GET /api/cron/weekly-content` — Monday 8AM content generation
- `GET/PATCH /api/contacts` — contact CRUD
- `GET/PATCH /api/pipeline` — pipeline stage management

### ✅ Phase 4 — Public Pages
- `/` — Landing page with lead capture form (typing bug fixed)
- `/thank-you` — Post-signup confirmation
- `/quote` — Trip quote request form
- `/join` — Membership page (manual enrollment)

### ✅ Phase 5 — Admin Dashboard (built, login pending)
- `/login` — Supabase Auth login page
- `/reset-password` — Password reset page (handles hash token)
- `/auth/confirm` — Auth callback route
- `/dashboard` — KPI overview + activity feed
- `/dashboard/leads` — Contacts table
- `/dashboard/members` — Active members table
- `/dashboard/pipeline` — Kanban board
- `/dashboard/calls` — Bland.ai call logs
- `/dashboard/content` — AI content calendar
- `/dashboard/settings` — API key status + config

### ✅ Phase 6 — Deployment
- Vercel deployed + custom domain vortextrips.com connected
- All env vars added to Vercel
- Install command set to `npm install --legacy-peer-deps`
- Next.js upgraded to 16.2.4 (security fix)

---

## ❌ Blocker — Admin Login Not Working

### What's been tried
- Created admin user in Supabase Auth ✅
- Ran INSERT into admin_users table ✅
- SQL password update attempted
- Password recovery email flow set up
- Supabase email template updated to redirect to `/reset-password`

### Likely cause
The login hits `/dashboard` which calls `createClient()` server-side and checks `admin_users` table via RLS. Something in the auth session or RLS check is failing silently.

### Next session — try these in order
1. Open browser devtools → Network tab → try logging in → find the failing request and check the exact error response
2. In Supabase → Authentication → Users → confirm `leoelbey@gmail.com` shows **Confirmed**
3. In Supabase SQL Editor run:
   ```sql
   SELECT * FROM admin_users;
   ```
   Confirm the row exists with correct UUID matching auth.users
4. Check Vercel → Functions logs for any server error on `/dashboard`
5. Try logging in at `/login` and check what URL it redirects to and what error shows

---

## 🟡 Needs Testing (after login fixed)
- [ ] Lead form submission → contact saved in DB
- [ ] Bland.ai voice call triggered on new lead
- [ ] Quote email flow (OpenAI + Resend)
- [ ] Dashboard loads real data
- [ ] Weekly content generation cron

## 🟡 Resend Setup
- [ ] Verify vortextrips.com domain in Resend dashboard
- [ ] Add DNS records in Cloudflare for Resend domain verification
- [ ] Test email delivery end-to-end

## ⚪ Not Started
- [ ] Phase 7 — React Native mobile app (Expo)
- [ ] Stripe re-integration
- [ ] Supabase Realtime on dashboard
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
| `src/lib/supabase/server.ts` | Async server Supabase client |
| `supabase/migrations/` | All 5 DB migration files |
| `.env.local` | Local API keys (never committed) |

## Vercel Env Vars
- [x] NEXT_PUBLIC_SUPABASE_URL
- [x] NEXT_PUBLIC_SUPABASE_ANON_KEY
- [x] SUPABASE_SERVICE_ROLE_KEY
- [x] BLAND_API_KEY
- [x] OPENAI_API_KEY
- [x] RESEND_API_KEY
- [x] NEXT_PUBLIC_APP_URL = https://www.vortextrips.com
- [x] ADMIN_NOTIFICATION_EMAIL = leoelbey@gmail.com
- [x] CRON_SECRET = vortextrips_cron_secret_2024
