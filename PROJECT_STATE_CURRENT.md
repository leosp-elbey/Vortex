# VortexTrips — Current Project State

**Last updated:** 2026-05-02 (Phase 14C complete — research engine code in working tree, not deployed)
**Last known good commit:** `8340a62` — "Phase 14B: campaign calendar schema migrations 017-021"
**Production:** vortextrips.com (LIVE; last prod deploy 2026-04-30; Phase 13 + 14A + 14B + 14C changes are NOT deployed yet by design)
**Branch:** `main`
**Status:** 🚀 LIVE · Phases 0 → 12.8 shipped · Phase 13 code-side complete · Phase 14A shipped (commit `dd01930`) · Phase 14B shipped (commit `8340a62`) · Phase 14C research engine in working tree

---

## ⚠️ HARD RULE — READ FIRST

**No phase is considered complete until:**
1. `PROJECT_STATE_CURRENT.md` is updated
2. `BUILD_PROGRESS.md` is updated
3. All changes are committed
4. `git push origin main` confirms "Everything up-to-date"

If any of those four steps is missing, the phase is **NOT done** — regardless of how working the code looks.

See `SAVE_PROTOCOL.md` for the full workflow.

---

## Current completed phase

**Phases 0 through 12.8 — SHIPPED.** System is LIVE on vortextrips.com. No active blockers.

- Phases 0-10 in `ad42f44` (AI Command Center, security, HeyGen async)
- Phase 10.5 in `f2b41e6` (save protocol + image safety guard)
- Phase 11 deploy hotfix in `8e54262` (env var whitespace trim — prevented OpenRouter 401 errors caused by tabs/spaces in pasted env values)
- Phase 12.0 → 12.7 across multiple commits (bulk import xlsx, email-stats CLI, daily email-health report, Twitter/X auto-post, weekly-content auto-gen, HeyGen avatar/voice swap, SBA video tightened, Surge365 corp video, weekly-content image fix, robots.txt + sitemap.xml)
- Phase 12.8 in `67d83c0` (Batch A: stats softening + parallel send-sequences + favicon + JSON-LD + /sba metadata; Batch B: capture-first homepage CTA + exit-intent popup, commits `f646150` + `bb38c0a` rolled into 12.8 audit pass)
- Strict-mode session continuity layer in `e256a13` (CLAUDE_SESSION_SKILL.md + anchors + chat continuation file — no code changes)

This includes:
- Phase 0 — Audit & plan
- Phase 1 — All 11 database migrations (`supabase/migrations/006`–`016`)
- Phase 2 — Env vars (`.env.example` updated)
- Phase 3 — AI Router (`src/lib/ai-router.ts`, `src/lib/ai-models.ts`)
- Phase 4 — Claude verifier (`src/lib/ai-verifier.ts`)
- Phase 5 — 12 admin AI API routes under `src/app/api/ai/`
- Phase 6 — AI Command Center dashboard (`src/app/dashboard/ai-command-center/page.tsx` + 5 components in `src/components/ai/`)
- Phase 7 — Workflow generators (social-pack, video-script, email-sequence, blog, social-calendar)
- Phase 8 — Webhook security hardening (`src/lib/webhook-auth.ts`, `src/lib/rate-limit.ts`)
- Phase 9 — HeyGen async cron (`src/app/api/cron/check-heygen-jobs/route.ts`)
- Phase 10 — Build/typecheck/lint verification

---

## Files created/edited in the latest session (Phase 11)

**Created:**
- `src/app/api/admin/env-check/route.ts` — admin-only diagnostic showing env var presence, length, and prefix (no values exposed). Was instrumental in finding the whitespace bug.

**Edited:**
- `src/lib/ai-router.ts` — all `process.env.X` reads now go through `envTrim()` helper that strips leading/trailing whitespace
- `src/lib/ai-verifier.ts` — same trim treatment, plus explicit `apiKey` passed to Anthropic client
- `PROJECT_STATE_CURRENT.md` + `BUILD_PROGRESS.md` — Phase 11 complete

**Deployed:**
- Preview chain: `vortex-el75d800f` → `vortex-9soz0ntmi` → `vortex-ik4zkym1a` → `vortex-bczpnbclr` → `vortex-cfb100glz` (the one that worked)
- Production: `dpl_qDc73T2dNmEmtQZPajwZpdAW6R6H` → vortextrips.com

---

## What is working in production (validated end-to-end)

- ✅ AI Command Center page renders at vortextrips.com/dashboard/ai-command-center
- ✅ AI generation: tested via "Verifier test" job — llama-3.3-70b-instruct, cost $0.0001, output rendered correctly
- ✅ Claude verification: tested same job — Opus 4.7 returned approved/92, all 6 brand checks passed, caught real issues (malformed hashtag, missing brand mention) → confirms verifier is doing real quality review, not rubber-stamping
- ✅ Sidebar nav link at `src/components/dashboard/sidebar.tsx:14`
- ✅ All AI API routes admin-gated via `src/lib/admin-auth.ts`
- ✅ Webhook signature checks live on Bland, Twilio, HeyGen
- ✅ Rate limiting on AI generation endpoints
- ✅ HeyGen async pattern shipped (no more 10s timeouts)
- ✅ Env var whitespace defense (trim on every read)
- ✅ `ai_jobs`, `ai_verification_logs`, `ai_model_usage` tables all writing correctly

## Post-launch follow-ups (not blockers)

- **Code lint config:** `next lint` was removed in Next.js 16. The `lint` script in package.json is broken. Fix: install ESLint v9 + `eslint-config-next` flat config, or remove the lint script. Typecheck and build are the real gates and both pass.
- **Vercel "Needs Attention" flags** on Supabase env vars: cosmetic, not blocking. Refresh via the Supabase integration UI when convenient.
- **Whitespace cleanup in Vercel env vars:** the trim fix means tabs/spaces in env values are now harmless, but it's still good hygiene to delete and re-paste OPENROUTER_BASE_URL, AI_MEDIUM_MODEL, OPENROUTER_API_KEY without leading whitespace. Do this on a slow day.
- **Verify Claude verification flow** end-to-end (click "Verify with Claude" on a real job and confirm `ai_verification_logs` row appears).
- **HeyGen lifelike upgrades** (post-launch quality): ElevenLabs voice clone, Studio Avatar, b-roll cutaways. See chat history.
- **Per-platform image/video sizing** (`src/lib/social-specs.ts`). 2-3 hours, post-launch enhancement.

## Known issues

- Previous Claude chat froze due to images >2000px being pasted/dragged in. The image safety guard added this session is the fix; from now on, screenshots must be ≤2000px on the longest side. See `IMAGE_UPLOAD_RULES.md`.
- `package.json` has no `typecheck` script — use `npx tsc --noEmit` instead.
- Vercel Hobby plan: 10s function timeout, daily cron only, max 4 cron jobs total. We are at the limit (score-and-branch, send-sequences, weekly-content, check-heygen-jobs).

## Exact next step

**Phase 13 — Stability Layer.** Code-side changes from this session are in working tree, awaiting commit. Production is unchanged. Before closing the phase, Leo must complete the manual follow-ups below.

### Phase 13 — what shipped this session (in working tree, not yet committed)

**Edited:**
- `.env.example` — Twitter section comment corrected (posting routes are shipped, not pending).
- `.env.local` — whitespace around `=` removed on `NEXT_PUBLIC_FORM_TOKEN` + `BLAND_WEBHOOK_SECRET`; admin-password comment line removed. **Gitignored — not committed.**
- `package.json` — `lint` script changed from `next lint` (removed in Next 16) to `eslint .`; `typecheck` script added; `eslint` bumped from `^8` to `^9.17.0`; added `@eslint/eslintrc ^3.2.0` for FlatCompat.
- `PROJECT_STATE_CURRENT.md` + `BUILD_PROGRESS.md` — this Phase 13 entry.

**Created:**
- `eslint.config.mjs` — flat config using FlatCompat to load `next/core-web-vitals` + `next/typescript` presets, with sensible ignores (`.next/**`, `mobile/**`, `scripts/**`, `supabase/**`, etc.).

### Phase 13 — Leo follow-ups required before closing the phase

1. **Lint validation.** Run:
   ```
   npm install
   npm run lint
   ```
   First run will install eslint v9 + @eslint/eslintrc and update `package-lock.json`. Commit the lockfile separately. If lint surfaces real issues, fix or `// eslint-disable-next-line` per case — do not regress the config.

2. **Fix `.env.local` malformed values** (both must be fixed in Vercel as well, in case the same paste error is mirrored there):
   - **Line 53** — `ANTHROPIC_API_KEY` has duplicated prefix `sk-ant-sk-ant-api03-…`. Remove the leading 7 chars `sk-ant-`. Confirm against Anthropic console.
   - **Lines 56-57** — OpenRouter keys are stored under wrong variable names (`Management_Key`, `Your_new_API_key`). Code reads `OPENROUTER_API_KEY` only. Pick whichever key is current and rename the line to `OPENROUTER_API_KEY=…`. Delete the other.

3. **Vercel env audit.** Run:
   ```
   npx vercel env ls production
   ```
   Cross-check against the Required Env Vars list below. For any value that triggered the env-trim defense in Phase 11, delete and re-paste it cleanly (no leading/trailing whitespace). Pay attention to: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, all `AI_*_MODEL` vars, `ANTHROPIC_API_KEY`.

4. **(Optional) Prune unused Vercel env vars** to reduce surface area. The following are declared but not referenced anywhere in `src/`:
   - `NEXT_PUBLIC_FB_APP_ID`, `NEXT_PUBLIC_FB_LOGIN_CONFIG_ID` (FB Login flow not implemented)
   - `FACEBOOK_APP_SECRET` (only Page Access Token is used)
   - `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (no TikTok posting routes)
   - `TWITTER_BEARER_TOKEN`, `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` (only the 4 OAuth1 vars are consumed by `post-to-twitter`)
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_ID` (membership flow paused)

### Required Env Vars — actually consumed by `src/` code (Phase 13 audit)

**Server-side (must exist in Vercel for prod, never `NEXT_PUBLIC_*`):**
- Supabase: `SUPABASE_SERVICE_ROLE_KEY`
- App ops: `CRON_SECRET`, `ADMIN_NOTIFICATION_EMAIL`
- Webhook auth: `BLAND_WEBHOOK_SECRET`
- AI router: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` (optional, defaults to OpenRouter), `AI_DEFAULT_MODEL`, `AI_CHEAP_MODEL`, `AI_MEDIUM_MODEL`, `AI_STRONG_MODEL`, `AI_CODING_MODEL`, `AI_VERIFIER_MODEL`, `AI_MONTHLY_BUDGET_LIMIT`, `AI_DAILY_BUDGET_LIMIT`, `AI_REQUIRE_HUMAN_APPROVAL`
- AI verifier: `ANTHROPIC_API_KEY`
- OpenAI image/text: `OPENAI_API_KEY`
- Email/SMS: `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- Voice: `BLAND_API_KEY`
- Social posting: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`
- Content: `PEXELS_API_KEY`, `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `HEYGEN_VOICE_ID`

**Client-side (`NEXT_PUBLIC_*` — public by design):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon-key safe — protected by RLS)
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_FORM_TOKEN` (anti-bot deterrent only, documented as such)
- `NEXT_PUBLIC_FB_PIXEL_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` (analytics IDs are inherently public)

**Vercel-injected (no setup needed):** `VERCEL_URL`, `VERCEL_ENV`, `NODE_ENV`

---

## STRICT MODE — Session Continuity Anchor (reconciled 2026-05-02)

This block is appended (not overwriting prior content). Treat the markdown system as the only durable source of truth. Chat history is unreliable due to session resets and image-size limits.

> **Reconciliation note (2026-05-02):** the original anchor (dated 2026-05-01) listed Phase 10.5 as the last completed phase and Phase 11 as pending. That snapshot was already stale at the time of writing — Phases 11 and 12.0 → 12.8 had in fact shipped to production. The anchor has been corrected below to match the git log and the body of this file. Historical phase entries in `BUILD_PROGRESS.md` are preserved unchanged.

### Current system summary (locked in)
- Project: VortexTrips AI Command Center
- Architecture: Next.js App Router (TypeScript)
- Database: Supabase (connected + migrated; tables include `trips`, `itineraries`, `chat_sessions`, `saved_items`; AI tables `ai_jobs`, `ai_verification_logs`, `ai_model_usage`, `ai_command_templates` migrated)
- Deployment target: Vercel — LIVE on vortextrips.com
- API routes functional, OpenRouter integration wired, image generation with safety guard live
- Save protocol + Claude Session Skill in force; markdown tracking system is the source of truth

### Last completed phase
**Phase 12.8** — Batch A + B audit fixes shipped to prod (commit `67d83c0`, 2026-04-30). Phases 0 → 12.8 are all complete and deployed.

### Current blocker
**None.** System is live and stable. The session-continuity hardening from the prior anchor (image-size limits, session resets) is solved by `CLAUDE_SESSION_SKILL.md` + the markdown tracking system; this is no longer treated as an active blocker.

### Rules locked in
- Markdown files are the **only** source of truth.
- No phase proceeds without saving state.
- A phase is NOT complete until: `PROJECT_STATE_CURRENT.md` updated, `BUILD_PROGRESS.md` updated, changes committed, changes pushed, `git status` shows clean.

### Next phase
**Phase 13** — scope TBD. Do not start until explicitly authorized by Leo in this or a new session, after reading this file and `BUILD_PROGRESS.md`.

---

## Phase 14A — Destination/Event Campaign Skill (DONE 2026-05-02)

Markdown-only phase. No database, no automation, no deploy. The skill file is the spec; future phases (14B-14H) implement it.

**Created:**
- `VORTEX_EVENT_CAMPAIGN_SKILL.md` — full spec: purpose, six-part formula, 32 categories, 8 timing waves, output requirements, cruise add-on logic, hard compliance rules, automation rules, 10-dimension scoring rubric, 15 seed campaigns, canonical URLs.
- `EVENT_CAMPAIGN_ROADMAP.md` — Phases 14A-14H with exit criteria and the cross-cutting rules (Hobby cron limit, budget guards, human approval).

**Edited (Surge365 signup CTA sweep — path-based `/leosp` is canonical):**
- `next.config.js` — `/join` redirect destination corrected to `https://signup.surge365.com/leosp`.
- `src/app/sba/page.tsx` — footer "Get Started Today" CTA now uses `/leosp` path.
- `src/lib/email-templates.ts` — `SURGE365.signup` now `/leosp` path; comment clarifies that videos still use the older `wa=leosp` query.
- `src/app/join/page.tsx` — "Join the SBA Program" CTA uses `/leosp` path.
- `src/lib/twilio.ts` — `leadDay12` and `sbaDay7` SMS templates use `signup.surge365.com/leosp`.

**Intentionally unchanged (per Phase 14A scope):**
- Surge365 corporate video URLs (Opportunity, Powerline) — these are video pages, not signup CTAs, and use `wa=leosp` by design.
- All `myvortex365.com/leosp` references — different domain (free portal), already correct.
- Historical signup URL strings inside `BUILD_PROGRESS.md` and `PROJECT-STATUS.md` — preserved as historical record per session rules.

### Phase 14A — exit criteria

- [x] `VORTEX_EVENT_CAMPAIGN_SKILL.md` created
- [x] `EVENT_CAMPAIGN_ROADMAP.md` created
- [x] Surge365 referral-link sweep complete (6 active code-side CTAs corrected; 4 video links and all `myvortex365.com/leosp` links left intact)
- [x] No unrelated app code modified
- [x] `PROJECT_STATE_CURRENT.md` + `BUILD_PROGRESS.md` updated
- [ ] Working tree committed and pushed (Leo to run the git commands at the end of this session)

### Next recommended phase

**Phase 14B — Campaign Calendar Schema** (Supabase migrations for `event_campaigns`, `campaign_assets`, `campaign_scores`, `event_sources`, `campaign_schedule`). Do not start until explicitly authorized in a new session.

---

## Phase 14B — Campaign Calendar Schema (DONE 2026-05-02)

Migration files only. Nothing applied to Supabase yet — Leo runs `supabase db push` (or pastes the SQL into the Supabase SQL Editor) when ready. No app code, no UI, no automation.

**Created (5 migration files under `supabase/migrations/`):**
- `017_create_event_campaigns.sql` — root campaign table. Worldwide events, cruise add-on fields, scoring, lifecycle status (`idea/draft/approved/scheduled/active/archived`), human-approval gate, AI generation + Claude verification metadata, parent-campaign FK for yearly repeatability, tracking URL template.
- `018_create_campaign_assets.sql` — every generated asset (social_post, short_form_script, email_subject, email_body, dm_reply, hashtag_set, image_prompt, video_prompt, landing_headline, lead_magnet). Wave (W1-W8), platform, image source (pexels/openai/heygen/manual/unsplash/other), video source, scheduled_for, posted_at, lifecycle, approval, AI metadata, FK to existing `content_calendar`.
- `019_create_campaign_scores.sql` — score history per (campaign × week). Top-line 1-100 score plus 10-dimension breakdown JSONB matching the rubric in `VORTEX_EVENT_CAMPAIGN_SKILL.md` §9.
- `020_create_event_sources.sql` — registry of event-data sources (manual_seed/ics_feed/api/scrape/partner_feed/rss/other). Pull-frequency, last-pull status, non-sensitive integration metadata only (no secrets).
- `021_create_campaign_schedule.sql` — joins `campaign_assets` to a calendar slot. Platform, scheduled_for, status (pending/queued/posted/skipped/failed/cancelled), retry_count, FK to existing `content_calendar`.

**Conventions followed (matches existing migrations 001-016):**
- UUID primary keys via `gen_random_uuid()`
- `IF NOT EXISTS` and `DROP IF EXISTS` for idempotency
- `update_updated_at()` trigger on every mutable table (defined in `001_create_contacts.sql`)
- RLS enabled with the standard `Admins full access <table>` policy gated on `admin_users`
- All FKs have explicit `ON DELETE` semantics (CASCADE for parent-child, SET NULL for soft references)
- Indexes on hot lookup columns (status, scheduled_for, score, FK columns) and a GIN index on `event_campaigns.categories`

**Risks logged for Phase 14B → 14C handoff:**
- Migrations are file-only; nothing applied to Supabase yet. Phase 14C cannot run before Leo applies the SQL.
- `campaign_assets.content_calendar_id` and `campaign_schedule.content_calendar_id` reference `content_calendar(id)`. If Phase 14F ever changes that table's PK type, both FKs break — keep `content_calendar.id` as UUID.
- `categories` is `TEXT[]` with no DB-level CHECK against the 32-category list. Validation happens in app code (Phase 14D). The skill spec is the source of truth.
- `event_year` is hard-bounded to 2024-2099. Out-of-range data must be normalized before insert.
- `event_sources.credentials_metadata` is for non-sensitive integration shape only. Secrets stay in Vercel env vars; never write API keys here.

### Next recommended phase

**Phase 14C — Event Research Cron** (weekly job that pulls upcoming events from `event_sources` rows, scores them, writes `event_campaigns` candidates). Do not start until Phase 14B migrations are applied to Supabase prod and explicitly authorized in a new session.

---

## Phase 14C — Event Research Cron (DONE 2026-05-02)

Code only. Nothing deployed. The research engine reads a hand-curated seed file, computes the next-future occurrence of each event, scores it against the 10-dimension rubric in `VORTEX_EVENT_CAMPAIGN_SKILL.md` §9, and upserts rows into `event_campaigns` + `campaign_scores`. No new cron route — wired into the existing `weekly-content` cron as a safe post-step. Status defaults to `idea`; human approval still required before publishing.

**Created:**
- `src/lib/event-seeds.json` — 31 hand-curated worldwide event seeds. Covers all 17 categories named in the Phase 14C spec: Carnival, Cruise, Art & Culture, Sports, Music Festival, Business Conference, Family Reunion, Wedding Guest, Faith-Based Group, Youth Sports, Creator/Influencer, Diaspora/Back Home, Wellness Retreat, Luxury-on-a-Budget, No-Passport/Easy, Last-Minute Getaways, Seasonal/Shoulder-Season. Each seed carries event timing (month/day + duration + lead window), categories, audience, factual angles (hotel/cruise/flight/group), CTA copy, and `scoring_inputs` for the scoring module.
- `src/lib/event-campaign-scoring.ts` — pure deterministic 1-100 scorer implementing the 10-dimension rubric with the weights in `VORTEX_EVENT_CAMPAIGN_SKILL.md` §9 (travel demand 15, hotel pressure 12, group travel 10, buying intent 12, social potential 10, commission potential 12, urgency 8, competition level 6 inverse, addon opportunity 8, repeatability 7 = 100). Returns the total score plus per-dimension breakdown for `campaign_scores.breakdown` JSONB.
- `src/lib/event-campaign-generator.ts` — server-only module. Reads `event-seeds.json`, computes the next-future occurrence (one-off events with `static_year` always use that year; recurring events roll to next year if today's date is past this year's event date), scores each candidate, and upserts. Duplicate prevention is a case-insensitive `.ilike()` lookup on `(event_name, event_year, destination_city)` — found rows are updated; missing rows are inserted. Each run also writes a `campaign_scores` row with `week_of` set to that week's Monday so score history accumulates over time. Round-robin batching: `weekIndex × limit mod seedCount` so successive weekly runs eventually cover all 31 seeds.

**Edited:**
- `src/app/api/cron/weekly-content/route.ts` — added a Phase 14C post-step. After the existing weekly content insert succeeds, the cron calls `runEventCampaignResearch({ limit: 6 })` inside its own try/catch. Failures here are logged to `ai_actions_log` and to console but never fail the weekly-content response. The research result (processed/inserted/updated/error count) is included in both `ai_actions_log.response_payload` and the JSON response for observability.

**Tables written to (after migrations 017-021 are applied):**
- `event_campaigns` — one row per (event × year). Status defaults to `idea`, `requires_human_approval = TRUE`, `tracking_url_template` set to the canonical UTM format from `VORTEX_EVENT_CAMPAIGN_SKILL.md` §5.
- `campaign_scores` — one fresh row per processed seed per cron tick, keyed by `campaign_id` + `week_of`. Carries the 10-dimension breakdown JSONB and provenance metadata.

**Intentionally NOT done in Phase 14C:**
- No new Vercel cron route (Hobby plan caps at 4 — we are at the limit).
- No content generation (no AI text/image/video runs). Phase 14D handles the per-campaign asset generation against the `event_campaigns` rows produced here.
- No human-facing UI (Phase 14E).
- No auto-push to `content_calendar` (Phase 14F).
- No deployment from this session.

**Risks:**
- Migrations 017-021 must be applied to Supabase prod before the next weekly-content cron tick — otherwise the research call will throw and be caught (the cron itself stays green, but no campaigns will land). Per `BUILD_PROGRESS.md`, Leo is the one to apply the migrations.
- Round-robin batching means the first cron run scores 6 seeds; full coverage of all 31 seeds takes ~6 runs (~6 weeks). For a one-shot full backfill, call `runEventCampaignResearch({ limit: 31 })` once via a manual admin route — not scoped into Phase 14C.
- The duplicate check is app-level only. If two cron invocations race on the same week (unusual for daily cron + 10s timeout, but possible), the worst case is two `event_campaigns` rows for the same (event, year, city). The schema has no DB-level UNIQUE constraint here yet; if this becomes a real problem, add `UNIQUE(lower(event_name), event_year, lower(destination_city))` in a follow-up migration.
- `event-seeds.json` is checked into the repo. Editing the seed file in production requires a code deploy — by design, since seeds are spec, not data.

### Phase 14C — exit criteria

- [x] `src/lib/event-seeds.json` created with 31 seeds covering all 17 required categories
- [x] `src/lib/event-campaign-scoring.ts` created and implements the 10-dimension rubric
- [x] `src/lib/event-campaign-generator.ts` created — reads seeds, computes timing, scores, upserts, deduplicates
- [x] `src/app/api/cron/weekly-content/route.ts` calls the generator with a hard limit and isolated error handling
- [x] No new cron route added (Vercel Hobby cap respected)
- [x] No content auto-published; status defaults to `idea`, `requires_human_approval = TRUE`
- [x] `npx tsc --noEmit` passes
- [x] `PROJECT_STATE_CURRENT.md` + `BUILD_PROGRESS.md` updated
- [ ] Working tree committed and pushed (Leo to run the git commands at the end of this session)
- [ ] **Leo to do:** apply Phase 14B migrations 017-021 to Supabase prod (via `supabase db push` or pasting each file into the SQL Editor in order) before the next Monday 1pm UTC weekly-content tick — otherwise the research pass will catch-and-log a "relation does not exist" error each week.

### Next recommended phase

**Phase 14D — Campaign Generator API** (admin-only route that takes an `event_campaign_id` and produces the full asset bundle from `VORTEX_EVENT_CAMPAIGN_SKILL.md` §5/§6, OpenRouter cheap tier + Claude verifier, inserts into `campaign_assets` as drafts). Do not start until Phase 14C is committed/pushed and migrations are applied.
