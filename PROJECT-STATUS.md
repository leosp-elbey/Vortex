# VortexTrips — Project Status

Last updated: April 19, 2026

## Infrastructure
| Service | Status | Details |
|---|---|---|
| GitHub | ✅ Live | https://github.com/leosp-elbey/Vortex |
| Vercel | ✅ Deployed | https://www.vortextrips.com |
| Supabase | ✅ Connected | Project: mufpiphjddpacbxlbpqi |
| Bland.ai | ✅ Working | Calls firing, voicemail message added |
| OpenAI | ✅ Working | Quote emails generating correctly |
| Resend | ✅ Verified | Domain vortextrips.com verified via Cloudflare auto |
| Stripe | ❌ Removed | Manual enrollment for now — add back later |

---

## Build Phases

### ✅ Phase 1 — Foundation
- Next.js 16 + TypeScript + Tailwind CSS scaffolded
- .gitignore, .env.example, .env.local configured
- Supabase connected, all 5 SQL migrations run
- RLS policies applied + public insert policy on contacts

### ✅ Phase 2 — API Wrappers
- `src/lib/supabase/` — client, server (async), admin clients
- `src/lib/bland.ts` — voice call trigger + voicemail message
- `src/lib/openai.ts` — GPT-4o completions
- `src/lib/resend.ts` — email delivery
- `src/lib/utils.ts` — shared helpers

### ✅ Phase 3 — Automations
- `POST /api/webhooks/lead-created` — saves contact, creates opportunity, triggers Bland.ai
- `POST /api/webhooks/bland` — call completion callback
- `POST /api/automations/quote-email` — AI quote + Resend email (markdown stripping fixed)
- `GET /api/cron/weekly-content` — Monday 8AM content generation
- `GET/PATCH /api/contacts` — contact CRUD
- `GET/PATCH /api/pipeline` — pipeline stage management

### ✅ Phase 4 — Public Pages
- `/` — Landing page with lead capture form (autofill added)
- `/thank-you` — Post-signup confirmation
- `/quote` — Trip quote request form (autofill added)
- `/join` — Membership page (manual enrollment, autofill added)

### ✅ Phase 5 — Admin Dashboard
- `/login` — Supabase Auth login page (autofill added)
- `/reset-password` — Password reset page (token flow fixed)
- `/auth/confirm` — Auth callback route (token_hash flow)
- `/dashboard` — KPI overview + activity feed
- `/dashboard/leads` — Contacts table
- `/dashboard/members` — Active members table
- `/dashboard/pipeline` — Kanban board
- `/dashboard/calls` — Bland.ai call logs
- `/dashboard/content` — AI content calendar
- `/dashboard/settings` — Updated to Resend config (needs push)

### ✅ Phase 6 — Deployment
- Vercel deployed + custom domain vortextrips.com
- All env vars in Vercel
- Install command: `npm install --legacy-peer-deps`
- Next.js 16.2.4

---

## ✅ Fixes Applied This Session
- Supabase correct project identified (mufpiphjddpacbxlbpqi)
- RLS circular dependency on admin_users fixed
- Admin user inserted with correct UUID
- Password reset email template updated to use token_hash flow → `/reset-password`
- Supabase Site URL + Redirect URLs set to vortextrips.com
- Resend domain verified (auto via Cloudflare)
- Quote email markdown stripping fixed (OpenAI was wrapping HTML in ```html blocks)
- Bland.ai voicemail message added (`wait_for_greeting: true`)
- Autofill added to all 5 forms
- Settings page updated from Mailgun/Stripe → Resend
- README.md created with full backend documentation

---

## 🟡 Pending — Must Push to Vercel
These changes are saved locally but NOT yet deployed:

- [ ] Settings page Resend update (`src/app/dashboard/settings/page.tsx`)
- [ ] Autofill on all forms (`page.tsx`, `login`, `reset-password`, `join`, `quote`)
- [ ] Voicemail message in Bland.ai (`src/lib/bland.ts`)
- [ ] Quote email markdown fix (`src/app/api/automations/quote-email/route.ts`)
- [ ] README.md

**Run to deploy:**
```bash
git add -A && git commit -m "Fix quote email, add voicemail, autofill forms, update settings" && git push
```

---

## 🟡 Needs Testing (after push)
- [ ] Submit test lead → confirm contact in DB + Bland.ai call fires + voicemail left
- [ ] Submit quote form → confirm AI email arrives with no ```html prefix
- [ ] Settings page shows Resend (not Mailgun)
- [ ] Dashboard shows real data (leads count, activity log)

---

## ⚪ Not Started
- [ ] Phase 7 — React Native mobile app (Expo)
- [ ] Stripe re-integration
- [ ] Supabase Realtime on dashboard (live updates)
- [ ] Weekly content cron — verify Vercel cron job is scheduled
- [ ] End-to-end flow test: lead → call → quote email → member conversion

---

## Key Files
| File | Purpose |
|---|---|
| `src/app/page.tsx` | Landing page + lead form |
| `src/app/api/webhooks/lead-created/route.ts` | Main lead intake |
| `src/app/api/automations/quote-email/route.ts` | AI quote email |
| `src/lib/bland.ts` | Bland.ai voice call + voicemail |
| `src/lib/resend.ts` | Email sending |
| `src/lib/openai.ts` | AI content generation |
| `src/lib/supabase/server.ts` | Async server Supabase client |
| `src/app/dashboard/settings/page.tsx` | API key status + config |
| `supabase/migrations/` | All 5 DB migration files |
| `.env.local` | Local API keys (never committed) |
| `README.md` | Full backend documentation |

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
