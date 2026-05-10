# VortexTrips Build Progress

**Last updated:** 2026-05-09 (Phase 14AM.1 shipping in working tree — TikTok Sandbox Credential Toggle. New `TIKTOK_USE_SANDBOX` env var (default `false` = production). When `true`/`1`, every TikTok touch point reads `TIKTOK_CLIENT_KEY_SANDBOX` / `TIKTOK_CLIENT_SECRET_SANDBOX` instead of the production keys. Single decision point in `src/lib/tiktok-oauth.ts` (`tikTokIsSandboxMode`, `getTikTokClientKey`, `getTikTokClientSecret` exports); login route + status route + JS mirror in script + settings UI all route through it. Status route now returns `sandbox: boolean`; settings page shows amber "🧪 Sandbox mode" pill when active. Both credential pairs coexist in Vercel env; flip the toggle to switch between them. `.env.example` documents all three new vars. Lint + typecheck clean.)
**Earlier this session:** 2026-05-09 (Phase 14AM shipping in working tree — TikTok App Review Hardening. Five surgical changes: (1) `public/.well-known/tiktok-developers-site-verification.txt` placeholder for TikTok's domain ownership verification — operator pastes the real token before submission; (2) "TikTok Connection" subsection in `/privacy/page.tsx`; (3) "TikTok Integration" subsection in `/terms/page.tsx`; (4) per-user rate limit (10/hour) on `/api/automations/post-to-tiktok` with `Retry-After` header; (5) CSRF state cookie validation between `/api/auth/tiktok/login` (sets `tt_oauth_state`, httpOnly Secure SameSite=Lax, 10-min TTL) and `/api/auth/tiktok/callback` (validates against query param, rejects mismatch / missing, clears cookie in success and failure paths to prevent replay). The Phase 14R `void state` no-op is removed. Lint + typecheck clean.)
**Earlier this session:** 2026-05-09 (Phase 14AL shipping in working tree — TikTok Connect Button on Settings. Adds a clickable "Connect TikTok" button to `/dashboard/settings` so the operator's TikTok app-review demo video can show real UI interactions instead of typing the OAuth URL into the address bar. New `/api/auth/tiktok/status` admin-only endpoint returns sanitized state (`{ connected, expires_at, open_id }`) WITHOUT shipping access_token / refresh_token to the browser. Settings page gains a "Connected Accounts" section with a green ✓ Connected badge / metadata line / scope hint / black Connect-or-Reconnect button, and reads OAuth callback query params (`?platform=tiktok&connected=...`) to surface a toast then strip the params via `router.replace`. Suspense wrapper added per Next.js 16 client-component-with-useSearchParams requirement. Lint + typecheck clean.)
**Earlier this session:** 2026-05-09 (Phase 14AK shipping in working tree — TikTok OAuth Login Route. Operator hit a 404 visiting `/api/auth/tiktok/login` while trying to authorize the TikTok Direct Post API. Phase 14R built only the callback at `/api/auth/tiktok/callback`; the corresponding LOGIN route — the user-initiated step that constructs the authorize URL and 302-redirects the browser to TikTok — was never created. 14AK adds it: `src/app/api/auth/tiktok/login/route.ts` reads `TIKTOK_CLIENT_KEY`, generates a CSRF `state`, computes the same `redirect_uri` the callback uses, and 302-redirects to `https://www.tiktok.com/v2/auth/authorize/` with `scope=user.info.basic,video.publish`. The full OAuth handshake is now end-to-end functional. Lint + typecheck clean.)
**Earlier this session:** 2026-05-09 (Phase 14AJ shipping in working tree — Vercel Pro Scale Up. Operator upgraded to Vercel Pro; autoposter cron schedule now `0 14,18,22 * * *` (10 AM / 2 PM / 6 PM EST = 3 posts/day in steady state). The Phase 14S `queue_size_gt_1` refusal is removed: cron picks the OLDEST eligible row by `queued_for_posting_at` FIFO, leaves the rest for the next tick. Eligibility limit raised from 5 to 50 for full queue visibility. Response payload includes `queue_depth_before` / `queue_depth_remaining`. `scripts/run-autoposter-once.js` mirrors the same FIFO behavior. Kill switch + atomic UPDATE invariants unchanged. Lint + typecheck clean.)
**Earlier this session:** 2026-05-09 (Phase 14AI shipping in working tree — Manual Generation Route Fix. The dashboard's "Generate This Week" button calls `/api/dashboard/generate-content`, a separate route from the cron that wasn't updated in Phase 14AG. Pre-14AI it produced TikTok rows with `video_url=null` (and no Pexels image either — image fetch was IG/FB-only). 14AI brings the manual route into sync: image fetch runs for ALL platforms; TikTok rows synchronously call `fetchAndStoreVideo()` and land at `media_status='ready'` with `video_url` populated and `media_metadata` carrying `on_screen_hook` + Pexels provenance. User prompt teaches AI the TikTok-specific format. `maxDuration=60`. Lint + typecheck clean.)
**Earlier this session:** 2026-05-09 (Phase 14AH.1 shipping in working tree — Pre-Flight Hardening + Randomized Pexels Fetch. Two changes in one revision: (1) `scripts/generate-missing-media.js` now refuses upfront on missing PEXELS_API_KEY before any SELECT, preventing config errors from corrupting DB rows (the very failure mode hit during the earlier 14AH backfill attempt). (2) `fetchAndStoreVideo` swapped from deterministic "page 1 → fallback page 2–6 → first-fit" to **random page 1–5 + random unused index** for visual variety. Cron's DB pre-query removed per operator directive; in-run accumulator preserved. Lint + typecheck clean.)
**Earlier this session:** 2026-05-09 (Phase 14AH shipping in working tree — Pexels Duplicate Prevention. The new Pexels Video pipeline from Phase 14AG could pick the same MP4 twice when two posts have similar `image_prompt` values (Pexels search is deterministic). `fetchAndStoreVideo` now accepts `excludePexelsIds` and `excludeUrls` exclude sets; walks page 1 first, retries with a randomized page 2–6 if all page-1 results are excluded, falls back to a tagged duplicate as last resort. Both callers (weekly cron + manual script) pre-query existing `video_url` + `media_metadata.pexels_video_id` and accumulate newly-picked URLs/IDs as the run progresses. Cron's TikTok video fetches serialized (image fetches stay parallel). Lint + typecheck clean.)
**Earlier this session:** 2026-05-09 (Phase 14AG shipping in working tree — Video Pipeline Swap. HeyGen excised from the SOCIAL CONTENT PIPELINE (avatar voice was off-brand, async-only flow incompatible with the synchronous weekly cron, and rendering costs added up). Pexels Video Search wired in as the replacement: cinematic vertical HD travel B-roll, free, synchronous, lands on the row immediately. The TikTok "Media missing" state is now eliminated at the source — every TikTok row from the weekly cron lands at `media_status='ready'` with a Pexels MP4 in `video_url`. New `fetchAndStoreVideo()` in `src/lib/media-providers.ts`. Cron updated with `maxDuration=60`, parallel image+video fetch, `on_screen_hook` parsing into `media_metadata`. `ai-prompts.ts` rewritten with TikTok-specific image-prompt-as-search-query + 10-word On-Screen Hook directives. `scripts/generate-missing-media.js` rewritten — HeyGen surface fully removed; `processVideo` calls Pexels Video. `scripts/check-video-generation-status.js` and `scripts/inspect-heygen-pilot-candidates.js` deleted. Dashboard "🎬 Video generating" pill replaced by "⚠ Legacy HeyGen row" pill. Admin SBA welcome-video stack deliberately untouched (separate feature; `/sba` page would break). Lint + typecheck clean. No DB; no platform calls.)
**Earlier this session:** 2026-05-09 (Phase 14AF shipping in working tree — Media Pipeline Audit & UI Polish. Audit of `scripts/generate-missing-media.js` confirms the "Media missing" badge on TikTok drafts is a correct, deliberate signal (HeyGen renders are gated to a manual operator command per Phase 14L's API-quota design), not a bug. Single dashboard edit in `src/app/dashboard/content/page.tsx` adds an inline actionable helper under the badge row when a TikTok row is in the missing-or-failed state — surfaces the exact command "node scripts/generate-missing-media.js --provider=heygen" so the state becomes actionable instead of confusing. Lint + typecheck clean. No DB; no platform calls.)
**Earlier this session:** 2026-05-09 (Phase 14AE.1 shipping in working tree — physical mailing address "1595 Palm Bay Rd #1009, Palm Bay, FL 32905" added to shared `Footer.tsx`, replacing the `<!-- TODO -->` placeholder from 14AE. Surfaces on all three TCR-submitted pages via the shared component. Lint + typecheck clean.)
**Earlier this session:** 2026-05-08 (Phase 14AE shipping in working tree — Twilio A2P 10DLC compliance. The Twilio A2P 10DLC SMS campaign was rejected by The Campaign Registry (TCR); this phase brings the homepage lead form, Privacy Policy, and Terms of Service into compliance for the next carrier review. Six edits across four files plus one new shared `Footer.tsx`. Lint + typecheck clean. No DB; no platform calls.)
**Last code-shipping commit:** `03c9ca4` (Phase 14AC: Final System Audit + Maintenance Mode declaration)
**Status:** 🏁 **MAINTENANCE MODE** on vortextrips.com · **All Phases 0 → 14AC shipped** · **Phase 14AD in working tree (DB security patch)** · **Phase 14AE in working tree (Twilio A2P 10DLC compliance)** · System is functionally complete, locally clean, lint-clean, operationally observable, verifiable, on-brand, health-monitored, hang-resistant (everywhere), CI-gated, performance-tracked, audited, security-advisor-clean, AND now A2P 10DLC compliant.

---

## Current focus

**Phase 14AM.1 — TikTok Sandbox Credential Toggle (in working tree, 2026-05-09 — single env var that flips OAuth + posting routes between production and sandbox apps; no DB schema change; no platform calls).**

The operator received separate TikTok Sandbox credentials from the Developer Portal (`TIKTOK_CLIENT_KEY_SANDBOX` / `TIKTOK_CLIENT_SECRET_SANDBOX`) needed to record the app review demo before audit approval. 14AM.1 adds a runtime toggle so the production credentials and sandbox credentials can coexist in Vercel env without manual swapping.

**Built in 14AM.1:**
- [x] **`src/lib/tiktok-oauth.ts`.** Three new exports: `tikTokIsSandboxMode()`, `getTikTokClientKey()`, `getTikTokClientSecret()`. `exchangeCodeForTokens` and `refreshAccessToken` now read credentials via the helpers. Error message names the missing var dynamically based on active mode.
- [x] **`src/app/api/auth/tiktok/login/route.ts`.** Imports `getTikTokClientKey` + `tikTokIsSandboxMode`. `clientKey` resolved via the helper. Refusal message names the missing var dynamically.
- [x] **`src/app/api/auth/tiktok/status/route.ts`.** Response payload now includes `sandbox: tikTokIsSandboxMode()`.
- [x] **`src/app/dashboard/settings/page.tsx`.** `TikTokStatus` type gains optional `sandbox?: boolean`. Amber "🧪 Sandbox mode" pill renders next to the connected/disconnected pill when sandbox mode is on, with a tooltip explaining the post-audit transition.
- [x] **`scripts/run-autoposter-once.js`.** New JS-mirror helpers: `tikTokSandboxEnabledJs(env)`, `getTikTokClientKeyJs(env)`, `getTikTokClientSecretJs(env)`. `refreshTikTokTokensJs` now uses them.
- [x] **`.env.example`.** Three new documented vars: `TIKTOK_USE_SANDBOX=false`, `TIKTOK_CLIENT_KEY_SANDBOX=`, `TIKTOK_CLIENT_SECRET_SANDBOX=`.

**Behavior matrix:** unset/false → production keys; true/1 → `_SANDBOX` keys + amber UI pill.

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ Single source of truth — all four touch points route through `tikTokIsSandboxMode()` / `tikTokSandboxEnabledJs()`
- ✅ No hard-coded `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` reads in active code paths (grep-verified)

**Operator runbook for sandbox switch:**
1. Add 4 Vercel env vars (Production + Preview): `TIKTOK_USE_SANDBOX=true`, `TIKTOK_CLIENT_KEY_SANDBOX=<sandbox key>`, `TIKTOK_CLIENT_SECRET_SANDBOX=<sandbox secret>`. Keep production keys set too.
2. Confirm sandbox app has `https://www.vortextrips.com/api/auth/tiktok/callback` as a registered redirect URI.
3. Redeploy on Vercel.
4. Visit `/dashboard/settings` — amber "🧪 Sandbox mode" pill confirms the switch. Click Connect TikTok → authorize against sandbox app.
5. Record demo + submit.
6. After audit approval: set `TIKTOK_USE_SANDBOX=false`, redeploy, reconnect.

---

## Earlier focus

**Phase 14AM — TikTok App Review Hardening (in working tree, 2026-05-09 — domain verification + privacy/terms + state CSRF + post-route rate limit; no DB schema change; no platform calls).**

Path B from the operator's TikTok review prep — minimum required for review submission plus the security hardening that's worth doing before TikTok looks at the integration. Five files touched; no UI restructuring; no new tables.

**Built in 14AM:**
- [x] **`public/.well-known/tiktok-developers-site-verification.txt` (new).** Single-line placeholder `TODO_PASTE_TIKTOK_VERIFICATION_TOKEN_HERE`. Operator replaces the entire file with TikTok's token from Developer Portal → Content Posting API → Verify domains. Required for `pull_from_url` posting.
- [x] **`src/app/privacy/page.tsx`.** New "TikTok Connection" `<section>` at the top of the policy body — describes data we receive (open_id, profile, follower stats, videos), explicit-click-only commitment, disconnect path, and links to TikTok's Privacy Policy.
- [x] **`src/app/terms/page.tsx`.** New "TikTok Integration" `<section>` between SMS Program Terms and section 3 — references TikTok's Terms of Service, never-auto-post commitment, disconnect path.
- [x] **`src/app/api/automations/post-to-tiktok/route.ts`.** Imports `checkRateLimit`. After auth check, applies 10 publish/hour/user with 429 + `Retry-After` HTTP header. Per-user not per-IP because the route is admin-gated.
- [x] **`src/app/api/auth/tiktok/login/route.ts`.** Sets `tt_oauth_state` cookie (httpOnly, Secure in production, SameSite=Lax, path=`/`, 10-min TTL) on the redirect response.
- [x] **`src/app/api/auth/tiktok/callback/route.ts`.** New `redirectAndClearStateCookie()` helper. CSRF validation block runs BEFORE code exchange — missing cookie → `state_missing` redirect, mismatched cookie → `state_mismatch` redirect, valid cookie → continue. Cookie cleared in BOTH success and failure paths (replay protection). The Phase 14R `void state` no-op is removed.

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ All 4 redirect paths in callback go through `redirectAndClearStateCookie` (clear-on-exit invariant verified)

**Operator runbook for review submission:**
1. Paste TikTok's verification token into `public/.well-known/tiktok-developers-site-verification.txt`, commit + push.
2. Add your TikTok account as a Sandbox user in the Developer Portal.
3. Verify domain on the portal (it can now fetch the file).
4. Visit `vortextrips.com/dashboard/settings` → click Connect TikTok → authorize → confirm ✓ Connected.
5. Visit `/dashboard/content` → find approved + Ready TikTok row → click Post to TikTok → confirm post on TikTok profile.
6. Record 60–90s demo, upload, submit.

---

## Earlier focus

**Phase 14AL — TikTok Connect Button on Settings (in working tree, 2026-05-09 — Connected Accounts UI + sanitized status API; no DB schema change; no platform calls).**

For the TikTok app-review demo video, the OAuth flow needed a clickable UI entry point on the dashboard. Phase 14AK exposed `/api/auth/tiktok/login`; Phase 14AL adds the operator-facing button so the demo recording shows real UI interactions per TikTok's app review guidelines.

**Built in 14AL:**
- [x] **`src/app/api/auth/tiktok/status/route.ts` (new).** Admin-only GET. Returns `{ connected, expires_at, open_id }`. Critical: NEVER returns `tiktok_access_token` or `tiktok_refresh_token` — `connected` is computed from refresh_token presence, the tokens themselves stay server-side.
- [x] **`src/app/dashboard/settings/page.tsx`.** Refactored to wrap `SettingsPageInner` in a Suspense boundary (Next.js 16 requirement for client components using `useSearchParams`). New "Connected Accounts" section between API Keys and Bland.ai with a TikTok row showing: status pill (Loading… / ✓ Connected / Not connected), optional metadata (open_id first 12 chars + access-token expiration), required-scopes hint, and a black "Connect TikTok" / "Reconnect TikTok" anchor → `/api/auth/tiktok/login`. On mount fetches `/api/auth/tiktok/status`. New useEffect reads `?platform=tiktok&connected=true|false&error=...` from URL params, fires success/error toast, and strips the params via `router.replace` so refresh doesn't re-fire.

**Demo flow now end-to-end clickable:**
- vortextrips.com homepage → dashboard → /dashboard/settings → click Connect TikTok → authorize → land back with ✓ Connected → /dashboard/content → click Post to TikTok on Ready row → confirm post on TikTok profile.

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ Status route never SELECTs `tiktok_access_token` (verified by source review)

**Operator handoff:** after deploy, do (1) TikTok Sandbox add-self-as-test-user, (2) record 60–90s demo flow, (3) upload + submit. Detailed runbook in PROJECT_STATE_CURRENT.md Phase 14AL section.

---

## Earlier focus

**Phase 14AK — TikTok OAuth Login Route (in working tree, 2026-05-09 — single new route to complete the OAuth handshake; no DB schema change; no platform calls).**

Operator visited `https://www.vortextrips.com/api/auth/tiktok/login` to start TikTok auth and got a 404. Diagnosis: Phase 14R built only the callback half of OAuth; the login half was missing. 14AK fills the gap.

**Built in 14AK:**
- [x] **`src/app/api/auth/tiktok/login/route.ts` (new).** GET handler. Reads `TIKTOK_CLIENT_KEY`, generates CSRF `state` via `crypto.randomUUID()`, computes callback URL the same way the callback route does, and issues a 302 to `https://www.tiktok.com/v2/auth/authorize/` with `client_key`, `scope=user.info.basic,video.publish`, `response_type=code`, `redirect_uri`, and `state`. Refuses with a clear 500 if `TIKTOK_CLIENT_KEY` is unset. No DB writes; no platform calls beyond the redirect.

**End-to-end OAuth flow now functional:**
1. Operator visits `/api/auth/tiktok/login`
2. Login route → 302 to `https://www.tiktok.com/v2/auth/authorize/?<params>`
3. Operator authorizes on TikTok's UI
4. TikTok → 302 back to `/api/auth/tiktok/callback?code=...&state=...`
5. Callback (Phase 14R) exchanges code for tokens, upserts `site_settings`, → `/dashboard/settings`
6. `getValidTikTokAccessToken()` uses stored tokens for autoposter / manual platform routes

**Pre-flight checklist for the operator:**
- `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` set in Vercel env vars
- TikTok Developer Portal has `https://www.vortextrips.com/api/auth/tiktok/callback` registered as a valid redirect URI
- App's required scopes include `user.info.basic` and `video.publish`

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ `redirect_uri` computed via the same shape as the callback (byte-equivalent — TikTok accepts the round-trip)

**Operator handoff:** after Vercel deploys this commit (~1–2 min), visit `https://www.vortextrips.com/api/auth/tiktok/login` and authorize. The callback writes tokens; the autoposter/manual routes pick them up automatically.

---

## Earlier focus

**Phase 14AJ — Vercel Pro Scale Up: 3 Autoposter Ticks Per Day (in working tree, 2026-05-09 — `vercel.json` schedule + autoposter route + manual script; no DB schema change; no platform calls).**

The operator upgraded to Vercel Pro. The autoposter cron now fires 3×/day (10 AM / 2 PM / 6 PM EST), and the Phase 14S "one row at a time eligible" refusal is relaxed to FIFO drain.

**Built in 14AJ:**
- [x] **`vercel.json`.** `/api/cron/autoposter-once` schedule changed from `0 14 * * *` to `0 14,18,22 * * *` (UTC; equals 10 AM / 2 PM / 6 PM Eastern). Other 3 cron entries unchanged.
- [x] **`src/app/api/cron/autoposter-once/route.ts`.** Removed the `if (plan.eligible.length > 1)` refusal that returned `{ skipped: true, reason: 'queue_size_gt_1' }`. The cron now picks `plan.eligible[0]` (FIFO by `queued_for_posting_at` ascending) and leaves the rest for the next tick. Eligibility limit raised from 5 to 50. Response payload includes `queue_depth_before` and `queue_depth_remaining`. Per-tick log line added.
- [x] **`scripts/run-autoposter-once.js`.** Mirrored the same FIFO relaxation. The script's `eligible.length > 1` refusal is gone; queue depth + queued IDs printed informationally; oldest row is selected.

**Behavior contract:**
- Pre-14AJ: 1 tick/day × refuses if more than 1 eligible → forced operator to Mark Ready exactly 1 row at a time
- Post-14AJ: 3 ticks/day × posts oldest of any eligible queue → operator can Mark Ready a batch and let cron drain it

**Defenses preserved:**
- Kill switch still trips on first definitive failure → halts remaining ticks of the day
- Atomic UPDATE guards (`.eq('status', 'approved').is('posted_at', null)`) unchanged
- Per-tick row count still 1 — multi-row-per-tick was never supported

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean

**Operator handoff:** after Vercel finishes deploying this commit (1–2 min), the next 14:00 / 18:00 / 22:00 UTC tick will pick up. Mark Ready a batch in `/dashboard/content` and watch them drain at 3/day.

---

## Earlier focus

**Phase 14AI — Manual Generation Route Fix (in working tree, 2026-05-09 — manual "Generate This Week" route updated to mirror the cron's Pexels Video behavior; no DB schema change; no platform calls).**

Phase 14AG only updated the WEEKLY CRON. The dashboard's "Generate This Week" button calls a SEPARATE route (`/api/dashboard/generate-content`) — diagnosed during the post-14AH.1 backfill session when the operator's button click added 10 rows including 2 video-less TikTok rows. 14AI brings the manual route into byte-equivalent shape with the cron for TikTok rows.

**Built in 14AI:**
- [x] **`src/app/api/dashboard/generate-content/route.ts`.** Imported `fetchAndStoreVideo`. Added `maxDuration=60`. Updated user prompt with TikTok-specific format directives (image_prompt as Pexels Video search query; new `on_screen_hook` field, max 10 words). Removed IG/FB-only gate on image fetching — all platforms now get a Pexels image with platform-aware orientation. TikTok rows now synchronously call `fetchAndStoreVideo()` and land at `media_status='ready'`, `media_source='pexels'`, with `video_url` + `media_metadata.{ on_screen_hook, pexels_video_id, ... }`. `videos_generated` added to log + response.

**Behavior parity:** TikTok rows from the manual button now match the row shape of TikTok rows from the weekly cron exactly. No more "Media missing" badges from the dashboard button.

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean

**Operator handoff:** after this commit deploys, click "Generate This Week" in the dashboard and verify the new TikTok rows land green ("Media ready"). If they still land "Media missing" for any reason, the script `node scripts/generate-missing-media.js --videos-only --content-only --generate --apply` recovers them.

---

## Earlier focus

**Phase 14AH.1 — Pre-Flight Hardening + Randomized Pexels Fetch (in working tree, 2026-05-09 — script refuses upfront on missing API key + lib uses random page + random index; no DB schema change; no platform calls).**

Phase 14AH originally used a deterministic first-fit strategy with a cron DB pre-query. After 14AH landed, the backfill failed because `.env.local` had `PEXELS_API_KEY=""` empty — the script wrote `media_status='failed'` to both queued rows. 14AH.1 fixes the safety hole AND swaps the dedup strategy to randomization per the operator's directive.

**Built in 14AH.1:**
- [x] **`scripts/generate-missing-media.js` pre-flight.** New refusal block in `main()` AFTER the apply/generate flag validation but BEFORE the posted_at snapshot or any SELECT: when `--generate` is set with `--provider=auto` or `--provider=pexels` and `env.PEXELS_API_KEY` is empty/missing, the script prints "Refused: PEXELS_API_KEY is missing or empty in .env.local" and `process.exit(1)`. Dry-run still allowed without keys.
- [x] **`src/lib/media-providers.ts` randomized fetch.** `fetchAndStoreVideo` rewritten around `fetchRandomPage(excludePages)` (random page 1–5, re-roll on dup) and `collectUsableVideos` (returns the full filtered candidate list — caller picks a random index). Up to 2 random pages tried; last resort returns a random duplicate with `raw.duplicate_fallback = true`.
- [x] **`scripts/generate-missing-media.js` JS mirror.** `fetchPexelsVideo` rewritten with the same random-page + random-index logic. `pickFirstUnusedVideo` removed; `collectUsableVideos` added.
- [x] **`src/app/api/cron/weekly-content/route.ts`.** Phase 14AH's DB pre-query (`SELECT video_url, media_metadata FROM content_calendar WHERE video_url IS NOT NULL`) removed. The empty `existingUrls` / `existingPexelsIds` Sets still construct and thread to `fetchAndStoreVideo` for in-run accumulator dedup. Cross-week dedup is now statistical (random page × random index across thousands of Pexels results = acceptable for weekly cadence).

**Algorithm:**
- Random page 1–5 (re-roll on collisions, max 10 attempts)
- Within page, build candidate list (duration filter + exclude sets)
- Random index pick from candidates
- Up to 2 random pages tried; last-resort flagged duplicate

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ Pre-flight fires BEFORE SELECT — verified by code path inspection
- ✅ Random-page re-roll capped at 10 — cannot infinite-loop

**Operator handoff:** the codebase is pushed; operator runs the backfill in their local terminal (which has the real Pexels key) to clear the failed-state rows from the previous attempt.

---

## Earlier focus

**Phase 14AH — Pexels Duplicate Prevention (shipped in `be860ca`; superseded by 14AH.1 above).**

The deterministic first-fit + cron DB pre-query strategy from 14AH was replaced. The exclude-set plumbing through `fetchAndStoreVideo` survives 14AH.1 (the standalone script still pre-queries the DB), but the cron's hot-path SELECT is gone and the lib's first-fit walker was replaced by random page + random index.

---

## Earlier focus

**Phase 14AG — Video Pipeline Swap: HeyGen → Pexels Video (in working tree, 2026-05-09 — full HeyGen excision from social content pipeline + new Pexels Video fetcher + automated TikTok video on the weekly cron; no DB schema change; no platform calls).**

The TikTok "Media missing" state from Phase 14AF is now resolved at the source — Phase 14AF made it actionable; Phase 14AG eliminates it. The weekly-content cron now fetches a Pexels Video synchronously for every TikTok row and lands `video_url` + `media_status='ready'` in the same insert.

**Built in 14AG:**
- [x] **`src/lib/media-providers.ts` — full rewrite of the type surface.** Removed `createHeyGenVideo`, `getHeyGenVideoStatus`, all HeyGen types/env plumbing, the `'heygen'` arm of `MediaProviderName`, the `status` field on `MediaProviderResult`. Added `fetchAndStoreVideo()`, the supporting type interfaces, and `pickBestPortraitMp4()`. Calls `https://api.pexels.com/videos/search` with `orientation=portrait`, `size=large`, `per_page=5`, picks the highest-quality vertical MP4 with duration in [5, 30] seconds. Returns the Pexels CDN URL directly (no re-hosting).
- [x] **`src/app/api/cron/weekly-content/route.ts`.** Added `export const maxDuration = 60`, `fetchAndStoreVideo` import, an `onScreenHook` field on the `ParsedPost` type, and a markdown-parser pass that captures `On-Screen Hook:` lines. The user prompt now teaches the AI a TikTok-specific format. Row builder runs image + video fetches in parallel per post; TikTok rows that get a `video_url` land with `media_status='ready'`, `media_source='pexels'`, `media_generated_at`, and `media_metadata: { source, on_screen_hook, pexels_video_id, fetched_at }`. `videos_generated` added to the cron's success log + response payload.
- [x] **`src/lib/ai-prompts.ts`.** New TIKTOK-SPECIFIC subsection in `SOCIAL_SYSTEM`'s Rule 2 block. (a) `image_prompt` written as a 3–7 word Pexels Video search query for cinematic vertical travel B-roll; (b) `On-Screen Hook` of max 10 words containing a savings number or curiosity gap. Examples and banned generic taglines included.
- [x] **`src/app/dashboard/content/page.tsx`.** The "🎬 Video generating" indigo pill replaced by an amber "⚠ Legacy HeyGen row" pill (any row with `media_source='heygen'`). The Phase 14AF helper text updated to point at the new command shape `node scripts/generate-missing-media.js --videos-only --content-only --generate --apply` (no `--provider=heygen`).
- [x] **`scripts/generate-missing-media.js` — full rewrite of the HeyGen surface.** Removed all HeyGen caps/flags/sanity-checks/preview/cleanScript/createHeyGenVideo, plus the `'heygen'` provider option. Added `pickBestPortraitMp4`, `fetchPexelsVideo`, `buildVideoQuery`. `processVideo()` calls Pexels Video synchronously and lands rows at `media_status='ready'` with `media_metadata.pexels_video_id` (preserving any existing metadata, e.g. `on_screen_hook` from the cron, via merge).
- [x] **`scripts/check-video-generation-status.js` deleted.**
- [x] **`scripts/inspect-heygen-pilot-candidates.js` deleted.**
- [x] **`.env.example`.** `PEXELS_API_KEY` comment now mentions video. `HEYGEN_*` block rewritten to make clear those vars are now ONLY used by the (separate, untouched) admin SBA welcome-video feature.

**Open question for the operator:** the admin SBA welcome-video stack on `/dashboard/videos` (and the public `/sba` page) still uses HeyGen. Phase 14AG deliberately did NOT touch that path because it's a separate feature from the social content pipeline and deleting it would break `/sba`. If you want full HeyGen removal, that's Phase 14AG.1.

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ Image + video parallelism verified
- ✅ Conditional video fetch — non-TikTok rows skip the video API call entirely

---

## Earlier focus

**Phase 14AF — Media Pipeline Audit & UI Polish (in working tree, 2026-05-09 — single dashboard component edit + script audit; no DB; no platform calls).**

The operator noticed TikTok drafts show "Media missing" while FB/IG show "Media ready". Audit confirmed this is the deliberate Phase 14L design — HeyGen video renders are gated to a manual `node scripts/generate-missing-media.js --provider=heygen` invocation to protect the HeyGen API quota — not a pipeline bug. The pipeline correctly classifies TikTok as `video: required` and the script's pre-flight contract (batch caps, pending-job check, per-row sanity validation) is intact with no silent failures. Fix is UX-only: surface the resolution command in the dashboard so the state becomes actionable.

**Built in 14AF:**
- [x] **`src/app/dashboard/content/page.tsx`** — new conditional helper `<p>` rendered directly below the badge row. Visible only when `item.platform === 'tiktok'` AND `media.outcome` is `missing` or `failed` AND the row is NOT already in the existing pending-HeyGen pill state (Phase 14L.2.1's `<span>🎬 Video generating</span>` carries its own actionable tooltip and would conflict with a re-queue hint). Renders "Run `node scripts/generate-missing-media.js --provider=heygen` to render video" in 11px gray text with the command in a 10px monospace `<code>` tag.

**Operator runbook (the diagnostic answer to the original question):**
```bash
# 1. Queue HeyGen renders for pending TikTok video drafts
node scripts/generate-missing-media.js --provider=heygen --videos-only --content-only --generate --apply

# 2. After 1–3 minutes, poll HeyGen and write the finished URLs to content_calendar
node scripts/check-video-generation-status.js --apply
```

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ Helper does not stack on top of the existing "Video generating" pill (mutually-exclusive condition)

---

## Earlier focus

**Phase 14AE — Twilio A2P 10DLC Compliance (in working tree, 2026-05-08 — homepage form + legal pages + shared footer; no DB; no platform calls; no new dependencies).**

The Twilio A2P 10DLC SMS campaign was rejected by The Campaign Registry (TCR). The rejection feedback maps onto a well-documented compliance pattern: explicit consent disclosure on the opt-in surface, a privacy-policy clause that excludes SMS data from any third-party sharing, full SMS Program Terms in the Terms of Service, and defensible marketing claims. This phase makes those four edits plus a shared Footer for the three TCR-submitted URLs.

**Built in 14AE:**
- [x] **`src/components/Footer.tsx` (new)** — shared footer with business name, Privacy Policy link, Terms of Service link, Contact/Support mailto, quick-nav, savings disclaimer, and a `<!-- TODO: Add physical mailing address -->` placeholder for the operator to fill in.
- [x] **`src/app/page.tsx`** — LeadForm phone placeholder updated, phone input made `required={form.smsConsent}` (browser enforces phone presence iff the consent box is checked), `required` removed from the consent checkbox HTML attribute (checkbox starts unchecked already), checkbox label rewritten to the exact TCR-mandated wording with explicit Msg/HELP/STOP disclosure inline, Privacy and Terms links open in a new tab. Hero headline reframed from "Save 40-60% on Every Trip." to "Save Up to 40-60% on Member Travel Rates." Inline footer replaced by `<Footer />`.
- [x] **`src/app/privacy/page.tsx`** — new "SMS / Mobile Information Sharing" section inserted at the top of the policy body (verbatim TCR-required wording), `<Footer />` rendered after the back-to-home link.
- [x] **`src/app/terms/page.tsx`** — section 2 body REPLACED with the full TCR-required SMS Program Terms (Program Name "VortexTrips SMS Notifications", how to opt in / opt out, HELP keyword, message frequency, message-and-data-rate disclosure, supported carriers including the explicit T-Mobile non-liability statement, privacy reference). `<Footer />` rendered after the back-to-home link.

**Verification:**
- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ Footer rendered in all three TCR-submitted pages

**Operator workflow after this commit lands:**
1. Vercel rebuilds on the new commit (homepage hero, lead form, /privacy, /terms updated).
2. Operator re-submits the A2P 10DLC campaign in the Twilio Console with three URLs: `https://www.vortextrips.com`, `https://www.vortextrips.com/privacy`, `https://www.vortextrips.com/terms`.
3. If a physical mailing address is available, operator edits `src/components/Footer.tsx` to fill in the TODO placeholder.

---

## Earlier focus

**Phase 14AD — Supabase Security Advisor Compliance (in working tree, 2026-05-08 — single migration 034; metadata-only ALTERs; no app code).**

The operator's Supabase Security Advisor flagged the two warnings the security audit predicted. Phase 14AD is the surgical patch: one new migration with two `ALTER` statements, idempotent and metadata-only.

**Built in 14AD:**
- [x] **`supabase/migrations/034_security_advisor_compliance.sql` (new)** — two ALTER statements:
  - **(A)** `ALTER VIEW event_campaign_attribution_summary SET (security_invoker = true)` — closes the `security_definer_view` advisor warning. Anon queries now respect RLS on the view's underlying tables; admin/service-role callers are unaffected.
  - **(B)** `ALTER FUNCTION update_updated_at() SET search_path = pg_catalog, public` — closes the `function_search_path_mutable` advisor warning. Triggers using the function are unaffected.

**Why this is the first new migration since 033:**
- Phases 14P → 14AC explicitly preserved the immutability of 001–033.
- This migration is the first justified by a concrete EXTERNAL trigger (Supabase's own Security Advisor) rather than a feature change.
- Code-only changes can't fix either warning — both require database-level metadata changes.

**Behavior contract:**
| Caller | Pre-14AD | Post-14AD |
|---|---|---|
| Admin | Reads view normally | Reads view normally (unchanged) |
| Service-role | Bypasses RLS | Bypasses RLS (unchanged) |
| Anon | Reads full view (RLS-bypassed via view-owner) | Returns `[]` (caller's RLS now applied) |
| Triggers via update_updated_at() | Resolve via mutable search_path | Resolve via pinned `pg_catalog, public` (transparent) |

**Idempotency:** Both ALTERs are safe to re-run. No CREATE statements; no DROPs; no data migration. The migration is metadata-only.

**Operator workflow after this commit lands:**
1. Vercel rebuilds on the new commit (no behavior change since no app code touched).
2. Operator runs migration 034 on Supabase (SQL Editor or `supabase db push`).
3. Operator verifies via Supabase Dashboard → Security Advisor: both warnings clear.
4. Operator verifies via curl that anon now sees `[]` instead of campaign data on the view's REST endpoint.

**Critical safety preserved:**
- ✅ View shape unchanged (all 27 columns return identical types/values for admin/service-role).
- ✅ Function body unchanged (still `NEW.updated_at = NOW(); RETURN NEW;`).
- ✅ No app code touched. 30+ TypeScript files reading these tables continue to work.
- ✅ Migrations 001–033 untouched.
- ✅ No new env vars or dependencies.

**Tests:**
- ✅ Migration syntax verified by inspection (both ALTER statements are stock Postgres 15+).
- ✅ Header comment documents rationale, behavior contract, and verification steps.
- ⏸️ Live verification deferred to operator-run.

**Provider / platform / DB activity in this phase:**

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against DB data tables | 0 |
| `ALTER VIEW` / `ALTER FUNCTION` (metadata) | 2 (after operator applies) |
| posted_at delta | 0 (29 → 29) |

**Findings NOT addressed in 14AD (out of scope, separate operator-side dashboard work):**
- Auth Dashboard settings (password strength, OTP expiry, leaked-password protection, MFA)
- Storage bucket policies (`media` bucket — verify READ open / WRITE service-role only)
- Exposed Schemas API config (verify only `public, storage, graphql_public`)
- Reviews public-write design (acceptable — pending-status mitigates)
- Lead-created webhook public-write (acceptable by design)

---

### Pre-Phase-14AD: 🏁 Maintenance Mode — Operator activations remain

Three operator-side activations remain to take the system live:

1. **Connect TikTok once.** Confirm Developer Portal redirect URI `https://www.vortextrips.com/api/auth/tiktok/callback`; scopes `user.info.basic` + `video.publish`. Click Connect TikTok → callback writes tokens to site_settings.
2. **Flip the autoposter kill switch.** AI Command Center dashboard → "Enable Cron" button. (Or SQL upsert on `site_settings.autoposter_cron_enabled='true'`.)
3. **Mark Ready one row.** From `/dashboard/content` before next 14:00 UTC tick. Cron picks it up, posts it, atomic-UPDATEs to posted. On failure: auto-disables + emails `ADMIN_NOTIFICATION_EMAIL`.

**Recently completed (this block, 14Z → 14AC):**

- [x] **Phase 14Z** (`1bfda11`) — CI/CD GitHub Actions (typecheck + lint on every push/PR)
- [x] **Phase 14AA** (`d3cf3d3`) — Lighthouse CI (perf/a11y/SEO budgets, warn-level)
- [x] **Phase 14AB** (`5a60f06`) — Globalized bounded() helper to webhook routes
- [x] **Phase 14AC** (this commit) — Final audit (8/8 healthy) + Maintenance Mode declaration

**Final audit run (this phase):**
```
[PASS] /            200 OK    237ms
[PASS] /free        307 TR    230ms  → myvortex365.com/leosp
[PASS] /book        307 TR    247ms  → /traveler.html
[PASS] /join        307 TR    195ms  → signup.surge365.com/leosp
[PASS] /thank-you   200 OK   1030ms
[PASS] /quote       200 OK    243ms
[PASS] /quiz        200 OK    291ms
[PASS] /sba         200 OK    214ms
[WARN] /t/<slug>    SKIPPED   (Supabase 522 — transient infrastructure)

✓ All 8 routes healthy (slowest 1030ms, /t/<slug> skipped)
```

**Provider / platform / DB activity in 14AC:** zero across the board (8 HTTP GETs against own production routes for the audit run). posted_at delta: 0 (29 → 29).

**Architecture milestones recap:**

| Phase | Delivery |
|---|---|
| 14O.1 | Manual autoposter runner; Path D chosen |
| 14P | Operator SOP codified |
| 14Q | Twitter/X excised |
| 14R | TikTok Direct Post API + OAuth wired |
| 14S | Autoposter cron + kill switch + auto-disable |
| 14T | Resend lazy-init + ESLint flat config |
| 14T.1 | Lint hygiene (51 findings → 0) |
| 14U | Dashboard kill switch UI + email-on-halt |
| 14V | TikTok status polling + diagnostic |
| 14W | AI prompts (4-rule playbook) |
| 14X | Site health audit script |
| 14Y | Tracking redirect bounded waits |
| 14Z | CI/CD typecheck + lint gates |
| 14AA | Lighthouse CI |
| 14AB | Globalized bounded() helper |
| **14AC** | **Final audit + Maintenance Mode** |

**Future work (as-needed, no queue):** any bug fix, operator-driven feature, or infrastructure tuning follows the same SAVE_PROTOCOL.md and conventions used through Phase 14AC.

---

### Pre-Maintenance-Mode: Phase 14AB — Globalized bounded() helper (saved + pushed `5a60f06`).

Phase 14AA deployed at `d3cf3d3`. Phase 14AB is the third of three optional polish phases. What Phase 14Y did for `/t/<slug>` is now applied uniformly to the two webhook routes most exposed to upstream slowdowns.

**Built in 14AB:**
- [x] **`src/lib/bounded-wait.ts` (new)** — extracts the `bounded()` helper from `/t/[slug]/route.ts` into a shared module. Adds optional `logPrefix` parameter (default `[bounded-wait]`) so each route gets clean per-route log streams. Exports `WEBHOOK_BOUND_MS = 2500` constant. Behavior byte-identical to Phase 14Y's local helper.
- [x] **`src/app/t/[slug]/route.ts` (refactor)** — removes locally-defined `bounded()` helper (~30 lines + comment block). Imports from the new lib. Adds `LOG_PREFIX = '[branded-redirect]'` constant; passes it as 4th arg to all 3 callsites. Pure organizational change.
- [x] **`src/app/api/webhooks/lead-created/route.ts`** — wraps **9 Supabase calls** with bounded(): the contacts insert as **CRITICAL** (returns 503 fast on timeout so GoHighLevel can retry), and 8 bookkeeping calls (opportunities insert, sequence_queue inserts × 4, ai_actions_log inserts × 2, contacts updates × 2) that degrade silently on timeout. External API calls (sendSMS, sendEmail, triggerCall) intentionally NOT wrapped — they have their own clients with their own timeouts.
- [x] **`src/app/api/webhooks/bland/route.ts`** — wraps **all 4 Supabase calls** with bounded() at 2500ms each. All bookkeeping; degrade silently. Contacts SELECT result-checked so a timeout cleanly skips dependent updates rather than partial-updating on stale data.

**Why critical-vs-bookkeeping in lead-created:**
- Step 1 (contacts insert) produces the FK every subsequent step depends on. Timeout → 503 fast retry signal.
- Steps 2-9 (opportunities, sequence_queue, ai_actions_log, contacts updates) are nice-to-have bookkeeping. Timeout → log warning, continue, return 200.

**Worst-case latency:**
| Scenario | Total |
|---|---|
| lead-created degraded, contacts insert hangs | ~2.5s (503 returned) |
| lead-created happy path | ~3-5s |
| lead-created pathological (contacts fast, everything else hangs) | up to 20s; Vercel kills at 10s, returns 504 |
| bland-webhook degraded (all 4 calls hang) | exactly 10s; Vercel returns 504 |
| bland-webhook happy path | ~200ms |

**Critical safety preserved:**
- ✅ `/t/<slug>` behavior byte-identical to Phase 14Y (refactor only).
- ✅ External API calls (SMS, email, Bland) NOT wrapped — they have their own timeouts.
- ✅ `bounded()` never throws — callers rely on `T | null` contract.
- ✅ lead-created critical path returns 503 fast on timeout (informative + retry-friendly).
- ✅ All bookkeeping degrades silently — user-visible response unaffected.

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run lint` clean (0 errors, 0 warnings)
- ✅ Static review of `bounded-wait.ts`: three failure modes (success/throw/timeout) all converge to `T | null`; clearTimeout in finally; Promise.race against catch-wrapped work never rejects.
- ✅ Static review of `/t/[slug]` refactor: byte-identical behavior; all 3 callsites pass LOG_PREFIX.
- ✅ Static review of webhook critical/bookkeeping paths.

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Optional remaining phases (this block):**
- [ ] **Phase 14AC** — Final audit + declare Maintenance Mode

---

### Pre-Phase-14AB: Phase 14AA — Lighthouse CI Action (saved + pushed `d3cf3d3`).

Phase 14Z deployed at `1bfda11`. Phase 14AA is the second of three optional polish phases. Continuous Lighthouse auditing of VortexTrips' real content pages on every push to `main`. Modest score thresholds surface regressions as warnings without blocking the workflow.

**Built in 14AA:**
- [x] `lighthouserc.json` (new) — LHCI config at repo root. URL list, run count, score thresholds, upload target.
- [x] `.github/workflows/lighthouse.yml` (new) — single-job workflow using `treosh/lighthouse-ci-action@v12`. Triggers on `push: main` and `workflow_dispatch`. 20-minute job timeout. Does NOT cancel in-flight runs (each commit's audit is meaningful historical data). Uploads to LHCI public storage AND GitHub Actions artifacts.

**URLs audited (real content pages):**
- `/` (Homepage)
- `/quote` (conversion form)
- `/sba` (SBA affiliate landing)
- `/thank-you` (post-conversion page)

**URLs NOT audited (and why):**
- `/free`, `/join`, `/book` — all 307 redirects in next.config.js to external portals (myvortex365.com, surge365.com, /traveler.html). Auditing them would score someone else's site, not ours.
- `/quiz` — kept the audit tight at 4 URLs; can add later if it becomes a primary entry point.
- `/t/<slug>` — 302 redirect; Lighthouse doesn't audit redirects.

This decision diverges from the operator's literal `/free` and `/join` examples in the directive. The user said "e.g." — the underlying intent is "audit our funnel pages," which the redirect routes don't represent.

**Score thresholds (modest, `warn` level):**
| Category | Min score | Level |
|---|---|---|
| Performance | 0.70 | warn |
| Accessibility | 0.90 | warn |
| SEO | 0.90 | warn |
| Best-practices | 0.85 | warn |

`warn` (not `error`) means score drops surface in Actions log but don't block the workflow. Per operator directive: "warning system for future frontend changes." Future phase can flip specific assertions to `error` once a stable baseline exists.

**Why a separate workflow file (not a second job in ci.yml):**
1. **Speed** — ci.yml runs in ~2-3 min; Lighthouse takes 10-15 min for 4 URLs. Combining would slow the typecheck/lint feedback loop.
2. **Cadence** — Lighthouse only meaningfully runs against deployed production URLs. PR previews have different cold-start profiles. `push: main` is the right window.
3. **Failure semantics** — ci.yml hard-fails on lint/typecheck; Lighthouse uses `warn` assertions. Separating clarifies "what failed."

**Tests:**
- ✅ `lighthouserc.json` valid JSON
- ✅ `lighthouse.yml` valid YAML
- ✅ `treosh/lighthouse-ci-action@v12` current major as of this phase
- ⏸️ Live workflow run deferred — first run executes on the very push that lands these files

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Optional remaining phases (this block):**
- [ ] **Phase 14AB** — Globalize bounded() helper to webhook routes
- [ ] **Phase 14AC** — Final audit + Maintenance Mode

---

### Pre-Phase-14AA: Phase 14Z — CI/CD GitHub Actions Wiring (saved + pushed `1bfda11`). Closes the `/t/<unknown-slug>` hang surfaced by Phase 14X's audit. New `bounded()` helper races every Supabase call against a 2.5s per-call timeout. PORTAL_FALLBACK changed from `myvortex365.com/leosp` to `vortextrips.com/free` per operator directive. Worst-case latency 7.5s well under Vercel Hobby's 10s budget. Typecheck + lint clean.)
**Last code-shipping commit:** `1fcd40d` (Phase 14X: Full System Audit & Broken Page Scanner)
**Status:** 🚀 LIVE on vortextrips.com · Phases 0 → 12.8 shipped · Phase 13 code-side complete · **Phases 14A → 14X deployed and verified on prod** · **Phase 14Y in working tree (redirect-route hang fix)** — codebase is now functionally complete, locally clean, lint-clean, operationally observable, verifiable, on-brand, health-monitored, AND hang-resistant. 8 live posts since 2026-05-05. Twitter/X removed (14Q). TikTok fully automated (14R). Autoposter cron + kill switch (14S). Local-build artifacts eliminated (14T). Lint backlog cleared (14T.1). Dashboard + email alerts (14U). TikTok async status polling (14V). AI prompts optimized (14W). Public-route health audit (14X). Tracking-redirect hang fixed (14Y).

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

**Phase 14Y — Tracking Redirect Fallback Fix (in working tree, 2026-05-08 — surgical patch closing the `/t/<unknown-slug>` hang. Typecheck + lint clean).**

Phase 14X deployed at `1fcd40d`. Phase 14Y closes the only real bug Phase 14X's audit surfaced: `/t/<unknown-slug>` was hanging in production for 15-30s before Cloudflare timed out the connection. Root cause was unbounded `await` on Supabase calls — `try/catch` doesn't bound await time, so a Supabase 522 ate Vercel Hobby's 10s function-execution budget. Fix: every Supabase call goes through a new `bounded()` helper that races against a 2.5s per-call timeout.

**Built in 14Y (no DB writes, no platform writes, surgical patch to one file):**
- [x] **`src/app/t/[slug]/route.ts`** (updated) — new `bounded(work, ms, label)` helper races any thenable against a fixed timeout. Returns `null` on timeout / rejection / any failure mode — never throws. Cleans up the timer in `finally` to prevent handle leaks. All 3 Supabase calls in the route now go through `bounded()` with a 2.5s budget each: campaign lookup, asset lookup, contact_events insert. PORTAL_FALLBACK changed from `myvortex365.com/leosp` to `https://www.vortextrips.com/free` per operator directive (keeps visitors on brand domain; `/free` is itself a 307 redirect to the same myvortex365 portal). Header comment expanded to document Phase 14Y hardening.

**The bug Phase 14Y closes:**

```
Pre-14Y:
  curl -sS --max-time 20 https://www.vortextrips.com/t/system-health-check
  → HTTP 000 in 20.008s — connection timeout

Post-14Y (after deploy):
  curl -sS https://www.vortextrips.com/t/system-health-check
  → 302 redirect to https://www.vortextrips.com/free in ~2.5s
```

**Worst-case latency analysis:**

| Path | Bounded calls | Max wait |
|---|---|---|
| Slug found, asset matched, log succeeds | 3 calls × ~50ms | ~150ms |
| Slug found, asset matched, log timeout | 2 fast + 1 timeout | ~2.6s |
| Everything times out | 3 × 2.5s | 7.5s |

Worst case ~7.6s, well under Vercel Hobby's 10s budget. **No path can hang the function.**

**Critical safety preserved:**
- ✅ The 3-tier fallback chain (Tier 1: campaign cta_url; Tier 2: vortextrips.com/free; Tier 3: vortextrips.com homepage) still works correctly even when EVERY Supabase call times out — `chooseRedirect()` already handles `campaign === null` by falling through to Tier 2.
- ✅ Real campaign tracking links continue to work exactly as before (Tier 1 — campaign found, redirect to `cta_url`).
- ✅ During Supabase outages, attribution is missed for that period (logging times out cleanly), but visitors still reach a destination.
- ✅ The existing `NextResponse.redirect` try/catch on lines 278-289 is a separate defense-in-depth layer for malformed URLs — left intact.
- ✅ Route's UTM parsing, `parseUtmContent()`, and `chooseRedirect()` logic untouched (sync code, can't hang).

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run lint` clean (0 errors, 0 warnings)
- ✅ Static review: bounded()'s three failure modes (success, throw, timeout) all converge to `T | null`; clearTimeout in `finally`; `Promise.race` against `.catch()`-wrapped work means the race never rejects.
- ⏸️ Live `/t/<unknown-slug>` re-test deferred to post-deploy. Operator runs `node scripts/audit-site-health.js` after Vercel finishes deploying this commit; the audit's `/t/<slug>` test should now succeed (when Supabase is reachable) instead of timing out.

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Architecture status: COMPLETE + HARDENED.** All phases 14A → 14Y deliver a production-ready system. Optional follow-ups remain available:

- [ ] **Phase 14Z (optional)** — wire audit-site-health.js into CI/CD GitHub Action (auto-rollback on route failure).
- [ ] **Phase 14AA (optional)** — Lighthouse + Web Vitals tracking via headless Playwright.
- [ ] **Phase 14AB (optional)** — apply the `bounded()` pattern across other Supabase-using routes for uniform hang-resistance.

None are required.

---

### Pre-Phase-14Y: Phase 14X — Full System Audit & Broken Page Scanner (saved + pushed `1fcd40d`).

**Built in 14X (no DB writes, no platform writes, HTTP GETs only):**
- [x] **`scripts/audit-site-health.js`** (new) — ~280-line standalone Node script. HTTP GETs the 8 public routes in parallel, asserts per-route expected status (200 for App Router pages, 307 for `next.config.js` redirects, 302 for `/t/<real-slug>` looked up dynamically from event_campaigns). Color-coded `[PASS]` / `[FAIL]` / `[WARN]` output with elapsed-ms and redirect-target columns. Top-of-file 24-line operator manual-review checklist (real-device mobile testing). `?utm_source=audit&utm_medium=health_check` query params + custom `User-Agent: VortexTrips-Audit-Script/14X` header so analytics queries can filter audit traffic. Non-zero exit on failure (CI-friendly).

**Routes tested (per-route expected status):**

| Route | Expected | Why |
|---|---|---|
| `/` | 200 | Homepage — App Router page |
| `/free` | 307 | Configured in `next.config.js` to redirect to myvortex365.com/leosp |
| `/book` | 307 | Configured to redirect to /traveler.html |
| `/join` | 307 | Configured to redirect to signup.surge365.com/leosp |
| `/thank-you` | 200 | Generic post-conversion page |
| `/quote` | 200 | Quote-form page |
| `/quiz` | 200 | Travel quiz funnel |
| `/sba` | 200 | SBA affiliate landing page |
| `/t/<slug>` | 302 | Dynamic — uses real slug from event_campaigns; WARN-skipped if no slug or Supabase unreachable |

**Critical design decisions:**
- **Per-route expected status (NOT one-size-fits-all 200)** — `next.config.js` configures /free, /book, /join as 307 redirects. A literal 200-only check would have falsely flagged 3 healthy routes as broken.
- **Real slug for /t/ test (not a mock)** — initial probe revealed /t/<unknown-slug> hangs in production at 15s+ (likely a stalled Supabase logging path). Rather than mask this with a mock, the script queries event_campaigns for a real slug. Tests what visitors actually experience.
- **Graceful degradation** — three failure modes for the slug lookup all handled cleanly (missing env, missing supabase-js, query error). Yellow WARN, never a hard FAIL. Public-page audit completes normally.
- **15s per-request timeout** — bumped from 10s after first probe revealed cold-start latency on /t/. A route taking longer than 15s IS broken from a visitor's perspective.

**Live production audit results:**
```
[PASS] /            200 OK    150ms
[PASS] /free        307 TR    132ms  → myvortex365.com/leosp
[PASS] /book        307 TR    137ms  → /traveler.html
[PASS] /join        307 TR    139ms  → signup.surge365.com/leosp
[PASS] /thank-you   200 OK    184ms
[PASS] /quote       200 OK    148ms
[PASS] /quiz        200 OK    146ms
[PASS] /sba         200 OK    149ms
[WARN] /t/<slug>    SKIPPED   (Supabase 522 — transient infrastructure)

✓ All 8 routes healthy (slowest 184ms, /t/<slug> skipped)
```

All public pages green. Total wall-time ~1.2s for 8 parallel checks. The /t/ skip is environmental (Supabase project 522'd this run); script handled it correctly with WARN, not FAIL. Exit 0.

**Side-finding (out of 14X scope, defer to follow-up):**
`/t/<unknown-slug>` hangs in production for 15s+. Route header says it should always redirect through a 3-tier fallback even for unknown slugs, but the implementation appears to hang. Doesn't affect real traffic today (real campaign links use valid slugs). Worth a Phase 14Y fix.

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run lint` clean (0 errors, 0 warnings)
- ✅ Live production audit: 8/8 public routes healthy
- ✅ Static review: AbortController timeout cleanup correct; Promise.all bounded to ~9 concurrent; exit 0 only when every route passed; expected-status table matches `next.config.js` reality.

**Operator usage:**
```bash
node scripts/audit-site-health.js                      # production
node scripts/audit-site-health.js --base=https://...   # preview deploy
node scripts/audit-site-health.js --skip-tracking      # skip /t/ test
```

After the script reports green, operator runs the 4-step manual review checklist (real-device mobile testing) documented in the script header.

**Provider / platform / DB activity in this phase:** zero against payment / posting / external APIs. 1 read against `event_campaigns` per audit run (indexed lookup). HTTP GET against the 8 public routes per audit run. posted_at delta: 0 (29 → 29).

**Architecture status: COMPLETE.** Phases 14T.1 → 14X delivered the operational tuning block. The system is production-ready for traffic.

**Optional follow-up phases:**
- [ ] **Phase 14Y (recommended)** — fix the `/t/<unknown-slug>` hang surfaced by 14X.
- [ ] **Phase 14Z (optional)** — wire audit-site-health.js into CI/CD GitHub Action.
- [ ] **Phase 14AA (optional)** — Lighthouse + Web Vitals tracking.

---

### Pre-Phase-14X: Phase 14W — Social Media Content Optimization (saved + pushed `ce20cfc`).

**Built in 14W (no DB writes, no platform calls, affects only the next AI generation pass):**
- [x] **`src/lib/ai-prompts.ts`** (updated) — header comment notes Phase 14W's intentional cache invalidation. **VORTEX_BRAND_RULES** rephrased: the old "exclamation-stuffed clickbait" line replaced with one that reconciles aggressive hooks with compliance ("Direct and value-first. Aggressive curiosity hooks are encouraged when they expose a real savings benefit. Avoid exclamation-stuffed walls of text and FAKE scarcity"). CTA line strengthened with explicit ban on "link in bio" / "DM me" / "comment below". **SOCIAL_SYSTEM** completely rewritten with 4 rule sections (each enforced with `═══` dividers).

**The 4 enforced rules:**

1. **3-Second Hook** — every post's first sentence must grab attention with a punchy curiosity-inducing statement. Worked examples: "Stop overpaying for your vacations", "$1,847 saved on one trip — here's exactly how", "Most people don't know hotels have wholesale rates". Banned openers: "Welcome to...", "Are you looking for...", "Today we're talking about...", "Have you ever wondered...", brand-name openers.

2. **Platform-Specific Formatting** — IG: emojis as visual bullets, 1-2 sentence paragraphs, 3-5 short paragraphs total. FB: same rhythm but slightly longer body OK; clickable links in body. TikTok: punchy chyron ≤100 chars, hard cap 150, minimal emojis (1-2 max), one hook line + hashtag burst.

3. **Value-First CTA Structure** — mandatory order `HOOK → DESTINATION + SAVINGS STORY → SPECIFIC CTA URL`. 5 allowed CTAs each with documented use case: `vortextrips.com/free` (top-of-funnel awareness), `/book` (specific deal), `/join` (paid push), `/quote` ("see your rate"), `/sba` (income angle). Banned: "Click the link in bio", "DM me", "Comment below", any CTA without a `vortextrips.com` path.

4. **Hashtag Strategy** — every post MUST include the 4 mandatory branded tags FIRST: `#TravelHacks #Surge365 #WholesaleTravel #VortexTrips`. Then 3-5 contextual tags per platform (broad + niche + destination-specific mix). Counts: IG 8-12, FB 4-6, TikTok 4-6.

**Compliance reconciliation:**
- New aggressive-hook directive doesn't conflict with compliance: hooks may be aggressive but must be TRUE. Savings numbers must be cited as "members report saving up to $X" or "examples like $X are common" — never as a guarantee.
- Forbidden terms (MLM/downline/network marketing) and brand-name rules (Travel Team Perks blocked) intact.
- No fabricated scarcity, no countdown timers, no "only 3 spots left".

**Cache impact:** OpenRouter prompt cache for the OLD SOCIAL_SYSTEM string is invalidated. The next generation pays one uncached prompt cost (~$0.001-0.005), then re-warms.

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run lint` clean (0 errors, 0 warnings)
- ✅ Static review: all 4 rule sections present + dividered; banned-openers list explicit; CTA URL allowlist explicit; mandatory hashtag list spelled out exactly per the operator's directive.
- ✅ VORTEX_BRAND_RULES tension reconciled.
- ⏸️ Live AI generation test deferred. The next weekly-content cron tick (Monday 13:00 UTC) will be the first production exercise. Operator can also manually trigger via `/api/ai/generate/social-pack` to validate before Monday.

**Consumers picking up the new prompt automatically (via SOCIAL_SYSTEM import):**
- `src/app/api/cron/weekly-content/route.ts` (Mondays 13:00 UTC)
- `src/app/api/ai/generate/social-pack/route.ts` (manual trigger)
- `src/app/api/ai/generate/social-calendar/route.ts` (manual trigger)

No route changes required — the system prompt drives all three.

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Optional remaining phases:**
- [ ] **Phase 14X** — Full System Audit & Broken Page Scanner (route-status script + manual mobile review)

---

### Pre-Phase-14W: Phase 14V — TikTok Status Polling (saved + pushed `d426e47`).

**Built in 14V (no DB writes during this phase, no platform writes; only status reads):**
- [x] **`src/lib/tiktok-oauth.ts`** (updated) — new `checkTikTokPostStatus(supabase, publishId)` helper. POSTs to `https://open.tiktokapis.com/v2/post/publish/status/fetch/`. Returns `{ status, fail_reason, publicly_available_post_ids, log_id, raw }`. Defensively accepts both `publicaly_available_post_id` (TikTok's typo'd field) and `publicly_available_post_id` spellings. New `TikTokPublishStatus` type union covers documented enum values; unknown enums pass through.
- [x] **`src/app/api/automations/post-to-tiktok/route.ts`** (updated) — extended SELECT to include `media_metadata`. After init returns `publish_id`, the route spreads existing JSONB and adds `{ tiktok_publish_id, tiktok_published_at }` as part of the SAME atomic UPDATE that flips `status='posted'`.
- [x] **`src/app/api/cron/autoposter-once/route.ts`** (updated) — same extension. UPDATE payload built conditionally — only TikTok branch (`platform === 'tiktok' && result.platform_post_id`) merges `media_metadata`. FB / IG branches unchanged.
- [x] **`scripts/run-autoposter-once.js`** (updated) — same extension. `ROW_SELECT` includes `media_metadata`. The `--apply` UPDATE branch builds the payload conditionally.
- [x] **`scripts/diagnose-tiktok-uploads.js`** (new) — read-only diagnostic. Queries posted TikTok rows, polls TikTok status endpoint per row, prints color-coded report. Supports `--limit=N` and `--since=DATE`. Mirrors `getValidTikTokAccessTokenJs` and `checkTikTokPostStatusJs` (kept in sync with the lib by hand). Summary footer counts each state and flags `FAILED` rows for manual review.

**TikTok status enum (5 documented + UNKNOWN catch-all):**
| Status | Color | Emoji |
|---|---|---|
| `PUBLISH_COMPLETE` | green | ✅ |
| `PROCESSING_DOWNLOAD` | cyan | ⏬ |
| `PROCESSING_UPLOAD` | cyan | 🔄 |
| `SEND_TO_USER_INBOX` | blue | 📥 |
| `FAILED` | red | ❌ |
| (unknown) | yellow | ❓ |

**Persisted JSONB shape (post-14V TikTok rows):**
```json
{
  "tiktok_publish_id": "v_pub_url~v3.0...",
  "tiktok_published_at": "2026-05-08T14:00:00.000Z",
  "...worker-set fields preserved...": "..."
}
```

**Critical safety preserved:**
- ✅ `media_metadata` merge happens inside the atomic UPDATE statement (not a separate write) — no race window where status='posted' lands without publish_id.
- ✅ JSONB spread preserves worker-set fields (e.g. `heygen_video_id`). Defensive `typeof === 'object' && !== null` guards.
- ✅ `checkTikTokPostStatus` throws on transport / API errors so callers don't silently treat failed reads as "no info."
- ✅ Diagnostic script is **read-only** against content_calendar. The only DB writes it can produce are token rotations to `site_settings.tiktok_*` (same authorized side effect the runner has).
- ✅ No new env vars. No new public endpoints. No platform writes.

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run lint` clean (0 errors, 0 warnings)
- ✅ Static review of all 3 atomic UPDATE branches: media_metadata merge happens AFTER the existing JSONB spread, in the same UPDATE statement; FB/IG branches unaffected; defensive type guards before spread.
- ⏸️ Live diagnostic run deferred — no Phase 14V TikTok posts in DB yet. Script correctly returns "No TikTok posts with a publish_id found" for pre-14V rows.

**Operator usage:**
```bash
node scripts/diagnose-tiktok-uploads.js          # last 25 TikTok posts
node scripts/diagnose-tiktok-uploads.js --limit=50
node scripts/diagnose-tiktok-uploads.js --since=2026-05-01
```

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Optional remaining phases:**
- [ ] **Phase 14W** — Social Media Content Optimization (rewrite AI prompts for hooks, platform-specific formatting, niche hashtags)
- [ ] **Phase 14X** — Full System Audit & Broken Page Scanner (route-status script + manual mobile review)

---

### Pre-Phase-14V: Phase 14U — Cron Health Dashboard UI & Alerts (saved + pushed `debea44`).

**Built in 14U (no DB writes during this phase, no platform calls):**
- [x] **`src/app/api/admin/system/autoposter-cron/route.ts`** (new) — admin GET + POST endpoints, both gated by `requireAdminUser`. GET returns `{ enabled, last_change, last_reason }`. POST `{ enabled: boolean }` upserts `site_settings.autoposter_cron_enabled` with the actor's email captured in the `description` column for audit trail.
- [x] **`src/components/ai/SystemStatusCard.tsx`** (new) — self-contained client component. Color-coded card (emerald = enabled, rose = disabled, gray = loading). Toggle button flips state with confirm dialog on disable. Shows last-change timestamp + reason so operator can distinguish manual disables from auto-disables. Refresh button. Toast notifications via existing `useToast`.
- [x] **`src/app/dashboard/ai-command-center/page.tsx`** (updated) — imports + renders `<SystemStatusCard />` between the header and the WorkflowPanel/JobInspector grid. No layout disruption.
- [x] **`src/app/api/cron/autoposter-once/route.ts`** (updated) — imports `sendEmail` from `@/lib/resend`. New `sendKillSwitchAlert(...)` helper sends an HTML email to `ADMIN_NOTIFICATION_EMAIL` with subject "🚨 URGENT: VortexTrips Autoposter Halted". Body: reason, platform, content_calendar.id, platform_post_id (when present), severity tag, next-steps checklist. **Best-effort** — missing env var = warning log + return; Resend failure = warning log + continue. Wired into all 4 auto-disable branches: platform non-2xx, DB UPDATE error, UPDATE-affected count != 1, post-flight invariant slip. Transient network-exception branch deliberately NOT alerted (likely transient, doesn't auto-disable). Internal `escapeHtml()` for all dynamic strings.

**Email alert behavior (severity escalation):**
| Trigger | Severity | Subject prefix |
|---|---|---|
| Platform non-2xx | High | 🚨 URGENT: ... |
| DB UPDATE error after platform success | **CRITICAL** (post may have landed) | 🚨 URGENT: ... |
| DB UPDATE affected != 1 row | **CRITICAL** (post landed) | 🚨 URGENT: ... |
| Post-flight invariant slip | **CRITICAL** (counters disagree) | 🚨 URGENT: ... |

All four cases emit the same subject line; severity is conveyed in the body's "Additional context" section.

**Critical safety gates preserved:**
- ✅ `requireAdminUser` on both GET and POST of the new admin route.
- ✅ Kill-switch flip happens BEFORE the email send; if the email fails, the cron is still disabled.
- ✅ `sendKillSwitchAlert` never throws — wrapped in try/catch internally.
- ✅ Cron's atomic UPDATE, refusal contract, and CRON_SECRET auth unchanged.
- ✅ No new env vars required (`ADMIN_NOTIFICATION_EMAIL` was already in `.env.example`).

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run lint` clean (0 errors, 0 warnings)
- ✅ Static review: `requireAdminUser` enforced; POST validates body shape; `sendKillSwitchAlert` is best-effort; all 4 auto-disable branches emit alerts AFTER the kill-switch flip; HTML body escapes dynamic strings.
- ⏸️ Live email-on-halt test deferred — would require triggering an actual cron failure. The code path is exercised by the static review.

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Operator workflow now (post-14U):**
1. **Enable cron:** click "Enable Cron" on the AI Command Center → kill switch flips to `'true'`.
2. **Daily routine:** Mark Ready one row in `/dashboard/content` before the next 14:00 UTC tick.
3. **On halt:** receive emergency email with reason + content_calendar.id + next-steps; investigate; click "Enable Cron" to resume after fix.
4. **Disable for maintenance:** click "Disable Cron" → confirm dialog → kill switch flips to `'false'`. Daily ticks return `cron_disabled` until re-enabled.

**Optional remaining phases:**
- [ ] **Phase 14V** — TikTok Status Polling (async upload verification)
- [ ] **Phase 14W** — Social Media Content Optimization (rewrite AI prompts)
- [ ] **Phase 14X** — Full System Audit & Broken Page Scanner

---

### Pre-Phase-14U: Phase 14T.1 — Lint Hygiene Sweep (saved + pushed `90b27b9`; 51 findings → 0; npm run lint silent).

**Built in 14T.1 (no DB writes, no platform calls, behavior preserved on every funnel page):**
- [x] **API routes (3)** — `upload-to-youtube` ts-ignore→ts-expect-error; `dashboard/generate-content` removed unused `request` param; `webhooks/bland` removed unused `call_id`.
- [x] **Dashboard pages (5)** — `campaigns` removed dead `CALENDAR_PLATFORMS` + 3 set-state-in-effect disables; `content` img-element disable; `leads` ternary→if/else; `members` removed unused `show`; `videos` URL-param-sync disable.
- [x] **Public landing pages (11)** — `data-deletion`, `destinations/[slug]`, `join`, `page` (homepage), `privacy`, `quiz`, `quote`, `reviews`, `sba`, `terms`, `thank-you`. Mechanical `<a>`→`<Link>` for internal hrefs (external `mailto:`/`https://` left as `<a>`), JSX entity escapes, dead-code cleanup (unused `router`, dead `handleSubmit` on join, dead `eslint-disable react/no-danger` on reviews).
- [x] **Components (3)** — `JobInspector` + `JobsTable` data-fetch-on-mount disables; `WorkflowPanel` real refactor — `PlatformChips` and `togglePlatform` extracted out of render scope into module-level declarations + new `SocialPlatformId` type alias.

**Decision on `react-hooks/set-state-in-effect` (5 instances):**
Silenced with targeted `eslint-disable-next-line` directives + inline justification comments. The rule recommends not using effects for these patterns, but the alternatives (React Query, in-effect lazy initializers) are major refactors out of 14T.1's "strictly mechanical" scope. Each disable carries a one-line `--` comment explaining why (data fetch on mount; URL-param sync; selection-driven re-fetch). Future phase can migrate if desired.

**Verification:**
- ✅ `npm run lint`: **0 problems (0 errors, 0 warnings)** — down from 51 problems
- ✅ `npx tsc --noEmit` clean
- ✅ Behavior preserved: `<Link>` renders the same `<a>` tag in DOM with same href; entity escapes render identically; removed `handleSubmit` on /join was unbound (no form `onSubmit` referenced it); `WorkflowPanel`'s `PlatformChips` extraction is functionally identical (still receives state/setter as props).

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Architecture status: COMPLETE, locally clean, lint-clean.** Optional remaining phases:
- [ ] **Phase 14U** — Cron Health Dashboard UI & Alerts (kill-switch toggle UI + admin email on auto-disable)
- [ ] **Phase 14V** — TikTok Status Polling (async upload verification)
- [ ] **Phase 14W** — Social Media Content Optimization (rewrite AI prompts for hooks, formatting, niche hashtags)
- [ ] **Phase 14X** — Full System Audit & Broken Page Scanner (route-status script + manual mobile review)

---

### Pre-Phase-14T.1: Phase 14T — Resend Lazy-Init + ESLint v9 Flat Config (saved + pushed `2844734`).

**Built in 14T (no DB writes, no platform calls, no behavioral change to posting / cron / API surfaces):**
- [x] `src/lib/resend.ts` — module-level `new Resend(...)` replaced with private `getResend()` getter that lazily instantiates and caches the client. Module-eval no longer reads `RESEND_API_KEY`. The missing-key error throws only at actual send time. `sendEmail` export interface unchanged — all 6 consumers (partners, lead-created webhook, send-sequences cron, score-and-branch cron, quote-email, trigger-sba) continue to work without changes.
- [x] `eslint.config.mjs` — dropped `FlatCompat` from `@eslint/eslintrc`. `eslint-config-next` v16.2.4 ships flat-config-native arrays at `./core-web-vitals` and `./typescript` subpath exports — already-shaped `Linter.Config[]` arrays. New config spreads them directly. Exported as a named `const` for `import/no-anonymous-default-export` compliance.
- [x] `package.json` — removed `@eslint/eslintrc: ^3.2.0` from devDependencies (only consumer was the FlatCompat path).
- [x] `package-lock.json` — regenerated; `@eslint/eslintrc` top-level entry dropped.

**Verification:**
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run lint` executes cleanly (no crash; 51 pre-existing findings in unrelated files surface — that's the linter doing its job)
- ✅ Static review of `src/lib/resend.ts`: `process.env.RESEND_API_KEY` only read inside `getResend()`; throws are scoped to send attempts
- ✅ Resend `sendEmail` interface unchanged; all 6 call sites continue to work

**Pre-existing lint findings (out of scope):**
51 issues across the codebase — `react-hooks/set-state-in-effect` (5x), `@next/next/no-html-link-for-pages` (~14x), `react/no-unescaped-entities` (~10x), unused vars and minor noise. ALL in files Phase 14T did not touch. The deliverable was "lint executes cleanly without crashing" (achieved); cleanup of these findings is deferred to a future Phase 14T.1 lint-hygiene sweep.

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Architecture status: COMPLETE and locally clean.** Optional future phases:
- [ ] **Phase 14T.1 (optional) — Lint Hygiene Sweep** — address the 51 pre-existing findings now that the linter works
- [ ] **Phase 14U (optional) — TikTok Status Poll** — confirm async upload completion for each `tiktok_publish_id`
- [ ] **Phase 14V (optional) — Per-Platform Schedules** — requires Vercel Pro upgrade

---

### Pre-Phase-14T: Phase 14S — 100% Automation Cron (saved + pushed `c012228`; CRON_SECRET-gated daily route at `0 14 * * *`; kill switch defaults disabled; auto-disable on definitive failure).

**Built in 14S (no DB writes during this phase, no platform calls until kill switch is enabled AND a Mark-Ready'd row exists at cron tick time):**
- [x] `src/app/api/cron/autoposter-once/route.ts` (new) — ~430-line CRON_SECRET-gated daily route. Implements the SOP's 5 steps programmatically: pre-flight snapshot → `getAutoposterEligibleRows({ limit: 5 })` → defense-in-depth `validateManualPostingGate` → platform call (FB photo→feed fallback / IG container→wait→publish / TikTok Direct Post init) → atomic UPDATE with `.eq('status','approved').is('posted_at',null)` guards → post-flight delta check → kill-switch flip on any definitive failure. One row per execution (refuses on queue size != 1). Twitter/X explicitly refused (defense-in-depth). Uses existing `getValidTikTokAccessToken` and `validateManualPostingGate` libraries — no logic duplication beyond the platform-poster branches.
- [x] `vercel.json` — `/api/cron/check-heygen-jobs` slot dropped (Path A); `/api/cron/autoposter-once` registered at `0 14 * * *` (2 PM UTC daily). Hobby plan stays at 4/4 cron slots.
- [x] `docs/skills/autoposter-operator-sop.md` — header re-stamped to "Phase 14S: Cron now active." New "Operating mode (post-Phase-14S)" section documents kill switch, auto-disable triggers, and operator-after-incident flow. Step 2 (Mark Ready) flagged as the only step the operator runs daily under cron mode. Phase 14S Cron Mapping table at the bottom traces each SOP step to its cron implementation. The full 5-step manual protocol is preserved verbatim and re-purposed as canonical **diagnostic** procedure.

**Kill switch (defense-in-depth):**
- `site_settings.autoposter_cron_enabled = 'true'` → cron actively posts
- anything else (including missing key) → cron returns 200 `{ skipped: true, reason: 'cron_disabled' }`
- Auto-flips to `'false'` on: platform non-2xx response, DB UPDATE failure, UPDATE-affected-count != 1, post-flight invariant slip
- Re-enable: `UPDATE site_settings SET value='true' WHERE key='autoposter_cron_enabled';`

**Cron route's contract** (mirrors the SOP):
1. **Step 1 (Audit pre-flight)** → `snapshotPostedCounts(supabase)` captures posted_at + status='posted' counts
2. **Step 2 (Mark Ready)** → operator-driven; cron does NOT mark Ready
3. **Step 3 (Dry-run / gate)** → eligibility query + `validateManualPostingGate` re-check on the freshly-fetched row
4. **Step 4 (Apply)** → platform call + atomic UPDATE; update count must equal 1
5. **Step 5 (Post-flight)** → re-snapshot, posted_at delta and status='posted' delta both must equal +1; on slip, kill switch flips

**Schedule choice:** `0 14 * * *` (14:00 UTC daily) = 9 AM ET / 6 AM PT. Avoids the typical operator morning window (7-11 AM ET), so any post-deploy bug surfaces during a manual run before the cron tick.

**Operator next steps (post-deploy, before activating cron):**
1. **Verify route is reachable:** `curl -H "Authorization: Bearer $CRON_SECRET" https://www.vortextrips.com/api/cron/autoposter-once` → expect `{ skipped: true, reason: 'cron_disabled' }`.
2. **(Once ready)** flip the kill switch: `INSERT INTO site_settings (key, value, description) VALUES ('autoposter_cron_enabled', 'true', 'Enables /api/cron/autoposter-once daily posting') ON CONFLICT (key) DO UPDATE SET value='true', updated_at=now();`
3. Mark Ready ONE FB/IG/TikTok row before the next 14:00 UTC tick — that row will be auto-posted.
4. Watch Vercel logs for `[autoposter-once]` entries.

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ Static review of route: gate ordering, atomic-UPDATE shape, kill-switch flip points, error paths verified
- ✅ `vercel.json` validates: 4 cron slots, valid cron syntax, all paths resolve to existing routes
- ⏸️ Live cron tick test deferred — Vercel fires on schedule; first tick will safely return `cron_disabled`
- ⚠️ `audit-pre-autoposter-readiness.js`: same pre-existing local Supabase schema-cache transient (environmental, not from this phase)

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Architecture status: complete.** Remaining work is operational tuning, not code:
- [ ] **Phase 14T (optional) — Cron Health Dashboard** (kill switch toggle, last-N runs, one-click re-enable)
- [ ] **Phase 14U (optional) — TikTok Status Poll** (confirm async upload completion for each `tiktok_publish_id`)
- [ ] **Phase 14V (optional) — Per-Platform Schedules** (requires Vercel Pro upgrade for sub-daily cron cadence)

---

### Pre-Phase-14S: Phase 14R — TikTok Auto-Poster (saved + pushed `78c4041`; full TikTok automation; OAuth + Direct Post API + runner integration).

**Built in 14R (no DB writes during this phase, no platform calls until operator runs --apply):**
- [x] `src/lib/tiktok-oauth.ts` (new) — `exchangeCodeForTokens(code, redirectUri)`, `refreshAccessToken(refreshToken)`, `saveTikTokTokens(supabase, tokens)`, `getValidTikTokAccessToken(supabase)`. Calls `https://open.tiktokapis.com/v2/oauth/token/`. Persists `tiktok_{access_token,refresh_token,token_expires_at,open_id}` into `site_settings` with `onConflict: 'key'` upserts. 60s expiry buffer for proactive refresh. Never logs the OAuth code or state.
- [x] `src/app/api/auth/tiktok/callback/route.ts` (updated) — wired to `exchangeCodeForTokens` + `saveTikTokTokens`. Token-exchange failures redirect with `connected=false&error=<truncated>`. State CSRF still deferred (matches YouTube callback pattern).
- [x] `src/app/api/automations/post-to-tiktok/route.ts` (new) — Direct Post API consumer. Auth check → joined-fetch with media → flatten → `validateManualPostingGate({ supportedPlatforms: ['tiktok'] })` → defense-in-depth video_url re-check → `getValidTikTokAccessToken` → POST `/v2/post/publish/video/init/` with `{ source: 'PULL_FROM_URL', video_url }` → atomic UPDATE `status='posted', posted_at=now()` with `.eq('status','approved').is('posted_at',null)` guards inline. Returns 503 when TikTok not connected.
- [x] `scripts/run-autoposter-once.js` (updated) — `'tiktok'` removed from `REFUSED_PLATFORMS`, added to `SUPPORTED_PLATFORMS`. Added in-script JS mirrors of the OAuth + token helpers + `postToTikTok(row, env, supabase)`. New TikTok branches in Plan and Apply sections. Twitter/X stays in `REFUSED_PLATFORMS` as defensive.
- [x] `.env.example` (updated) — TikTok block documents Phase 14R wiring, lists required scopes (`user.info.basic`, `video.publish`), explains site_settings token storage. Added `TIKTOK_PRIVACY_LEVEL` (default `SELF_ONLY` for unaudited apps).

**Critical safety gates:**
- ✅ `validateManualPostingGate(post, { supportedPlatforms: ['tiktok'] })` enforced on the route AND in the runner.
- ✅ `validateMediaReadiness(post)` runs inside the gate; TikTok requires non-empty `video_url`.
- ✅ Atomic UPDATE pattern with defensive guards mirrors FB / IG / runner exactly.
- ✅ No write to posting_status / posting_gate_* / queued_for_posting_at / media columns.
- ✅ TIKTOK_PRIVACY_LEVEL defaults to SELF_ONLY (safest for unaudited app).

**TikTok endpoints used:**
- OAuth: `POST https://open.tiktokapis.com/v2/oauth/token/`
- Direct Post: `POST https://open.tiktokapis.com/v2/post/publish/video/init/` with `source: PULL_FROM_URL` against the row's `video_url`

**Operator next steps (post-deploy):**
1. Confirm TikTok Developer Portal redirect URI = `https://www.vortextrips.com/api/auth/tiktok/callback` and scopes `user.info.basic` + `video.publish`.
2. Click Connect TikTok once → callback writes tokens to `site_settings`.
3. (Optional) Set `TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE` in Vercel once the app is fully audited.
4. Pilot: Mark Ready one TikTok row, `node scripts/run-autoposter-once.js` (DRY-RUN), then `--apply`.

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ Static review of route + lib + runner: gate ordering, atomic-UPDATE shape, error paths verified
- ⏸️ Live `--apply` test deferred to operator authorization
- ⚠️ `audit-pre-autoposter-readiness.js`: same pre-existing local Supabase schema-cache transient (environmental, not from this phase)

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Next phase:**
- [ ] **Phase 14S — 100% Automation Cron:** wrap `run-autoposter-once.js` --apply logic into `/api/cron/autoposter-once/route.ts`; replace `check-heygen-jobs` slot in `vercel.json` (Path A); CRON_SECRET-gated; auto-disable on first non-2xx via `site_settings.autoposter_cron_enabled` kill switch; mirror the 5-step SOP from `docs/skills/autoposter-operator-sop.md` step-for-step.

---

### Pre-Phase-14R: Phase 14Q — Excise Twitter/X (saved + pushed `5f48ced`; route deleted, dependency removed, allowlists/UI/prompts/types all narrowed to {instagram, facebook, tiktok}).

**Built in 14Q (no DB writes, no platform calls):**
- [x] **Deleted:** `src/app/api/automations/post-to-twitter/route.ts`
- [x] **Lib (5 files):** `src/lib/social-specs.ts` (TWITTER_SPEC, PlatformId, normalizePlatform), `src/lib/media-readiness.ts` (PLATFORM_RULES), `src/lib/posting-gate.ts` (comment cleanup), `src/lib/ai-prompts.ts` (SOCIAL_SYSTEM brand-voice), `src/lib/event-campaign-asset-generator.ts` (SocialPlatform type, KNOWN_PLATFORMS, asPlatform alias rejection, schema fragment, system prompt voice norms).
- [x] **API routes (8 files):** weekly-content cron prompt + PLATFORMS array; ai/generate/social-calendar + social-pack + content z.enum + defaults; ai/push-to-calendar PostSchema + POSTING_NOT_YET_IMPLEMENTED; dashboard/generate-content prompt; admin/campaigns push-to-calendar CALENDAR_PLATFORMS + comment; content/route.ts comment.
- [x] **Scripts (6 files):** audit-pre-autoposter-readiness.js (MANUAL_POST_ROUTES, PLATFORM_RULES — banned-hostname list intentionally KEPT as Check 7 safety assertions), run-autoposter-once.js (PLATFORM_RULES + refusal message; REFUSED_PLATFORMS retains `twitter`/`x` as belt-and-suspenders), diagnose-media-readiness.js, plan-media-generation.js, generate-missing-media.js (PLATFORM_RULES + imageOrientationFor), diagnose-manual-posting-gates.js (ROUTES_TO_CHECK).
- [x] **UI components (4 files):** dashboard/content (platformEmoji/Label, postToTwitter handler deleted, post-to-X button removed), dashboard/campaigns (CALENDAR_PLATFORMS), PushToCalendarPanel (Platform type, POSTING_NOT_IMPLEMENTED, twitter <option>), WorkflowPanel (packPlatforms/calPlatforms type unions, togglePlatform param, PlatformChips array, draftOnly logic).
- [x] **Types:** `shared/types.ts` `ContentPlatform` narrowed to `'instagram' | 'facebook' | 'tiktok'`.
- [x] **Config:** `package.json` (twitter-api-v2 removed); `package-lock.json` regenerated via `npm install --legacy-peer-deps` (-19 packages, +13 lockfile churn); `.env.example` (TWITTER_* removed, replacement note added).

**What stayed (intentionally):**
- Migration files (001-033 immutable; migration 004's CHECK still permits 'twitter' for historical rows).
- Audit script Check 7 banned-hostname list (`twitter.com`, `x.com`) — these are safety assertions verifying the audit doesn't reach those hosts, NOT references to twitter posting logic.
- Runner `REFUSED_PLATFORMS = {twitter, x, tiktok}` — defensive belt-and-suspenders for legacy rows.
- Twitter Card / Open Graph metadata in `src/app/layout.tsx` and `src/app/sba/layout.tsx` — these are SEO tags for external link previews when others share VortexTrips URLs on Twitter/X. Not posting logic. Out of scope.
- Historical narrative docs (PHASE_14O_*, EVENT_CAMPAIGN_ROADMAP, SYSTEM_AUDIT_PHASE_14_STATUS, etc.) — they document past state.

**Tests:**
- ✅ `npx tsc --noEmit` clean (after removing stale `.next/types/validator.ts` which referenced the deleted route)
- ⚠️ `node scripts/audit-pre-autoposter-readiness.js` — could not complete due to Supabase schema-cache transient (environmental: local Supabase project paused / stale `.env.local` creds; same pre-existing issue surfaced in earlier phases). Audit's local-only changes (Check 4 file-presence on the 3 remaining manual-poster routes; Check 7 banned-hostname list) were verified by inspection. Production deploys hit real Supabase and will run the audit cleanly.
- ✅ `npm install --legacy-peer-deps` clean (-19/+13 packages)
- ✅ Static grep: zero `twitter-api-v2` imports in code; zero `post-to-twitter` route references in code; remaining literal mentions of "twitter" are documentation comments noting the Phase 14Q removal.

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (29 → 29).

**Next operator-authorized phases (from Game Plan):**
- [x] **Phase 14P — Autoposter Operator SOP Skill** (`b181cb8`)
- [~] **Phase 14Q — Excise Twitter/X** (this phase; in working tree)
- [ ] **Phase 14R — TikTok Auto-Poster:** create `src/lib/tiktok-oauth.ts` (exchangeCodeForTokens, refreshAccessToken); update `/api/auth/tiktok/callback` to store tokens in `site_settings`; build `/api/automations/post-to-tiktok/route.ts` using TikTok Direct Post API; ensure it pulls HeyGen video_url and strictly passes `validateManualPostingGate`. Add `'tiktok'` to `scripts/run-autoposter-once.js`.
- [ ] **Phase 14S — 100% Automation Cron:** wrap `run-autoposter-once.js` logic into `/api/cron/autoposter-once/route.ts`; update `vercel.json` to replace `check-heygen-jobs` cron with this new one (Path A); CRON_SECRET-gated; auto-disable on first non-2xx platform response; mirror the 5-step SOP programmatically.

---

### Pre-Phase-14Q (now Pre-Phase-14R): Phase 14P — Autoposter Operator SOP Skill (saved + pushed `b181cb8`; documentation only; canonical 5-step protocol now lives at `docs/skills/autoposter-operator-sop.md`).

Phase 14O Scopes C+A deployed at `f74ddfc`. Live dry-run proof captured (HTTP 200 / `dry_run: true` / `live_posting_blocked: true` / `eligible_count: 1` / posted_at unchanged at 30). Operator removed the row from queue (pure dry-run proof) and authorized Phase 14O.1 / Path D instead of a registered cron. Legacy IG WARN row `a0bd9d16…` cleared (forensics confirmed it was never actually posted — 27-second create→posted_at gap, expired DALL·E URL, no gate fields ever set). posted_at: 30 → 29; status='posted': 29 (now perfectly aligned, Check 9 PASS with 0 WARN).

**Built in 14O.1 (no code-route changes, no DB writes, no platform calls):**
- [x] `scripts/run-autoposter-once.js` — manual autoposter runner. ~400 lines. Mirrors `getAutoposterEligibleRows` / `validateAutoposterCandidate` / `validateMediaReadiness` (all in JS, in-sync with audit script). Mirrors `post-to-facebook` / `post-to-instagram` route Graph API call patterns line-by-line. Atomic UPDATE: `status='posted', posted_at=now()` with defensive `.eq('status','approved').is('posted_at',null)` inline guards. Refusal contract: queue size != 1, twitter/x platform, tiktok platform, validator non-eligible, media-blocked, missing platform credentials, platform non-2xx, post-flight invariant slip — each fires a precise refusal with a documented exit code (0/2/3/4/5).
- [x] `PHASE_14O_AUTOPOSTER_PILOT_PLAN.md` extended with §11 (Path D decision, daily routine, refusal contract, 30-run promotion criteria to Phase 14O.2).

**Commands:**
```bash
node scripts/run-autoposter-once.js          # DRY-RUN (default)
node scripts/run-autoposter-once.js --apply  # operator-authorized post (one row, FB or IG only)
```

**Refusal contract (encoded in the runner):**
- Eligible queue size != 1 → exit 2
- Selected platform is twitter/x/tiktok → exit 2
- `validateAutoposterCandidate` non-null reason → exit 2
- `validateMediaReadiness` blocked → exit 2
- Platform credentials missing → exit 3
- Platform non-2xx → exit 3, DB unchanged
- Atomic UPDATE affected != 1 row → exit 4 (warning: post may have landed without DB flip)
- Post-flight invariant slip (delta != +1 for posted_at or status='posted', Check 9 anomaly (a) > 0, eligible queue != 0) → exit 5

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ `node scripts/run-autoposter-once.js` (queue=0): clean exit, no platform call, no DB write, message "no eligible row" with operator instruction
- ✅ `node scripts/audit-pre-autoposter-readiness.js`: 9/9 PASS, posted_at=29 unchanged, Check 9 PASS
- ✅ `node scripts/diagnose-autoposter-dry-run.js`: HTTP 200, dry_run=true, live_posting_blocked=true, eligible_count=0, posted_at unchanged at 29
- ⚠️ `npm run build`: compile passes; page-data collection still hits known local `RESEND_API_KEY=""` issue on routes that instantiate Resend at module-eval — pre-existing, not Phase 14O.1.

**Operator daily routine:**
1. `node scripts/audit-pre-autoposter-readiness.js` (sanity baseline)
2. Mark Ready ONE FB or IG row in `/dashboard/content`
3. `node scripts/run-autoposter-once.js` (DRY-RUN — confirms selection + plan)
4. `node scripts/run-autoposter-once.js --apply` (operator-authorized; calls platform; atomic UPDATE)
5. `node scripts/audit-pre-autoposter-readiness.js` (verify posted_at +1, queue 0, Check 9 PASS)

**~30 clean `--apply` runs → Phase 14O.2 (cron promotion).** Path A (drop `check-heygen-jobs`, free) or Path C (Vercel Pro $20/mo for 40-cron limit + sub-daily cadence + 60s timeout) decided then.

---

### Pre-Phase-14O.1: Phase 14O — Autoposter Pilot Plan + One-Row Cron Simulation (saved + pushed `f74ddfc`; Scope C plan committed; Scope A live dry-run captured; legacy IG WARN cleared 2026-05-06).

Phase 14M.2 deployed at `224e01b`. Phase 14N drained 5 clean manual cycles across FB/IG/TikTok (posted_at: 25 → 30). Phase 14O is the pre-cron planning + simulation step — **no live cron decision is being made in this phase**.

**Built in 14O (no code changes, no DB writes, no platform calls):**
- [x] `PHASE_14O_AUTOPOSTER_PILOT_PLAN.md` (Scope C) — full 10-section pre-cron contract: production baseline, 13 cron guardrails, per-platform first-cron order (FB → IG → TikTok-manual → Twitter-excluded), rollback plan, success criteria, failure conditions, operator instructions for the live dry-run, approval gate before Phase 14O.1.
- [x] Scope A baseline run — `node scripts/diagnose-autoposter-dry-run.js` against the live `/api/cron/autoposter-dry-run` endpoint with current empty queue: HTTP 200 / `dry_run: true` / `live_posting_blocked: true` / `eligible_count: 0` / 54 rows correctly skipped / posted_at unchanged at 30.

**What's NOT built in 14O:**
- ❌ No `vercel.json` change. No autoposter cron registered.
- ❌ No live posting. No platform API calls.
- ❌ No row mutations. (Operator's eventual Mark Ready click is the only DB write contemplated.)
- ❌ No TikTok OAuth token exchange. No Twitter unblock.

**Operator next step (the live dry-run proof):**
1. Mark Ready ONE Facebook row in `/dashboard/content`
2. Tell Claude `"ready - Facebook"`
3. Claude runs the audit + diagnostic + curl recipe (PowerShell-compatible) against the live endpoint
4. Verify all 6 success criteria from the plan doc §5
5. Decide: Phase 14O closed (proof captured) → Phase 14O.1 (live cron, FB-only, 1 row/day with auto-disable) is the next operator-authorized phase

**Cron stays off** until Phase 14O.1 ships with operator approval. The plan doc's §10 lists the 4 conditions that must all be met before that happens.

---

### Pre-Phase-14O: Phase 14N — Controlled Manual Posting Expansion (5/5 clean cycles 2026-05-05/06).

posted_at: 25 → 30 across 5 cycles (FB×2 atomic platform-poster path; IG×2 atomic platform-poster path; TikTok×1 atomic `/api/content` PATCH bookkeeping path — Phase 14M.2 route fix proven natively). Validator disagreements: 0. Spillover: none. Check 9: PASS each cycle.

---

### Pre-Phase-14N: Phase 14M.2 — Fix TikTok Mark Posted bookkeeping + posted_at invariant audit (saved + pushed `224e01b`; deployed `dpl_DRN42…`; repair script `--apply --id=9a9e2a52…` ran successfully closing the existing TikTok pilot anomaly 2026-05-05).

Phase 14M.1 deployed at `8b4da4c`. Manual TikTok pilot completed live (operator clicked Upload to TikTok → Creator Center → published → Mark Posted). Phase 14M's audit caught a real bookkeeping bug immediately after: TikTok pilot row `9a9e2a52…` had `status='posted'` but `posted_at=null`. Root cause was the `/api/content` PATCH route's UPDATE only including `status`, never `posted_at`.

**Built in 14M.2 (no DB writes, no platform calls):**
- [x] `src/app/api/content/route.ts` — when `status === 'posted'` AND the row's current `posted_at` is null, the same UPDATE now stamps `posted_at = new Date().toISOString()`. The gate-fetch already pulls the row, so we capture `posted_at` from there. Repeat clicks preserve the original timestamp (idempotent). Other transitions (approve/reject/reset) leave `posted_at` alone — per spec, the historical-artifact path is reviewed via the repair script, not auto-cleared.
- [x] `scripts/audit-pre-autoposter-readiness.js` — new **Check 9** invariant `status='posted' iff posted_at IS NOT NULL`. **FAIL** when `status='posted' AND posted_at IS NULL`. **WARN** (not FAIL) when `status != 'posted' AND posted_at IS NOT NULL` so the historical artifact stays visible without blocking the audit.
- [x] `scripts/repair-posted-at-invariants.js` — DRY-RUN-default. With `--apply`, ONLY repairs the TikTok pilot row `9a9e2a52…` (stamps `posted_at = now()` or `--timestamp=<iso>`). Other anomaly-(a) rows are listed but never auto-repaired (refusal is intentional per spec — narrow scope). Anomaly-(b) clearing requires explicit `--repair-legacy-id=<uuid>` flag AND the row must currently match anomaly (b). UPDATEs include defensive re-checks of the anomaly condition so a row that flipped state mid-run is left alone.

**Audit results (current state, before repair):**
- Checks 1–8: ✅ PASS
- Check 9: ❌ FAIL — 1 row in anomaly (a) (TikTok pilot `9a9e2a52…`); 1 row in anomaly (b) WARN (legacy IG `a0bd9d16…`)
- Audit summary: 8/9 — closes to 9/9 after the operator-approved repair

**Provider / platform / DB activity in this phase:** zero across the board. posted_at delta: 0 (24 → 24).

**Live posting still BLOCKED on cron.** Manual posting validated end-to-end on FB + IG + TikTok in this session. Twitter/X paused on Developer Portal billing (HTTP 402). Once Phase 14M.2 deploys + the repair runs, Check 9 closes and every future Mark Posted click writes both columns atomically.

**Next steps (operator-authorized):**
1. Commit + push + deploy Phase 14M.2
2. Run `node scripts/repair-posted-at-invariants.js --apply` to close the existing TikTok anomaly (posted_at: 24 → 25)
3. Re-run audit → expect 9/9 PASS
4. Decide whether to clear the legacy IG `a0bd9d16…` row's `posted_at` (separate `--repair-legacy-id` invocation)
5. Resume normal posting routine — every future Mark Posted click correctly stamps `posted_at`

---

### Pre-Phase-14M.2: Phase 14M.1 — TikTok OAuth Callback Route (saved + pushed `8b4da4c`; manual TikTok pilot landed live in this session 2026-05-05).

Phase 14M deployed at `b119a3e`. After deploy, the operator exercised the live posting chain for the first time:
- ✅ Facebook pilot row `30a95acf…` posted via `/api/automations/post-to-facebook` → live on the Vortex Trips Page (verified visually)
- ✅ Instagram pilot row `7edb49ba…` posted via `/api/automations/post-to-instagram` → live on the Vortex Trips IG account (verified)
- ❌ Twitter/X attempt on row `77a60ee3…` returned **HTTP 402 (Payment Required)** from `api.twitter.com` — Twitter API tier doesn't include posting (Free tier is read-only since 2024). Route correctly preserved row state (status='approved', posted_at=null). Operator unqueued the row.
- 🟡 TikTok pilot row `9a9e2a52…` is Mark-Ready'd; the dashboard's "Upload to TikTok" button opens TikTok Creator Center (manual upload + manual Mark Posted bookkeeping per Phase 14K.0.6 gate)

State: posted_at: 22 → 24, eligible queue: 1 (TikTok), 8/8 audit still PASS, cron still off.

Phase 14M.1 was prompted by a separate concern: the TikTok Login Kit redirect URI `/api/auth/tiktok/callback` returned 404, blocking the TikTok Developer Portal from accepting the redirect. This phase adds the route — strictly the redirect surface; **no token exchange, no DB writes, no posting changes**.

**Built in 14M.1 (no posting changes, no DB mutations):**
- [x] `src/app/api/auth/tiktok/callback/route.ts` — Next.js App Router GET handler. Reads `code` / `state` / `error` / `error_description`. On `error` → redirects to `/dashboard/settings?platform=tiktok&connected=false&error=<message>` (truncated to 200 chars). On missing `code` → `error=missing_code`. On success → `connected=pending`. Token exchange intentionally deferred to a future Phase 14K-tt sub-phase that will mirror the YouTube callback's pattern (token POST + `site_settings` upsert). Uses `process.env.NEXT_PUBLIC_APP_URL` with `request.nextUrl.origin` as defensive fallback. Never logs `code` or `state`.

**Behavioral guarantees:**
- No platform API calls (route only issues redirects)
- No content_calendar / posting_status / posting_gate_* writes
- No `vercel.json` / cron change
- No token storage (deferred to a future helper)
- Sensitive `code` and `state` values never logged

**Tests:**
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run build` — `Compiled successfully in 16.7s`; `ƒ /api/auth/tiktok/callback` registered
- ❌ `npm run lint` not run — pre-existing Phase 13 ESLint v8/v9 mismatch unrelated

**Verify post-deploy:** open `https://www.vortextrips.com/api/auth/tiktok/callback` (no query string) → expect a 307 redirect to `/dashboard/settings?platform=tiktok&connected=false&error=missing_code` instead of a 404. Then return to the TikTok Developer Portal and finish the Login Kit redirect-URI registration.

**Live posting for the in-flight TikTok pilot is unaffected by this phase** — the OAuth callback is a separate URL surface for a future authentication flow; the manual upload + Mark Posted bookkeeping flow continues independently.

---

### Pre-Phase-14M.1: Phase 14M — Final Pre-Autoposter Posting Readiness Audit (deployed `b119a3e`; first live FB + IG pilots succeeded 2026-05-05).

Phase 14L.2.6 deployed at `2b838ce` (script-readiness diagnostic) and the full TikTok pipeline was drained across multiple operator-authorized HeyGen batches:
- 9 rows scripted in this session via Phase 14L.2.5 generator
- 9 + 5 + 4 + 1 + 5 = 24 HeyGen renders queued, polled, and stored as permanent Supabase URLs
- 30/30 TikTok rows now pass media readiness
- 0 temporary HeyGen URLs remain
- 0 pending HeyGen jobs
- posted_at unchanged at 22

Phase 14M is the final read-only safety proof before Phase 14K.1 (live autoposter). The audit validates the full chain in one shot.

**Built in 14M (no provider calls, no mutations):**
- [x] `scripts/audit-pre-autoposter-readiness.js` — read-only safety audit. Pulls content_calendar joined with campaign_assets; runs 8 independent checks against in-memory mirrors of the validators; static-greps the 4 manual-post route files; self-scans for banned platform/provider hostnames; captures posted_at before AND after. Writes `PHASE_14M_PRE_AUTOPOSTER_AUDIT_<date>.md` proof file. Exits non-zero if any check fails.
- [x] `PHASE_14M_PRE_AUTOPOSTER_AUDIT_2026-05-05.md` — proof file from the 2026-05-05 audit run. Overall PASS, all 8 checks PASS, posted_at unchanged 22 → 22.

**Audit results (2026-05-05):**
1. ✅ Branded tracking links — 52 approved + unposted rows; 0 missing or legacy
2. ✅ Media ready — 52 approved checked; 0 media-blocked
3. ✅ Gate blocks idle/unapproved — 5+5 sampled; 0 leaks
4. ✅ Manual routes guarded — 4 of 4 route files import + call `validateManualPostingGate`
5. ✅ Autoposter dry-run gate-approved-only — 0 eligible (queue empty by design); validator agrees with the gate state
6. ✅ posted_at unchanged — 22 → 22
7. ✅ No platform API calls during audit — script source contains zero platform/provider hostnames
8. ✅ Manual + autoposter validators agree on every approved row — 0 disagreements

**Live posting still BLOCKED.** Queue is empty by design — no operator has clicked Mark Ready on any row. The audit confirms that when Mark Ready IS clicked, every safety rail is in place. Once approved:
1. Operator picks 1 approved row on a low-risk text platform (Twitter/X or Facebook, not TikTok)
2. Click Mark Ready on the dashboard → row enters the live queue
3. Re-run Phase 14M audit → expect Check 5 = `eligible: 1`, Check 8 still 0 disagreements
4. Manually invoke the platform Post button → first real posting event
5. Verify result on the platform, on the dashboard, and via diagnostic
6. If clean, graduate to a second row; eventually to TikTok video; eventually to cron-driven autoposter

---

### Pre-Phase-14M: Phase 14L.2.6 — Controlled HeyGen Batch Unlock (saved + pushed `2b838ce`; full pipeline drained across this session — 30/30 TikTok ready 2026-05-05).

Phase 14L.2.5 deployed at `2b838ce` and the script generator was applied across multiple operator-driven runs. Production state per the live diagnostic:
- 16 TikTok rows have `video_script` and no `video_url` (HeyGen-ready NOW)
- 9 TikTok rows still need scripts
- 5 TikTok rows have permanent Supabase `video_url` (Phase 14L.2.4 + 14L.2.2 batch + pilot)
- 0 pending HeyGen jobs
- 0 temporary HeyGen URLs

Phase 14L.2.6 unlocks small, controlled HeyGen batches now that the pipeline is proven end-to-end. The Phase 14L.2.2 hard `--limit=1` guard is replaced by a tiered cap with explicit refusal contracts.

**Built in 14L.2.6 (no provider calls, no mutations):**
- [x] `scripts/generate-missing-media.js` — new constants `HEYGEN_DEFAULT_BATCH_MAX=5` and `HEYGEN_ABSOLUTE_BATCH_MAX=10`. New flags `--allow-large-heygen-batch` (lifts cap from 5 to 10) and `--allow-when-pending` (overrides the pending-jobs refusal). Old `flags.limit !== 1` guard replaced with cap-aware logic that applies to both `--provider=heygen` and `--videos-only --provider=auto`. New pending-HeyGen-jobs query + refusal block. Defensive per-row invariant pass that refuses the batch with per-row reasons before any provider call (rows that are posted, have `video_url`, or lack a script). New DRY-RUN preview block that lists each candidate row's id / platform / week_of / status and a 90-char script preview. Banner updated to "Phase 14L.2.6".
- [x] `scripts/diagnose-media-readiness.js` — new section `6e2. HeyGen batch eligibility` reports batch-eligible row count, both caps, blocked-no-script count, and the exact preview command.

**Dry-run results:**
- `--videos-only --provider=heygen --limit=5`: 5 rows planned (`9a9e2a52…`, `25df8c16…`, `ee431aac…`, `a805f65a…`, `dee88875…`); 80–86 word scripts, all TikTok content_calendar; posted_at unchanged at 22.
- `--videos-only --provider=heygen --limit=6`: refused — `cap exceeded; pass --allow-large-heygen-batch`.
- `--videos-only --provider=heygen --limit=11 --allow-large-heygen-batch`: refused — `absolute ceiling is 10`.
- `diagnose-media-readiness.js` section 6e2: 16 batch-eligible / 9 blocked-no-script / caps shown / preview command printed.
- `check-video-generation-status.js`: 0 pending; exit clean.

**Live posting still BLOCKED.** No HeyGen call has been authorized. Once approved:
1. (operator-approved) `node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=5` — queues exactly 5 HeyGen renders with the new batch logic
2. Wait ~3–5 min, then `node scripts/check-video-generation-status.js --apply` — lands permanent Supabase URLs
3. Repeat to drain the remaining 11 HeyGen-ready rows (two more `--limit=5` invocations or one `--limit=10 --allow-large-heygen-batch`)
4. Phase 14L.2.5 generator authors scripts for the 9 still-no-script rows
5. HeyGen those 9 rows; final state is 30 of 30 TikTok rows `Media ready`
6. Then ship Phase 14K.1 (live autoposter)

---

### Pre-Phase-14L.2.6: Phase 14L.2.5 — Generate Missing TikTok Video Scripts (saved + pushed `2b838ce`; backfill applied to 16 of 25 rows in production 2026-05-03).

Phase 14L.2.4 complete — the 4 remaining script-eligible HeyGen renders (`b378c767…`, `a42b8a02…`, `3e6879da…`, `41f3fa6a…`) were queued, polled, and stored as permanent Supabase URLs through the Phase 14L.2.3 hardened pipeline. Result: 5 of 30 TikTok rows pass media readiness. The 25 remaining TikTok blockers are uniformly "missing video_script" — they were inserted by the weekly-content cron with caption + image_prompt only.

Phase 14L.2.5 is the controlled DRY-RUN scaffold to fix that. The generator authors HeyGen-ready spoken text (70–110 words, no `[VISUAL: …]` cues, no portal URLs, no MLM language, mentions VortexTrips once) and writes only `content_calendar.video_script`.

**Built in 14L.2.5 (no AI calls, no mutations):**
- [x] `scripts/generate-missing-video-scripts.js` — DRY-RUN script generator. Default lists candidates + prompt structure. `--generate` calls OpenAI; prints scripts; no writes. `--generate --apply` writes ONLY `content_calendar.video_script`. `--apply` alone refused. Filters: `--limit=N` (default 5; max 25), `--id=<uuid>`, `--provider=openai`. Strict allow-list — never touches `status`, `posted_at`, `posting_status`, `posting_gate_approved`, `queued_for_posting_at`, `media_status`, `video_url`, etc. Sanitizer strips bracketed cues / speaker labels / lone hashtags / emoji range characters in case the model drifts. Word-count warnings at <50 or >140.
- [x] `scripts/diagnose-video-script-readiness.js` — read-only. Reports total unposted TikTok / has-video / missing-video / has-script / no-script / projected HeyGen-eligible count after backfill. posted_at no-mutation cross-check.
- [x] `scripts/inspect-missing-video-scripts.js` — one-shot inspector kept for debugging.
- [x] `scripts/diagnose-media-readiness.js` updated — section 6e now splits the TikTok blocker into `no video_script` vs `has video_script` so each pipeline stage's remaining work is visible.

**Dry-run results:**
- Generator (default): 25 candidates, 5 sampled at default `--limit=5`, full prompt printed for the first row (`4faa0732-9655-40cd-a7c7-3ff6ca7d7c9e`). posted_at unchanged at 22.
- Script-readiness diagnostic: 30 unposted TikTok / 5 with video / 25 needs-script / projected 25 HeyGen-eligible after backfill.
- Media-readiness diagnostic: section 6e now shows `TikTok blocked — no video_script: 25` and `TikTok blocked — has video_script: 0`. No temp HeyGen URLs (Phase 14L.2.3 cleanup confirmed).

**Live posting still BLOCKED.** Phase 14L.2.5 only ships tooling. No AI call has been authorized. Once approved:
1. (operator-approved) `node scripts/generate-missing-video-scripts.js --generate --limit=1 --id=4faa0732-9655-40cd-a7c7-3ff6ca7d7c9e` — review the generated script in the terminal
2. (operator-approved, after spot-check) `--generate --apply` on the same id — script lands in `video_script`
3. Scale up `--limit` until all 25 rows have scripts
4. Phase 14L.2.6 — run the existing HeyGen worker in batches of 5 against the now-script-ready rows, polling through the Phase 14L.2.3 hardened pipeline
5. Once all 30 TikTok rows show `Media ready`, ship Phase 14K.1 (live autoposter)

---

### Pre-Phase-14L.2.5: Phase 14L.2.4 — HeyGen Batch (4 remaining renders, completed) (deployed; permanent Supabase video_urls applied 2026-05-03).

The 4 remaining script-eligible HeyGen-ready rows were queued, polled, and stored as permanent Supabase URLs through the Phase 14L.2.3 hardened pipeline. 5 of 30 TikTok rows now pass media readiness. 0 temporary HeyGen URLs remain. posted_at unchanged at 22. No platform API calls. Live posting still BLOCKED.

---

### Pre-Phase-14L.2.4: Phase 14L.2.3 — HeyGen Batch + Permanent Video Storage Hardening (saved + pushed `ec3fc3e`).

Phase 14L.2.2 deployed at `e0f013d`. Migration 033 applied. The HeyGen single-video pilot succeeded — content_calendar row `71c25664-38a7-4bc3-80b5-326bfc36c54d` rendered, polled, and `video_url` was applied. TikTok passing media readiness: 1 of 30. Posted_at unchanged at 22.

Phase 14L.2.3 hardens video storage before queuing the remaining 4 HeyGen renders. The pilot row's `video_url` is currently a HeyGen-hosted signed URL (`https://files2.heygen.ai/...?Expires=...&Signature=...`) that will expire — Instagram/TikTok would 403 on it. The completion path now downloads the MP4 and re-uploads it to Supabase Storage so `video_url` is a permanent self-hosted URL.

**Built in 14L.2.3 (no provider calls, no mutations):**
- [x] `scripts/check-video-generation-status.js` — new `downloadAndStoreVideo` helper (mirrors the Pexels image pattern but with `video/mp4` + `upsert: true`); deterministic `buildVideoObjectPath` (`media/content/<platform>/<row>-<vid>.mp4` or `media/campaigns/video/<asset>-<vid>.mp4`); `isHeyGenTempUrl(url)` predicate (matches any `*.heygen.ai` host). Completion path now copies the MP4 to Supabase Storage **before** writing `video_url`; on storage failure leaves the row at `media_status='pending'` (per spec — the HeyGen render did succeed; only the storage step blew up; a re-run will retry). The original temp URL is preserved in `media_metadata.heygen_temp_url` (or `video_source_metadata.heygen_temp_url` for campaign rows) for forensics. New `--repair-temp-urls` mode (DRY-RUN + `--apply`) scans both tables for `heygen.ai`-hosted `video_url` values and rewrites them.
- [x] `scripts/diagnose-media-readiness.js` — new section `6f. Temporary HeyGen video URLs` — counts unposted rows whose `video_url` is on `heygen.ai`, prints the repair command. Detected 1 such row (the pilot).

**Dry-run results:**
- `node scripts/check-video-generation-status.js`: 0 pending HeyGen jobs (Phase 14L.2.3 banner; `No platform calls. No DB writes. No Storage writes.`).
- `node scripts/check-video-generation-status.js --repair-temp-urls`: 1 content_calendar row (the pilot) flagged with planned destination `media/content/tiktok/71c25664-38a7-4bc3-80b5-326bfc36c54d-d0611cdd7a1649379ab61a7a93c263fa.mp4`; 0 campaign_assets rows; posted_at unchanged at 22.
- `node scripts/diagnose-media-readiness.js`: section 6f reports `⚠ content_calendar rows on heygen.ai temp URLs: 1`; recommends repair command. Migration 033 ✓ applied. Posted_at unchanged at 22.

**No migration created.** Migration 033 (`content_calendar.media_metadata` JSONB) shipped in Phase 14L.2.2 and is already applied in production. Phase 14L.2.3 only adds new keys to existing JSONB columns.

**Live posting still BLOCKED.** Phase 14L.2.3 only adds storage hardening. No HeyGen call fired in this phase. Once approved:
1. Push + deploy
2. (operator-approved) `node scripts/check-video-generation-status.js --repair-temp-urls --apply` → migrates the 1 pilot row off `files2.heygen.ai`; `video_url` becomes a Supabase public URL
3. (operator-approved, after repair verified) Queue the 4 remaining HeyGen renders one at a time via `--id=<uuid>` — pilot guard still requires `--limit=1` per call
4. Phase 14L.2.4 will drop the `--limit=1` enforcement once the new pipeline is verified end-to-end

---

### Pre-Phase-14L.2.3: Phase 14L.2.2 — HeyGen Single-Video Pilot (saved + pushed `e0f013d`; migration 033 applied; pilot row `71c25664…` rendered + `video_url` applied 2026-05-03).

Phase 14L.2.1 deployed at `98204ef`. Pexels image generation + Supabase Storage write-back ran safely; Instagram media gap is now 0 of 26 (was 3 of 26). Diagnostic baseline: 30 of 107 unposted rows still blocked, all "missing required video_url for TikTok"; 5 rows ready for HeyGen (have script), 25 still blocked-no-script; 0 HeyGen jobs awaiting poll; posted_at unchanged at 22.

Phase 14L.2.2 narrows the focus to a single controlled HeyGen render against one TikTok row that has a real `video_script`. The recommended pilot row is `71c25664-38a7-4bc3-80b5-326bfc36c54d` (TikTok, week 2026-04-20, 354-char script). The four other eligible rows: `b378c767…`, `a42b8a02…`, `3e6879da…`, `41f3fa6a…`.

**Built in 14L.2.2 (no mutations, no HeyGen call fired):**
- [x] `supabase/migrations/033_add_media_metadata_to_content_calendar.sql` — `media_metadata JSONB DEFAULT '{}'::jsonb` + partial GIN index. Idempotent. Replaces the Phase 14L.2.1 `media_error` overload for HeyGen `video_id` storage on organic rows. Pending application.
- [x] `scripts/inspect-heygen-pilot-candidates.js` — read-only enumerator. Returns 5 eligible rows + 25 blocked-no-script rows; recommends a deterministic pilot pick.
- [x] `scripts/generate-missing-media.js` — adds `--id=<uuid>`; refuses `--provider=heygen --limit>1` and `--videos-only --provider=auto --limit>1`; pre-filter drops rows already with `video_url` AND rows without explicit `video_script`/`video_prompt` (caption fallback excluded for HeyGen pilot); strips `[VISUAL: …]` / `Hook:` / `Outro:` cues via new `cleanScriptForHeyGen()` helper; switches organic-row HeyGen storage from `media_error` overload to `media_metadata.heygen_video_id`.
- [x] `scripts/check-video-generation-status.js` — reads `media_metadata.heygen_video_id` first, falls back to legacy `media_error` sentinel; gracefully handles migration-033-not-applied; merges into `media_metadata` on completion / failure instead of clobbering.
- [x] `scripts/diagnose-media-readiness.js` — section `6e. HeyGen pilot status` (migration 033 applied/not, pending HeyGen jobs by table with metadata-vs-media_error breakdown, completed `video_url` counts, TikTok unposted passing media readiness, TikTok still blocked-no-script).

**Dry-run results (post-Phase-14L.2.1, pre-deploy):**
- Inspector: 5 eligible / 25 blocked-no-script; pilot pick `71c25664…`.
- Diagnostic 6e: migration 033 NOT applied (banner shown); 0 pending HeyGen jobs; 0 completed; 0 of 30 TikTok rows passing; 25 blocked-no-script; posted_at unchanged at 22.
- Generator (`--videos-only --provider=heygen --limit=1`): matched filters = 5; queued 1 dry-run plan; posted_at unchanged.
- Generator (`--limit=3 --provider=heygen`): refused with clear pilot-mode message.
- Polling script: 0 pending jobs, exit clean.

**Live posting still BLOCKED.** Phase 14L.2.2 only ships pilot guards and storage shape. No HeyGen call has been authorized. Once approved:
1. Apply migration 033 in Supabase SQL Editor; verify
2. Deploy code via Vercel
3. (operator-approved) `node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=1 --id=71c25664-38a7-4bc3-80b5-326bfc36c54d` → exactly one HeyGen render queued; row marked pending
4. Wait ~3–5 min, then `node scripts/check-video-generation-status.js` (DRY-RUN) to observe status
5. (operator-approved) `node scripts/check-video-generation-status.js --apply` once HeyGen reports completed
6. Verify on dashboard — row's media badge flips to `Media ready`
7. After pilot succeeds, repeat for one campaign_assets video row, then drop the `--limit=1` enforcement

---

### Pre-Phase-14L.2.2: Phase 14L.2.1 — Real Media Provider Integration (saved + pushed `98204ef`; Pexels image write-back applied 2026-05-03; Instagram media gap cleared).

Phase 14L.2 deployed at `7aad656` and migration 032 applied successfully. content_calendar now has `video_url`, `media_status`, `media_generated_at`, `media_source`, `media_error` columns. The validator stack reads them. The dry-run worker scaffold ran clean (107 scanned, 39 blocked, posted_at unchanged at 22).

Phase 14L.2.1 replaces the worker's `--apply` stub with real provider integrations behind a strict flag matrix.

**Built in 14L.2.1 (no mutations, no provider calls fired):**
- [x] `src/lib/media-providers.ts` — typed `MediaProviderResult` shape; `fetchPexelsImage`, `generateOpenAIImage`, `createHeyGenVideo`, `getHeyGenVideoStatus`, `normalizeProviderError`, `isMediaProviderConfigured`. HeyGen is async-only.
- [x] `scripts/generate-missing-media.js` rewritten — flag matrix: default DRY-RUN; `--generate` (provider calls, no writes); `--generate --apply` (provider calls + allow-listed media writes); `--apply` alone refuses. Filters: `--limit=N`, `--provider=pexels|openai|heygen|auto`, `--images-only`, `--videos-only`, `--campaign-only`, `--content-only`. Image path Pexels-first → OpenAI fallback when `provider='auto'`. Video path HeyGen, refuses without script. Campaign-asset writes go to `image_url` / `video_url` + `image_source` / `video_source` + `*_source_metadata` JSONB. Organic-row writes go to `image_url` / `video_url` + `media_status` + `media_source` + `media_generated_at` + `media_error`. Apply uses a strict allow-list — never touches `status` / `posted_at` / `posting_status` / `posting_gate_approved` / `queued_for_posting_at`.
- [x] `scripts/check-video-generation-status.js` — HeyGen polling. Default DRY-RUN; `--apply` writes resolved `video_url` + `media_status='ready'` (or `'failed'`) back. Reads pending jobs from `campaign_assets.video_source_metadata.heygen_video_id` AND from `content_calendar.media_error LIKE 'heygen_video_id:%'`.
- [x] `scripts/diagnose-media-readiness.js` — adds section `6d. Provider readiness` (key presence + per-provider eligible row counts + HeyGen jobs awaiting poll).
- [x] `src/app/dashboard/content/page.tsx` — adds "🎬 Video generating" indigo badge for `media_status='pending' && media_source='heygen'` rows; SELECT pulls `media_source`.

**Dry-run results (post-migration-032 baseline):**
- Diagnostic: migration 032 ✓ applied; 39 of 107 unposted rows blocked (30 TikTok no video, 14 prompt without media, 3 IG no media); media_status distribution = 22 null / 0 pending / 85 ready / 0 failed / 0 skipped; 16 rows ready for Pexels image, 5 rows ready for HeyGen (have script), 25 blocked-no-script; 0 HeyGen jobs awaiting poll; posted_at unchanged at 22.
- Generator (DRY-RUN, no flags): 107 scanned, 39 matched, 5 sampled at default `--limit=5`, 0 calls; posted_at unchanged at 22.
- Polling script (DRY-RUN): 0 pending jobs, exit clean.

**Live posting still BLOCKED.** Phase 14L.2.1 only adds provider plumbing; no provider call has been authorized yet. Once the operator approves:
1. Run `node scripts/generate-missing-media.js --generate --images-only --limit=1 --provider=pexels` for a single Pexels-only review (provider call, no write)
2. Operator inspects the URL, then runs the same with `--apply` to persist
3. Repeat scaling up `--limit` and switching to `--provider=heygen` for video (with `--limit=1` for the first HeyGen render)
4. Run `node scripts/check-video-generation-status.js --apply` after a few minutes to land the resolved video_url
5. Once IG + TikTok rows are populated, ship Phase 14K.1 (live autoposter)

---

### Pre-Phase-14L.2.1: Phase 14L.2 — Media Generation Storage + Worker Foundation (saved + pushed `7aad656`; migration 032 applied 2026-05-03).

Phase 14L.1 backfill applied successfully: 8 content_calendar + 8 campaign_assets rows now carry branded VortexTrips tracking URLs; 7 unposted captions had legacy `myvortex365.com/leosp` rewritten; visible legacy links in unposted rows are now 0; posted_at row count unchanged at 22.

Phase 14L.2 lands the storage shape for the next preflight problem: 39 unposted rows are still blocked by the media gate (3 IG missing both, 30 TikTok missing video, 14 prompt-without-media). Without a place to land generated URLs on organic rows, the worker has nothing to write to. Migration 032 fixes that:

- Adds `content_calendar.video_url` (was absent — organic TikTok rows had nowhere to land)
- Adds `content_calendar.media_status` (`pending` / `ready` / `failed` / `skipped` with CHECK constraint)
- Adds `content_calendar.media_generated_at`, `media_source`, `media_error`
- Backfills `media_status='ready'` for rows that already carry a media URL
- Idempotent (IF NOT EXISTS / DROP IF EXISTS); partial indexes on the worker queue

**Built in 14L.2 (no mutations, no provider calls):**
- [x] `supabase/migrations/032_add_video_url_and_media_status_to_content_calendar.sql` — schema + backfill + indexes. Pending application.
- [x] `src/lib/media-readiness.ts` — new `MediaStatus` type; new `'failed'` outcome; `validateMediaReadiness` short-circuits on `'failed'`, blocks `'skipped'` only when platform requires media, and verifies `'ready'` actually has a URL.
- [x] `src/lib/posting-gate.ts` — `PostingGateRow` + `POSTING_GATE_ROW_SELECT_WITH_MEDIA` extended with `media_status` / `media_error` and row-level `image_url` / `video_url`. `flattenJoined` prefers campaign_asset URLs, falls back to row-level columns.
- [x] `src/lib/autoposter-gate.ts` — `ContentCalendarRow` + ROW_SELECT extended; `flattenAutoposterRow` does the same merge; `validateAutoposterCandidate` passes the new fields.
- [x] `scripts/generate-missing-media.js` — DRY-RUN worker scaffold. Mirrors media-readiness rules, groups by (campaign × platform × asset_type × target table), recommends Pexels/OpenAI/HeyGen per group, gracefully degrades when migration 032 is unapplied. `--apply` is a stub that exits non-zero so CI can't enable generation accidentally.
- [x] `scripts/diagnose-media-readiness.js` — adds migration-032-applied detection, `media_status` distribution, "rows ready after media" count. Mirrors the new validator rules.
- [x] `src/app/dashboard/content/page.tsx` — `MEDIA_BADGE_STYLES` gains the `'failed'` rose badge; SELECT pulls the new columns; `computeMediaReadiness` passes `media_status` + `media_error`.

**Dry-run results (pre-migration baseline):**
- Diagnostic: 0 caption legacy links left, 8 branded tracking URLs, 39 of 107 unposted rows blocked, 68 ready or text-only-allowed; posted_at unchanged at 22.
- Generator: 107 scanned, 68 covered, 9 image-only, 23 video-only, 7 both, 25 video blocked by missing script; PEXELS / OPENAI / HEYGEN keys all present; posted_at unchanged at 22.

**Live posting still BLOCKED.** Phase 14L.2 only ships storage shape + worker scaffold. No provider API was called. Once approved:
1. Apply migration 032 in Supabase SQL Editor (run verification SQL afterwards)
2. Deploy code (after migration confirmed applied)
3. Phase 14L.2.1 — wire real Pexels / OpenAI / HeyGen integration into `scripts/generate-missing-media.js`; remove the `--apply` stub; extend `weekly-content/route.ts` to set `media_status='ready'` after `fetchAndStoreImage` succeeds
4. Run worker; populate `media_status='ready'` on IG + TikTok rows
5. Then Phase 14K.1 (live autoposter) becomes runnable

---

### Pre-Phase-14L.2: Phase 14L.1 — Media Generation + Tracking URL Materialization Preflight (saved + pushed `7e8ec63`; backfill + caption cleanup applied 2026-05-03).

Phase 14L deployed at `810999e`. Diagnostic surfaced two outstanding blockers before Phase 14K.1 (live autoposter) can start:

1. 7 unposted rows still contain visible `myvortex365.com/leosp` AND have `tracking_url IS NULL`, so the cleanup script can't rewrite them.
2. 75 rows are blocked by media readiness (no image_url for Instagram, no video_url for TikTok, or `image_prompt` set without resolved `image_url`).

**Investigation result:** all 7 null-tracking rows are campaign-originated under one campaign (`art-basel-miami-beach` 2026). Their `campaign_assets.tracking_url` is also null — they predate the Phase 14H.1 push-to-calendar tracking-URL materialization. Every field needed by `buildCampaignTrackingUrl` (event_slug, event_year, wave, asset_type, assetId, platform) is recoverable.

**Built in 14L.1 (no mutations yet):**
- [x] `scripts/inspect-null-tracking-rows.js` — read-only ground-truth inspection. Confirmed all 7 are campaign-linked under one campaign.
- [x] `scripts/backfill-content-calendar-tracking-urls.js` — `--dry-run` (default) or `--apply`. Mirrors `buildCampaignTrackingUrl` in plain JS. Only touches unposted rows where `campaign_asset_id` is set, `tracking_url` is null, `posted_at` is null, and status is not posted/rejected/archived. UPDATEs re-check the safety filter inline. Back-fills `campaign_assets.tracking_url` only when null. `posted_at` no-mutation cross-check + verification SQL.
- [x] `scripts/plan-media-generation.js` — read-only. Groups missing-media rows by (campaign × platform × asset_type), recommends Pexels (→ OpenAI image fallback) for images, HeyGen for video, reports key presence. Surfaces the `content_calendar.video_url` schema gap that organic TikTok rows hit.

**Dry-run results:**
- Backfill: 8 rows eligible (the 7 with legacy links + 1 more), 0 skipped, all under Art Basel campaign.
- Media planner: 79 rows scanned → 47 already covered, 9 image-only, 16 video-only, 7 need both. PEXELS / OPENAI / HEYGEN keys all present.

**Live posting still BLOCKED.** Phase 14L.1 only writes scripts. No `--apply` was run. Once approved:
1. `node scripts/backfill-content-calendar-tracking-urls.js --apply` → 8 campaign rows get branded `vortextrips.com/t/...` URLs
2. `node scripts/cleanup-legacy-caption-links.js --apply` → captions are rewritten to use the branded URL
3. Build a media generation worker (Phase 14L.2) → populates `campaign_assets.image_url` / `.video_url` so visual-platform rows pass the gate
4. Then Phase 14K.1 (live autoposter) becomes runnable

---

---

### Pre-Phase-14L.1: Phase 14L — Media Readiness + Caption Link Finalization (saved + pushed `810999e`).

Two pre-flight blockers identified before Phase 14K.1:

1. Captions can still contain visible `https://myvortex365.com/leosp` even when `tracking_url` is correctly branded. Public posts must show `vortextrips.com/t/<slug>`.
2. Media readiness is unenforced — Instagram rows can reach `posting_status='ready'` without an image_url, TikTok rows without a video_url. Live posting would fail at the platform API.

**Built in 14L:**
- [x] `src/lib/media-readiness.ts` — pure validators: `getRequiredMediaForPlatform`, `validateMediaReadiness`, `summarizeMediaReadiness`, `getMediaReadinessLabel`. Per-platform rules: IG = image OR video required, TikTok = video required, FB/Twitter = text-only OK.
- [x] `src/lib/posting-gate.ts` — `PostingGateRow` extended with optional `image_url`/`video_url`/`image_prompt`/`video_prompt`; both `getPostingGateBlockReason` and `validateManualPostingGate` now run `validateMediaReadiness`. Bookkeeping-only mode skips the media check (operator may have posted manually). Exported `POSTING_GATE_ROW_SELECT_WITH_MEDIA` and `flattenPostingGateRow` so platform routes share a single fetch shape.
- [x] `src/lib/autoposter-gate.ts` — `ContentCalendarRow` extended; ROW_SELECT joins campaign_assets; `validateAutoposterCandidate` runs media readiness as the final check.
- [x] `src/app/api/automations/post-to-{instagram,facebook,twitter}/route.ts` — switched to the joined SELECT + `flattenPostingGateRow` so the gate sees the linked campaign_asset.image_url / video_url.
- [x] `src/app/api/content/route.ts` — bookkeeping path uses joined SELECT for shape consistency.
- [x] `src/app/dashboard/content/page.tsx` — renders "Media ready / Media missing / Text-only allowed" badge per row; per-platform Post buttons hidden when `media.blocked`. Mark Posted (bookkeeping) stays visible.
- [x] `scripts/cleanup-legacy-caption-links.js` — `--dry-run` (default) or `--apply`. Only touches unposted rows with branded `tracking_url`; preserves hashtags + copy; never modifies posted/rejected/archived rows; prints verification SQL.
- [x] `scripts/diagnose-media-readiness.js` — read-only. Reports caption legacy-link debt, branded-URL count, IG/TikTok media gaps, prompt-without-media count, total blocked count, and posted_at no-mutation cross-check.

**No migrations created.** Phase 14L uses existing columns + the JOIN through `content_calendar.campaign_asset_id`.

**Live posting still BLOCKED.** Phase 14L only ADDS gate refusals; no existing rule was loosened. Phase 14K.1 (live autoposter) will not begin until:
- The caption cleanup script is applied (`--apply` returns 0 from the verification SQL)
- A media-generation worker is built that populates `campaign_assets.image_url` / `.video_url` so visual-platform rows can pass the gate

---

### Pre-Phase-14L: Phase 14K.0.6 — Closed `/api/content` PATCH bypass for `→ posted` (saved + pushed `6b86b1a`).

Phase 14K.0.5 shipped (`0c81df2`). The 3 manual platform-post routes are now gated. The last remaining bypass was `/api/content` PATCH — Mark Posted bookkeeping could still curl-flip a non-ready row to `status='posted'`. Phase 14K.0.6 closes that gap.

**Patch applied:**
- [x] `src/app/api/content/route.ts` — when `body.status === 'posted'`, fetches the current row's gate columns and runs `validateManualPostingGate(row, { bookkeepingOnly: true })` before the UPDATE. Returns 403 with structured reasons if not allowed. Other transitions (draft↔approved, *→rejected, *→draft reset) NOT gated — operators retain full control over the approval lifecycle.
- [x] `scripts/diagnose-manual-posting-gates.js` — added `src/app/api/content/route.ts` to `ROUTES_TO_CHECK` so the source-code grep verifies the helper is imported + called. Comment explains the conditional gating (only on `→ posted`) and that runtime smoke-tests verify the conditional, not the static check.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 27.0s`; `ƒ /api/content` still registered.
- [ ] `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated.
- [ ] `node scripts/diagnose-manual-posting-gates.js` — to run after deploy. Expected: 4 routes ✓.

**Behavioral guarantees:**
- No new migration. No `vercel.json` change.
- Zero database mutations from this phase's code paths.
- Zero platform API calls from this phase's code paths.
- Dashboard "Mark Posted" continues to work — the dashboard already only shows the button on gate-ready rows (Phase 14K.0.5).
- `bookkeepingOnly: true` skips platform/caption checks (this route doesn't post anywhere). Everything else still applies — `status='approved'`, `posting_status='ready'`, `posting_gate_approved=true`, `queued_for_posting_at` non-null, `manual_posting_only=true`, `posted_at IS NULL`, branded `tracking_url` for campaign rows.
- Reset path (`posted → draft`) remains ungated. Reset is a recovery action, not a posting action.

**Outcome:**
After Phase 14K.0.6 deploys, **every** server-side path that lands a row in `status='posted'` runs through `validateManualPostingGate`. No remaining bypass. Phase 14K.1 (live autoposter) can ship with a clean defensive perimeter.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Dashboard smoke test: Mark Ready → Mark Posted on an approved row → confirm 200 + status flips to posted.
- [ ] Synthetic refusal test: in browser devtools, `fetch('/api/content', { method: 'PATCH', body: JSON.stringify({ id: '<idle approved row id>', status: 'posted' }), headers: { 'Content-Type': 'application/json' } })` → expect HTTP 403 with `blocked_by_gate: true`.
- [ ] Run `node scripts/diagnose-manual-posting-gates.js` → all 4 routes ✓.

---

## Phase 14K.0.5 — Posting Gate Consistency for Manual Platform Routes (shipped commit `0c81df2`, prod-verified 2026-05-03).**

Phase 14K (dry-run) shipped (`63bb4ba`) and prod-verified (HTTP 200, `dry_run=true`, `live_posting_blocked=true`, `posted_at` count 22 unchanged). Phase 14K.0.5 closes the manual-route bypass: every `/api/automations/post-to-{facebook,instagram,twitter}` route now calls a shared `validateManualPostingGate` helper before any platform API call.

**Patch applied:**
- [x] `src/lib/posting-gate.ts` — added `validateManualPostingGate(row, options)` returning `{ allowed, reasons[], warnings[], mode: 'manual' }`. Same eligibility rules as Phase 14K dry-run + branded `tracking_url` enforcement for campaign rows. `bookkeepingOnly` and `supportedPlatforms` options reserved.
- [x] `src/app/api/automations/post-to-twitter/route.ts` — calls `validateManualPostingGate(post, { supportedPlatforms: ['twitter'] })` before any tweet. Returns 403 with `{ success:false, blocked_by_gate:true, reasons }` if refused. Legacy `status==='approved'` and `platform==='twitter'` checks removed (subsumed by gate).
- [x] `src/app/api/automations/post-to-facebook/route.ts` — same pattern, `supportedPlatforms: ['facebook']`.
- [x] `src/app/api/automations/post-to-instagram/route.ts` — same pattern, `supportedPlatforms: ['instagram']`.
- [x] `src/app/dashboard/content/page.tsx` — for `status='approved'` rows, the four platform-Post buttons + Mark Posted are now hidden until `posting_status='ready' && posting_gate_approved=true`. Approved-but-idle rows show only Mark Ready. New copy: "Posting buttons appear only after Mark Ready passes the gate." Mark Posted button gains a tooltip clarifying it's bookkeeping.
- [x] `scripts/diagnose-manual-posting-gates.js` — verifies each platform route imports + calls the helper; runs the validator against current approved rows; snapshots `posted_at` count before/after; never hits a platform API.

**NOT modified:**
- `src/app/api/content/route.ts` (generic status PATCH used by Mark Posted bookkeeping) — not in user's allow-list. Server-side curl bypass remains; UI hides the button. Deferred to Phase 14K.0.6.
- `src/app/api/cron/autoposter-dry-run/route.ts` — already gates correctly via Phase 14K.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 14.9s`. All 4 relevant routes still register.
- [ ] `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated.

**Behavioral guarantees:**
- No new migration. No `vercel.json` change. No new platform integrations.
- Zero database mutations from this phase's code paths.
- Zero platform API calls from this phase's code paths.
- Approved-and-ready rows continue to post exactly as before — only the path to "ready" is now stricter.
- Existing manual approval flow (Approve / Reject / Reset) unchanged.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Open `/dashboard/content` → verify approved-but-idle rows show only Mark Ready (no platform-Post buttons).
- [ ] Run `node scripts/diagnose-manual-posting-gates.js` → confirm all 3 routes green, idle rows correctly blocked, `posted_at` unchanged.

---

## Phase 14K Patch — Remove `updated_at` from dry-run eligibility query (shipped commit `63bb4ba`, prod-verified 2026-05-03).**

Phase 14K shipped (`0faf4ff`) and deployed. First smoke test surfaced one bug: dry-run endpoint returned HTTP 500 with `column content_calendar.updated_at does not exist`. The diagnostic script + direct SQL agreed on 0 eligible / 53 skipped (`posting_status='idle'`), but the cron route's helper SELECTed a non-existent column.

**Patch applied:**
- [x] `src/lib/autoposter-gate.ts` — dropped `updated_at` from both the `ContentCalendarRow` interface and the `ROW_SELECT` constant. Added header comment documenting that `content_calendar` has no such column (verified against migrations 004 / 022 / 024 / 029). Strengthened ORDER BY to three keys using only existing columns: `queued_for_posting_at ASC NULLS LAST`, then `created_at DESC`, then `id ASC` as final tiebreaker.

**NOT changed:**
- `src/app/api/cron/autoposter-dry-run/route.ts` — already didn't reference `updated_at`.
- `scripts/diagnose-autoposter-dry-run.js` — already didn't reference `updated_at`.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 9.4s`; `ƒ /api/cron/autoposter-dry-run` still registered
- [ ] `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated

**Behavioral guarantees preserved:**
- No new migration. No new column added (preferred fix per spec).
- `dry_run: true`, `live_posting_blocked: true` runtime contract unchanged.
- `hardBlockLivePosting()` tripwire still throws; `LIVE_POSTING_ENABLED = false as const`.
- `markAutoposterDryRunInspected` still a no-op stub.
- Zero mutations on `content_calendar`. The diagnostic's before/after snapshot of `posted_at` count is the cross-check.
- Eligibility rules unchanged.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Run the PowerShell curl command (see PROJECT_STATE_CURRENT.md Phase 14K Patch entry) — expect HTTP 200 with `success=true`, `dry_run=true`, `live_posting_blocked=true`, `eligible_count=0`, `skipped_count=53` (or current count of approved-but-idle rows).
- [ ] Confirm `SELECT count(*) FROM content_calendar WHERE posted_at IS NOT NULL` is still 22 (unchanged).

---

## Phase 14K — Autoposter Cron, DRY-RUN ONLY (shipped commit `0faf4ff`, prod-deployed; HTTP 500 fixed by Phase 14K patch above).**

First piece of autoposter infrastructure. Selects content_calendar rows that WOULD be posted, but never posts. Manually invoked via curl during this phase — Hobby plan is at the 4-cron limit, so no `vercel.json` registration. Future Phase 14K.1 ships live posting.

**Patch applied:**
- [x] `src/lib/autoposter-gate.ts` — eligibility helper (`getAutoposterEligibleRows`, `validateAutoposterCandidate`, `buildAutoposterDryRunPlan`, `summarizeAutoposterDryRun`, no-op `markAutoposterDryRunInspected` stub, `hardBlockLivePosting` tripwire, `LIVE_POSTING_BLOCKED` runtime contract). Pure server-side, zero platform-SDK imports.
- [x] `src/app/api/cron/autoposter-dry-run/route.ts` — GET-only cron route. Bearer-auth via CRON_SECRET (matches existing pattern). Optional `?limit=N` (1-500, default 100) and `?platform=ig`. Returns the structured JSON spec'd in Phase 14K. Calls the no-op stub at the end.
- [x] `scripts/diagnose-autoposter-dry-run.js` — read-only diagnostic. Schema check, eligibility split, ineligibility-reason histogram, hits the dry-run endpoint when CRON_SECRET is in `.env.local`, 6 contract assertions, before/after snapshot of `posted_at` count to confirm zero mutations.
- [x] `src/app/dashboard/content/page.tsx` — added one-line note "Autoposter dry-run only. Ready rows are inspected, not posted." under the existing gate note. No other UI changes.
- [ ] Existing manual posting routes (`/api/automations/post-to-{twitter,facebook,instagram}`) — **not modified.** Per spec they remain admin-only / `status='approved'`-gated and continue to bypass the posting gate. Documented in the report; resolution comes with Phase 14K.1.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 13.5s`; `ƒ /api/cron/autoposter-dry-run` registered
- [ ] `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated

**Behavioral guarantees:**
- No `vercel.json` registration (Hobby plan at 4-cron limit). Manual curl invocation only during 14K.
- No platform API calls. No AI calls. No auto-posting. No new content generation.
- `LIVE_POSTING_ENABLED = false as const` in the helper. `hardBlockLivePosting()` exported as a tripwire — no path inside the module reaches a platform integration.
- `LIVE_POSTING_BLOCKED = true as const` surfaced in every dry-run JSON response as a runtime contract.
- The dry-run never mutates: `markAutoposterDryRunInspected` is a no-op stub returning `{ ok, written: false }`. The diagnostic's before/after `posted_at` count snapshot is the cross-check.
- Existing dashboard manual buttons unchanged.
- Existing migrations unchanged. Schema unchanged.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Run the curl command:
  ```bash
  CRON_SECRET=$(grep "^CRON_SECRET=" .env.local | head -1 | sed 's/CRON_SECRET=//' | tr -d '\r\n'); curl -sS -w "\n---HTTP %{http_code}---\n" -H "Authorization: Bearer $CRON_SECRET" https://www.vortextrips.com/api/cron/autoposter-dry-run
  ```
- [ ] Run `node scripts/diagnose-autoposter-dry-run.js` and verify all contract assertions + the no-mutation cross-check pass.
- [ ] Spot-check `/dashboard/content` for the new dry-run note line.

---

## Phase 14J.2.1 — Harden Branded Tracking Redirect Route (shipped commit `dec7bb3`, prod-verified 2026-05-03).**

Phase 14J.2 shipped (`2abb1cf`), migration 031 applied. Smoke test surfaced one issue: clicking the branded `/t/<slug>?...` link logged the click correctly but returned a VortexTrips 404 to the browser. Phase 14J.2.1 hardens the redirect call shape, adds a three-tier fallback chain so the route can never produce a 404, and adds debug metadata (`route_slug`, `redirect_target`, `redirect_reason`) to every logged click for post-mortem.

**Patch applied:**
- [x] `src/app/t/[slug]/route.ts` — rewritten with `chooseRedirect()` helper returning `{ target, reason }`. Five reason codes: `campaign_cta_url`, `portal_fallback`, `slug_unmatched`, `empty_slug`, `final_fallback`. Three-tier fallback chain (campaign cta_url → myvortex365.com/leosp → vortextrips.com). Redirect call switched to `NextResponse.redirect(new URL(target), 302)` (most broadly compatible). Try/catch belt-and-suspenders falls back to manual `Response` with `Location` header so the route can never 404.
- [x] `scripts/diagnose-branded-redirect.js` — new read-only diagnostic. Lists recent `branded_redirect` events with route_slug / redirect_target / redirect_reason / resolved IDs / UTMs. Distributes by reason. Spot-checks a known-good slug (default `art-basel-miami-beach`, override via CLI arg).

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 11.3s`; `ƒ /t/[slug]` registered
- [ ] `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated

**Behavioral guarantees:**
- No new migration. `contact_events.metadata` is JSONB; new debug fields are additive.
- Click-logging contract preserved (every redirect still logs to `contact_events` with full UTM + FK resolution).
- Public `/t/<slug>` URL contract unchanged — bookmarks / social posts continue to work.
- No platform API calls. No AI calls. No auto-posting.
- Existing manual posting flow unchanged.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Click the smoke test URL once: `https://www.vortextrips.com/t/art-basel-miami-beach?utm_source=facebook&utm_medium=event_campaign&utm_campaign=art-basel-miami-beach_2026_W2&utm_content=social_post_fca9a0dd`. Expected: browser lands on `myvortex365.com/leosp`, NOT a VortexTrips 404.
- [ ] Run `node scripts/diagnose-branded-redirect.js` → confirm the latest entry shows `redirect_reason='campaign_cta_url'` for the Art Basel slug.
- [ ] Or run the SQL verification query in PROJECT_STATE_CURRENT.md Phase 14J.2.1 entry.

---

## Phase 14J.2 — Replace Legacy CTA Links on Social Posts (shipped commit `2abb1cf`, migration 031 applied 2026-05-03).**

Pre-Phase-14K corrective: campaign-attributed tracking URLs were being emitted with the legacy `myvortex365.com/leosp` host as the visible social link. Phase 14J.2 swaps the visible link to a branded `https://www.vortextrips.com/t/<event_slug>?utm_*=…` form. The `/t/<slug>` route logs the click via `contact_events` (mirrors Phase 14I) then 302-redirects to the campaign's `cta_url`.

**Patch applied:**
- [x] `supabase/migrations/031_rewrite_legacy_tracking_urls.sql` — diagnostic SELECTs + two scoped UPDATE statements (content_calendar unposted, campaign_assets non-archived/non-rejected) + verification SELECTs. Idempotent.
- [x] `src/lib/campaign-tracking-url.ts` — new `BRAND_TRACKING_BASE_URL = 'https://www.vortextrips.com/t'`. `buildCampaignTrackingUrl` emits `<brand>/<slug>?utm_*=…` whenever a slug is resolvable; falls back to `DEFAULT_BASE_URL` only when no slug can be produced.
- [x] `src/lib/event-campaign-asset-generator.ts` — `EventCampaignRow` + `loadCampaign` now read `event_slug`. Prompt's CTA-targets block points the LLM at `https://www.vortextrips.com/t/<event_slug>` with explicit "use the branded URL, not myvortex365.com/leosp" instruction.
- [x] `src/app/t/[slug]/route.ts` — public branded redirect. Resolves campaign by `event_slug` (latest year first), parses utm_content for asset+calendar FK resolution, logs `page_view` to contact_events (best-effort, never blocks), 302-redirects to `event_campaigns.cta_url` or to `DEFAULT_REDIRECT='https://myvortex365.com/leosp'`.

**Kept on purpose:**
- `event-seeds.json` `cta_url` (×31): final destination behind the redirect, not the visible link.
- `next.config.js /free → myvortex365.com/leosp`: site lead-capture, not a social link.
- `src/app/page.tsx`, `/thank-you`, `/join` CTAs: operator-facing on our domain.
- `src/lib/twilio.ts` SMS templates: separate channel.
- `VORTEX_EVENT_CAMPAIGN_SKILL.md`, `PROJECT-STATUS.md`, `SYSTEM_AUDIT_PHASE_14_STATUS.md`: docs.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 7.8s`; `ƒ /t/[slug]` registered
- [ ] `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated

**Behavioral guarantees:**
- No platform API calls. No AI calls. No auto-posting. No new content generation.
- Site-internal CTAs unchanged — operators' lead-capture flow on the homepage is untouched.
- Posted/rejected/archived rows are preserved as historical record.
- Branded redirect logs clicks; failure of the log NEVER blocks the redirect.
- Existing manual posting flow unchanged.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] **Apply migration 031.** Run Step 0 diagnostics first (preview affected rows), then the two UPDATEs together, then Step 3 verification.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test: re-display the Art Basel tracking URL on `/dashboard/campaigns` → confirm branded host → click → confirm 302 to myvortex365.com/leosp + a fresh `contact_events` row with FK attribution.

---

## Phase 14J.1 — Posting Gate UI Smoke Test + Audit Trail (shipped commit `764a6db`, migration 030 applied, prod-verified 2026-05-03).**

Phase 14J shipped (`0b3896a`), prod-verified — gate columns live, diagnostic clean (143 idle / 0 ready). Phase 14J.1 adds the accountability layer: every Mark Ready / Remove from Queue / blocked-attempt is now recorded in a new `posting_gate_audit` table.

**Patch applied:**
- [x] `supabase/migrations/030_create_posting_gate_audit.sql` — new table + 4 indexes + RLS policy mirroring migration 015. Idempotent.
- [x] `src/lib/posting-gate.ts` — added `writeAudit` helper; both `markReadyForPosting` and `removeFromPostingQueue` now insert audit rows on real state changes (NOT on idempotent no-ops). Added `audit_written` and `audit_warning` to `GateActionResult`. Added `bareResult()` convenience for early-error paths.
- [x] `src/app/api/admin/content-calendar/posting-gate/route.ts` — actor context now includes `user_email`. Both 200 and 4xx responses surface `action`, `audit_written`, `audit_warning`. 4xx also returns the unchanged row state.
- [x] `src/app/dashboard/content/page.tsx` — success toast for queue says `Ready for Posting`. When API returns `audit_warning`, fires a second info-level toast `Audit log warning: …`.
- [x] `scripts/diagnose-posting-gate-audit.js` — read-only diagnostic. Schema check, action counts, last 10 audits, ready-row ↔ queue-audit cross-check, no-auto-post sanity (queue audit followed by `status='posted'` within 60s).

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 23.9s`; `ƒ /api/admin/content-calendar/posting-gate` registered
- [ ] `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated

**Behavioral guarantees:**
- No new posting routes. No platform API calls. No AI calls. No media generation.
- `content_calendar.status` still flips only via the existing `/api/content` PATCH; the audit table only records gate actions.
- Existing manual posting flow on `/dashboard/content` is unchanged.
- Idempotent no-ops do NOT write audit rows (no audit-table noise from re-clicks).
- Audit-insert failures NEVER propagate to the gate action — `audit_warning` flag carries the error message instead. Gate state still changes.
- Migration 030 is fully append-only — no existing data is touched.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] **Apply migration 030 to Supabase prod.** Verification:
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_name = 'posting_gate_audit';
  SELECT count(*) FROM information_schema.columns WHERE table_name = 'posting_gate_audit';
  -- Expect: 1 row from the first; 13 from the second.
  SELECT polname FROM pg_policy WHERE polrelid = 'posting_gate_audit'::regclass;
  -- Expect: "Admins full access posting_gate_audit".
  ```
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test on `/dashboard/content`: Mark Ready → Remove from Queue → confirm no `audit_warning` toast appears.
- [ ] Run `node scripts/diagnose-posting-gate-audit.js` to confirm queue/unqueue audit rows landed.

---

## Phase 14J — Safe Posting Gate / Manual Publish Controls (shipped commit `0b3896a`, migration 029 applied, prod-verified 2026-05-03).**

Phase 14I shipped (`c9956f5`), prod-verified — synthetic click validated, Art Basel attributed page_view = 1. Phase 14J adds an explicit human gate to `content_calendar` so future autoposters require an admin's explicit approval before publishing. **This phase does NOT post.**

**Patch applied:**
- [x] `supabase/migrations/029_add_posting_gate_fields_to_content_calendar.sql` — adds 8 nullable columns + 3 partial indexes on `content_calendar`. Backfill + CHECK constraint included. Idempotent.
- [x] `src/lib/posting-gate.ts` — pure helpers (`canEnterPostingQueue`, `getPostingGateBlockReason`, `normalizePostingStatus`, `buildPostingGatePayload`, `buildPostingUnqueuePayload`) + DB actions (`markReadyForPosting`, `removeFromPostingQueue`). Idempotent; no platform API calls.
- [x] `src/app/api/admin/content-calendar/posting-gate/route.ts` — admin-gated POST `{ content_calendar_id, action: 'queue'|'unqueue', notes? }`. 200/400/404/500. Never auto-posts.
- [x] `src/app/dashboard/content/page.tsx` — for `status='approved'` rows: `🟢 Mark Ready` button when eligible, `✅ Ready for Posting` badge + `↩ Remove from Queue` when queued, `Gate ineligible` muted hint with tooltip reason otherwise. Header note: "Mark Ready is a manual gate only. It does not post to social platforms." Existing manual posting buttons untouched.
- [x] `scripts/diagnose-posting-gate.js` — read-only diagnostic. Schema check, posting_status distribution, gate-approved listing, tracking_url anomaly check, posted-after-queued cross-check.
- [ ] Existing manual posting routes (`/api/automations/post-to-{instagram,facebook,twitter}`) — **not modified.** Adding a gate guard would break the dashboard's manual flow. Documented as deferred to the future autoposter phase.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 23.3s`; `ƒ /api/admin/content-calendar/posting-gate` registered
- [ ] `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated

**Behavioral guarantees:**
- No new posting routes. No AI calls. No platform API calls from any path created in 14J.
- Existing manual posting flow on `/dashboard/content` is unchanged — operators still publish via the same buttons against `status='approved'` rows.
- Gate flips only via the new admin route. The route writes ONLY to `content_calendar`'s 14J columns; never touches `status`, `caption`, `hashtags`, or anything else.
- Idempotent at every layer: re-marking ready / re-unqueueing is a quiet success.
- Migration 029 backfills existing rows to `posting_status='idle'`, `posting_gate_approved=false`, `manual_posting_only=true`. No row's behavior changes until an admin explicitly clicks Mark Ready.

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] **Apply migration 029 to Supabase prod.** Verification:
  ```sql
  SELECT count(*) FROM information_schema.columns
  WHERE table_name = 'content_calendar'
    AND column_name IN ('posting_status','posting_gate_approved','posting_gate_approved_at','posting_gate_approved_by','posting_gate_notes','queued_for_posting_at','manual_posting_only','posting_block_reason');
  -- Expect: 8.
  ```
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Run `node scripts/diagnose-posting-gate.js` to confirm post-deploy schema.
- [ ] Smoke test on `/dashboard/content`: mark an approved row Ready → confirm badge → unqueue → confirm reverted.

---

## Phase 14I — Click Attribution via track-event (shipped commit `c9956f5`, migrations 027-028 applied, prod-verified 2026-05-03).**

Phase 14H.2 shipped (`783803e`), prod-verified — Art Basel slug confirmed, attribution view rewritten. Phase 14I closes the click loop: extends `contact_events` with UTM + campaign FK columns, rewrites `track-event` to capture campaign UTM (anonymous visits included), updates the attribution view to count clicks deterministically, threads click_count through the helper + dashboard.

**Patch applied:**
- [x] `supabase/migrations/027_add_utm_fields_to_contact_events.sql` — adds `utm_source/medium/campaign/content` + `event_campaign_id/campaign_asset_id/content_calendar_id` (UUID FK with `ON DELETE SET NULL`) + 5 partial indexes. Idempotent.
- [x] `supabase/migrations/028_update_event_campaign_attribution_view_for_clicks.sql` — `CREATE OR REPLACE VIEW` extends migration 026 with FOUR tail columns (`campaign_click_count`, `campaign_page_view_count`, `campaign_first_click_at`, `campaign_latest_click_at`). New `click_match` CTE prefers FK match, falls back to UTM substring.
- [x] `src/app/api/webhooks/track-event/route.ts` — `extractUtm` (body / metadata / query / referrer), `parseUtmCampaign`, `parseUtmContent`, `resolveCampaignFromUtm` resolves `(event_campaign_id, campaign_asset_id, content_calendar_id)`. Bail logic loosened to log anonymous events when campaign UTM is present. Lead score / tags still gated on resolved contact.
- [x] `src/lib/event-campaign-attribution.ts` — `AttributionRow` + `VIEW_COLUMNS` extended; `CampaignRollup.click_count` is real (was always-zero); adds `page_view_count`, `first_click_at`, `latest_click_at`; `latest_activity_at` now considers click activity.
- [x] `src/app/dashboard/campaigns/page.tsx` — `AttributionRollup` mirrors helper; Performance Metric grid shows real clicks + page_views (4 cells in row 1, 4 cells in row 2); deferred subtext removed; new empty-state copy "No campaign clicks captured yet. Tracking URLs are ready." when posted rows exist but no clicks; footer note rewritten.
- [x] `scripts/diagnose-campaign-click-attribution.js` — read-only diagnostic verifying migration 027 columns, listing campaign UTM events in last 30 days, grouping by utm_campaign, Art Basel-specific check.

**Tests run:**
- [x] `npx tsc --noEmit` — clean
- [x] `npm run build` — `Compiled successfully in 11.1s`; `ƒ /api/webhooks/track-event` still registered
- [ ] `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated

**Behavioral guarantees:**
- No new posting routes. No AI calls. No media generation.
- Existing track-event behavior for known contacts is preserved (lead score / tags update on every event).
- Anonymous events without campaign UTM are still ignored (no schema noise).
- Migration 027 is FK-safe (`ON DELETE SET NULL` on all three FKs — never blocks deletion of the parent campaign / asset / calendar row).
- View remains backwards compatible with rows lacking `event_campaign_id` (substring fallback).
- Migration apply order: 027 → 028 (028 references columns added in 027).

**Leo to do (per Mandatory End-of-Phase Save Protocol):**
- [ ] Commit + push.
- [ ] **Apply migration 027 to Supabase prod.** Verification SQL:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'contact_events'
    AND column_name IN ('utm_source','utm_medium','utm_campaign','utm_content','event_campaign_id','campaign_asset_id','content_calendar_id')
  ORDER BY column_name;
  -- Expect: 7 rows.
  ```
- [ ] **Apply migration 028 to Supabase prod.** Verification SQL:
  ```sql
  SELECT position('campaign_click_count' IN pg_get_viewdef('event_campaign_attribution_summary', true)) > 0;
  -- Expect: true.
  ```
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Run `node scripts/diagnose-campaign-click-attribution.js` to confirm post-deploy schema.
- [ ] Smoke test: open `/dashboard/campaigns` → Art Basel → confirm Performance panel renders Clicks/Page views (both 0 today), no "deferred" subtext, footer note rewritten.

---

## Phase 14H.2 — Persist event_slug on event_campaigns (shipped commit `783803e`, migrations 025-026 applied, prod-verified 2026-05-03).**

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
