# VortexTrips — Project Status

Last updated: April 20, 2026

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
- `POST /api/dashboard/generate-content` — manual "Generate This Week" (session-auth)
- `GET/PATCH /api/contacts` — contact CRUD
- `GET/PATCH /api/pipeline` — pipeline stage management
- `PATCH /api/content` — content status update (approve/reject/post)
- `GET/POST/DELETE /api/admin-users` — team admin management

### ✅ Phase 4 — Public Pages
- `/` — Landing page with lead capture form (autofill added)
- `/thank-you` — Post-signup confirmation
- `/quote` — Trip quote request form (autofill added)
- `/join` → redirect to https://signup.surge365.com/signup
- `/booking` → redirect to https://travmanity.com/Page/Home/wa=leosp?FpSubAffiliate
- `/free` → redirect to https://myvortex365.com/leosp

### ✅ Phase 5 — Admin Dashboard
- `/login` — Supabase Auth login page (autofill added)
- `/reset-password` — Password reset page (token flow fixed)
- `/auth/confirm` — Auth callback route (token_hash flow)
- `/dashboard` — KPI overview + activity feed
- `/dashboard/leads` — Searchable/filterable table, bulk status + tag actions, slide-out contact detail with AI history
- `/dashboard/members` — Searchable table, slide-out member detail with AI history
- `/dashboard/pipeline` — Kanban board with drag-and-drop stage changes
- `/dashboard/calls` — Bland.ai call logs
- `/dashboard/content` — AI content calendar, Approve/Reject/Mark Posted/Reset buttons wired up
- `/dashboard/settings` — API key status, Bland/Email config, admin user management (invite + remove)

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

## ✅ New UI Components
- `src/components/ui/toast.tsx` — Toast notifications (useToast hook + Toaster, auto-dismiss 3s)
- `src/components/ui/slide-panel.tsx` — Slide-out detail panel (ESC to close, backdrop click to close)

---

## ⚪ Not Started (On Hold)
- [ ] **Phase 7 — React Native mobile app** (Expo) — login, home, trips, savings, membership card screens
- [ ] **Stripe integration** — payment checkout + webhook + onboarding automation
- [ ] Supabase Realtime on dashboard (live auto-refresh activity feed + pipeline)
- [ ] Email template HTML preview in Settings page

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
