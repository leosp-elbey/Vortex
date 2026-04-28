# Vortex AI Command Center — Test Report

**Date:** 2026-04-28
**Branch:** main (uncommitted changes)
**Build status:** ✅ PASSING

---

## Test Results Summary

| Check | Status | Notes |
|---|---|---|
| `npx tsc --noEmit` (full project typecheck) | ✅ PASS | Zero errors after `.next/` cache cleared |
| `npm run build` (Next.js production build) | ✅ PASS | All 64 routes compiled; static pages generated cleanly |
| `npm run lint` (next lint) | ⚠️ DISABLED | Pre-existing issue — Next.js 16 dropped `next lint`. Project lint is broken project-wide; not a Phase 8-AI-Center regression |
| Manual smoke tests | ⚠️ PENDING | Requires deploy + dev server run; covered in Phase 11 deployment checklist |

---

## Files Changed Summary

### Created (38 files)

**Documentation (2)**
- `VORTEX_AI_COMMAND_CENTER_PLAN.md` (Phase 0 — build plan)
- `VORTEX_AI_COMMAND_CENTER_TEST_REPORT.md` (this file)

**Database migrations (11)** — `supabase/migrations/`
- `006_create_sequence_queue.sql`
- `007_create_site_settings.sql`
- `008_create_contact_events.sql`
- `009_create_partners.sql`
- `010_create_trips.sql`
- `011_create_reviews.sql`
- `012_alter_contacts_lead_score.sql`
- `013_create_ai_jobs.sql`
- `014_create_ai_model_usage.sql`
- `015_create_ai_verification_logs.sql`
- `016_create_ai_command_templates.sql`

**Library code (8)** — `src/lib/`
- `admin-auth.ts` — shared admin auth helper
- `ai-models.ts` — model metadata & cost estimation
- `ai-prompts.ts` — shared system prompts (writer/video/social/email)
- `ai-router.ts` — OpenRouter gateway with retry + budget guardrails
- `ai-verifier.ts` — Claude verification layer
- `rate-limit.ts` — in-memory IP rate limiter
- `webhook-auth.ts` — form token + Twilio HMAC + Bland Bearer

**API routes (12)** — `src/app/api/`
- `ai/jobs/create/route.ts`
- `ai/jobs/[id]/route.ts`
- `ai/jobs/[id]/verify/route.ts`
- `ai/jobs/[id]/approve/route.ts`
- `ai/jobs/[id]/reject/route.ts`
- `ai/generate/content/route.ts`
- `ai/generate/blog/route.ts`
- `ai/generate/email-sequence/route.ts`
- `ai/generate/video-script/route.ts`
- `ai/generate/social-pack/route.ts`
- `ai/generate/social-calendar/route.ts`
- `ai/push-to-calendar/route.ts`
- `cron/check-heygen-jobs/route.ts`

**Dashboard (5)** — `src/app/dashboard/ai-command-center/` and `src/components/ai/`
- `src/app/dashboard/ai-command-center/page.tsx`
- `src/components/ai/WorkflowPanel.tsx`
- `src/components/ai/JobInspector.tsx`
- `src/components/ai/JobsTable.tsx`
- `src/components/ai/VerificationPanel.tsx`
- `src/components/ai/PushToCalendarPanel.tsx`

### Edited (8 files)
- `vercel.json` — added cron schedule for `check-heygen-jobs`
- `.env.example` — added AI Command Center vars + webhook security vars
- `package.json` + `package-lock.json` — added `@anthropic-ai/sdk` and `zod`
- `src/components/dashboard/sidebar.tsx` — added 🤖 AI Center nav link
- `src/app/api/webhooks/lead-created/route.ts` — form token + IP rate limit
- `src/app/api/webhooks/track-event/route.ts` — IP rate limit
- `src/app/api/webhooks/bland/route.ts` — Bearer token check
- `src/app/api/webhooks/twilio-sms/route.ts` — HMAC signature verification
- `src/app/page.tsx`, `src/app/sba/page.tsx`, `src/app/quiz/page.tsx`, `src/app/destinations/[slug]/page.tsx` — added `X-Vortex-Form-Token` header on lead-form fetches

### Deleted (2)
- `src/app/api/webhooks/stripe/` (empty orphan directory)
- `src/components/ai/JobCreator.tsx` (replaced by WorkflowPanel)

---

## Routes Inventory

### New AI Command Center routes (admin-only)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ai/jobs/create` | Generic AI job creation (any job type) |
| GET | `/api/ai/jobs/[id]` | Fetch job + verifications + usage |
| POST | `/api/ai/jobs/[id]/verify` | Trigger Claude verification |
| POST | `/api/ai/jobs/[id]/approve` | Human gate: status → approved |
| POST | `/api/ai/jobs/[id]/reject` | Human gate: status → rejected |
| POST | `/api/ai/generate/content` | Generic content generator |
| POST | `/api/ai/generate/blog` | Long-form blog post |
| POST | `/api/ai/generate/email-sequence` | N-step email drip |
| POST | `/api/ai/generate/video-script` | Short-form video script |
| POST | `/api/ai/generate/social-pack` | Multi-platform post pack |
| POST | `/api/ai/generate/social-calendar` | 30-day calendar (capped at 60 posts total) |
| POST | `/api/ai/push-to-calendar` | Insert approved job's posts into `content_calendar` |

### New cron route
| Method | Path | Schedule |
|---|---|---|
| GET/POST | `/api/cron/check-heygen-jobs` | Daily 6am UTC — polls HeyGen for pending video completion |

### Hardened webhooks (existing routes)
| Path | Hardening |
|---|---|
| `/api/webhooks/lead-created` | Form token + 10 reqs/min/IP |
| `/api/webhooks/track-event` | 60 reqs/min/IP |
| `/api/webhooks/bland` | Bearer token check |
| `/api/webhooks/twilio-sms` | HMAC-SHA1 signature verification |

### New dashboard
| Path | Purpose |
|---|---|
| `/dashboard/ai-command-center` | Workflow tabs + job inspector + jobs table + push-to-calendar |

---

## Migrations Status

All 11 migrations were applied to Supabase production on 2026-04-27 by Leo via the SQL Editor.

| # | File | Applied | Notes |
|---|---|---|---|
| 006 | sequence_queue | ✅ | Schema verified against code |
| 007 | site_settings | ✅ | |
| 008 | contact_events | ✅ | Fixed mid-deploy: column is `event` (not `event_type`); added `score_delta` |
| 009 | partners | ✅ | Fixed mid-deploy: `destinations TEXT[]`, `budgets TEXT[]`, `active BOOLEAN` |
| 010 | trips | ✅ | Fixed mid-deploy: `departure_date`, `booking_value`, `travelers` |
| 011 | reviews | ✅ | Fixed mid-deploy: `first_name`, `review_text`, `saved_amount` |
| 012 | contacts.lead_score ALTER | ✅ | |
| 013 | ai_jobs | ✅ | Core AI Command Center table |
| 014 | ai_model_usage | ✅ | Token + cost tracking |
| 015 | ai_verification_logs | ✅ | Claude verification audit trail |
| 016 | ai_command_templates | ✅ | Reusable prompt templates |

All include RLS policies tied to `admin_users`. Service-role-key code paths bypass RLS.

---

## Required Environment Variables (Vercel + .env.local)

### Already configured (verified 2026-04-27 via `vercel env ls`)

- ANTHROPIC_API_KEY
- BLAND_API_KEY
- CRON_SECRET
- FACEBOOK_APP_SECRET
- FACEBOOK_PAGE_ACCESS_TOKEN
- FACEBOOK_PAGE_ID
- HEYGEN_API_KEY
- HEYGEN_AVATAR_ID
- HEYGEN_VOICE_ID
- INSTAGRAM_ACCESS_TOKEN
- INSTAGRAM_BUSINESS_ACCOUNT_ID
- NEXT_PUBLIC_APP_URL
- NEXT_PUBLIC_FB_APP_ID
- NEXT_PUBLIC_FB_LOGIN_CONFIG_ID
- NEXT_PUBLIC_FB_PIXEL_ID
- NEXT_PUBLIC_GA_MEASUREMENT_ID
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SUPABASE_URL
- OPENAI_API_KEY
- OPENROUTER_API_KEY
- PEXELS_API_KEY
- RESEND_API_KEY
- SUPABASE_SERVICE_ROLE_KEY
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_PHONE_NUMBER
- YOUTUBE_CLIENT_ID
- YOUTUBE_CLIENT_SECRET
- TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
- TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET, TWITTER_BEARER_TOKEN, TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET
- ADMIN_NOTIFICATION_EMAIL
- (all auto-managed Supabase POSTGRES_* / SUPABASE_* integration vars)

### NEW — must be added to Vercel (Production + Preview) before deploy

| Key | Suggested value | Notes |
|---|---|---|
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI-compatible base URL for OpenRouter |
| `AI_DEFAULT_MODEL` | `anthropic/claude-haiku-4.5` | Fallback if no other model resolves |
| `AI_CHEAP_MODEL` | `meta-llama/llama-3.3-70b-instruct` | For: ideas, captions, hashtags, outlines |
| `AI_MEDIUM_MODEL` | `anthropic/claude-sonnet-4.6` | For: scripts, emails, blog, landing-copy, etc |
| `AI_STRONG_MODEL` | `anthropic/claude-opus-4-7` | For: security-review, compliance |
| `AI_CODING_MODEL` | `anthropic/claude-sonnet-4.6` | For: code job_type |
| `AI_VERIFIER_MODEL` | `anthropic/claude-opus-4-7` | Claude direct (prefix stripped at runtime) |
| `AI_MONTHLY_BUDGET_LIMIT` | `75` | USD cap. Hard-blocks new jobs when reached |
| `AI_DAILY_BUDGET_LIMIT` | `5` | USD cap |
| `AI_REQUIRE_HUMAN_APPROVAL` | `true` | Even if Claude approves, status goes to pending_review |
| `NEXT_PUBLIC_FORM_TOKEN` | random string (e.g., `openssl rand -hex 16`) | Public anti-bot token. Used by lead-form pages |
| `BLAND_WEBHOOK_SECRET` | random string | Set in Bland.ai dashboard webhook config as `Authorization: Bearer <value>` |

**12 new env vars to set.** All fail-open if not set, so deploy is safe even if you forget some — but enforcement only kicks in once they're populated.

---

## Remaining Risks

### High priority
1. **🟡 Vercel Hobby cron count cap (4 daily crons now).** First deploy with Phase 9's new `check-heygen-jobs` cron will tell us. If Vercel rejects, fold it into `score-and-branch` since both are lightweight. Mitigation: test on next deploy.

2. **🟡 Long generation timeouts (Hobby 10s function limit).** Blog generations >1500 words and 30+ post calendars may timeout. The router doesn't stream. Failed jobs land as `status=failed` in `ai_jobs` so the dashboard surfaces them. Mitigation options: switch to a faster model via `modelOverride`, cap inputs (already done in social-calendar), or upgrade to Pro plan (60s timeout).

3. **🟡 In-memory rate limiter resets on cold start.** Sophisticated attacker hitting cold instances could squeeze through. Current state acceptable for low-traffic admin panel. Upgrade path: Upstash KV or Supabase counter table.

### Medium priority
4. **🟡 NEXT_PUBLIC_FORM_TOKEN is public.** Visible in client JS, so motivated attackers can read it and bypass. Layered defense: token + rate limit + (future) Cloudflare Turnstile.

5. **🟡 Twilio signature URL reconstruction.** First inbound STOP message after deploy will validate this; signature mismatch returns 401, Twilio retries.

6. **🟡 24-hour gap on HeyGen completion if dashboard closed.** Safety-net cron only runs daily on Hobby. Most users will complete the manual polling before closing.

### Low priority
7. **🟢 Schema-mismatch risk on retroactive migrations.** All `CREATE TABLE IF NOT EXISTS`, so prod is safe. Schema drift on fresh DB rebuild is the only failure mode — caught only by spinning up a test environment.

8. **🟢 Prompt caching may not engage on verifier.** System prompt is ~700 tokens; Opus 4.7 needs ≥4096 to cache. ~$0.01 per verification is acceptable.

9. **🟢 No cross-content duplicate detection in verifier.** Within-piece duplication is checked; cross-DB checks would need extra context loaded into the prompt.

---

## Pre-Deploy Checklist (for Phase 11)

Items that MUST be done before/during deploy:
- [ ] Set 12 new env vars in Vercel (Production + Preview)
- [ ] Add the same 12 vars to local `.env.local` (for dev)
- [ ] Set `BLAND_WEBHOOK_SECRET` in Bland.ai dashboard webhook config too
- [ ] Trigger deploy via `npx vercel --prod` (or wait for GitHub auto-deploy if webhook is healthy)
- [ ] Verify deploy success on Vercel — check that 4 crons register without error
- [ ] Smoke test on prod (see Phase 11)

---

## Verification Path

To verify the AI Command Center actually works in prod after deploy:

1. Log in to dashboard
2. Navigate to `/dashboard/ai-command-center`
3. Click **Social Pack** tab → enter "Spring break in Cancun" → Generate
4. Watch the toast confirm — job should appear in the table within ~5s with status `pending_review`
5. Click the job → "Verify with Claude"
6. Verification panel should populate within ~5s
7. Click **Approve**
8. Push-to-calendar panel appears (blue) — fill one row with platform=instagram, week_of=this week, paste a caption from the output
9. Click "Push 1 row to calendar"
10. Navigate to `/dashboard/content` → see the new row

If any step fails, capture the toast text and the Vercel logs at `/api/ai/...` and diagnose.
