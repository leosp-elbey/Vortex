# VortexTrips Build Progress

**Last updated:** 2026-05-02 (Phase 14E.1 media-clarity patch stacked on the timeout patch in working tree; tests pass; not deployed yet)
**Last code-shipping commit:** `b7fc8ad` (Phase 14E dashboard campaign planner)
**Status:** 🚀 LIVE on vortextrips.com · Phases 0 → 12.8 shipped · Phase 13 code-side complete · Phases 14A-14E shipped through `b7fc8ad` and deployed; **Phase 14E Timeout Patch in working tree, awaiting commit + deploy**.

Legend: `[x]` shipped · `[~]` in progress · `[ ]` pending · `[!]` blocked

---

## Phases

- [x] **Phase 0 — Audit & plan** (`VORTEX_AI_COMMAND_CENTER_PLAN.md`)
- [x] **Phase 1 — Database migrations** (`supabase/migrations/006`–`016`)
- [x] **Phase 2 — Env vars** (`.env.example` updated; Vercel vars set)
- [x] **Phase 3 — AI Router** (`src/lib/ai-router.ts`, `src/lib/ai-models.ts`)
- [x] **Phase 4 — Claude verifier** (`src/lib/ai-verifier.ts`)
- [x] **Phase 5 — API routes** (12 routes under `src/app/api/ai/`)
- [x] **Phase 6 — Dashboard page** (`/dashboard/ai-command-center` + 5 components, sidebar link)
- [x] **Phase 7 — Workflows** (social-pack, video-script, email-sequence, blog, social-calendar)
- [x] **Phase 8 — Security hardening** (`src/lib/webhook-auth.ts`, `src/lib/rate-limit.ts`)
- [x] **Phase 9 — HeyGen async** (`src/app/api/cron/check-heygen-jobs/route.ts`)
- [x] **Phase 10 — Local testing** (lint, typecheck, build pass before commit `ad42f44`)
- [x] **Phase 10.5 — Save protocol + image safety guard** (commit `f2b41e6`)
- [x] **Phase 11 — Deploy prep & production deploy** (commits `c361e8d`, `8e54262`; prod `dpl_qDc73T2dNmEmtQZPajwZpdAW6R6H`)

---

## Current focus

**Phase 14E.1 Campaign Dashboard Media Clarity Patch (in working tree, 2026-05-02 — typecheck + build pass; stacked on the Phase 14E timeout patch; awaiting commit + deploy).**

After the timeout patch let Art Basel generate 33 draft assets, operator feedback surfaced one residual UX gap: `image_prompt` / `video_prompt` rows render only as text and look incomplete because no actual image/video file is attached yet. This patch makes the prompt-vs-finished-media distinction explicit in the UI without touching the API, schema, or any media generation pipeline.

**Patch applied (single file: `src/app/dashboard/campaigns/page.tsx`):**
- [x] `AssetRow` accepts optional `image_url?: string | null` / `video_url?: string | null` (forward-compat; API doesn't return them today).
- [x] `short_form_script` group renamed "Short-Form Video Scripts" to match §6 wording.
- [x] New `ASSET_TYPE_HELPER_TEXT` map. Helper text shown under the group title (italic, muted) for `image_prompt` and `video_prompt` only.
- [x] `AssetGroup` extended with `assetType` + `helperText?`. Renders helper text below the title when present.
- [x] `AssetCard` extended with `assetType`. New media block:
  - `image_url` set → `<img>` preview, max-h-32, rounded.
  - No `image_url` AND row is `image_prompt` → italic muted placeholder "🖼️ No image generated yet."
  - `video_url` set → "▶ View generated video" link.
  - No `video_url` AND row is `video_prompt` → italic muted placeholder "🎬 No video generated yet."
- [x] Placeholder is NOT shown on non-prompt asset types — avoids visual noise on social posts, emails, DMs, etc.
- [x] All 10 asset groups remain visible when they have rows: Social Posts · Short-Form Video Scripts · Email Subjects · Email Bodies · DM Replies · Hashtag Sets · Image Prompts · Video Prompts · Landing Headlines · Lead Magnets.

**Forbidden actions confirmed not taken:** no Pexels, no OpenAI image gen, no HeyGen, no `content_calendar` insert, no schema change, no auto-publish.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — compiles cleanly; route table unchanged
- [ ] `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated

**Leo to do:**
- [ ] Commit + push Phase 14E timeout patch + 14E.1 media-clarity patch (combined) per the session response.
- [ ] Re-deploy to Vercel prod.
- [ ] Reload `/dashboard/campaigns` → Art Basel → confirm Image Prompts and Video Prompts groups show helper text and per-row "No image/video generated yet" placeholders.

---

## Phase 14E Timeout Patch (in working tree, 2026-05-02 — typecheck + build pass; awaiting commit + deploy).**

The dashboard campaign planner returned a 504 on `POST /api/admin/campaigns/generate-assets` for Art Basel because Vercel Hobby's hard 10s function timeout cannot accommodate a single Sonnet 4.6 + Claude verifier call generating the full ~33-asset bundle. The route's `maxDuration = 60` declaration is silently ignored on Hobby. See `SYSTEM_AUDIT_PHASE_14_STATUS.md` for the full diagnosis.

**Patch applied:**
- [x] `src/lib/event-campaign-asset-generator.ts` — `inspectExistingAssets` is now asset-type-aware (`liveTypes` set + `draftIdsByType` map). New `archiveDraftsForTypes` archives only `status='draft'` rows for the requested asset types. `generateCampaignAssets` filters `requestedTypes − liveTypes` for non-force calls (returns `already_exists=true` only when all requested types are already covered) and archives drafts of the requested types only on `force_regenerate=true`. Added `skip_verifier?: boolean` option that bypasses the Claude verifier pass. `buildSystemPrompt(typesToGenerate)` and `buildUserPrompt(campaign, typesToGenerate)` emit a targeted JSON schema so the model only generates what's asked. `buildInsertRows` filters on the post-dedup `generatedTypes` set, preventing duplicate inserts even if the model echoes back already-live types.
- [x] `src/app/api/admin/campaigns/generate-assets/route.ts` — Zod schema accepts optional `skip_verifier: boolean`; passed through.
- [x] `src/app/dashboard/campaigns/page.tsx` — `handleGenerate` rewritten as sequential 4-batch loop. Batches:
  - Batch 1: `['social_post']`
  - Batch 2: `['short_form_script','email_subject','email_body']`
  - Batch 3: `['dm_reply','hashtag_set']`
  - Batch 4: `['image_prompt','video_prompt','landing_headline','lead_magnet']`
  Every batch sends `model_override: 'meta-llama/llama-3.3-70b-instruct'` and `skip_verifier: true`. New `generationProgress` state drives a "Generating batch N of 4 — <label>…" button label. Loop stops on first batch failure with named-batch error toast. Detail and list refresh after success.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — compiles cleanly; all routes register; no new warnings
- [ ] `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated

**Behavioral guarantees preserved:**
- All inserted assets stay `status='draft'`, `requires_human_approval=true`.
- No `content_calendar` writes. No auto-publish. No schema changes.
- Posted, scheduled, approved, idea, rejected assets never modified by this code path.
- Drafts of asset types outside the current batch are untouched.
- Force regenerate confirm dialog wording unchanged.

**Leo to do:**
- [ ] Commit + push the patch (commands in the session response).
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Run the cleanup SQL from `SYSTEM_AUDIT_PHASE_14_STATUS.md` to flip orphaned `running` `ai_jobs` rows from the failed Art Basel attempt to `failed`.
- [ ] Retry Generate Asset Bundle on Art Basel; expect 4 sequential ~5-8s calls, ~33 draft assets total, no 504.

---

## Phase 14F-Prep (3 manual gates) before Phase 14F can start.**

The 2026-05-02 read-only system audit confirmed Phases 14A-14E are committed cleanly to `main` (typecheck + build pass; lint pre-broken from Phase 13). Phase 14F is **not safe to start yet** because three prerequisites are still open:

1. **Apply migrations 017-021 to Supabase prod.** Without this, `event_campaigns` / `campaign_assets` / `campaign_scores` / `event_sources` / `campaign_schedule` don't exist; 14C/14D/14E error against the missing schema.
2. **Deploy `b7fc8ad` to Vercel production.** Production is still on the 2026-04-30 build; the new `Campaigns` dashboard nav and Phase 14A Surge365 path-based `/leosp` redirect are in code but not in prod.
3. **Smoke-test the dashboard end-to-end** against the migrated DB: list shows campaigns, `Generate Asset Bundle` calls `/api/admin/campaigns/generate-assets`, approve/reject flips status correctly.

Once all three are green, Phase 14F is a low-risk session: one schema migration adding nullable `content_calendar.campaign_asset_id`, one approve-handler extension to insert into `content_calendar` with `scheduled_for` from the wave offset, and the existing posters do the rest.

See [SYSTEM_AUDIT_PHASE_14_STATUS.md](SYSTEM_AUDIT_PHASE_14_STATUS.md) for the full audit report (executive summary, scores, priority fix lists, automation status, security posture).

**Phase 13** remains `[~]` — code-side complete, awaiting Leo's three manual follow-ups (lint validation, `.env.local` value fixes, Vercel env audit). Independent of Phase 14A/14B/14C/14D/14E. **Phase 14E note:** `npm run lint` failed with the same `TypeError: Converting circular structure to JSON` from ESLint 8.57.1 trying to load the v9 flat config — pre-existing, not a Phase 14E regression. Resolves once Leo runs the Phase 13 follow-up `npm install` to bring in v9.

Phase 11 sub-tasks (all complete):
- [x] Local typecheck + build verification (lint script broken — separate cleanup)
- [x] Verified all 11 new env vars present in Vercel dashboard
- [x] Deployed preview, smoke-tested AI generation end-to-end
- [x] Diagnosed and fixed env var whitespace bug (commit `c361e8d` diagnostic + `8e54262` fix)
- [x] Promoted to prod via `npx vercel --prod`
- [x] Save protocol run

## Phase 12 candidates (in suggested priority)

- [x] Smoke-test "Verify with Claude" button on a real job — passed 4/29/2026 (Opus 4.7, score 92/100, real recommendations)
- [x] **Bulk import: accept .xlsx/.xls files** — shipped 4/29/2026 (commit `467c0b5`). Drop zone now accepts CSV + Excel; clear error on 0 rows.
- [x] **Local email-stats CLI script** — shipped 4/29/2026 (`scripts/check-email-stats.js`, commit `e8da511` after CRLF fix). Run `node scripts/check-email-stats.js` for instant Resend verdict.
- [x] **Auto email-health daily report** — shipped 4/29/2026 (commit `c91a7b9`). Embedded in `send-sequences` cron at 10am UTC: pulls 24h Resend stats, emails `ADMIN_NOTIFICATION_EMAIL` when verdict is YELLOW/RED. No 5th cron needed (still at Hobby's 4-cron limit).
- [x] **Twitter/X auto-post** — shipped 4/29/2026 (commit `de51509`). Real Twitter API v2 integration via `twitter-api-v2` package. Text + image upload (download from image_url, upload to Twitter, post with media_ids). Replaces the manual compose-intent link. Uses `TWITTER_API_KEY/SECRET/ACCESS_TOKEN/ACCESS_SECRET` env vars (already in Vercel).
- [x] **Auto weekly-content generation** — shipped 4/29/2026 (commit `31e5c7d`).
- [x] **HeyGen avatar swap to Raul_expressive_2024112501** — shipped 4/30/2026.
- [x] **HeyGen voice clone (Leo's voice, ID `2263a0768f7a4eb7b13ae680b3b57fc4`)** — shipped 4/30/2026.
- [x] **SBA video script tightened to 30 sec, speed 1.05, emotion Excited** — shipped 4/30/2026 (commit `c8a5851`). Cuts credit cost ~50% per render.
- [x] **Surge365 corporate video integration** — shipped 4/30/2026 (commit `4b48474`).
- [x] **Bug fix: images on auto-generated weekly content** — shipped 4/30/2026 (commit `869e1b6`). Ported Pexels image fetching from old admin route into new `weekly-content` cron. Verified on prod: 28/28 posts now have images.
- [x] **SEO: robots.txt + dynamic sitemap.xml** — shipped 4/30/2026 (commit `869e1b6`). All public pages now indexable.
- [x] **Batch A: stats softening + parallel queue + favicon + JSON-LD + /sba metadata** — shipped 4/30/2026 (commit `f646150`). Soft brand claims, send-sequences now 250/day in parallel chunks of 10 (~3-5sec wall time vs 10sec before), favicon, /sba dedicated OG/Twitter cards, /reviews schema.org Product+AggregateRating+Review JSON-LD.
- [x] **Batch B: capture-first homepage + exit-intent popup** — shipped 4/30/2026 (commit `bb38c0a`). Homepage primary CTA now captures lead first then redirects to myvortex365.com/leosp. New ExitIntent component on / and /sba captures bouncing visitors with localStorage dismiss state (24h cooldown). Embedded on /sba page (Opportunity + Powerline videos) + integrated into mlmDay0 + mlmDay4 email templates with `wa=leosp` referral attribution. Final CTA on /sba goes to `signup.surge365.com/?wa=leosp` for direct enrollment with commission tracking. Mondays 1pm UTC, generates 7 days × 4 platforms (28 posts) via OpenRouter cheap-tier (llama-3.3-70b). Logs to `ai_jobs` for audit. Inserts directly to `content_calendar` as drafts. Verified on prod 4/29: 28 posts generated, cost $0.00069. Uses ai-router budget guards (AI_DAILY_BUDGET_LIMIT, AI_MONTHLY_BUDGET_LIMIT). Modified `ai-router.ts` to allow `createdBy: null` for system/cron jobs.
- [ ] HeyGen voice clone (Leo recording — in progress 4/29)
- [ ] Twitter/X auto-post route (`/api/automations/post-to-twitter`)
- [ ] TikTok: API access application OR partner-tier integration (Buffer/Later)
- [ ] Cleanup: refresh Vercel env vars to remove leading whitespace (cosmetic)
- [ ] Cleanup: fix lint config (`next lint` removed in Next 16)
- [ ] Build `src/lib/social-specs.ts` for per-platform image/video sizing

---

## Blocked / pending items

> **Reconciliation note (2026-05-02):** the four items below were Phase 11 deployment-prep checks. All four were satisfied during the Phase 11 prod cutover (commits `c361e8d` + `8e54262`, prod deploy `dpl_qDc73T2dNmEmtQZPajwZpdAW6R6H`). Left in place as a historical record only — they are not active TODOs. There are no current blockers.

- [x] ~~Verify all 11 new env vars are present in Vercel dashboard~~ — done in Phase 11
- [x] ~~Run final local build: `npm run lint && npx tsc --noEmit && npm run build`~~ — done (lint script broken under Next 16; typecheck + build pass)
- [x] ~~Deploy preview, smoke test, then promote to prod~~ — done; live on vortextrips.com
- [x] ~~End-to-end AI Center test (job → verify → approve → push to calendar)~~ — done 2026-04-29 (Opus 4.7 verifier, score 92/100)

## Notes

- Previous Claude chat froze because images >2000px were attached. Image safety guard now in place; rule is documented in `IMAGE_UPLOAD_RULES.md`.
- Vercel Hobby plan caps: 10s function timeout, daily cron only, 4 cron jobs max — we're at 4.

---

## STRICT MODE Phase Tracker (reconciled 2026-05-02)

> **Reconciliation note:** the original 2026-05-01 anchor listed Phase 10.5 as last-complete and Phase 11 as pending. That snapshot was already stale at the time of writing — Phases 11 through 12.8 had shipped to production. Below reflects true current state. Historical phase entries above are preserved unchanged.

- [x] **Phase 10.5 — Save protocol + image safety guard** (commit `f2b41e6`)
- [x] **Phase 11 — Deployment prep & prod cutover** (commits `c361e8d` + `8e54262`, prod `dpl_qDc73T2dNmEmtQZPajwZpdAW6R6H`)
- [x] **Phase 12.0 → 12.8 — Post-launch enhancements + audit fixes** (last commit `67d83c0`, 2026-04-30)
- [x] **Strict-mode session-continuity layer** (commit `e256a13`, docs only — no code)
- [x] **Phase 14E — Dashboard Campaign Planner** (code only, 2026-05-02)
  - [x] `src/app/dashboard/campaigns/page.tsx` — admin UI. Filters (status / category / min score / search). Left rail = campaign list with status, score, urgency-wave inferred from event date, asset-count chips, top-4 categories. Right rail = detail panel: identity + dates + audience + 6 angles + tracking URL; latest score panel with 10-dimension breakdown; asset bundle grouped by `asset_type` in canonical 10-type order. Each asset card surfaces platform, wave, status, scheduled_for, hashtags, banned-term `compliance_flag` from `verification_metadata`, and rejection reason when present.
  - [x] Generate Asset Bundle button posts to existing Phase 14D route `/api/admin/campaigns/generate-assets`. Force Regenerate button is hidden until assets exist; when shown, it confirms with the exact warning copy: "This archives existing draft assets only. Posted, approved, scheduled, and rejected assets are not overwritten."
  - [x] `src/app/api/admin/campaigns/route.ts` — `GET`. `requireAdminUser`. Filters: `status` (validated against the enum), `category` (TEXT[] contains), `min_score` (1-100 numeric), `q` (sanitized ilike across `campaign_name`, `event_name`, `destination_city`). Returns campaigns enriched with `asset_counts` aggregated from a single `campaign_assets` query (no N+1).
  - [x] `src/app/api/admin/campaigns/[id]/route.ts` — `GET`. `requireAdminUser`. Returns full `event_campaigns` row, all related `campaign_assets`, asset counts by status, latest `campaign_scores` row with 10-dimension `breakdown` JSONB.
  - [x] `src/app/api/admin/campaigns/assets/[assetId]/approve/route.ts` — `POST`. `requireAdminUser`. Allowed only from `'draft'` or `'idea'`. Sets `status='approved'`, `approved_at=now()`, `approved_by=auth.user.id`. Optimistic-concurrency guard via `.eq('status', prior_status)` — returns 409 instead of clobbering. Never auto-posts. Never writes to `content_calendar`.
  - [x] `src/app/api/admin/campaigns/assets/[assetId]/reject/route.ts` — `POST`. `requireAdminUser`. Allowed from `'draft'`, `'idea'`, `'approved'`. Sets `status='rejected'`. Optional `{reason}` body merged into `verification_metadata.rejection_reason` + `rejected_by` + `rejected_at`. Same optimistic-concurrency guard. Never modifies `posted` / `scheduled` / `archived` / `rejected` assets.
  - [x] `src/components/dashboard/sidebar.tsx` — `Campaigns` nav entry added between AI Center and Videos.
  - [x] Reuses `requireAdminUser`, `createAdminClient`, `useToast`/`Toaster`, `getStatusColor`, `formatDate`, `formatDateTime`. No new component library, no new dependencies, no new env vars, no new auth helper.
  - [x] No DB schema changes. No `content_calendar` writes. No auto-publish. No bulk operations. No edit-in-place.
  - [x] `npx tsc --noEmit` passes.
  - [x] `npm run build` compiles cleanly. New routes: `ƒ /api/admin/campaigns`, `ƒ /api/admin/campaigns/[id]`, `ƒ /api/admin/campaigns/assets/[assetId]/approve`, `ƒ /api/admin/campaigns/assets/[assetId]/reject`. New page: `ƒ /dashboard/campaigns`.
  - [ ] `npm run lint` — known Phase 13 ESLint v8/v9 mismatch (`TypeError: Converting circular structure to JSON` from ESLint 8.57.1 trying to load the v9 flat config). Not a Phase 14E regression.
  - [ ] **Leo to do:** apply migrations 017-021 to Supabase prod (still pending from Phase 14C/14D) before exercising the dashboard end-to-end.
  - [ ] **Leo to do:** run the git commands at the end of this session to commit and push Phase 14E.
- [x] **Phase 14D — Campaign Generator API** (code only, 2026-05-02)
  - [x] `src/lib/event-campaign-asset-generator.ts` — server-only library. Loads campaign, builds the §5/§6 system+user prompt, calls `runAIJob` (medium-tier OpenRouter), parses JSON output (markdown-fence aware), maps to up to 33 `campaign_assets` rows across all 10 asset types, computes `scheduled_for` per wave (W1−180d, W2−120d, W3−90d, W4−60d, W5−30d, W6−14d, W7−7d, W8+7d), tags banned-vocab hits in `verification_metadata`, and calls the existing Claude verifier on the concatenated text bundle when `ANTHROPIC_API_KEY` is present.
  - [x] `src/app/api/admin/campaigns/generate-assets/route.ts` — admin-gated POST. Zod validates `event_campaign_id` (required UUID), `model_override`, `asset_types[]`, `force_regenerate`. Returns 400/404/200/502/500. `maxDuration = 60`.
  - [x] Reuses `requireAdminUser`, `runAIJob`, `verifyAIOutput`, `createAdminClient` — no new auth, no new AI router, no new budget logic. `AI_DAILY_BUDGET_LIMIT` / `AI_MONTHLY_BUDGET_LIMIT` enforced automatically.
  - [x] Duplicate prevention: returns `{ already_exists:true, existing_count }` when non-archived/non-rejected assets already exist for the campaign and `force_regenerate` is not true. Never inserts a duplicate.
  - [x] On `force_regenerate=true`, archives only `status='draft'` rows (double-filtered in code) before inserting. Posted, scheduled, approved, idea, rejected rows are never touched.
  - [x] Every inserted row: `status='draft'`, `requires_human_approval=true`, `generation_job_id` linked to `ai_jobs`. Never auto-publishes; never writes to `content_calendar`.
  - [x] `npx tsc --noEmit` passes.
  - [x] `npm run build` compiles cleanly; new route registered as `ƒ /api/admin/campaigns/generate-assets`.
  - [ ] `npm run lint` — not run; pre-existing Phase 13 lint config not yet validated by Leo. Phase 14D introduces no lint regression in either of its two new files.
  - [ ] **Leo to do:** apply migrations 017-021 to Supabase prod (still pending from Phase 14C) before exercising the route end-to-end.
  - [ ] **Leo to do:** run the git commands at the end of this session to commit and push Phase 14D.
- [x] **Phase 14C — Event Research Cron** (code only, 2026-05-02)
  - [x] `src/lib/event-seeds.json` — 31 worldwide event seeds across all 17 required categories (Carnival, Cruise, Art & Culture, Sports, Music Festival, Business Conference, Family Reunion, Wedding Guest, Faith-Based, Youth Sports, Creator/Influencer, Diaspora/Back Home, Wellness Retreat, Luxury-on-a-Budget, No-Passport/Easy, Last-Minute, Seasonal/Shoulder)
  - [x] `src/lib/event-campaign-scoring.ts` — pure 1-100 scorer implementing the 10-dimension rubric in `VORTEX_EVENT_CAMPAIGN_SKILL.md` §9
  - [x] `src/lib/event-campaign-generator.ts` — reads seeds, computes next-future occurrence, scores, upserts into `event_campaigns`, inserts into `campaign_scores`. Duplicate prevention by `ilike(event_name) + event_year + ilike(destination_city)`. Round-robin batching across weekly runs.
  - [x] `src/app/api/cron/weekly-content/route.ts` — calls `runEventCampaignResearch({ limit: 6 })` after the existing weekly content insert; isolated try/catch ensures research failures never break weekly content; result and error count logged into `ai_actions_log.response_payload`.
  - [x] No new Vercel cron route (Hobby cap of 4 respected — score-and-branch, send-sequences, weekly-content, check-heygen-jobs)
  - [x] No content auto-published; status defaults to `idea`; `requires_human_approval = TRUE`
  - [x] `npx tsc --noEmit` passes
  - [ ] **Leo to do:** apply migrations 017-021 to Supabase prod before next Monday 1pm UTC weekly-content tick (`supabase db push` or paste into SQL Editor in order). Until applied, the research call will catch-and-log a "relation does not exist" error each week without breaking weekly content.
  - [ ] **Leo to do:** run the git commands at the end of this session to commit and push Phase 14C
- [x] **Phase 14B — Campaign Calendar Schema** (migration files only, 2026-05-02)
  - [x] `supabase/migrations/017_create_event_campaigns.sql` — root campaign table (worldwide events, cruise add-on, scoring, lifecycle, approval, AI metadata, parent-campaign FK for yearly repeats, tracking URL template)
  - [x] `supabase/migrations/018_create_campaign_assets.sql` — generated assets (10 asset types × 10 platforms, wave W1-W8, image/video source provenance, FK to existing `content_calendar`)
  - [x] `supabase/migrations/019_create_campaign_scores.sql` — score history with 10-dimension breakdown JSONB
  - [x] `supabase/migrations/020_create_event_sources.sql` — source registry (manual_seed/ics_feed/api/scrape/partner_feed/rss/other) with pull-status tracking
  - [x] `supabase/migrations/021_create_campaign_schedule.sql` — schedule slots bridging assets to existing `content_calendar`
  - [x] All five tables: `gen_random_uuid()` PKs, `update_updated_at` trigger, RLS via `admin_users`, indexes on hot columns, GIN index on `event_campaigns.categories`
  - [ ] **Leo to do:** apply migrations via `supabase db push` (or paste each file into Supabase SQL Editor in order 017 → 021) before starting Phase 14C
- [x] **Phase 14A — Destination/Event Campaign Skill** (markdown only, 2026-05-02)
  - [x] `VORTEX_EVENT_CAMPAIGN_SKILL.md` created (purpose, formula, 32 categories, 8 timing waves, output spec, cruise add-on, compliance rules, scoring rubric, 15 seed campaigns)
  - [x] `EVENT_CAMPAIGN_ROADMAP.md` created (Phases 14A-14H with exit criteria)
  - [x] Surge365 signup-CTA sweep — 6 code-side links corrected to path-based `/leosp`: `next.config.js`, `src/app/sba/page.tsx`, `src/app/join/page.tsx`, `src/lib/email-templates.ts`, `src/lib/twilio.ts` (leadDay12 + sbaDay7)
  - [x] Surge365 corporate video URLs left intact (`wa=leosp` query is correct for video pages)
  - [x] `myvortex365.com/leosp` references left intact (different domain — free portal)
  - [ ] **Leo to do:** run the git commands at the end of this session to commit and push Phase 14A
- [~] **Phase 13 — Stability Layer** (code-side complete 2026-05-02, awaiting Leo follow-ups)
  - [x] Env-var audit across `.env.example`, `.env.local`, and code (full inventory below)
  - [x] `.env.local` whitespace + admin-password-comment removed (gitignored, not committed)
  - [x] Verified no secrets exposed to client (`next.config.js` has no `env` block; all 6 used `NEXT_PUBLIC_*` vars are public-by-design)
  - [x] `.env.example` Twitter comment fixed (posting routes are shipped, not pending)
  - [x] Next 16 lint config: created `eslint.config.mjs` (FlatCompat) + updated `package.json` lint script + bumped `eslint` to ^9 + added `@eslint/eslintrc`
  - [x] Added `typecheck` script to `package.json`
  - [ ] **Leo to do:** run `npm install` and `npm run lint` to validate flat config (do not deploy from this until lint exits clean)
  - [ ] **Leo to do:** in `.env.local`, fix duplicated `sk-ant-` prefix on `ANTHROPIC_API_KEY` (line 53). Confirm against Anthropic console.
  - [ ] **Leo to do:** in `.env.local`, rename `Management_Key` / `Your_new_API_key` → one canonical `OPENROUTER_API_KEY` (lines 56-57). Code reads `OPENROUTER_API_KEY` only.
  - [ ] **Leo to do:** Vercel env audit — run `vercel env ls production` and cross-check against the Required-vars list in `PROJECT_STATE_CURRENT.md`. Confirm no leading/trailing whitespace on values.
  - [ ] **Leo to do (optional):** prune Vercel of unused `NEXT_PUBLIC_FB_APP_ID`, `NEXT_PUBLIC_FB_LOGIN_CONFIG_ID`, `FACEBOOK_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TWITTER_BEARER_TOKEN`, `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `STRIPE_*` (all declared but unused in current code).

## Session Safety Rules
- One phase per session
- Always read `PROJECT_STATE_CURRENT.md` first
- Never rely on chat history
- Always save progress before ending

## Global completion rule (mirrored from SAVE_PROTOCOL.md)
A phase is NOT complete until:
- `PROJECT_STATE_CURRENT.md` updated
- `BUILD_PROGRESS.md` updated
- Changes committed
- Changes pushed
- `git status` shows clean
