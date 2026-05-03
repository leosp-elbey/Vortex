# VortexTrips Build Progress

**Last updated:** 2026-05-03 (Phase 14H.1 closed — helper hardening + diagnostic committed and deployed; diagnostic confirmed 0 bad rows. Phase 14H.2 starting — persist event_slug on event_campaigns.)
**Last code-shipping commit:** `dc56330` (scripts: Phase 14H.1 tracking URL diagnostic helper)
**Status:** 🚀 LIVE on vortextrips.com · Phases 0 → 12.8 shipped · Phase 13 code-side complete · **Phases 14A → 14H.1 deployed and verified on prod** · **Phase 14H.2 starting** (persist event_slug on event_campaigns — migration 025 + generator update + helper update + migration 026 view rewrite)

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

**Phase 14H.2 — Persist event_slug on event_campaigns (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + migrations 025 & 026 apply + deploy).**

Phase 14H.1 closed (helper hardening + diagnostic, commits `8582680` / `dc56330`; diagnostic confirmed 0 bad rows). Phase 14H.2 adds a persisted `event_campaigns.event_slug` column so attribution survives future `event_name` edits — addresses the slug-drift risk noted in Phases 14H + 14H.1.

**Patch applied:**
- [x] `supabase/migrations/025_add_event_slug_to_event_campaigns.sql` — adds nullable `event_slug TEXT` + backfill from `event_name` (regex matches the JS helper) + partial lookup index + conditional unique index on `(slug, year, city)` that silently skips when natural duplicates exist.
- [x] `supabase/migrations/026_update_event_campaign_attribution_view_use_event_slug.sql` — `CREATE OR REPLACE VIEW` with the same column shape as 023; the WITH-CTE now anchors against `COALESCE(NULLIF(trim(event_slug), ''), regex-derived slug)` so persisted slug wins, NULL falls through to legacy behavior. Backwards compatible.
- [x] `src/lib/event-campaign-generator.ts` — `UpsertPayload.event_slug` required; `buildUpsertPayload` resolves slug as `seed.slug || slugifyEventName(seed.event_name)`; INSERT carries it; UPDATE strips it from the main payload (preserves operator-edited values), then a separate narrow `.is('event_slug', null)` UPDATE backfills NULL rows on each cron tick. Soft-fails on backfill (logs to console).
- [x] `src/lib/campaign-tracking-url.ts` — `buildCampaignUtmCampaign` and `buildCampaignTrackingUrl` accept optional `eventSlug`; when present and non-empty, used directly; else falls back to `slugifyEventName(eventName)`. Legacy callers without `eventSlug` keep working unchanged.
- [x] `src/app/api/admin/campaigns/assets/[assetId]/push-to-calendar/route.ts` — `CampaignCtaRow.event_slug: string | null`; SELECT list adds `event_slug`; helper call passes `eventSlug: campaign.event_slug`.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 15.2s`; route registry unchanged
- [ ] `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated

**Behavioral guarantees:**
- No new posting routes. No AI calls. No media generation. No caption text mutation.
- Existing `content_calendar.tracking_url` rows are not rewritten. Force-regenerate → re-Approve → re-Push is the path to refresh a row's URL.
- Cron UPDATE never overwrites `event_slug`. Operator edits are preserved.
- View remains backwards compatible — NULL `event_slug` falls through to the legacy regex, so post-deploy behavior is identical for any row that hasn't been backfilled.
- Migration 025 conditional unique index never fails the migration; if duplicates exist, it silently skips.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] **Apply migration 025 to Supabase prod.** Verification SQL:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'event_campaigns' AND column_name = 'event_slug';

  SELECT count(*) FILTER (WHERE event_slug IS NOT NULL) AS slugged,
         count(*) FILTER (WHERE event_slug IS NULL)     AS still_null,
         count(*) AS total
  FROM event_campaigns;
  ```
- [ ] **Apply migration 026 to Supabase prod.** Verification SQL:
  ```sql
  SELECT viewname FROM pg_views WHERE viewname = 'event_campaign_attribution_summary';
  -- Confirm the view definition references event_slug:
  SELECT pg_get_viewdef('event_campaign_attribution_summary', true);
  ```
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test: re-push an Art Basel asset → confirm new `tracking_url` matches `…&utm_campaign=art-basel-miami-beach_2026_W<n>&utm_content=social_post_<8 hex>`. (Optional: synthetic rename test described in PROJECT_STATE_CURRENT.md.)

---

## Phase 14H.1 patch — `utm_content` placeholder defense (shipped commits `8582680` + `dc56330`, prod-verified 2026-05-03).**

Smoke test of the just-deployed Phase 14H.1 surfaced a copied URL whose `utm_content` did not contain a real 8-char short id. `grep` confirmed there is no literal placeholder string in `src/`; the bug class is failure-mode permissiveness in `shortAssetId` + `buildCampaignTrackingUrl`. Patched both:

- [x] `src/lib/campaign-tracking-url.ts` — `shortAssetId` now strips ALL non-alnum and requires the 8-char slice to match `^[a-z0-9]{8}$`. Real UUIDs pass; literal `<shortid>`, `{assetId}`, `{asset_id}`, `<asset_id>`, `<8 chars>`, etc. all fail and return `''`. `buildCampaignTrackingUrl` now requires BOTH a clean asset_type AND a real id-derived short before emitting `utm_content` — when either is missing, the param is omitted entirely.

**Existing bad rows (if any):** SQL diagnostic + repair queries documented in `PROJECT_STATE_CURRENT.md` Phase 14H.1 patch section. Do NOT auto-run; Leo to inspect Step 1, then apply Step 2.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 7.8s`
- [ ] `npm run lint` — not run (Phase 13 ESLint v8/v9 mismatch unrelated)

**Behavioral guarantees:**
- No new migration. `content_calendar.tracking_url` schema unchanged.
- No new route call sites. Push-to-calendar route still passes `asset.id` (real UUID).
- No dashboard wiring changes — copy button continues to read API-returned `tracking_url`.
- No auto-posting. No AI calls. No media generation.

**Leo to do:**
- [ ] Commit + push.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Run SQL diagnostic Step 1; if rows return, apply Step 2 to repair existing tracking_urls.
- [ ] Smoke test: push a fresh asset → confirm `utm_content` ends in eight hex characters.

---

## Phase 14H.1 — Tracking URL Materialization (shipped commits — see Phase 14H.1 entry below for original patch; this current focus block tracks the placeholder-defense follow-up).**

Phase 14H shipped (`2e3869d` / `4323250`), prod-verified — Performance panel renders, metrics in expected zero/deferred state. Phase 14H.1 turns the placeholder tracking URL template into real URLs at push-to-calendar time so future click traffic with UTM params will be attributed back through the existing 14H view.

**Patch applied:**
- [x] `supabase/migrations/024_add_tracking_url_to_content_calendar.sql` — `content_calendar.tracking_url TEXT NULL` + partial lookup index. Idempotent. Existing rows unaffected.
- [x] `src/lib/campaign-tracking-url.ts` — `slugifyEventName`, `buildCampaignUtmCampaign`, `buildCampaignTrackingUrl`. Pure helpers; no side effects.
- [x] `src/app/api/admin/campaigns/assets/[assetId]/push-to-calendar/route.ts` — loads parent campaign on the new-insert path, builds resolved tracking URL via the helper, writes `content_calendar.tracking_url` on insert, back-fills `campaign_assets.tracking_url` when currently NULL, surfaces `tracking_url` on every response shape.
- [x] `src/app/dashboard/campaigns/page.tsx` — captures `tracking_url` from push responses into a session-local map, threads through `CampaignDetailPanel` → `AssetGroup` → `AssetCard`, renders a small `🔗 Tracking URL ready · copy` button on cards where the URL is known. Click copies to clipboard.
- [ ] Migration 025 (attribution view rewrite) — **not created.** Existing view already works against `contacts.custom_fields.utm_campaign` and the helper's slug matches the view's slug regex exactly.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 25.2s`; route still registered
- [ ] `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated

**Behavioral guarantees:**
- No auto-posting. No AI calls. No image / video generation. No caption text mutation.
- Posted / scheduled / approved / rejected calendar rows never modified.
- Operator-set `campaign_assets.tracking_url` values are preserved (back-fill only fires when currently NULL).
- All four push response shapes (new push, partial-success, both idempotency-cached returns) include `tracking_url` at the top level.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] **Apply migration 024 to Supabase prod.** Verification SQL:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'content_calendar' AND column_name = 'tracking_url';
  ```
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test: Art Basel social_post → Approve → Push to Calendar → confirm green `🔗 Tracking URL ready · copy` button + URL matches `https://myvortex365.com/leosp?utm_source=<platform>&utm_medium=event_campaign&utm_campaign=art-basel-miami-beach_2026_W<n>&utm_content=social_post_<8chars>`.

---

## Phase 14H deploy + smoke test (2026-05-03) — pending. Mandatory End-of-Phase Save Protocol locked into `CLAUDE_SESSION_SKILL.md`.**

Phase 14H is committed to `main` (`2e3869d` + last-known-good hash bump `4323250`) and migration 023 is applied to Supabase prod (`event_campaign_attribution_summary` confirmed in `pg_views`). The new Performance panel will render the empty-state copy in the dashboard until prod is redeployed and the panel is smoke-tested.

**Leo to do (in order):**
- [ ] `npx vercel --prod --yes` to deploy Phase 14H code.
- [ ] Smoke test on `/dashboard/campaigns` → Art Basel → confirm Performance panel renders with the empty-state copy and a composite performance score derived from the intrinsic event-fit + production / distribution ratios.
- [ ] Recommended next phase after smoke test: **Phase 14H.1 — Tracking URL Materialization** (small, focused phase; see "Recommended Next Phase" details below).

**Mandatory End-of-Phase Save Protocol — checklist now permanent:**

Every future phase must end with all of the following (full text in `CLAUDE_SESSION_SKILL.md` § Mandatory End-of-Phase Save Protocol):

- [x] `PROJECT_STATE_CURRENT.md` updated
- [x] `BUILD_PROGRESS.md` updated
- [x] Tests run or explicitly deferred with reason
- [x] Migration status documented (apply order + Supabase verification SQL)
- [x] Deploy status documented
- [x] Smoke-test status documented
- [x] Exact git commands provided (named-file `git add`, exact commit message, two `git push origin main` lines)
- [x] `tsconfig.tsbuildinfo` and other cache/build/secret files excluded by default
- [x] Two-push verification — second push must return `Everything up-to-date`
- [x] Final state confirmed `nothing to commit, working tree clean`

---

## Phase 14H — Conversion Tracking by Event Campaign (commits `2e3869d` + `4323250`, migration 023 applied 2026-05-03; deploy + smoke test pending).**

Phase 14G shipped (`ca7c2e4`), prod-verified — platform guidance lines render correctly per platform on every approved `social_post` row. Phase 14H lays the attribution foundation: a SQL view joining `event_campaigns → campaign_assets → content_calendar` plus best-effort UTM lead matching against `contacts.custom_fields`, a server helper that rolls per-(asset × calendar_row) rows up to per-campaign metrics, an admin GET endpoint, and a Performance panel on the campaign dashboard.

**Patch applied:**
- [x] `supabase/migrations/023_create_event_campaign_attribution_view.sql` — `event_campaign_attribution_summary` view, idempotent (`CREATE OR REPLACE`).
- [x] `src/lib/event-campaign-attribution.ts` — `getEventCampaignAttributionSummary`, `getEventCampaignAttributionByCampaign`, `rollupCampaign`, `calculateCampaignPerformanceScore`. Server-only.
- [x] `src/app/api/admin/campaigns/attribution/route.ts` — admin-gated GET. Zod-validated query (`campaign_id`/`platform`/`wave`/`min_score`/`date_from`/`date_to`). Returns `{ ok, empty, filters, totals, ranked, notes }`.
- [x] `src/app/dashboard/campaigns/page.tsx` — new `PerformancePanel` between the score panel and the asset bundle. Renders composite performance score, latest activity, 8-cell metric grid, per-platform breakdown, deferred-attribution footer note. Empty-state copy when no signal exists. Refreshes after a successful Push to Calendar.
- [ ] `push-to-calendar` route metadata — **not patched.** Resolving the placeholder tracking URL safely requires a `content_calendar.tracking_url` column (schema change) and persisting `event_slug` on `event_campaigns`. Documented as a high-priority gap; deferred to a future phase.

**Existing tracking schema inspected:** `contact_events`, `contacts.custom_fields`, `event_campaigns.tracking_url_template`, `campaign_assets.tracking_url`, `content_calendar`. None of them carry resolved campaign UTM tags today; `/dashboard/attribution` already aggregates leads by UTM from `contacts.custom_fields`, which is the same signal the new view re-uses.

**Metrics supported now:** asset_count · approved_asset_count · calendar_row_count · posted_count · latest_posted_at · lead_count (UTM best-effort) · member_count (UTM best-effort) · lead_to_conversion_rate · latest_activity_at · performance_score.

**Metrics deferred:** clicks (no UTM-aware click tracking on `contact_events`) · impressions (no platform analytics integrated) · per-(platform × wave) lead breakdown (requires resolved tracking URLs first).

**Tracking URL placeholder status:** documented gap. `event_campaigns.tracking_url_template` stores the literal template; `campaign_assets.tracking_url` is always NULL; `content_calendar` has no field for it. Captions don't include a UTM tag. Lead counts will be 0 until a future small phase materializes the URL through the chain.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 31.0s`; new route registered as `ƒ /api/admin/campaigns/attribution`
- [ ] `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated

**Behavioral guarantees:**
- Read-only. No posts, no AI calls, no DB writes outside the view definition.
- No changes to existing posting routes or generation logic.
- Performance panel render-only — never blocks any operator action.

**Leo to do:**
- [ ] Commit + push.
- [ ] **Apply migration 023 to Supabase prod** — required before the endpoint or panel returns data.
- [ ] Re-deploy to Vercel prod.
- [ ] Smoke test: `/dashboard/campaigns` → Art Basel → Performance panel renders with empty-state copy + composite score.

---

## Phase 14G — Per-Platform Creative Sizing & Media Rules (shipped commit `ca7c2e4`, prod-verified 2026-05-03).**

Phase 14F shipped (`e4737e0`), migration 022 applied to Supabase prod, smoke-tested end-to-end: approved social posts push to `content_calendar` as drafts idempotently, badge confirms the link, non-social asset types correctly show the "not yet supported" hint, no auto-posting occurred. Phase 14G is now safe to start (purely additive; no posting routes / schema / generation logic touched).

**Patch applied:**
- [x] `src/lib/social-specs.ts` — single source of truth. `PlatformId` union (`instagram | facebook | twitter | tiktok | youtube_shorts`), `SocialSpec` interface, 5 populated spec constants, helper functions: `normalizePlatform`, `getSocialSpec`, `validateCaptionForPlatform`, `suggestCaptionTrim`, `getRecommendedImageSpec`, `getRecommendedVideoSpec`, `buildPlatformGuidanceLine`.
- [x] `src/app/dashboard/campaigns/page.tsx` — for `social_post` rows where the platform resolves, renders a muted one-liner under the body: `📐 Instagram: 1080×1080 image · caption ≤ 150 chars · 8 hashtags`. Title attribute carries the spec's notes. Hidden when platform can't be resolved.
- [ ] Push-to-calendar route metadata storage — **deferred**. `content_calendar` has no JSONB column today; route unchanged per the user's escape hatch ("If no safe field exists, do not change schema and just leave this for a later phase").

**Platform specs included:** Instagram · Facebook · X / Twitter · TikTok · YouTube Shorts.

**Helper functions exported:** `getSocialSpec`, `normalizePlatform`, `validateCaptionForPlatform`, `suggestCaptionTrim`, `getRecommendedImageSpec`, `getRecommendedVideoSpec`, `buildPlatformGuidanceLine`.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 11.0s`; route table unchanged
- [ ] `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated

**Behavioral guarantees:**
- No new external API calls (no Pexels / OpenAI / HeyGen / OpenRouter / Claude).
- No `content_calendar` writes; no schema changes; no posting-route changes.
- No changes to approve / reject / generate / push-to-calendar logic.
- Guidance line is render-only — never blocks any operator action.

**Leo to do:**
- [ ] Commit + push.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Spot-check `/dashboard/campaigns` → Art Basel → each social_post row shows the correct per-platform hint.

---

## Phase 14F — Push Approved Campaign Assets into `content_calendar` (shipped commit `e4737e0`, migration 022 applied, prod-verified 2026-05-02).**

Phases 14E timeout patch + 14E.1 media-clarity have been committed (`5037a6c` + `a91acd3`), deployed to prod, and smoke-tested end-to-end — Art Basel generated 33 draft assets across the 4 batches, all asset-group sections render with helper text and prompt placeholders, approve/reject works. Phase 14F is now safe to start (migrations 017-021 applied, code deployed, surface validated).

**Patch applied:**
- [x] `supabase/migrations/022_add_campaign_asset_link_to_content_calendar.sql` — adds nullable `content_calendar.campaign_asset_id` FK + partial unique index. Idempotent. Existing rows unaffected.
- [x] `src/app/api/admin/campaigns/assets/[assetId]/push-to-calendar/route.ts` — admin-gated POST. Loads asset, checks `status='approved'`, validates asset_type ∈ pushable allowlist (today: `social_post`), validates platform ∈ {`instagram`,`facebook`,`tiktok`,`twitter`}, validates non-empty body, derives `week_of` from override / asset.scheduled_for / now, INSERTs `content_calendar` row with `status='draft'`, links the back-pointer on the asset. Two layers of idempotency (forward link via `campaign_assets.content_calendar_id`, back link via `content_calendar.campaign_asset_id`); `23505` race recovery; partial-success path for failed forward-link update. Returns `{ ok, already_pushed?, partial?, content_calendar }`.
- [x] `src/app/dashboard/campaigns/page.tsx` — adds `📅 Push to Calendar` button (only for approved + supported assets), `✓ Added to Calendar` badge (driven by client-session set + future API support of `content_calendar_id`), muted hint when calendar push isn't supported for an approved asset's type. New `handlePushToCalendar` POSTs the route, surfaces idempotency / partial-success messages, refreshes the campaign detail.

**Supported asset types this phase:** `social_post` only. Other types return 400 with `"This asset type is not yet supported for calendar push."` because `content_calendar.platform` CHECK only allows the four social platforms.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — compiles cleanly; new route registered as `ƒ /api/admin/campaigns/assets/[assetId]/push-to-calendar`
- [ ] `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated

**Behavioral guarantees:**
- Never auto-posts (calendar row lands as `status='draft'`; per-platform posters still require `status='approved'` set on `/dashboard/content`).
- Never modifies posted/scheduled/rejected `content_calendar` rows.
- Never modifies asset status; asset stays `approved` after push.
- Never calls OpenRouter / Claude / Pexels / OpenAI / HeyGen.

**Leo to do:**
- [ ] Apply migration 022 to Supabase prod (`supabase db push` or paste SQL Editor). **Required before the route works.**
- [ ] Commit + push (commands in the session response).
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test: open Art Basel → approve a social_post → click Push to Calendar → confirm a draft `content_calendar` row with caption / hashtags / platform → click again to confirm idempotency.

---

## Phase 14E.1 Campaign Dashboard Media Clarity Patch (in working tree, 2026-05-02 — typecheck + build pass; stacked on the Phase 14E timeout patch; awaiting commit + deploy).**

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
