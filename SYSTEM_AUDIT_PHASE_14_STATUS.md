# VortexTrips — Full System Audit (Phase 14 Status)

**Audit date:** 2026-05-02
**Auditor:** Claude (read-only inspection — no code modified, nothing deployed)
**Branch:** `main`
**HEAD commit:** `b7fc8ad` — *Phase 14E: dashboard campaign planner UI and admin campaign asset routes*
**Working tree:** clean (`git status` confirmed)
**Production deploy:** still on the 2026-04-30 deploy (`dpl_qDc73T2dNmEmtQZPajwZpdAW6R6H`); Phase 14A → 14E are committed but **not deployed**.

---

## 1. Executive Summary

The codebase is in a strong, internally consistent state. Phases 0 → 12.8 are live in production and stable. Phases 14A → 14E (campaign engine + dashboard) are fully committed to `main` and pass `tsc` and `next build`, but **none of it is exercised yet**, because:

1. **Supabase migrations 017-021 have not been applied to the prod database** (Leo task carried over from Phase 14C/14D/14E).
2. **The 14A-14E code has not been deployed to Vercel** — production still serves the 2026-04-30 build.
3. **Phase 13 follow-ups remain open** — `.env.local` has malformed `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`; lint config still wedged on ESLint v8 vs v9.

The public funnel, SBA flow, lead-capture → SMS/email/Bland sequence, and the four production cron jobs are intact. Surge365 referral CTAs were correctly swept to the path-based `/leosp` form during 14A. Security posture is solid: admin routes are gated, webhooks have Bearer/HMAC checks, the service-role key is server-only, and CSP headers are set globally.

The system is **not ready to start Phase 14F**. Phase 14F is meant to wire approved `campaign_assets` into `content_calendar`, but the prerequisite tables don't exist in prod yet, and the Phase 14E approval surface has never been exercised end-to-end. Two manual gates need to clear before 14F is safe: apply migrations 017-021, and deploy the current `main` to prod (or at least to a preview that exercises the dashboard against the migrated DB).

---

## 2. Current Phase Status

| Phase | Code state | Prod state | Blocker |
|---|---|---|---|
| 0 → 12.8 | Shipped | Live | — |
| 13 (Stability) | Code-side complete | Lint config pending; `.env.local` value fixes pending | Leo follow-ups |
| 14A (Skill spec + URL sweep) | Committed `dd01930` | **Not deployed** | Pending deploy |
| 14B (Migrations 017-021) | Files in repo `8340a62` | **Not applied to Supabase prod** | Leo `supabase db push` |
| 14C (Event research) | Committed `f4bae3a` | Inert in prod (no tables yet) | 14B migrations |
| 14D (Generator API) | Committed `410e0a8` | Will 502 in prod (no tables yet) | 14B migrations |
| 14E (Dashboard planner) | Committed `b7fc8ad` | **Not deployed** | Deploy + 14B migrations |
| 14F (Auto-push to calendar) | Not started | n/a | 14B + 14E live |

Three independent gates control 14F readiness: migrations applied, code deployed, end-to-end approval-surface validated.

---

## 3. What Is Working (verified by code inspection)

### Public website
- All 9 audited pages exist and compile statically: `/` (page.tsx), `/sba`, `/join` (redirect), `/quote`, `/quiz`, `/reviews`, `/thank-you`, `/privacy`, `/terms`.
- `/join` redirects to `https://signup.surge365.com/leosp` via `next.config.js` (correct path-based `/leosp`).
- `/free` redirects to `https://myvortex365.com/leosp`.
- `/book` and `/go` redirect to `/traveler.html`.
- Sitemap at [src/app/sitemap.ts](src/app/sitemap.ts) covers all 10 static paths plus 8 destinations.
- robots.txt blocks `/dashboard/`, `/api/`, `/auth/`, `/login`. Sitemap link present.
- Layout sets up FB Pixel + GA conditionally; OG card defaults set; Twitter card metadata set.
- Exit-intent popup ([src/components/ExitIntent.tsx](src/components/ExitIntent.tsx)) fires after 8s arming, uses `localStorage` cooldown, posts to `/api/webhooks/lead-created` with the public form token.

### Funnel flow (verified end-to-end in code)
[src/app/page.tsx](src/app/page.tsx) → POST `/api/webhooks/lead-created` ([src/app/api/webhooks/lead-created/route.ts](src/app/api/webhooks/lead-created/route.ts)) →
- Inserts `contacts` + `opportunities` rows (handles `23505` duplicate as 409).
- Sends Day-0 SMS via Twilio if phone provided + consent.
- Sends Day-0 welcome email via Resend immediately.
- Queues 9 follow-up steps in `sequence_queue` (Day 2 → Day 14).
- If `enroll_sba=true`: sends Day-1 SBA email + queues Day-3 + Day-7 + SBA SMS pair.
- Triggers Bland.ai voice call ([src/lib/bland.ts](src/lib/bland.ts)) if phone provided; tags `bland-call-sent` or `call-failed`.
- All steps are wrapped in try/catch so a downstream failure doesn't take out the whole submission.

### Supabase schema
All required tables exist as migration files:
- `contacts` (001), `opportunities` (002), `ai_actions_log` (003), `content_calendar` (004), `admin_users` (005)
- `sequence_queue` (006), `site_settings` (007), `contact_events` (008), `partners` (009), `trips` (010), `reviews` (011)
- `lead_score` alter (012), `ai_jobs` (013), `ai_model_usage` (014), `ai_verification_logs` (015), `ai_command_templates` (016)
- **Phase 14B**: `event_campaigns` (017), `campaign_assets` (018), `campaign_scores` (019), `event_sources` (020), `campaign_schedule` (021)

All 14B tables follow existing conventions: UUID PKs via `gen_random_uuid()`, `update_updated_at` trigger, RLS gated on `admin_users`, indexes on hot lookups, GIN on `event_campaigns.categories`. CHECK constraint on `event_year BETWEEN 2024 AND 2099`. App-level dedup keys for `(event_name, event_year, destination_city)`.

### Automation (cron jobs)
[vercel.json](vercel.json) registers exactly 4 crons (Hobby cap):
- `weekly-content` Mon 13:00 UTC — generates 7 days × 4 platforms; calls Pexels for images; piggybacks Phase 14C `runEventCampaignResearch({limit:6})` inside isolated try/catch.
- `send-sequences` daily 10:00 UTC — pulls 250 pending `sequence_queue` rows; processes in parallel chunks of 10; embedded daily email-health snapshot.
- `score-and-branch` daily 09:00 UTC — surfaces hot leads, sends direct-close email/SMS.
- `check-heygen-jobs` daily 06:00 UTC — async polling for HeyGen video render completion.

All four require `Authorization: Bearer ${CRON_SECRET}`. Event-research failure inside `weekly-content` is logged but never fails the parent response.

### AI system
- [src/lib/ai-router.ts](src/lib/ai-router.ts) is the only AI entry point. Selects `cheap/medium/strong/coding/verifier` model by job type. Reads all env via `envTrim()` (Phase 11 whitespace defense).
- Daily + monthly budget guards via `checkBudget()` against `ai_jobs.cost_estimate`.
- Logs every call to `ai_jobs` + `ai_model_usage`; supports `createdBy: null` for cron jobs.
- [src/lib/ai-verifier.ts](src/lib/ai-verifier.ts) uses Anthropic SDK directly (not via OpenRouter). Falls through gracefully when `ANTHROPIC_API_KEY` is missing.
- Phase 14D generator ([src/lib/event-campaign-asset-generator.ts](src/lib/event-campaign-asset-generator.ts)) is server-only, archives only `status='draft'` rows on `force_regenerate`, never auto-publishes, tags banned-vocab hits in `verification_metadata`.

### Dashboard
- Sidebar nav at [src/components/dashboard/sidebar.tsx](src/components/dashboard/sidebar.tsx) lists 12 sections including the new `Campaigns` (🌍) entry between AI Center and Videos.
- `/dashboard/campaigns` renders client-side; calls `GET /api/admin/campaigns`, `GET /api/admin/campaigns/[id]`, `POST /api/admin/campaigns/generate-assets`, `POST /api/admin/campaigns/assets/[assetId]/{approve,reject}`.
- All admin API routes call `requireAdminUser()` which verifies a Supabase session AND an `admin_users` row by user id.
- Approve/reject use optimistic-concurrency (`.eq('status', priorStatus)`) to prevent racey double-updates. Reject reason stored under `verification_metadata.rejection_reason`.

### Social posting
- Facebook ([post-to-facebook/route.ts](src/app/api/automations/post-to-facebook/route.ts)) — Graph API v25.0, photo post with text-only fallback. Requires `post.status === 'approved'` before publishing.
- Instagram ([post-to-instagram/route.ts](src/app/api/automations/post-to-instagram/route.ts)) — `createMediaContainer` → poll up to 6×1s → publish; rejects when no `image_url`.
- Twitter/X ([post-to-twitter/route.ts](src/app/api/automations/post-to-twitter/route.ts)) — `twitter-api-v2` package, OAuth1, image upload + media_id, falls back to text-only on media failure. 280-char trim logic.
- TikTok — **not implemented**, intentional. Only appears as a platform string in `content_calendar` rows; no `/api/automations/post-to-tiktok` route exists. TikTok content remains manual.

### Images & video
- Pexels integration in `weekly-content` cron downloads → uploads to Supabase `media` bucket → returns public URL. Orientation chosen per platform.
- Image safety guard at [src/lib/image-safety.ts](src/lib/image-safety.ts) enforces 2000px / 5 MB / `image/jpeg|png|webp` MIME types.
- HeyGen async pipeline ([check-heygen-jobs cron](src/app/api/cron/check-heygen-jobs/route.ts)) avoids the 10-second timeout. SBA video uses Raul avatar + Leo voice clone, 30 sec, speed 1.05.
- HeyGen credit-burn risk is documented in `BUILD_PROGRESS.md`.

### SEO & tracking
- [sitemap.ts](src/app/sitemap.ts) lists 10 static + 8 destination URLs with priorities and change frequencies.
- [robots.txt](public/robots.txt) blocks dashboard/API/auth, allows everything else, links to sitemap.
- Reviews page has Schema.org Product + AggregateRating + Review JSON-LD (Phase 12.8 Batch A).
- Open Graph defaults set in `app/layout.tsx`; `/sba` has its own per-page metadata.
- Favicon ([src/app/icon.tsx](src/app/icon.tsx)) registered.

### Security boundaries
- `next.config.js` sets a global CSP allowing self + inline (needed for Pixel/GA + Tailwind), explicit allowlist for `connect-src` (Supabase, Bland, OpenAI, Resend, Twilio); `frame-src 'none'`.
- All `NEXT_PUBLIC_*` vars are public-by-design (Supabase URL/anon key, Pixel/GA IDs, public form token, app URL). The form token is correctly documented as deterrent only.
- `SUPABASE_SERVICE_ROLE_KEY` used only via [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts) in server-side admin client.
- Webhook auth ([src/lib/webhook-auth.ts](src/lib/webhook-auth.ts)): form-token, Bland Bearer (timing-safe compare), Twilio HMAC-SHA1.
- **Note:** all three webhook auth paths fail-open when their secret env var is unset. Acceptable during early deployment but should be tightened to fail-closed before opening traffic taps.

### Build health
- `npx tsc --noEmit` — **PASS** (exit 0).
- `npm run build` — **PASS** (exit 0). All routes registered including `ƒ /dashboard/campaigns` and the four `ƒ /api/admin/campaigns/...` routes.

---

## 4. What Is Broken / Incomplete

### Broken
- **`npm run lint`** — fails with `TypeError: Converting circular structure to JSON` from ESLint 8.57.1 trying to load the v9 flat config in `eslint.config.mjs`. Pre-existing Phase 13 issue. Resolves with `npm install` to bring in v9 per Phase 13 follow-ups. Not a regression.

### Incomplete (carried over)
- **Migrations 017-021 not applied to Supabase prod.** Until Leo runs `supabase db push` (or pastes each file into the SQL Editor in order), the new dashboard, generator API, and event-research pass will all error with "relation does not exist". The cron pass catches the error, so weekly content still ships; the dashboard will render an empty list with a toast.
- **Phase 14A-14E not deployed.** Production still serves the 2026-04-30 build. The Surge365 path-based `/leosp` URL fix in `next.config.js` is in code but not on prod. The dashboard `Campaigns` link will 404 in prod.
- **`.env.local` malformed values (Phase 13 follow-up).**
  - `ANTHROPIC_API_KEY` has a duplicated `sk-ant-` prefix (`sk-ant-sk-ant-api03-...`).
  - OpenRouter key is stored under non-canonical names (`Management_Key`, `Your_new_API_key`); code reads `OPENROUTER_API_KEY` only. One must be renamed.
- **Vercel env audit not performed.** No confirmation that production env values are free of leading whitespace post-Phase 11. Trim defense neutralizes it, but cleanliness is still pending.
- **No `npm run typecheck` script confusion** — `package.json` now has both `typecheck` (`tsc --noEmit`) and `lint` scripts since Phase 13. The `typecheck` script works. The `lint` script is the broken one.
- **Webhook auth fail-open** — three secret-checks (`checkFormToken`, `checkBlandWebhook`, `verifyTwilioSignature`) return `true` when the env var is absent. Today this is fine because all three secrets are set in prod; if someone removes a key from Vercel it silently disables auth.

### Intentional gaps (not bugs)
- TikTok posting — pending API approval; current state matches Phase 12 plan.
- Stripe checkout — paused; matches `.env.example` comment.
- HeyGen voice clone hardening (ElevenLabs upgrade) — listed as post-launch enhancement.
- `social-specs.ts` per-platform sizing — listed as Phase 14G work.

---

## 5. Priority Fix Lists

### High priority (block 14F)
1. **Apply Phase 14B migrations 017-021 to Supabase prod.** `supabase db push` from the project root, or paste each `.sql` file into the SQL Editor in numeric order. Confirm with `select count(*) from event_campaigns;` (should return 0, not relation-error). Without this, 14C/14D/14E silently fail and 14F can't be tested.
2. **Deploy current `main` (`b7fc8ad`) to Vercel preview, smoke-test the dashboard, then promote to prod.** Verify `/dashboard/campaigns` lists campaigns (will start empty until research cron writes the first batch), the `Generate Asset Bundle` button calls the Phase 14D route, and approve/reject toggles status correctly.
3. **Fix the two `.env.local` malformed values.** Remove the duplicated `sk-ant-` from `ANTHROPIC_API_KEY`; rename one of `Management_Key` / `Your_new_API_key` to `OPENROUTER_API_KEY` and delete the stray. Mirror in Vercel if needed.

### Medium priority
4. **Run `npm install` and `npm run lint`** to bring ESLint v9 into `node_modules` so the lint script exits cleanly. Triage any real lint findings.
5. **`vercel env ls production` audit.** Cross-check against the Phase 13 inventory in `PROJECT_STATE_CURRENT.md`. Re-paste any value with leading/trailing whitespace.
6. **Tighten webhook auth from fail-open to fail-closed.** Once Vercel production is confirmed to have `NEXT_PUBLIC_FORM_TOKEN`, `BLAND_WEBHOOK_SECRET`, `TWILIO_AUTH_TOKEN`, change the helpers to return `false` (or throw) when the env var is missing.
7. **Manually exercise `Verify with Claude` end-to-end** on a real `ai_jobs` row to confirm an `ai_verification_logs` insert. Last verified 2026-04-29.

### Low priority
8. Prune unused Vercel env vars (`NEXT_PUBLIC_FB_APP_ID`, `NEXT_PUBLIC_FB_LOGIN_CONFIG_ID`, `FACEBOOK_APP_SECRET`, `TIKTOK_*`, three unused Twitter vars, all `STRIPE_*`).
9. Add `UNIQUE(lower(event_name), event_year, lower(destination_city))` to `event_campaigns` to back up the app-level dedup. Currently a race-window of < 1ms exists.
10. Build `src/lib/social-specs.ts` (Phase 14G prerequisite) to centralize per-platform image/video sizing.
11. Restore the lost `typecheck` script alias note in CLAUDE memory; `package.json` already has it but the `KNOWN ISSUE` text in `PROJECT_STATE_CURRENT.md` line 92 is stale.
12. Refresh "Verify with Claude" smoke once 14E hits prod to confirm verifier still functional after dashboard route changes.

---

## 6. Automation Status

| Cron | Schedule (UTC) | Function timeout | State |
|---|---|---|---|
| `weekly-content` | Mon 13:00 | 10s (Hobby) | ✅ live; piggybacks event-research after migration applied |
| `send-sequences` | Daily 10:00 | 10s | ✅ live; parallel chunks of 10 |
| `score-and-branch` | Daily 09:00 | 10s | ✅ live; hot-lead branch |
| `check-heygen-jobs` | Daily 06:00 | 10s | ✅ live; async HeyGen polling |

Hobby plan caps at 4 cron jobs. We're at the limit. Phase 14C correctly merged event-research into `weekly-content` rather than adding a 5th cron. No headroom for new crons without a Pro plan upgrade.

Email queue: `sequence_queue` table backs the daily `send-sequences` cron. SMS opt-out (STOP/UNSUBSCRIBE/CANCEL/QUIT) is handled by `/api/webhooks/twilio-sms` — flips `sms-optout` tag and cancels pending SMS rows. HELP and START re-opt-in flows present.

Bland.ai voice calls fire on lead creation if a phone is provided. Webhook callback at `/api/webhooks/bland` updates `ai_actions_log` and stamps `bland-call-completed` on the contact + advances the opportunity stage.

---

## 7. Scores

> Each score is a snapshot of the system **as of `b7fc8ad` and the current prod state** — not a forward projection.

| Dimension | Score | Rationale |
|---|---|---|
| **Revenue readiness** | **78 / 100** | Public funnel captures leads end-to-end and pushes them through SMS + email + Bland call + 14-day nurture. SBA path goes to `signup.surge365.com/leosp` (path-based ✅ in code, but old prod still has the `?wa=leosp` query string until next deploy). Stripe is paused, so paid-membership flow is affiliate-only. The Phase 14 campaign engine — which would multiply content output — is built but inert. |
| **Technical health** | **80 / 100** | Typecheck and build both clean. Schema and code consistent. -10 for migrations not applied to prod. -5 for lint config wedged. -5 for the gap between committed code and prod deploy. |
| **Marketing/funnel readiness** | **80 / 100** | Lead → contact → opportunity → 9-step nurture → Bland call → SBA upsell all wired. Exit-intent popup live. JSON-LD on /reviews. Sitemap + robots.txt clean. -10 because Phase 14 personalized event campaigns are not yet earning attribution. -10 because TikTok is still manual. |
| **Security** | **85 / 100** | Admin gate, webhook auth, CSP, RLS, server-only secrets, timing-safe Bearer compare. -10 because three webhook helpers fail-open without their secret env var. -5 because the public form token is the only inbound deterrent on lead-created (acceptable, documented). |

---

## 8. Recommended Next Phase

**Not Phase 14F. Phase 14F-Prep first.**

Concretely:
1. Leo applies migrations 017-021 to Supabase prod.
2. Leo deploys `b7fc8ad` to Vercel production (preview → prod cutover).
3. Smoke test: open `/dashboard/campaigns`, wait for the next `weekly-content` Monday tick (or call `runEventCampaignResearch({limit:31})` once via a one-shot script to backfill all seeds), verify a campaign appears, click `Generate Asset Bundle`, verify ~33 draft assets appear, approve one and reject one.
4. Only then start **Phase 14F — Auto-Push Approved Campaigns into `content_calendar`** (per `EVENT_CAMPAIGN_ROADMAP.md` §14F): adds nullable FK `content_calendar.campaign_asset_id`, inserts approved assets into `content_calendar` with `scheduled_for` derived from the wave offset, and lets the existing `weekly-content` poster pick them up.

A Phase 14F session that starts before the three prep steps above will burn time chasing missing-table errors instead of writing useful code.

---

## 9. Phase 14F Safety Verdict

**❌ NOT SAFE to start Phase 14F right now.**

Three independent prerequisites must clear first:
1. ❌ Migrations 017-021 not applied to Supabase prod.
2. ❌ Phase 14E code not deployed to Vercel.
3. ❌ Phase 14E approval surface never exercised end-to-end against the migrated DB.

If all three were green, Phase 14F would be a simple, low-risk session (one schema migration, one route extension, one cron-side hook). Today it would be a debugging session against a missing schema.

---

## 10. Tests Run This Audit

| Test | Result |
|---|---|
| `git status` | clean |
| `git log -5` | confirms `b7fc8ad` HEAD = Phase 14E commit |
| `npx tsc --noEmit` | ✅ PASS (exit 0) |
| `npm run build` | ✅ PASS (exit 0); all routes registered including 5 new Phase 14E routes/pages |
| `npm run lint` | ❌ FAIL — pre-existing Phase 13 ESLint v8/v9 mismatch (`TypeError: Converting circular structure to JSON`). Not a regression. |

No code was modified. No deploys were triggered. No database writes were performed.

---

## 11. End

This audit is read-only. The next session should pick up by addressing items 1-3 of the High-priority list and then proceeding to Phase 14F.
