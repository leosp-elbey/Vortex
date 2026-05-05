# VortexTrips Build Progress

**Last updated:** 2026-05-03 (Phase 14L.2.5 deployed; 16 of 25 TikTok scripts backfilled in production. Phase 14L.2.6 in working tree — controlled HeyGen batch unlock: replaces `--limit=1` pilot guard with default cap 5 / absolute cap 10 (`--allow-large-heygen-batch`), pre-flight refusal contract, new diagnostic section 6e2. No HeyGen call fired. No mutations. No platform calls.)
**Last code-shipping commit:** `2b838ce` (Phase 14L.2.5: TikTok video-script backfill generator and readiness diagnostic)
**Status:** 🚀 LIVE on vortextrips.com · Phases 0 → 12.8 shipped · Phase 13 code-side complete · **Phases 14A → 14L.2.5 deployed and verified on prod** · **Phase 14L.2.6 in working tree** — controlled HeyGen batch unlock. Live posting still BLOCKED. 16 TikTok rows now HeyGen-ready (script-backfilled); 9 still need scripts; 5 already rendered to permanent Supabase URLs.

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

**Phase 14L.2.6 — Controlled HeyGen Batch Unlock (in working tree, 2026-05-03 — no HeyGen call fired; default DRY-RUN; no mutations; no platform calls).**

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
