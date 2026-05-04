# VortexTrips — Current Project State

**Last updated:** 2026-05-03 (Phase 14L.1 backfill + caption cleanup applied successfully. Phase 14L.2 in working tree — migration 032, media_status field, and DRY-RUN media-generation worker scaffold. No mutations. No platform calls. No provider API calls.)
**Last known good commit:** `7e8ec63` — "Phase 14L.1: tracking URL backfill and media generation planner dry-run only"
**Production:** vortextrips.com (LIVE; **Phase 14A → 14L.1 deployed + applied**; Supabase migrations 017-031 applied; **migration 032 pending**; Hobby plan, 4 / 4 cron slots used)

**Live posting status:** STILL BLOCKED. Phase 14L.2 lands the storage shape (migration 032 adds `content_calendar.video_url` + `media_status` + worker fields), threads the new columns through both gates, and ships a DRY-RUN media-generation worker scaffold with provider stubs. Real Pexels / OpenAI image / HeyGen integration is intentionally deferred to Phase 14L.2.1 with explicit operator approval. Live autoposter (Phase 14K.1) does not start until media generation is wired and a worker run produces non-empty `media_status='ready'` populations on Instagram + TikTok rows.

---

## Phase 14L.2 — Media Generation Storage + Worker Foundation (in working tree, 2026-05-03 — migration 032 pending; --apply mode is a stub)

### What this phase ships

Phase 14L (deployed `810999e`) gated posting on media readiness. Phase 14L.1 (deployed `7e8ec63`) backfilled branded tracking URLs + cleaned up legacy caption links. Phase 14L.2 adds the storage and worker scaffold needed before a real generation worker can populate `image_url` / `video_url` on the rows blocked by the media gate.

The two preflight problems Phase 14L surfaced — Instagram rows missing image, TikTok rows missing video — could not be fixed without a place to land the generated URLs. Organic TikTok rows had no `content_calendar.video_url` column; organic rows generally had no per-row generation state. Migration 032 closes that gap.

### Migration 032 — `032_add_video_url_and_media_status_to_content_calendar.sql`

**Status: pending — must be applied before this code is deployed.** Without 032 applied, the `content_calendar` SELECTs in `posting-gate.ts`, `autoposter-gate.ts`, and `dashboard/content/page.tsx` will return `42703` ("column does not exist") for `video_url` / `media_status` / `media_error`. The two scripts (diagnose, generate) gracefully fall back to legacy SELECTs and warn; the API routes and dashboard do not.

What 032 adds:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `video_url` | TEXT | NULL | public URL of generated/attached video media (was missing — organic TikTok rows had nowhere to land) |
| `media_status` | TEXT | `'pending'` | per-row state: `pending` / `ready` / `failed` / `skipped` (CHECK-constrained) |
| `media_generated_at` | TIMESTAMPTZ | NULL | timestamp the worker last wrote a media URL |
| `media_source` | TEXT | NULL | provider label: `pexels` / `openai-image` / `heygen` / `manual` (free-text — CHECK deferred until provider list stabilizes) |
| `media_error` | TEXT | NULL | most recent worker error (worker truncates to 1000 chars before insert) |

Plus a backfill: rows that already have `image_url` or `video_url` populated and aren't in a terminal state get `media_status='ready'` so the gate's "trust but verify" check passes the same as before. CHECK constraint and partial indexes (`media_status WHERE NULL OR pending OR failed`, `media_generated_at WHERE NOT NULL`) are added at the end. All operations idempotent (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, CREATE INDEX IF NOT EXISTS).

### Files added

| File | Purpose |
|---|---|
| `supabase/migrations/032_add_video_url_and_media_status_to_content_calendar.sql` | Schema + backfill + indexes for the worker queue. |
| `scripts/generate-missing-media.js` | DRY-RUN media-generation worker scaffold. `--dry-run` (default) or `--apply` / `--generate` (intentional stub — refuses to call provider APIs and exits with code 3 so CI can't accidentally enable generation by passing the flag). Mirrors `media-readiness.ts` rules; groups work by (campaign × platform × asset_type × target table); reports per-platform recommended provider; gracefully falls back to legacy SELECT if migration 032 hasn't been applied yet. Reports `media_status` distribution + posted_at no-mutation cross-check. |

### Files updated

| File | Change |
|---|---|
| `src/lib/media-readiness.ts` | New `MediaStatus` type ('pending'/'ready'/'failed'/'skipped'); `MediaReadinessRow` gains optional `media_status` + `media_error`; `MediaReadinessResult` gains `media_status` field and the new `'failed'` outcome; `validateMediaReadiness` short-circuits on `media_status='failed'` (with `media_error` detail), blocks `media_status='skipped'` only on platforms that hard-require media, and verifies `media_status='ready'` rows actually carry a URL ("trust but verify"); `getMediaReadinessLabel` adds `'Media failed'` label. |
| `src/lib/posting-gate.ts` | `PostingGateRow` gains optional `media_status` / `media_error`; `POSTING_GATE_ROW_SELECT_WITH_MEDIA` extended to include row-level `image_url`, `video_url`, `media_status`, `media_error`; `flattenJoined` now prefers the joined campaign_asset URLs but falls back to row-level columns from migration 032 (organic rows). Both `getPostingGateBlockReason` and `validateManualPostingGate` pass `media_status` + `media_error` into `validateMediaReadiness`. |
| `src/lib/autoposter-gate.ts` | `ContentCalendarRow` gains `media_status` + `media_error`; ROW_SELECT extended with the new columns; `flattenAutoposterRow` does the campaign_asset → row-level fallback merge; `validateAutoposterCandidate` passes both new fields into the validator. |
| `src/app/dashboard/content/page.tsx` | `ExtendedContentItem` gains `video_url` / `media_status` / `media_error`; SELECT extended; `MEDIA_BADGE_STYLES` gains `failed: 'bg-rose-100 text-rose-700'`; `computeMediaReadiness` passes `media_status` + `media_error` and falls back to row-level `video_url` for organic rows. No new buttons added. |
| `scripts/diagnose-media-readiness.js` | Detects whether migration 032 is applied and runs in either mode; reports `media_status` distribution; new "rows ready after media" count; mirrors the new validator rules (failed/skipped/trust-but-verify). |

### Migration created?

**Yes — `supabase/migrations/032_add_video_url_and_media_status_to_content_calendar.sql`.** Apply BEFORE deploying this code. Both scripts gracefully degrade if not yet applied; the API routes and dashboard SELECTs do not. See "Migration application" section at the bottom of this entry for the SQL verification queries.

### Media readiness rules after this patch

| Input | Behavior |
|---|---|
| `media_status === 'failed'` | Blocks unconditionally with `media error: <media_error>` if available, else `media generation failed` |
| `media_status === 'skipped'` + platform requires media + no URL present | Blocks with `media_status='skipped' but platform <p> requires media` |
| `media_status === 'skipped'` + text-OK platform | Passes (text-only allowed) |
| `media_status === 'ready'` + URL present | Passes |
| `media_status === 'ready'` + URL missing on required-media platform | Blocks with `media_status='ready' but no image_url/video_url present` |
| `media_status === 'pending'` or `null` | No effect on its own; platform rule + image_prompt check decide |
| Instagram missing both image_url AND video_url | Blocks `missing required image_url for Instagram` |
| TikTok missing video_url | Blocks `missing required video_url for TikTok` |
| `image_prompt` set + no image_url | Blocks `campaign media prompt exists but generated media is missing` |
| `video_prompt` set + no video_url | Same canonical message |
| Facebook / Twitter text-only | Passes — `'text-only-allowed'` outcome |

### Worker behavior

`scripts/generate-missing-media.js` ships as a planner today. Its real-world effects:

- DEFAULTS to dry-run. `--dry-run` flag is accepted explicitly for clarity.
- `--apply` / `--generate` is a stub: prints a clear "stubbed in Phase 14L.2 — provider integration deferred to 14L.2.1" notice and exits with code 3 so CI cannot interpret it as success.
- Walks unposted, gate-eligible candidates and recommends a provider per group:
  - Image → Pexels (PEXELS_API_KEY) → OpenAI image (OPENAI_API_KEY) fallback
  - Video → HeyGen (HEYGEN_API_KEY) when `video_script` or `video_prompt` is non-empty
  - Video without script → reports `⚠ blocked: video script missing` so the operator can fix the upstream content generator first
- Snapshots `posted_at` row count BEFORE and AFTER to prove zero mutations.
- Falls back to legacy SELECT if migration 032 hasn't been applied; the `media_status` distribution report shows `n/a` in that case.

### Real provider / platform calls?

**No.** No Pexels, OpenAI, HeyGen, Supabase Storage upload, or platform API was invoked by this phase's code. The diagnose + generate scripts only run `SELECT` queries.

### Rows mutated?

**No.** posted_at row count snapshot before/after each script run is unchanged at 22. No `INSERT` / `UPDATE` / `DELETE` was issued by this phase's code paths.

### Tests run

- `npx tsc --noEmit` → ✅ PASS (clean)
- `npm run build` → ✅ PASS (`Compiled successfully in 26.8s`; route table unchanged — no new routes added in this phase)
- `node scripts/diagnose-media-readiness.js` → ✅ PASS (run pre-migration; reports schema gap + 39 rows blocked, 68 ready, posted_at unchanged at 22)
- `node scripts/generate-missing-media.js` → ✅ PASS dry-run (107 scanned, 68 covered, 9 image-only, 23 video-only, 7 both, 25 video blocked-no-script, posted_at unchanged at 22)
- `npm run lint` → ❌ not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated to this phase. Same TypeError("Converting circular structure to JSON") as in 14K / 14L.

### Diagnostic results (pre-migration baseline, 2026-05-03)

```
0. Migration 032: not yet applied (banner shown)
1. Caption legacy-link debt: 0  (Phase 14L.1 cleanup landed)
2. Branded tracking_url:    8  (Phase 14L.1 backfill landed)
3. Instagram media gap:     3 of 26 unposted IG rows missing both
4. TikTok video gap:        30 of 30 unposted TikTok rows missing video
5. Prompt without media:    0
6. Total blocked:           39 of 107 unposted
   30  missing required video_url for TikTok
   14  campaign media prompt exists but generated media is missing
    3  missing required image_url for Instagram
6b. media_status distribution: n/a — migration 032 not applied
6c. ready/text-only-allowed:   68 of 107
7. posted_at unchanged (22 → 22)
```

### Risks

- **Migration 032 must apply before the code deploys.** API routes and the dashboard SELECT the new columns; without 032 they will throw 500s on the `posting-gate` paths and the `/dashboard/content` page will fail to load. Order: apply 032 → deploy code.
- **--apply is a stub.** A future engineer who removes the stop-and-exit block must take care that the worker writes `media_status='ready'` AND a non-empty URL atomically; otherwise the gate's "trust but verify" rule will refuse to post the row.
- **Organic video remains blocked at the source.** 25 unposted organic TikTok rows have no `video_script` and HeyGen needs one. The worker will refuse those even after provider wiring; the upstream weekly-content generator must be extended to author scripts before HeyGen can do anything.
- **`media_source` is free-text by design.** A CHECK constraint deferred until provider list stabilizes. Worker code is the only writer; misspelled labels will land but won't break anything.
- **`media_status` defaults to `'pending'` for new rows.** That's intentional but means rows created BEFORE 032's backfill ran will be classified `'ready'` (because they have URLs) while rows created AFTER will start `'pending'` even when the weekly-content cron immediately sets `image_url`. The weekly-content cron should be updated in Phase 14L.2.1 to set `media_status='ready'` + `media_source='pexels'` + `media_generated_at=now()` after `fetchAndStoreImage` succeeds. Until then, organic rows from the weekly cron are correctly classified by the gate (they have URL → 'trust but verify' passes), but the `media_status` column stays at `'pending'`.

### Migration application instructions

Apply the migration **before** deploying the code change (default ordering — code references new columns the migration creates).

Open the Supabase SQL Editor and paste the contents of `supabase/migrations/032_add_video_url_and_media_status_to_content_calendar.sql`. Run it. It is idempotent — re-running on an already-migrated DB is a no-op for every operation.

### Verification SQL (paste into Supabase SQL Editor after applying 032)

```sql
-- 1. Confirm columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'content_calendar'
  AND column_name IN ('video_url', 'media_status', 'media_generated_at', 'media_source', 'media_error')
ORDER BY column_name;
-- Expect 5 rows.

-- 2. Confirm CHECK constraint
SELECT conname FROM pg_constraint
WHERE conname = 'content_calendar_media_status_check';
-- Expect 1 row.

-- 3. Confirm partial indexes
SELECT indexname FROM pg_indexes
WHERE tablename = 'content_calendar'
  AND indexname IN ('idx_content_calendar_media_status', 'idx_content_calendar_media_generated_at');
-- Expect 2 rows.

-- 4. Confirm backfill landed
SELECT media_status, count(*) FROM content_calendar GROUP BY media_status ORDER BY 2 DESC;
-- Expect rows with image_url/video_url to be 'ready'; the rest NULL or 'pending'.

-- 5. posted_at row count cross-check (must equal 22)
SELECT count(*) FROM content_calendar WHERE posted_at IS NOT NULL;
```

### Deploy instructions

After migration 032 is verified above:

1. Push commit + ensure `git push origin main` returns "Everything up-to-date".
2. Deploy: `npx vercel --prod --yes` (no `vercel.json` change; no new cron registration).
3. Open `/dashboard/content` while signed in as admin — confirm the page loads (the SELECT now includes `video_url`, `media_status`, `media_error`).

### Smoke-test checklist

- [ ] Apply migration 032 in Supabase SQL Editor
- [ ] Run verification SQL queries 1-5 above and confirm expected counts
- [ ] Deploy code
- [ ] Open `/dashboard/content` — confirm page loads, badges render (no console errors)
- [ ] Confirm at least one previously-failing-gate row still shows the correct refusal reason (the validator's behavior should not regress)
- [ ] Run `node scripts/diagnose-media-readiness.js` against prod env — expect "Migration 032 applied ✓" banner; `media_status` distribution should show non-trivial `'ready'` count; posted_at unchanged at 22
- [ ] Run `node scripts/generate-missing-media.js` (DRY-RUN) — expect a clean group breakdown; posted_at unchanged at 22
- [ ] Confirm `SELECT count(*) FROM content_calendar WHERE posted_at IS NOT NULL` is still 22

### Recommended next phase

**Phase 14L.2.1 — Wire real provider integrations into `scripts/generate-missing-media.js`.** Concrete order:
1. Implement Pexels image fetch + Supabase Storage re-upload (mirror `fetchAndStoreImage` in `weekly-content/route.ts`); land the public URL in `image_url` and set `media_status='ready'`, `media_source='pexels'`, `media_generated_at=now()`.
2. Implement OpenAI image fallback for Pexels misses.
3. Implement HeyGen video generation, but only for rows with a `video_script` or `video_prompt`. Document upstream that organic TikTok rows need scripts authored first (extend the weekly-content cron's prompt to include a TikTok video script).
4. Update `weekly-content/route.ts` to set `media_status='ready'` + `media_source='pexels'` after `fetchAndStoreImage` succeeds, so new organic rows don't sit at `'pending'` while having a URL.
5. After enough rows clear the gate, ship Phase 14K.1 (live autoposter) — at that point the gate will block anything that still doesn't have media.

---

## Phase 14L.1 — Media Generation + Tracking URL Materialization Preflight (in working tree, 2026-05-03 — dry-run scripts only, no mutations, no platform calls)

### Why tracking_url was null on those 7 rows

All 7 unposted rows with the legacy `myvortex365.com/leosp` link in their captions are **campaign-originated** — every one links back via `campaign_asset_id` to a `campaign_assets` row whose `campaign_id` is `7ca6bc3f-5cb2-4bdf-9883-1470a31c8a8f` ("Art Basel Miami Beach" 2026, slug `art-basel-miami-beach`, cta_url `https://myvortex365.com/leosp`).

Both `content_calendar.tracking_url` AND the linked `campaign_assets.tracking_url` are null on every one of them, which means they were inserted by a code path that ran **before Phase 14H.1** added tracking-URL materialization in `push-to-calendar` — or via an earlier asset-generator path that bypassed the helper. Phase 14H.1 only retroactively fills the row's tracking URL when a NEW push happens; it does not back-fill historical rows.

The fix is mechanical: every field `buildCampaignTrackingUrl` needs (event_slug, event_year, wave, asset_type, assetId, platform) is recoverable from the asset → campaign chain. Backfill is safe.

### Files added (this phase)

| File | Purpose |
|---|---|
| `scripts/backfill-content-calendar-tracking-urls.js` | Resolution + writer. `--dry-run` (default) or `--apply`. Only touches unposted rows whose `campaign_asset_id` is set and `tracking_url` is null. Mirrors `buildCampaignTrackingUrl` logic in plain JS. Defensively re-checks the safety filter inside each UPDATE so a row that flips status mid-run is left alone. Back-fills `campaign_assets.tracking_url` only when currently null. Posted_at no-mutation cross-check. Verification SQL at the end. |
| `scripts/plan-media-generation.js` | Read-only planner. Groups missing-media rows by (campaign × platform × asset_type), picks recommended source per group (Pexels → OpenAI image fallback for images, HeyGen for video), and reports key presence (PEXELS / OPENAI / HEYGEN). Surfaces a `content_calendar.video_url` schema gap that organic TikTok rows hit. No API calls; no mutations. |
| `scripts/inspect-null-tracking-rows.js` | One-shot ground-truth inspection used to confirm all 7 rows are campaign-originated under one campaign. Read-only. Kept in repo for future debugging. |

### Backfill dry-run results

- 79 unposted rows have `tracking_url IS NULL`
  - 71 organic (no `campaign_asset_id` — NOT backfillable; they never had a campaign tracking URL by design)
  - **8 campaign-linked, all eligible**, all under the Art Basel campaign
- Skipped: 0
- Proposed URLs all resolve to `https://www.vortextrips.com/t/art-basel-miami-beach?utm_source=<platform>&utm_medium=event_campaign&utm_campaign=art-basel-miami-beach_2026_W<wave>&utm_content=social_post_<8charAssetId>`
- `posted_at` count unchanged (22 → 22)

### Media generation plan (dry-run)

- 79 rows scanned → 47 already covered, 9 image-only, 16 video-only, 7 need both
- Groups identified:
  - Organic TikTok: 7 image + 21 video → image=Pexels(→OpenAI), video=HeyGen
  - Organic Twitter: 5 image → Pexels
  - Art Basel IG (asset_type=social_post, target table=campaign_assets): 2 image → Pexels
  - Art Basel TikTok (asset_type=social_post, target table=campaign_assets): 2 video → HeyGen
  - Organic FB: 1 image → Pexels
  - Organic IG: 1 image → Pexels
- All three generation API keys present (PEXELS_API_KEY, OPENAI_API_KEY, HEYGEN_API_KEY)
- **Schema gap:** organic TikTok rows have no `content_calendar.video_url` column to land a generated URL. A follow-on phase must add the column OR route organic video through `campaign_assets` first.

### Live posting

Still BLOCKED. Phase 14L.1 only writes scripts; nothing has been applied. Once the operator approves `--apply` on the backfill, the 8 Art Basel rows can pass the cleanup script's branded-prefix gate; the legacy-link cleanup can then rewrite their captions. Media generation remains DRY-RUN until a generation worker is built (Phase 14L.2).

---

## Phase 14L — Media Readiness + Caption Link Finalization (deployed and verified, 2026-05-03 — commit `810999e`)

Phase 14L closes two pre-flight blockers identified before Phase 14K.1 (live autoposter):

1. **Visible captions** can still contain `https://myvortex365.com/leosp` even when `tracking_url` is correctly branded. Public social posts must show the `vortextrips.com/t/<slug>` link, not the backend portal URL.
2. **Media readiness**: rows have no enforcement that an Instagram post has an image, that a TikTok post has a video, or that a row whose campaign attached an image_prompt actually has the resolved image_url before posting.

### Files added / changed

| File | Status | Purpose |
|---|---|---|
| `src/lib/media-readiness.ts` | **new** | Pure validators: `getRequiredMediaForPlatform`, `validateMediaReadiness`, `summarizeMediaReadiness`, `getMediaReadinessLabel` |
| `src/lib/posting-gate.ts` | **changed** | `PostingGateRow` gains optional `image_url`/`video_url`/`image_prompt`/`video_prompt`; `getPostingGateBlockReason` and `validateManualPostingGate` now run media readiness; exported `POSTING_GATE_ROW_SELECT_WITH_MEDIA` and `flattenPostingGateRow` so platform-poster routes can fetch the joined shape consistently |
| `src/lib/autoposter-gate.ts` | **changed** | `ContentCalendarRow` gains media inputs; ROW_SELECT now joins `campaign_assets`; `validateAutoposterCandidate` runs media readiness as final check |
| `src/app/api/automations/post-to-instagram/route.ts` | **changed** | SELECT joins campaign_asset; uses flattened row for gate + image_url |
| `src/app/api/automations/post-to-facebook/route.ts` | **changed** | Same pattern |
| `src/app/api/automations/post-to-twitter/route.ts` | **changed** | Same pattern |
| `src/app/api/content/route.ts` | **changed** | Bookkeeping-mode gate uses joined SELECT (media check skipped per spec) |
| `src/app/dashboard/content/page.tsx` | **changed** | Renders "Media ready / Media missing / Text-only allowed" badge per row; hides per-platform Post buttons when `media.blocked` |
| `scripts/cleanup-legacy-caption-links.js` | **new** | Safe one-shot cleanup. `--dry-run` (default) or `--apply`. Only touches unposted rows with branded `tracking_url`; preserves hashtags + copy; never modifies posted/rejected/archived rows |
| `scripts/diagnose-media-readiness.js` | **new** | Read-only diagnostic; reports caption legacy-link debt, branded-URL count, IG/TikTok media gaps, prompt-without-media rows, total blocked count, posted_at no-mutation cross-check |

### Migration created?

**No.** All Phase 14L work uses existing columns + a JOIN through `content_calendar.campaign_asset_id` to `campaign_assets`. No schema changes.

### Media readiness rules by platform

| Platform | Image | Video | Either-satisfies |
|---|---|---|---|
| Instagram | required | required | **yes** (image OR video posts both work) |
| TikTok | none | required | no — must be video |
| YouTube | none | required | no |
| Facebook | recommended | recommended | yes — text-only allowed |
| Twitter / X | recommended | recommended | yes — text-only allowed |
| Threads / LinkedIn | recommended | recommended | yes |
| Email / SMS / Web | none | none | n/a |

**Prompt-without-resolution rule:** for every platform, if `image_prompt` is non-empty and `image_url` is empty (or `video_prompt` non-empty + `video_url` empty), the gate refuses with `"campaign media prompt exists but generated media is missing"`.

### Live posting

Still BLOCKED. Phase 14L only ADDS gate refusals; it does not loosen any existing rule. Phase 14K.1 (live autoposter) requires both:
- `node scripts/cleanup-legacy-caption-links.js --apply` to run cleanly with verification SQL returning 0
- Media generation worker (future phase) to populate `campaign_assets.image_url` / `.video_url` so Instagram and TikTok rows actually pass the gate

---

## Phase 14J.2 — Replace Legacy CTA Links on Social Posts (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + migration 031 + deploy)

A campaign-link audit found that every campaign-attributed tracking URL was emitting `https://myvortex365.com/leosp?utm_*=…` as the visible social link. Phase 14J.2 swaps the visible link to a branded `https://www.vortextrips.com/t/<event_slug>?utm_*=…` form. The destination behind the redirect (still `myvortex365.com/leosp` by default) is unchanged.

### Where the legacy link was found

| Layer | File / Source | Action |
|---|---|---|
| Helper output | `src/lib/campaign-tracking-url.ts` `DEFAULT_BASE_URL` | **changed** — branded `/t/<slug>` is now the visible base |
| Asset generator prompt | `src/lib/event-campaign-asset-generator.ts` (CTA-targets block) | **changed** — points the LLM at `https://www.vortextrips.com/t/<slug>` |
| Seed file `cta_url` (×31) | `src/lib/event-seeds.json` | **kept** — `cta_url` is the redirect destination, not the visible link |
| Prod `event_campaigns.cta_url` (×6 rows) | DB | **kept** — same reason (now read by the `/t/<slug>` route) |
| Prod `content_calendar.tracking_url` (1 row, Art Basel `posting_status='ready'`) | DB | **rewrites if unposted** (migration 031 step 1) |
| `campaign_assets.tracking_url` (any non-NULL row) | DB | **rewrites if not posted/rejected/archived** (migration 031 step 2) |
| `next.config.js` `/free → myvortex365.com/leosp` | code (site redirect) | **kept** — site's own lead-capture, not a social link |
| `src/app/page.tsx` / `/thank-you` / `/join` CTAs | code (site UI) | **kept** — operator-facing CTAs on our domain |
| `src/lib/twilio.ts` SMS templates | code (SMS channel) | **kept** — separate channel, user spec called out social only |
| `VORTEX_EVENT_CAMPAIGN_SKILL.md`, `PROJECT-STATUS.md`, `SYSTEM_AUDIT_PHASE_14_STATUS.md` | docs | **kept** — historical record |

### Whether code, data, or both

**Both.** Code emitted the legacy link via `DEFAULT_BASE_URL` (helper) and the prompt's CTA list. Data (`content_calendar.tracking_url`, `campaign_assets.tracking_url`) was rewritten with the legacy host on every push since Phase 14H.1. Migration 031 backfills the data for unposted rows.

### New canonical VortexTrips link strategy

| Surface | Visible URL | Final destination |
|---|---|---|
| Social posts (campaign-attributed) | `https://www.vortextrips.com/t/<event_slug>?utm_*=…` | `event_campaigns.cta_url` (typically `myvortex365.com/leosp`) — reached via 302 from `/t/<slug>` |
| Site internal CTAs (homepage, thank-you, join) | direct `https://myvortex365.com/leosp` | unchanged — operator's lead-capture flow |
| SMS templates | direct `myvortex365.com/leosp` (kept short) | unchanged — separate channel |
| `/free` site redirect | unchanged 307 → `myvortex365.com/leosp` | unchanged |

The branded `/t/<slug>` route logs every click to `contact_events` with full UTM + FK resolution (mirrors Phase 14I track-event), then 302-redirects to the campaign's `cta_url`. UTM params are stripped from the redirect target so the final landing page stays clean.

### Files changed

**Created:**
- `supabase/migrations/031_rewrite_legacy_tracking_urls.sql` — read-only diagnostic SELECTs at the top + two scoped UPDATE statements + verification SELECTs at the bottom. Idempotent (`ILIKE '%myvortex365.com/leosp%'` filter excludes already-rewritten rows).
- `src/app/t/[slug]/route.ts` — branded redirect route. Server-side click logging via `contact_events` insert (best-effort, never blocks the redirect). Resolves campaign by `event_slug` (latest year first). Resolves `campaign_asset_id` + `content_calendar_id` from `utm_content` using the same UUID-prefix match as Phase 14I track-event. 302 to `event_campaigns.cta_url` or to `DEFAULT_REDIRECT='https://myvortex365.com/leosp'`.

**Updated:**
- `src/lib/campaign-tracking-url.ts` — added `BRAND_TRACKING_BASE_URL = 'https://www.vortextrips.com/t'`. `buildCampaignTrackingUrl` now constructs the visible URL from `BRAND_TRACKING_BASE_URL/<slug>` whenever a slug is resolvable (either supplied as `eventSlug` or derived via `slugifyEventName(eventName)`). Falls back to the legacy `DEFAULT_BASE_URL` only when no slug can be produced.
- `src/lib/event-campaign-asset-generator.ts` — `EventCampaignRow` interface gains `event_slug: string | null`. `loadCampaign` SELECT extended to include `event_slug`. `buildUserPrompt` CTA-targets block now points the LLM at `https://www.vortextrips.com/t/<event_slug>` and includes an explicit "use the branded URL, not myvortex365.com/leosp" instruction.

**Kept on purpose:** `event-seeds.json` (`cta_url` is the redirect destination), homepage / thank-you / join CTAs (site lead-capture), SMS templates (separate channel), all docs (historical record).

### Migration / script created

`supabase/migrations/031_rewrite_legacy_tracking_urls.sql`:

- **Step 0 (commented):** diagnostic SELECTs that show exactly which rows will be rewritten and which will be skipped. Run these first to preview.
- **Step 1:** UPDATE `content_calendar.tracking_url` where it contains `myvortex365.com/leosp` AND `status NOT IN ('posted','rejected')`. New value built inline from joined `event_campaigns` (slug, year) and `campaign_assets` (asset_type, wave, id-short).
- **Step 2:** UPDATE `campaign_assets.tracking_url` where it contains `myvortex365.com/leosp` AND `status NOT IN ('posted','rejected','archived')`. Same URL formula.
- **Step 3 (commented):** verification SELECTs that count remaining legacy URLs (should be 0 for unposted rows; posted/rejected rows are deliberately preserved).

Idempotent: re-running the migration after rows are on the branded host is a no-op (the `ILIKE '%myvortex365.com/leosp%'` filter excludes them).

### Verification SQL

After applying migration 031:

```sql
-- Should return 0 — no unposted row should still carry the legacy host:
SELECT count(*) FROM content_calendar
WHERE tracking_url ILIKE '%myvortex365.com/leosp%'
  AND status NOT IN ('posted', 'rejected');

SELECT count(*) FROM campaign_assets
WHERE tracking_url ILIKE '%myvortex365.com/leosp%'
  AND status NOT IN ('posted', 'rejected', 'archived');

-- Should show branded URLs for any rows that were rewritten:
SELECT id, platform, status, tracking_url
FROM content_calendar
WHERE tracking_url IS NOT NULL
ORDER BY updated_at DESC NULLS LAST, created_at DESC
LIMIT 10;
```

The Art Basel row (the only existing prod tracking URL per the Phase 14H.1 smoke test) will end up with:
```
https://www.vortextrips.com/t/art-basel-miami-beach?utm_source=facebook&utm_medium=event_campaign&utm_campaign=art-basel-miami-beach_2026_W2&utm_content=social_post_fca9a0dd
```

### Tests run

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 7.8s`. New route registered as `ƒ /t/[slug]`.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **Migration 031 must be applied for legacy data to be rewritten.** New URLs (any `Push to Calendar` after deploy) automatically use the branded form. Without 031, existing unposted rows still carry the legacy host. Both code-deploy + migration-apply are needed for full coverage.
- **The `/t/<slug>` route depends on Phase 14H.2's `event_slug` column** (migration 025) being present. It is — applied 2026-05-03.
- **Posted rows are preserved.** A row that was posted to a platform with the legacy URL is NOT rewritten — historical record. If the operator wants to update the live post, they'd do it manually on the platform.
- **`utm_medium=event_campaign` mismatch warning is non-blocking.** A future caller with a different medium would still redirect successfully; only `console.warn` fires.
- **Best-effort click logging.** A `contact_events` insert failure (e.g. transient DB) does NOT block the redirect — the user always reaches the destination. Attribution may be missing for that one click.
- **Slug-collision edge case:** if two campaigns share an `event_slug` (different years), the route picks the latest year. The Phase 14I attribution view still reads `utm_campaign` substring (year-aware), so attribution stays accurate at the campaign-grain level even if the redirect lookup picks a non-current-year row.
- **Public route, no rate limit.** `/t/<slug>` is intentionally public (anyone with the link can click). Vercel-level DDoS protection is the only rate limit. Acceptable for a redirect.
- **Defensive `safeDestination` fallback** — if `event_campaigns.cta_url` is somehow malformed, the route falls back to `DEFAULT_REDIRECT` rather than 500ing.

### Exact git commands

```bash
git status
git add supabase/migrations/031_rewrite_legacy_tracking_urls.sql src/lib/campaign-tracking-url.ts src/lib/event-campaign-asset-generator.ts "src/app/t/[slug]/route.ts" PROJECT_STATE_CURRENT.md BUILD_PROGRESS.md
git commit -m "Phase 14J.2: branded /t/<slug> tracking URL + redirect route + legacy data rewrite"
git push origin main
git push origin main   # verify "Everything up-to-date"
```

`tsconfig.tsbuildinfo` is intentionally **not** in the `git add` list (cache file, save-protocol Rule 5).

### Deploy instructions

1. `git push` (above).
2. **Apply migration 031** in Supabase SQL Editor. Step 0 diagnostics first (uncomment and run); confirm the row counts; then run the two UPDATEs together. Verification SELECTs at the bottom should report 0 remaining legacy URLs in unposted rows.
3. `npx vercel --prod --yes` — deploy the new route + helper changes.
4. Smoke test (below).

Order matters: deploy BEFORE migration is also safe (the new code emits branded URLs for new pushes; existing data just stays legacy until the migration runs). Either order works.

### Smoke-test checklist

- [ ] Open `/dashboard/campaigns` → Art Basel → click on the existing tracking URL chip / re-push to refresh.
- [ ] Confirm the displayed URL is `https://www.vortextrips.com/t/art-basel-miami-beach?utm_source=…&utm_medium=event_campaign&utm_campaign=art-basel-miami-beach_2026_W2&utm_content=social_post_<8 hex>`.
- [ ] Click the URL → confirm the browser lands on `myvortex365.com/leosp` (the redirect target).
- [ ] In Supabase SQL Editor, run:
  ```sql
  SELECT event, utm_source, utm_medium, utm_campaign, utm_content, event_campaign_id, campaign_asset_id, content_calendar_id, created_at
  FROM contact_events
  WHERE created_at > now() - interval '5 minutes'
    AND metadata ->> 'source' = 'branded_redirect'
  ORDER BY created_at DESC LIMIT 5;
  ```
  Confirm a `page_view` row landed with `event_campaign_id` and `campaign_asset_id` resolved to non-null UUIDs.
- [ ] On `/dashboard/campaigns` → Art Basel → confirm the Performance panel's `Clicks` count incremented.
- [ ] Run `node scripts/diagnose-campaign-click-attribution.js` → step 4 (Art Basel attribution) should now show ≥1 FK-attributed click.
- [ ] Verify `next.config.js /free → myvortex365.com/leosp` still works (test by visiting `/free`).
- [ ] Verify the homepage CTAs still link directly to `myvortex365.com/leosp` (Phase 14J.2 deliberately did NOT touch these).

### Recommended next phase

Resume **Phase 14K — Autoposter cron that honors the gate**. The branded social-link cleanup is done; future autoposted content will carry the branded URL automatically (because `buildCampaignTrackingUrl` now produces it).

---

## Phase 14J.2.1 — Harden Branded Tracking Redirect Route (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + deploy)

Phase 14J.2 shipped (`2abb1cf`), migration 031 applied — content_calendar / campaign_assets `tracking_url` rewrites worked, `contact_events` rows logged with full FK + UTM resolution. **However** the visible `/t/<slug>?...` link returned a VortexTrips 404 in the browser even though the route logged the click correctly.

### Root cause

Two contributing factors, fixed together:

1. **Brittle redirect call shape.** `NextResponse.redirect(url, { status: 302 })` was the original — `ResponseInit`-style status. Switching to the bare-number form `NextResponse.redirect(new URL(target), 302)` is the most broadly-compatible call shape across Next.js / Vercel runtimes. Wrapping in `new URL(...)` is required by some runtimes; passing a string can cause silent rejection.
2. **Insufficient fallback chain.** When `cleanedSlug` was empty OR the campaign lookup returned no row OR `event_campaigns.cta_url` was malformed, the original code fell back unconditionally to `https://myvortex365.com/leosp`. If that URL itself were rejected by the redirect call (or simply 404'd in the destination platform), the visitor would hit a fallback page. The hardened version uses an explicit three-tier chain so every reachable code path produces a known-valid `redirect_target`.

A defensive `try/catch` around the redirect call adds a final manual `Response(null, { status: 302, headers: { Location: FINAL_FALLBACK } })` belt-and-suspenders. The route can now never produce a 404 short of complete server failure.

### Files changed

- `src/app/t/[slug]/route.ts` — full rewrite. Now uses a `chooseRedirect()` helper that returns `{ target, reason }`. Redirect call switched to `NextResponse.redirect(new URL(target), 302)`. Catch-block fallback to plain `Response` with manual `Location` header. `safeUrl()` helper validates URLs at every tier so each fallback is objectively known-valid before commit.
- `scripts/diagnose-branded-redirect.js` (new) — reads recent `branded_redirect` rows from `contact_events`, surfaces `route_slug` / `redirect_target` / `redirect_reason` / resolved IDs / UTM tags, distributes by reason, spot-checks a known-good slug (default Art Basel, override via CLI arg). Mirrors the read-only / no-write contract of the other diagnostics.

### Three-tier fallback chain

| Tier | Reason code | Target | Triggered when |
|---|---|---|---|
| 1 | `campaign_cta_url` | `event_campaigns.cta_url` (validated via URL parse) | normal happy path — slug matched a campaign with a parseable cta_url |
| 2 | `portal_fallback` | `https://myvortex365.com/leosp` (`PORTAL_FALLBACK`) | campaign matched but cta_url was blank/malformed |
| 2 | `slug_unmatched` | `https://myvortex365.com/leosp` (`PORTAL_FALLBACK`) | slug didn't match any campaign — visitor still gets to the portal |
| 3 | `empty_slug` | `https://www.vortextrips.com` (`FINAL_FALLBACK`) | slug param was empty (shouldn't happen via the dynamic route, defensive) |
| 3 | `final_fallback` | `https://www.vortextrips.com` (`FINAL_FALLBACK`) | even `PORTAL_FALLBACK` failed URL validation (should never happen) |

### Click-logging contract preserved

Every redirect — including unmatched-slug and malformed-cta_url paths — still produces a `contact_events` row with:
- `event = 'page_view'`
- All four UTM params from the query string
- `event_campaign_id`, `campaign_asset_id`, `content_calendar_id` resolved when possible
- New metadata fields (Phase 14J.2.1):
  - `metadata.source = 'branded_redirect'`
  - `metadata.route_slug` — the slug param the route received (lowercased / trimmed)
  - `metadata.redirect_target` — the actual URL the visitor was sent to
  - `metadata.redirect_reason` — one of the five reason codes above

The diagnostic script reads these debug fields directly so any future redirect failure can be triaged from `contact_events` alone.

### Tests run

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 11.3s`. `ƒ /t/[slug]` still registered.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **No new migration needed.** `contact_events.metadata` is JSONB; the new debug fields are additive and require no schema change.
- **Existing rows in `contact_events.metadata` lack the debug fields.** Pre-Phase-14J.2.1 rows have `metadata.source='branded_redirect'` but no `route_slug` / `redirect_target` / `redirect_reason`. The diagnostic script handles this via `??' (missing)'` fallbacks — no errors, just empty cells.
- **Fallback chain commits us to never returning 404 from this route.** If the campaign system is wholly broken (DB unreachable, etc.), the worst-case response is now `Response(null, { status: 302, headers: { Location: 'https://www.vortextrips.com' }})` — a redirect to our homepage. Acceptable.
- **Slug is still case-insensitive** (we lowercase before lookup). Operators who hand-type a slug with capital letters still hit the right campaign.
- **No behavior change to the `/t/` URL contract.** Browser bookmarks pointing at `/t/<slug>?utm_*=…` continue to work the same way — the redirect target may differ (now guaranteed valid) but the visible URL on social posts is unchanged.

### Exact git commands

```bash
git status
git add "src/app/t/[slug]/route.ts" scripts/diagnose-branded-redirect.js PROJECT_STATE_CURRENT.md BUILD_PROGRESS.md
git commit -m "Phase 14J.2.1: harden branded /t/<slug> redirect — robust call shape + 3-tier fallback + debug metadata"
git push origin main
git push origin main   # verify "Everything up-to-date"
```

`tsconfig.tsbuildinfo` intentionally **not** in the `git add` list (cache file, save-protocol Rule 5).

### Whether new migration is needed

**No.** Schema is unchanged — the new debug fields go into the existing JSONB `metadata` column.

### Deploy instructions

1. `git push origin main` (×2 for verification).
2. `npx vercel --prod --yes`.
3. Smoke test below.

No migration step. No order constraints with other phases.

### Smoke test URL to click

```
https://www.vortextrips.com/t/art-basel-miami-beach?utm_source=facebook&utm_medium=event_campaign&utm_campaign=art-basel-miami-beach_2026_W2&utm_content=social_post_fca9a0dd
```

Expected: browser briefly shows a 302 in devtools network panel, then lands on `myvortex365.com/leosp` (the portal). NO VortexTrips 404 page.

### SQL verification query

After clicking the smoke test URL once:

```sql
SELECT
  created_at,
  metadata ->> 'route_slug'      AS route_slug,
  metadata ->> 'redirect_reason' AS redirect_reason,
  metadata ->> 'redirect_target' AS redirect_target,
  utm_source, utm_medium, utm_campaign, utm_content,
  event_campaign_id IS NOT NULL  AS campaign_resolved,
  campaign_asset_id IS NOT NULL  AS asset_resolved,
  content_calendar_id IS NOT NULL AS calendar_resolved
FROM contact_events
WHERE metadata ->> 'source' = 'branded_redirect'
  AND created_at > now() - interval '5 minutes'
ORDER BY created_at DESC
LIMIT 5;
```

For the smoke test click, expect a row with:
- `route_slug = 'art-basel-miami-beach'`
- `redirect_reason = 'campaign_cta_url'` ✓ (NOT `slug_unmatched` or `final_fallback`)
- `redirect_target = 'https://myvortex365.com/leosp'`
- All three resolved booleans = `true`

Or run `node scripts/diagnose-branded-redirect.js` for the same data formatted nicely + a reason-distribution histogram + the known-good slug spot check.

If `redirect_reason` shows `slug_unmatched` for `art-basel-miami-beach`, that means the campaign was deleted from `event_campaigns` — re-seed via the next weekly-content cron tick or manually re-insert via the dashboard.

---

## Phase 14K — Autoposter Cron (DRY-RUN ONLY) (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + deploy)

The first piece of autoposter infrastructure. **Selects content_calendar rows that WOULD be posted, but never posts.** A future phase will add the live-posting layer (replacing one of the existing crons or upgrading to Vercel Pro to allow a 5th).

### Existing code inspected

- 4 existing crons (`/api/cron/check-heygen-jobs`, `/api/cron/score-and-branch`, `/api/cron/send-sequences`, `/api/cron/weekly-content`) — already at the Hobby plan's 4-cron limit. Phase 14K's dry-run route is **not** registered in `vercel.json`; it's invoked manually via curl.
- 3 manual posting routes (`/api/automations/post-to-{twitter,facebook,instagram}`) — admin-Supabase-auth-gated; require `post.status = 'approved'`; do NOT currently check `posting_gate_approved`. Used by the dashboard's per-row Post buttons. **Not modified in 14K** (per spec — manual flow stays as-is).
- `posting-gate.ts` (Phase 14J) + `posting_gate_audit` (Phase 14J.1) — drive the gate's `posting_status='ready'` and `posting_gate_approved=true`. The autoposter reads them.
- `content_calendar` schema — already carries the 8 gate columns from Phase 14J's migration 029; no schema change required.

### Files created

- `src/lib/autoposter-gate.ts` — eligibility helper. Exports:
  - `getAutoposterEligibleRows({ limit?, platform?, now? })` — pre-filters by `status='approved'` server-side; runs the remaining 8 rules in JS so each skipped row carries a precise reason. Returns `{ eligible: AutoposterEligibleRow[], skipped: AutoposterSkippedRow[] }`.
  - `validateAutoposterCandidate(row)` — pure; returns `null` when eligible, otherwise a short user-facing reason string.
  - `buildAutoposterDryRunPlan(rows)` — pure; reshapes for JSON output.
  - `summarizeAutoposterDryRun(eligible, skipped)` — returns `{ eligible_count, skipped_count, by_platform, skipped_by_reason }`.
  - `markAutoposterDryRunInspected(opts)` — Phase 14K stub returning `{ ok: true, written: false, reason: 'mutation deferred — Phase 14K is dry-run only' }`. Future phases can fill it in once `posting_gate_audit.action` or `ai_actions_log.action_type` CHECK constraints are extended; today's tables don't have a clean slot without a migration.
  - `hardBlockLivePosting(reason)` — tripwire that throws unless an internal `LIVE_POSTING_ENABLED` const flips to true. Const is `as const false` for Phase 14K, making it impossible to call a platform API from this module.
  - `LIVE_POSTING_BLOCKED = true as const` — runtime contract surfaced in the cron response.
- `src/app/api/cron/autoposter-dry-run/route.ts` — GET-only cron route. Bearer-auth via `CRON_SECRET` (same pattern as the other 4 crons). Optional `?limit=N` (1-500, default 100) and `?platform=ig` query params. Returns the structured JSON (shape below). Calls `markAutoposterDryRunInspected` (no-op stub) at the end.
- `scripts/diagnose-autoposter-dry-run.js` — read-only diagnostic. Schema check, candidate eligibility split, ineligibility-reason histogram, hits the dry-run endpoint when CRON_SECRET is in `.env.local` (otherwise prints curl command), 6 contract assertions, before/after snapshot of `posted_at` row count to confirm zero mutations.

### Files updated

- `src/app/dashboard/content/page.tsx` — added a one-line note under the existing gate note: "Autoposter dry-run only. Ready rows are inspected, not posted." No other UI changes; existing Approve / Reject / Mark Ready / Post-to-platform buttons untouched.

### Eligibility rules implemented

A row is eligible iff ALL of the following hold (validated by `validateAutoposterCandidate`):

| Rule | Reason if violated |
|---|---|
| `status === 'approved'` | `status is '<X>', need 'approved'` |
| `posting_status === 'ready'` | `posting_status is '<X>', need 'ready'` |
| `posting_gate_approved === true` | `posting_gate_approved is not true` |
| `manual_posting_only === true` | `manual_posting_only is not true` |
| `queued_for_posting_at` non-null | `queued_for_posting_at is null` |
| `posted_at` is null | `already posted` |
| `platform` non-empty | `platform is missing` |
| `caption` non-empty | `caption is empty` |
| Campaign-originated rows have `tracking_url` | `campaign-originated row missing tracking_url` |

The server-side query pre-filters to `status='approved'` and orders by `queued_for_posting_at ASC NULLS LAST` so the next-due row tops the list. The remaining rules run in JS so the skipped-rows sample carries human-readable reasons.

### Dry-run cron response shape

`GET /api/cron/autoposter-dry-run` (Bearer CRON_SECRET) returns:

```json
{
  "success": true,
  "dry_run": true,
  "live_posting_blocked": true,
  "eligible_count": 0,
  "skipped_count": 0,
  "eligible_rows": [
    {
      "id": "<uuid>",
      "platform": "instagram",
      "status": "approved",
      "posting_status": "ready",
      "posting_gate_approved": true,
      "queued_for_posting_at": "2026-05-03T...",
      "tracking_url_present": true,
      "campaign_asset_id_present": true,
      "reason": "eligible"
    }
  ],
  "skipped_rows_sample": [
    { "id": "<uuid>", "platform": "instagram", "reason": "posting_gate_approved is not true" }
  ],
  "summary": {
    "eligible_count": 0,
    "skipped_count": 0,
    "by_platform": {},
    "skipped_by_reason": {}
  },
  "inspected": { "ok": true, "written": false, "reason": "mutation deferred — Phase 14K is dry-run only" },
  "params": { "limit": 100, "platform": null }
}
```

`skipped_rows_sample` is capped at 25 rows; `summary.skipped_by_reason` carries the full histogram.

### How live posting is hard-blocked

Three layered guarantees:

1. **No platform integration in the module.** `autoposter-gate.ts` has zero imports of any social SDK (`twitter-api-v2`, Facebook Graph fetch, etc.) and zero references to the existing `/api/automations/post-to-*` routes.
2. **`LIVE_POSTING_ENABLED = false as const`.** Type-narrowing prevents flipping it without source-code changes. `hardBlockLivePosting()` reads it and throws unconditionally during Phase 14K.
3. **Runtime contract in the cron response.** `live_posting_blocked: LIVE_POSTING_BLOCKED` (which is `true as const`) is surfaced in every JSON response so any operator inspecting the curl output sees the dry-run guarantee without reading source.

A future phase that introduces live posting MUST: (a) extend `LIVE_POSTING_ENABLED` to a non-const branch, (b) wire the platform integration explicitly, (c) update the response contract, and (d) probably register this route in `vercel.json` after replacing one of the existing crons.

### Whether any rows were mutated

**No.** The dry-run never writes:
- `getAutoposterEligibleRows` is pure read.
- `markAutoposterDryRunInspected` is a no-op stub returning `{ ok: true, written: false }`.
- The cron route never updates a `content_calendar` row.

The diagnostic script's "no-mutation cross-check" snapshots `count(*) WHERE posted_at IS NOT NULL` before and after the curl call; values must match.

### Existing posting routes inspected

| Route | Auth | Gate-respecting | Status in 14K |
|---|---|---|---|
| `/api/automations/post-to-twitter` | Supabase admin user | ❌ requires only `status='approved'` | **unchanged** — manual dashboard flow continues to work as today |
| `/api/automations/post-to-facebook` | Supabase admin user | ❌ requires only `status='approved'` | **unchanged** — same |
| `/api/automations/post-to-instagram` | Supabase admin user | ❌ requires only `status='approved'` | **unchanged** — same |
| `/api/cron/weekly-content` | CRON_SECRET | n/a — generates content, doesn't post | unchanged |
| `/api/cron/send-sequences` | CRON_SECRET | n/a — sends email/SMS, not platform posts | unchanged |
| `/api/cron/score-and-branch` | CRON_SECRET | n/a — lead scoring, not posting | unchanged |
| `/api/cron/check-heygen-jobs` | CRON_SECRET | n/a — video render polling | unchanged |
| `/api/cron/autoposter-dry-run` (NEW) | CRON_SECRET | ✅ requires full gate | dry-run only — never posts |

The 3 manual posting routes are intentionally **NOT modified** per spec: "Do not disable existing manual buttons unless dangerous." They remain admin-only and require `status='approved'` (which is enforced server-side). Adding a `posting_gate_approved=true` requirement would break the existing manual dashboard flow that operators use today. A future phase can introduce that requirement once an autoposter is live and operators have agreed on the new contract.

### Dashboard copy added

Single line under the existing gate note on `/dashboard/content`:

> 🟢 Mark Ready is a manual gate only. It does not post to social platforms.
> Autoposter dry-run only. Ready rows are inspected, not posted.

Both lines are `text-[11px] text-gray-400` — small, muted, no UI clutter. No new buttons. No layout change to existing rows.

### Diagnostic script behavior

`node scripts/diagnose-autoposter-dry-run.js`:

1. Loads `.env.local` and verifies Supabase service role key is present.
2. Runs a probe SELECT on `content_calendar` for the 7 gate columns; reports schema status.
3. Pulls all `status='approved'` rows (capped at 500) and splits them into `eligible` vs `skipped` using the same rules as the helper. Lists the first 10 eligible by `queued_for_posting_at ASC` with platform / queue-time / tracking-url-presence.
4. For skipped rows, prints a histogram of reasons + a 5-row sample.
5. If `CRON_SECRET` is in `.env.local`, fetches `${NEXT_PUBLIC_APP_URL}/api/cron/autoposter-dry-run` and verifies the response shape (3 contract assertions: `dry_run`, `live_posting_blocked`, `eligible_count` consistency). Otherwise prints the exact curl command.
6. Snapshots `count(*) WHERE posted_at IS NOT NULL` before AND after the dry-run call; reports green if equal (zero mutations) or red if different.

Read-only — never writes.

### Tests run

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 13.5s`. New route registered as `ƒ /api/cron/autoposter-dry-run`.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **No vercel.json registration.** This route runs only when manually curled. A future phase moving to scheduled execution must replace one of the 4 existing crons OR upgrade to Vercel Pro. Documented in the route's header comment.
- **Manual posting routes still bypass the gate.** Phase 14K's autoposter-dry-run respects the gate; the dashboard's per-platform Post buttons do NOT. Operators can still post directly without `posting_gate_approved=true`. Acceptable for now (preserves existing flow); resolution comes when a future phase introduces live autoposting and contracts the manual flow at the same time.
- **`hardBlockLivePosting` is exported but unused inside the module today.** Intentional — it's a tripwire, not active code. If a future engineer accidentally adds platform code to this module, calling the function (or removing the guard) is the documented gate.
- **`markAutoposterDryRunInspected` is a stub.** Returns `{ ok, written:false }` always. The dry-run response includes `inspected.written: false` so operators can confirm no audit row was attempted. If a future phase wants per-run audit, it will need migration to extend `posting_gate_audit.action` CHECK or `ai_actions_log.action_type` CHECK to include an `autoposter_inspected` value.
- **`?limit=N` capped at 500** to prevent the helper from scanning all of `content_calendar` on a single call. With current production volume (~143 rows total per the Phase 14J diagnostic), 500 is far above any realistic eligibility set.
- **Anonymous candidates with no platform** (`platform = null` somehow — shouldn't happen given migration 004's NOT NULL CHECK, but defensively) are surfaced as `'platform is missing'` skipped rows rather than crashing.

### Exact git commands

```bash
git status
git add src/lib/autoposter-gate.ts "src/app/api/cron/autoposter-dry-run/route.ts" scripts/diagnose-autoposter-dry-run.js src/app/dashboard/content/page.tsx PROJECT_STATE_CURRENT.md BUILD_PROGRESS.md
git commit -m "Phase 14K (dry-run only): autoposter eligibility helper + manual-curl cron route + dashboard note + diagnostic"
git push origin main
git push origin main   # verify "Everything up-to-date"
```

`tsconfig.tsbuildinfo` intentionally **not** in the `git add` list (cache file, save-protocol Rule 5). Named-file staging only — never `git add .` (Rule 6).

### Deploy instructions

1. `git push origin main` (×2 for verification).
2. `npx vercel --prod --yes`.
3. Run the curl command below to verify the route works.
4. Run `node scripts/diagnose-autoposter-dry-run.js` to verify the response contract + zero-mutation cross-check.

**No migration in this phase.** No `vercel.json` changes (still 4-cron Hobby limit). No platform API integrations.

### Curl command for dry-run cron

```bash
CRON_SECRET=$(grep "^CRON_SECRET=" .env.local | head -1 | sed 's/CRON_SECRET=//' | tr -d '\r\n'); curl -sS -w "\n---HTTP %{http_code}---\n" -H "Authorization: Bearer $CRON_SECRET" https://www.vortextrips.com/api/cron/autoposter-dry-run
```

Optional query params:
- `?limit=10` — limit candidate scan to 10 rows.
- `?platform=instagram` — only consider Instagram rows.

Combine: `https://www.vortextrips.com/api/cron/autoposter-dry-run?limit=10&platform=instagram`

### Supabase verification queries

```sql
-- Count of currently-eligible rows (matches the dry-run's eligible_count):
SELECT count(*)
FROM content_calendar
WHERE status = 'approved'
  AND posting_status = 'ready'
  AND posting_gate_approved = TRUE
  AND manual_posting_only = TRUE
  AND queued_for_posting_at IS NOT NULL
  AND posted_at IS NULL
  AND platform IS NOT NULL
  AND length(trim(coalesce(caption, ''))) > 0
  AND (campaign_asset_id IS NULL OR (tracking_url IS NOT NULL AND length(trim(tracking_url)) > 0));

-- Snapshot of posted_at row count — should NOT change after running the dry-run:
SELECT count(*) FROM content_calendar WHERE posted_at IS NOT NULL;

-- After running the curl above, re-run the previous query and confirm the count is unchanged.
```

### Smoke-test checklist (post-deploy)

- [ ] `git push` confirmed `Everything up-to-date` on the second push.
- [ ] `npx vercel --prod --yes` finished cleanly.
- [ ] Open `/dashboard/content` → confirm new "Autoposter dry-run only…" line appears under the existing gate note.
- [ ] Existing manual posting buttons (Post to IG / FB / X / Mark Posted) still render unchanged.
- [ ] Run the curl command → expect HTTP 200 and a JSON response with `dry_run: true`, `live_posting_blocked: true`, `eligible_count` matching the SQL count above.
- [ ] Run `node scripts/diagnose-autoposter-dry-run.js` → all three contract assertions pass; "no-mutation cross-check" reports posted_at count unchanged.
- [ ] Confirm the response includes `inspected.written: false` (Phase 14K stub is intact).
- [ ] Confirm no row in `content_calendar` flipped to `status='posted'` because of the dry-run call.
- [ ] If `eligible_count > 0`, manually inspect one of the eligible rows in Supabase and verify all 9 eligibility rules are satisfied.

### Recommended next phase

**Phase 14K.1 — Autoposter live posting (per-platform, gated, opt-in).** The natural continuation. Scope:
- Move/replace one of the 4 existing crons OR upgrade to Vercel Pro to register `autoposter` (non-dry-run) in `vercel.json`.
- Per-platform poster module that respects the gate AND `manual_posting_only=true` (skip when true; only post when an operator explicitly flips it to false).
- Per-row idempotency: mark `posted_at` immediately on success; clear `posting_gate_approved` and write `posting_block_reason` on failure so operators must re-mark for retry.
- Migration to extend `posting_gate_audit.action` CHECK to include `auto_posted` and `auto_skipped` so the audit trail covers cron actions, not just human gate clicks.
- Feature flag (env var) to disable the autoposter at any time without redeploy.

Phase 14K's `hardBlockLivePosting` and `LIVE_POSTING_ENABLED` constants are the explicit handoff points — 14K.1 starts by removing the dry-run guards intentionally, not accidentally.

A safer intermediate alternative: **Phase 14K.0.5 — Posting gate consistency.** Add `posting_gate_approved=true` requirement to the 3 manual platform routes BEFORE introducing autoposting. Closes the existing gap where manual posting bypasses the gate. Trades operator convenience for consistency. Probably not worth doing on its own; pair it with 14K.1.

---

## Phase 14K Patch — Remove `updated_at` Dependency from Dry-Run Eligibility Query (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + deploy)

Phase 14K shipped (`0faf4ff`) and deployed. First smoke test surfaced one bug:

- **Diagnostic script + direct SQL agreed**: 0 eligible rows / 53 approved-but-skipped rows / `posting_status='idle'` reason — expected behavior.
- **Dry-run endpoint returned HTTP 500**: `{"success": false, "error": "autoposter eligibility query failed: column content_calendar.updated_at does not exist"}`.

### Root cause

`src/lib/autoposter-gate.ts` declared `updated_at: string | null` on `ContentCalendarRow` and included `updated_at` in the SELECT projection (`ROW_SELECT` constant). `content_calendar` does NOT have that column — verified against migration 004 (`id, week_of, platform, caption, hashtags, image_prompt, status, posted_at, created_at`) and migrations 022 / 024 / 029 which added FK / tracking_url / gate columns but never `updated_at`. Postgres returned error `42703` ("column does not exist"); Supabase surfaced it as a query failure; the route mapped it to HTTP 500.

The diagnostic script does NOT touch this column (its SELECT lists are explicit and don't include `updated_at`), which is why it ran clean while the cron route 500'd.

### Files changed

- `src/lib/autoposter-gate.ts`:
  - Dropped `updated_at: string | null` from `ContentCalendarRow`.
  - Dropped `updated_at` from `ROW_SELECT`.
  - Added a header comment on `ContentCalendarRow` documenting the audit (migration 004 + 022/024/029) so a future engineer doesn't re-add the column.
  - Strengthened the candidate `.order(...)` chain to a three-key stable sort using only columns that exist:
    1. `queued_for_posting_at ASC NULLS LAST` (next-due eligible row first)
    2. `created_at DESC` (newer authored rows next)
    3. `id ASC` (final tiebreaker for stability)

### Files NOT changed

- `src/app/api/cron/autoposter-dry-run/route.ts` — never referenced `updated_at`. Untouched.
- `scripts/diagnose-autoposter-dry-run.js` — never referenced `updated_at`. Untouched.
- All Phase 14K behavioral guarantees preserved: `dry_run: true`, `live_posting_blocked: true`, `hardBlockLivePosting()` tripwire active, `markAutoposterDryRunInspected` no-op stub, zero mutations to `content_calendar`.

### Tests run

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 9.4s`. `ƒ /api/cron/autoposter-dry-run` still registered.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **No new migration.** No `updated_at` column added — preferred fix per spec ("Do not add updated_at column unless there is a strong reason"). If a future phase wants update-time tracking on `content_calendar`, that's a deliberate schema decision, not implicit in the autoposter helper.
- **Three-key ORDER BY may marginally change row order** vs. Phase 14K's single-key sort, but only as a tiebreaker (when `queued_for_posting_at` is identical or both null). With current data (all 53 approved rows have `posting_status='idle'`, no eligible rows), this is moot.
- **No changes to behavioral contract.** `live_posting_blocked` still `true`, `hardBlockLivePosting` still throws, no mutations.

### Exact git commands

```bash
git status
git add src/lib/autoposter-gate.ts PROJECT_STATE_CURRENT.md BUILD_PROGRESS.md
git commit -m "Phase 14K patch: remove non-existent updated_at column from dry-run eligibility query"
git push origin main
git push origin main   # verify "Everything up-to-date"
```

`tsconfig.tsbuildinfo` intentionally **not** in the `git add` list (cache file, save-protocol Rule 5).

### Deploy instructions

1. `git push origin main` (×2 for verification).
2. `npx vercel --prod --yes`.
3. Run the PowerShell verification commands below.

### PowerShell verification (after deploy)

Cleaner native form (recommended):

```powershell
$CRON_SECRET = (Select-String -Path .env.local -Pattern '^CRON_SECRET=' | Select-Object -First 1).Line -replace '^CRON_SECRET=', ''
Invoke-RestMethod -Method GET `
  -Uri "https://www.vortextrips.com/api/cron/autoposter-dry-run" `
  -Headers @{ Authorization = "Bearer $CRON_SECRET" }
```

If you want to see the HTTP status code explicitly:

```powershell
$CRON_SECRET = (Select-String -Path .env.local -Pattern '^CRON_SECRET=' | Select-Object -First 1).Line -replace '^CRON_SECRET=', ''
curl.exe -sS -w "`n---HTTP %{http_code}---`n" `
  -H "Authorization: Bearer $CRON_SECRET" `
  "https://www.vortextrips.com/api/cron/autoposter-dry-run"
```

Expected response shape:
- HTTP 200 (no longer 500)
- `success: true`
- `dry_run: true`
- `live_posting_blocked: true`
- `eligible_count: 0` (current state — all 53 approved rows are `posting_status='idle'`)
- `skipped_count: 53` (or close — every approved row is currently in the skipped set with reason `posting_status is 'idle', need 'ready'`)
- `inspected.written: false`
- `summary.skipped_by_reason["posting_status is 'idle', need 'ready'"]: 53`

After running, also re-run the no-mutation cross-check:

```sql
SELECT count(*) FROM content_calendar WHERE posted_at IS NOT NULL;
```

Expect: still **22** (unchanged from pre-curl). Any deviation means a row was accidentally mutated, which would be a serious regression — the dry-run guarantees zero writes.

Or use the diagnostic for a richer view:

```bash
node scripts/diagnose-autoposter-dry-run.js
```

The script's "no-mutation cross-check" snapshots `posted_at` count before AND after the curl, and reports green only when they match.

---

## Phase 14K.0.5 — Posting Gate Consistency for Manual Platform Routes (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + deploy)

Phase 14K dry-run respected the gate; the 3 manual platform-post routes still bypassed it (they only checked `status='approved'`). Phase 14K.0.5 closes that backdoor by adding a shared `validateManualPostingGate` helper and calling it in every manual route BEFORE any platform API call or row mutation.

### Routes inspected

| Route file | Type | Phase 14K.0.5 status |
|---|---|---|
| `src/app/api/automations/post-to-facebook/route.ts` | manual platform-post (Facebook Graph API) | **patched** — gate-checked |
| `src/app/api/automations/post-to-instagram/route.ts` | manual platform-post (Instagram Graph API) | **patched** — gate-checked |
| `src/app/api/automations/post-to-twitter/route.ts` | manual platform-post (Twitter v2 API) | **patched** — gate-checked |
| `src/app/api/cron/autoposter-dry-run/route.ts` | dry-run cron (Phase 14K) | already gated — unchanged |
| `src/app/api/admin/content-calendar/posting-gate/route.ts` | gate toggle endpoint (Phase 14J) | not a posting route — unchanged |
| `src/app/api/content/route.ts` | generic status PATCH (used by Mark Posted bookkeeping) | **NOT modified** — see "Routes left unchanged" |

The user's task description listed paths under `src/app/api/admin/content-calendar/post-to-*` that don't actually exist; the live posting routes are at `src/app/api/automations/post-to-*`. Phase 14K.0.5 patched the actual route files (spirit of the rule); the file-path discrepancy is documented here.

### Routes patched

All three platform routes follow an identical pattern. After fetching the row from `content_calendar`:

1. Call `validateManualPostingGate(post, { supportedPlatforms: ['<platform>'] })`.
2. If `!gate.allowed`, return `403` with `{ success: false, blocked_by_gate: true, reasons: gate.reasons }`.
3. The legacy `if (post.status !== 'approved') ...` line is removed (subsumed by the gate's stricter check).
4. The legacy `if (post.platform !== '<platform>') ...` line is removed (covered by `supportedPlatforms` constraint).

Behaviorally: a row that was previously postable (`status='approved'` only) but isn't gate-ready (`posting_status='idle'` etc.) now gets refused with 403 instead of silently posting. A row that IS gate-ready posts exactly as before.

### Routes left unchanged and why

- **`src/app/api/content/route.ts`** (generic content PATCH, used by the dashboard's "Mark Posted" bookkeeping button): NOT in the user's allow-list. Server-side gap remains where a motivated operator could `curl -X PATCH /api/content -d '{"id":"<x>","status":"posted"}'` to flip a non-ready row to posted without going through a platform route. The dashboard now hides the Mark Posted button on non-ready rows, closing the GUI bypass — but the server-side curl-bypass persists. **Documented as a deferred gap** to be closed in a small follow-up phase (Phase 14K.0.6) when the user is ready to constrain `/api/content` to gate-aware status transitions.

### Gate rules enforced

`validateManualPostingGate` returns `{ allowed, reasons[], warnings[], mode: 'manual' }`. All rules below must pass for `allowed: true`:

| Rule | Reason if violated |
|---|---|
| Row must exist | `content_calendar row not found` |
| `status === 'approved'` | `row status is '<X>', need 'approved'` |
| Not rejected | `row status is rejected` |
| Not already posted | `row is already posted — refusing duplicate post` |
| `posting_status !== 'blocked'` | `gate is blocked: <reason>` |
| `posting_status === 'ready'` | `posting_status is '<X>', need 'ready' (Mark Ready first)` |
| `posting_gate_approved === true` | `posting_gate_approved is not true — Mark Ready first` |
| `queued_for_posting_at IS NOT NULL` | `queued_for_posting_at is null` |
| `manual_posting_only === true` | `manual_posting_only is not true — gate refuses non-manual paths in this phase` |
| `platform` non-empty (skipped in `bookkeepingOnly`) | `platform is missing` |
| `platform ∈ supportedPlatforms` (when supplied) | `platform '<X>' is not supported by this route (expected one of: ...)` |
| `caption` non-empty (skipped in `bookkeepingOnly`) | `caption/body is empty` |
| Campaign rows: `tracking_url` non-empty | `campaign-originated row missing tracking_url — re-push from campaign dashboard` |
| Campaign rows: `tracking_url` starts with branded host | `tracking_url must start with https://www.vortextrips.com/t/ (legacy URLs blocked)` |

This gate matches the autoposter dry-run's eligibility rules from Phase 14K (single source of truth — manual and automated paths share enforcement).

### UI changes

`src/app/dashboard/content/page.tsx`:

- For `status='approved'` rows, the four platform-Post buttons (Post to IG / FB / X / Upload to TikTok) AND the Mark Posted button now render **only when** `posting_status='ready' && posting_gate_approved=true`. Approved-but-idle rows show only the Mark Ready button.
- Added a third gate-related copy line near the existing notes:
  > 🟢 Mark Ready is a manual gate only. It does not post to social platforms.
  > Autoposter dry-run only. Ready rows are inspected, not posted.
  > **Posting buttons appear only after Mark Ready passes the gate.**
- Added a `title` attribute on the Mark Posted button explaining it's bookkeeping ("Bookkeeping only — record that this row was posted (e.g. via the platform's web UI).").
- Approve / Reject / generation flows untouched.
- Existing posting-gate buttons (Mark Ready / Remove from Queue / Gate ineligible hint) untouched.

### Diagnostic script

`scripts/diagnose-manual-posting-gates.js`:

1. **Source-code check.** For each of the 3 manual posting routes, verifies the file imports from `@/lib/posting-gate` AND contains `validateManualPostingGate`. Reports green / red per route.
2. **Approved-row split.** Pulls all `status='approved'` rows; classifies by `posting_status` (idle / ready / blocked / other).
3. **Idle ↔ blocked agreement.** Runs the validator (JS mirror) on every idle row; expects 0 to pass.
4. **Ready validator pass/fail.** Runs the validator on every ready row; lists failing rows with reasons.
5. **No-mutation cross-check.** Snapshots `count(*) WHERE posted_at IS NOT NULL` before AND after the diagnostic.
6. **No platform calls.** The script never hits a `/api/automations/post-to-*` URL and never imports a platform SDK; the contract is read-only.

### Tests run

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 14.9s`. All 4 relevant routes still register: `posting-gate`, `post-to-facebook`, `post-to-instagram`, `post-to-twitter`.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.
- `node scripts/diagnose-manual-posting-gates.js` — to run **after** deploy. Expected: section 1 reports all 3 routes green; section 2 shows 53/0/0; section 3 confirms all 53 idle rows correctly blocked; section 5 reports `posted_at` unchanged at 22.

### Database mutations / Platform API calls

**Zero of both.** Phase 14K.0.5 is purely defensive code:
- The validator is pure (no DB calls).
- The 3 routes only ADD a 403 short-circuit BEFORE existing platform calls.
- The dashboard hides buttons; clicking was the only mutation source, and they're only visible on already-gate-ready rows now.
- The diagnostic is read-only.

### Risks / deferred items

- **`/api/content/route.ts` server-side gap.** Mark Posted via curl can still flip a non-ready row. Dashboard hides the button; API doesn't enforce. Deferred to Phase 14K.0.6.
- **`automations/post-to-tiktok` and `automations/post-to-email` don't exist.** TikTok upload is a manual link to creator-center; no email-from-content_calendar route exists. If either ships in a future phase, they MUST call `validateManualPostingGate`.
- **Dashboard JS mirror of the validator** in `diagnose-manual-posting-gates.js` can drift from `src/lib/posting-gate.ts`. Kept in sync by hand.
- **`bookkeepingOnly` mode is exposed but unused** in this phase. Reserved for the future `/api/content` patch (Phase 14K.0.6).
- **`manual_posting_only=true` is required by the gate.** When Phase 14K.1 introduces live autoposting (operators flipping `manual_posting_only=false`), the manual routes will refuse those rows — which is correct. Manual and autoposter are mutually exclusive.

### Exact git commands

```bash
git status
git add src/lib/posting-gate.ts src/app/api/automations/post-to-twitter/route.ts src/app/api/automations/post-to-facebook/route.ts src/app/api/automations/post-to-instagram/route.ts src/app/dashboard/content/page.tsx scripts/diagnose-manual-posting-gates.js PROJECT_STATE_CURRENT.md BUILD_PROGRESS.md
git commit -m "Phase 14K.0.5: gate manual platform-post routes — validateManualPostingGate + dashboard UI gate"
git push origin main
git push origin main   # verify "Everything up-to-date"
```

`tsconfig.tsbuildinfo` intentionally **not** in the `git add` list (cache file, save-protocol Rule 5).

### Deploy instructions

1. `git push origin main` (×2 for verification).
2. `npx vercel --prod --yes`.
3. Smoke-test (below).

No migration. No `vercel.json` change.

### Smoke-test checklist

- [ ] `git push` confirmed `Everything up-to-date` on the second push.
- [ ] `npx vercel --prod --yes` finished cleanly.
- [ ] Open `/dashboard/content` → confirm a `status='approved'` row that is `posting_status='idle'` shows ONLY the `🟢 Mark Ready` button — no platform-Post buttons, no Mark Posted button.
- [ ] Click `🟢 Mark Ready` → confirm the badge flips to `✅ Ready for Posting` AND the platform-Post + Mark Posted buttons now appear.
- [ ] Click `↩ Remove from Queue` → confirm those buttons disappear again.
- [ ] (Optional, requires admin auth) `curl -X POST /api/automations/post-to-twitter -d '{"content_id": "<id of an idle approved row>"}'` → expect HTTP 403 with `{ success: false, blocked_by_gate: true, reasons: [...] }`.
- [ ] Run `node scripts/diagnose-manual-posting-gates.js`:
  - [ ] Section 1: ✓ for all 3 routes
  - [ ] Section 2: counts match Supabase reality
  - [ ] Section 3: 0 idle rows leaked through validator
  - [ ] Section 5: `posted_at` count unchanged
- [ ] `SELECT count(*) FROM content_calendar WHERE posted_at IS NOT NULL` is still 22.

### Recommended next phase

**Phase 14K.0.6 — Close the `/api/content` PATCH bypass.** Small follow-up. Add a guard: when the PATCH body sets `status='posted'`, run `validateManualPostingGate(row, { bookkeepingOnly: true })` first; refuse with 403 if not allowed. Other transitions unchanged. Closes the last server-side curl-bypass.

Or jump straight to **Phase 14K.1 — Live autoposter cron.** Removes the `LIVE_POSTING_ENABLED` guard, wires per-platform poster modules, replaces one of the 4 existing crons or upgrades to Vercel Pro, and extends `posting_gate_audit.action` CHECK to include `auto_posted` / `auto_skipped`.

I'd lean **14K.0.6 first** — small and closes a real gap that exists today. 14K.1 then ships with a clean defensive perimeter.

---

## Phase 14K.0.6 — Close `/api/content` PATCH Bypass for `→ posted` (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + deploy)

The last server-side bypass before Phase 14K.1 (live autoposter). The `/api/content` PATCH route was the only remaining path that could mutate a row to `status='posted'` without going through a gate-checked platform poster route. The dashboard's Mark Posted button (Phase 14K.0.5) hides on non-ready rows, but a direct curl could still bypass.

### What changed

- **`src/app/api/content/route.ts`**: when `request.body.status === 'posted'`, the route now fetches the current row's gate columns and runs `validateManualPostingGate(row, { bookkeepingOnly: true })` BEFORE updating. If `!gate.allowed`, returns **403** with `{ success: false, blocked_by_gate: true, reasons: [...] }`. Other status transitions (draft↔approved, *→rejected, *→draft reset) are NOT gated — operators retain full control over the approval lifecycle.
- **`scripts/diagnose-manual-posting-gates.js`**: added `src/app/api/content/route.ts` to `ROUTES_TO_CHECK` so the source-code grep verifies the helper is imported + called. Comment explains that the route gates conditionally on `status === 'posted'` and that runtime testing (not the static grep) verifies the conditional.

### What `bookkeepingOnly: true` skips

- platform non-empty check
- caption non-empty check

Everything else still applies — `status='approved'`, `posting_status='ready'`, `posting_gate_approved=true`, `queued_for_posting_at IS NOT NULL`, `manual_posting_only=true`, `posted_at IS NULL`, plus the branded `tracking_url` requirement for campaign-originated rows.

### Routes inspected

| Route | Status | Notes |
|---|---|---|
| `src/app/api/content/route.ts` | **patched** | gates `→ posted` only |
| `src/app/api/automations/post-to-{facebook,instagram,twitter}/route.ts` | gated (Phase 14K.0.5) | unchanged |
| `src/app/api/cron/autoposter-dry-run/route.ts` | gated (Phase 14K) | unchanged |
| `src/app/api/admin/content-calendar/posting-gate/route.ts` | gate toggle | unchanged |

After Phase 14K.0.6 deploys, **every** server-side path that can land a row in `status='posted'` runs the same gate. No remaining bypass.

### Database mutations / Platform API calls

**Zero of either** from this phase's code paths. The route only ADDS a 403 short-circuit BEFORE the existing UPDATE; the existing successful path is unchanged and only fires after the gate passes.

### Tests run

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 27.0s`. `ƒ /api/content` still registered.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.
- `node scripts/diagnose-manual-posting-gates.js` — to run **after** deploy. Expected: section 1 reports `✓` for all 4 routes (the 3 platform routes + `/api/content`); other sections unchanged.

### Risks

- **Existing dashboard "Mark Posted" clicks must hit gate-ready rows.** They do — the dashboard already hides the button on non-ready rows (Phase 14K.0.5). Operators using the dashboard see no behavior change.
- **Direct curl callers attempting `→ posted` on non-ready rows now get 403.** Intentional — that's the gap being closed. Any internal tooling that does this would need to either Mark Ready first OR use a different status (the gate doesn't constrain `→ approved`, `→ rejected`, or `→ draft`).
- **`bookkeepingOnly: true` mode is now exercised in production.** Phase 14K.0.5 defined the option but didn't use it. This phase is the first real consumer.
- **Reset path (`posted → draft`) remains ungated.** A row that's already posted can be reset to draft without gate. That's correct behavior — reset is a recovery action, not a posting action.
- **Race condition is benign.** If two clients race to set `→ posted`, both pass the gate read, both update — second update is idempotent (status already posted). The platform routes have this same property.

### Exact git commands

```bash
git status
git add src/app/api/content/route.ts scripts/diagnose-manual-posting-gates.js PROJECT_STATE_CURRENT.md BUILD_PROGRESS.md
git commit -m "Phase 14K.0.6: gate /api/content PATCH →posted transition with validateManualPostingGate(bookkeepingOnly)"
git push origin main
git push origin main   # verify "Everything up-to-date"
```

`tsconfig.tsbuildinfo` intentionally **not** in the `git add` list (cache file, save-protocol Rule 5).

### Deploy instructions

1. `git push origin main` (×2 for verification).
2. `npx vercel --prod --yes`.
3. Smoke-test (below).

No migration. No `vercel.json` change. No new platform integrations.

### Smoke-test checklist

- [ ] `git push` confirmed `Everything up-to-date` on the second push.
- [ ] `npx vercel --prod --yes` finished cleanly.
- [ ] **Dashboard happy path**: open `/dashboard/content` → click `🟢 Mark Ready` on an approved row → click `✓ Mark Posted` → row transitions to `status='posted'` (existing behavior preserved). The toast "Post posted" appears.
- [ ] **Dashboard refusal path** (synthetic): use browser devtools to fire `fetch('/api/content', { method: 'PATCH', body: JSON.stringify({ id: '<idle approved row id>', status: 'posted' }), headers: { 'Content-Type': 'application/json' } })` against an idle row → expect **403** with `{ success: false, blocked_by_gate: true, reasons: [...] }`. Reasons should include `"posting_status is 'idle', need 'ready' (Mark Ready first)"` and `"posting_gate_approved is not true — Mark Ready first"`.
- [ ] **Other transitions still work**: approve a draft → confirm 200. Reject a draft → confirm 200. Reset a posted row → confirm 200.
- [ ] Run `node scripts/diagnose-manual-posting-gates.js`:
  - [ ] Section 1: `✓` for all 4 routes (3 platform + `/api/content`).
  - [ ] Section 2: counts match Supabase.
  - [ ] Section 3: 0 idle rows leaked.
  - [ ] Section 5: `posted_at` count unchanged.

### Recommended next phase

**Phase 14K.1 — Live autoposter cron.** The defensive perimeter is now complete: every path that mutates a row to `posted` runs through the gate. 14K.1 can confidently:

1. Remove `LIVE_POSTING_ENABLED = false as const` in `src/lib/autoposter-gate.ts` (or thread it through an env var).
2. Wire per-platform poster modules (initially calling the existing `/api/automations/post-to-*` endpoints from the cron with admin-credentialed fetch, OR refactor those routes to share a platform-call layer).
3. Replace one of the 4 existing crons in `vercel.json` (the underused `score-and-branch` is the strongest merge candidate) OR upgrade to Vercel Pro for a 5th slot.
4. Migrate `posting_gate_audit.action` CHECK to include `auto_posted` and `auto_skipped` so cron actions are auditable alongside human gate actions.
5. Add a feature flag (env var) to disable the autoposter at any time without redeploy.

Phase 14K.1 starts with a clean defensive perimeter — every existing bypass is now closed.

---

**Branch:** `main`
**Status:** 🚀 LIVE · Phases 0 → 12.8 shipped · Phase 13 code-side complete · Phase 14A shipped (commit `dd01930`) · Phase 14B shipped (commit `8340a62`, migrations 017-021 applied) · Phase 14C shipped (commit `f4bae3a`) · Phase 14D shipped (commit `410e0a8`) · Phase 14E shipped (commit `b7fc8ad`) · Phase 14E timeout patch shipped (commit `5037a6c`) · Phase 14E.1 media clarity shipped (commit `a91acd3`) · Phase 14F shipped (commit `e4737e0`, migration 022 applied) · Phase 14G shipped (commit `ca7c2e4`) · Phase 14H shipped (commits `2e3869d`/`4323250`, migration 023 applied) · Phase 14H.1 shipped (commits `69d354d`/`8582680`/`dc56330`, migration 024 applied) · Phase 14H.2 shipped (commit `783803e`, migrations 025-026 applied) · Phase 14I shipped (commit `c9956f5`, migrations 027-028 applied) · Phase 14J shipped (commit `0b3896a`, migration 029 applied) · **Phase 14J.1 starting** (posting gate UI smoke test + audit trail)

---

## Phase 14J Production Smoke Test (PASSED 2026-05-03)

End-to-end verification on prod after migration 029 was applied + Phase 14J was deployed:
- ✅ Migration 029 applied: `content_calendar` gained 8 gate columns + 3 partial indexes + CHECK constraint + auth.users FK.
- ✅ `node scripts/diagnose-posting-gate.js` reported: schema check passed; **143 idle / 0 ready / 0 blocked / 0 null**; **0 gate-approved rows**; **0 anomalies** (no campaign-originated ready rows missing tracking_url); **0 posted-after-queued** entries.
- ✅ `/dashboard/content` renders the new header note "🟢 Mark Ready is a manual gate only…".
- ✅ Approved rows show the new `🟢 Mark Ready` button alongside the existing manual Post buttons.
- ✅ Existing manual posting flow (Post to IG / FB / X / Mark Posted) untouched.
- ✅ No auto-posting occurred. The gate is dormant until a future autoposter respects it.

**Phase 14J.1 is now safe to start.** No blockers. The gate columns work; what's missing is an accountability trail. Phase 14J.1 adds an audit table so every Mark Ready / Remove from Queue / blocked-attempt is recorded before any autoposter is introduced.

---

## Phase 14J.1 — Posting Gate UI Smoke Test + Audit Trail (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + migration 030 apply + deploy)

Adds an append-only `posting_gate_audit` table that records every queue / unqueue / blocked-attempt action on `content_calendar` rows. **No posting. No platform API calls. No AI calls.** Pure accountability layer.

### Existing schema/code inspected

- `ai_actions_log` (migration 003) — existing log table; UUID PK, JSONB payload, created_at index. RLS not enabled (predates the convention).
- `ai_verification_logs` (migration 015) — newer log table; RLS enabled with `Admins full access` policy gated on `admin_users`. Used as the template for migration 030's policy.
- `posting-gate.ts` (Phase 14J) — helper exports `markReadyForPosting` / `removeFromPostingQueue`. Both already idempotent. No audit insert today.
- `posting-gate/route.ts` (Phase 14J) — admin POST; returns `ok / posting_status / posting_gate_approved / posting_block_reason / queued_for_posting_at`.
- `dashboard/content/page.tsx` (Phase 14J) — toggles via `togglePostingGate(item, action)`; surfaces success / error toasts.

### Created

- `supabase/migrations/030_create_posting_gate_audit.sql` — new `posting_gate_audit` table + 4 indexes + RLS policy. Idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
- `scripts/diagnose-posting-gate-audit.js` — read-only diagnostic. Schema check, action counts, last 10 audit rows, ready-rows ↔ queue-audits cross-check, no-auto-post sanity (queue audit followed by `status='posted'` within 60s).

### Updated

- `src/lib/posting-gate.ts`:
  - `ActorContext.user_email` (optional) — denormalized into the audit row so attribution survives user deletion.
  - `GateActionResult.audit_written: boolean` and `audit_warning: string | null` — surfaced on every return path.
  - New private `writeAudit({ supabase, contentCalendarId, action, prev/new state, actor, notes, blockReason, metadata? })` — best-effort INSERT with caught throws + console.error logging. Failure of the audit insert NEVER propagates to the gate action; it just sets `audit_warning`.
  - `markReadyForPosting`:
    - Idempotent already-ready short-circuit → `audit_written=false`, `audit_warning=null`.
    - Eligibility failure → writes `action='blocked'` audit (best-effort) → returns `ok=false` with the eligibility reason + audit fields.
    - Successful queue → writes `action='queue'` audit → returns `ok=true` with audit fields.
  - `removeFromPostingQueue`:
    - Idempotent already-idle short-circuit → `audit_written=false`.
    - Successful unqueue → writes `action='unqueue'` audit (using `opts.reason` as both `notes` and `block_reason`) → returns `ok=true` with audit fields.
  - New private `bareResult(ok, reason, row)` helper for early-error paths where no audit was attempted.
- `src/app/api/admin/content-calendar/posting-gate/route.ts`:
  - Actor context now carries `user_email: auth.user.email`.
  - Both 200 and 4xx response shapes include `action`, `audit_written`, `audit_warning`.
  - 4xx responses additionally surface `posting_status`, `posting_gate_approved`, `posting_block_reason` from the row snapshot so the dashboard can display the unchanged state alongside the rejection reason.
- `src/app/dashboard/content/page.tsx`:
  - `togglePostingGate` success path now reads `json.audit_warning`. When present, fires a second info-level toast `Audit log warning: <message>` so the operator sees the warning without it overriding the primary success toast.
  - Success toast text refined: `'Ready for Posting'` (was `'Marked ready for posting'`) — matches the badge label and the user spec.
  - `'Removed from queue'` text unchanged.

### Migration 030 details

```sql
CREATE TABLE IF NOT EXISTS posting_gate_audit (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_calendar_id      UUID NOT NULL REFERENCES content_calendar(id) ON DELETE CASCADE,
  action                   TEXT NOT NULL CHECK (action IN ('queue', 'unqueue', 'blocked')),
  previous_posting_status  TEXT,
  new_posting_status       TEXT,
  previous_gate_approved   BOOLEAN,
  new_gate_approved        BOOLEAN,
  actor_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email              TEXT,
  notes                    TEXT,
  block_reason             TEXT,
  metadata                 JSONB DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);
```

Four indexes: `(content_calendar_id)`, `(action)`, `(created_at DESC)`, partial `(actor_id) WHERE actor_id IS NOT NULL`. RLS enabled with `Admins full access posting_gate_audit` policy gated on `admin_users` — same pattern as migration 015.

### Audit table columns and indexes

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | gen_random_uuid() |
| `content_calendar_id` | UUID | FK `content_calendar(id) ON DELETE CASCADE` (cascades audit cleanup if calendar row is deleted) |
| `action` | TEXT | CHECK `IN ('queue','unqueue','blocked')` |
| `previous_posting_status` | TEXT | nullable; pre-action snapshot |
| `new_posting_status` | TEXT | nullable; post-action snapshot |
| `previous_gate_approved` | BOOLEAN | nullable |
| `new_gate_approved` | BOOLEAN | nullable |
| `actor_id` | UUID | FK `auth.users(id) ON DELETE SET NULL` |
| `actor_email` | TEXT | denormalized for survival |
| `notes` | TEXT | operator-supplied notes / unqueue reason |
| `block_reason` | TEXT | populated on `action='blocked'` and on unqueue (mirrors notes) |
| `metadata` | JSONB | default `{}` — open slot for future fields |
| `created_at` | TIMESTAMPTZ | default `NOW()` |

Indexes: `idx_posting_gate_audit_calendar`, `idx_posting_gate_audit_action`, `idx_posting_gate_audit_created` (DESC), partial `idx_posting_gate_audit_actor WHERE actor_id IS NOT NULL`.

### RLS / admin access decision

- **RLS enabled.** Policy `Admins full access posting_gate_audit` mirrors migration 015's pattern — `auth.uid() IN (SELECT id FROM admin_users)`.
- **Writes via the helper use `createAdminClient()` (service role)** which bypasses RLS, so the API route writes succeed without an admin user being signed in to the DB session.
- **Dashboard reads** are not implemented in this phase — the user spec is "Do not add a full audit timeline yet unless easy and low-risk." When a future phase adds an audit timeline UI, it should go through an admin API endpoint (GET `/api/admin/content-calendar/posting-gate/audit?content_calendar_id=…`), not direct client-side `supabase.from('posting_gate_audit').select(…)` calls — that ensures the RLS policy is enforced at the right boundary.

### Helper behavior for queue / unqueue / blocked

| Path | State change | Audit row | `audit_written` | `audit_warning` |
|---|---|---|---|---|
| Queue, fully eligible | idle → ready | `action='queue'` written | `true` | `null` (or error msg if insert failed) |
| Queue, eligibility failure | none | `action='blocked'` written (best-effort) | `true` if insert succeeded | `null` (or error msg) |
| Queue, idempotent (already ready) | none | not written (state unchanged) | `false` | `null` |
| Queue, content_calendar update fails | none | not written | `false` | `null` |
| Unqueue, fully effective | ready → idle | `action='unqueue'` written | `true` | `null` (or error msg) |
| Unqueue, idempotent (already idle) | none | not written | `false` | `null` |
| Unqueue, content_calendar update fails | none | not written | `false` | `null` |

**Idempotency contract preserved.** Re-running queue on a ready row OR unqueue on an idle row produces no new audit row — the audit table doesn't fill with no-op duplicates.

**Audit-failure contract.** When the audit insert fails after a successful gate state change, the gate action still stands (`ok=true`) and `audit_warning` carries the error message. The dashboard surfaces this as a non-blocking info toast.

### API response changes

- 200 (success): `{ ok, action, content_calendar_id, posting_status, posting_gate_approved, posting_block_reason, queued_for_posting_at, audit_written, audit_warning }`
- 4xx (eligibility / not found): `{ ok:false, action, content_calendar_id, reason, posting_status, posting_gate_approved, posting_block_reason, audit_written, audit_warning }`. Status `400` for eligibility / validation, `404` for not-found.
- 500 (DB / unexpected): `{ error: <message> }`.

`action` is added at the top level so audit consumers can correlate the response shape with the request without digging into the URL path.

### Dashboard changes

- Success toast for queue: `'Ready for Posting'` (matches the badge text).
- Success toast for unqueue: `'Removed from queue'` (unchanged).
- When the API returns a non-empty `audit_warning`, a second `info` toast fires: `Audit log warning: <message>`. Doesn't replace the success toast.
- No full audit timeline UI added (per spec). When an operator wants a row's history, they can run `node scripts/diagnose-posting-gate-audit.js` or query directly.
- Existing manual posting buttons remain unchanged — gate flips don't affect them.

### Diagnostic script behavior

`node scripts/diagnose-posting-gate-audit.js`:

1. Schema check — selects all 13 columns; reports the migration to apply if any are missing.
2. Counts rows by action (queue / unqueue / blocked / other).
3. Lists last 10 audit rows: timestamp, action, previous → new status, actor email, content_calendar_id prefix, and either `block_reason` or `notes`.
4. Cross-check: every `posting_status='ready' AND posting_gate_approved=true` row should have at least one `action='queue'` audit entry. Reports any gaps (those would be pre-Phase-14J.1 rows queued before the audit table existed — acceptable and labeled).
5. No-auto-post sanity: looks for any row that transitioned to `status='posted'` within 60 seconds of its earliest queue audit. Expected count: 0 (the gate doesn't auto-post). Non-zero hits surface for manual review.

Read-only — never writes.

### Tests run this session

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 23.9s`. `ƒ /api/admin/content-calendar/posting-gate` still registered.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **Migration 030 must be applied before deploy.** Without it, the helper's INSERT into `posting_gate_audit` fails on every gate action. The error is caught in `writeAudit`, so the gate state still changes — but `audit_warning` will fire on every click. Operators would see a warning toast for each action until the migration lands. Apply migration first.
- **No audit reads via the dashboard yet.** The spec explicitly defers a full audit timeline UI. Operators wanting per-row history must use the diagnostic script or query Supabase directly. A future phase can add `GET /api/admin/content-calendar/posting-gate/audit?content_calendar_id=…`.
- **Ready-rows cross-check tolerates pre-existing rows.** Any rows that became ready before migration 030 was applied won't have a queue audit. The diagnostic flags them informational, not as errors.
- **`actor_email` denormalization.** Captured at write time. If an operator updates their email later, historical audit rows show the OLD email. Accepted trade-off — the audit row's purpose is "who did this when," not "who is this user now."
- **Audit-write failure is silent at the DB layer.** `console.error` logs from a serverless function don't always surface in the Supabase Studio. Vercel Functions logs catch them. If audit failures become a real concern, route them through `ai_actions_log` as a fallback.
- **No admin-level rate limit on the audit table.** A pathologically-quick admin could spam queue/unqueue and bloat the table. Acceptable for an internal admin surface; revisit if it becomes an issue.

### Leo to do (per Mandatory End-of-Phase Save Protocol)

- [ ] Commit + push.
- [ ] **Apply migration 030 to Supabase prod.** Verification SQL:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'posting_gate_audit';
  -- Expect: 1 row.

  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'posting_gate_audit'
  ORDER BY column_name;
  -- Expect: 13 rows.

  SELECT indexname FROM pg_indexes
  WHERE tablename = 'posting_gate_audit'
  ORDER BY indexname;
  -- Expect at least: idx_posting_gate_audit_action, idx_posting_gate_audit_actor, idx_posting_gate_audit_calendar, idx_posting_gate_audit_created.

  SELECT polname FROM pg_policy WHERE polrelid = 'posting_gate_audit'::regclass;
  -- Expect: "Admins full access posting_gate_audit".
  ```
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test (post-deploy):
  - [ ] Open `/dashboard/content` → click `🟢 Mark Ready` on an approved row → toast reads `Ready for Posting`. No audit warning toast appears.
  - [ ] Click `↩ Remove from Queue` → toast reads `Removed from queue`.
  - [ ] (Optional) Try Mark Ready on a rejected/posted row → 400 toast with the eligibility reason. Confirm no platform API was called.
- [ ] Run `node scripts/diagnose-posting-gate-audit.js` post-deploy:
  - [ ] Step 1 reports `✓ All Phase 14J.1 columns present`.
  - [ ] Step 2 shows non-zero queue + unqueue counts (depends on smoke-test clicks).
  - [ ] Step 3 lists the smoke-test audits.
  - [ ] Step 4 reports `✓ Every ready row has a matching queue audit.` (assuming the smoke test left one ready row).
  - [ ] Step 5 reports `✓ No row was posted within 60s of being queued.`.

### Recommended next phase

**Phase 14K — Autoposter cron that honors the gate AND writes to the audit table.** Now that the audit trail exists, the autoposter has somewhere to record `action='auto_posted'` (would need a CHECK-constraint expansion) or `action='auto_skipped'` for rows it considered but didn't post. Scope: daily cron reading rows where `posting_status='ready' AND posting_gate_approved=true AND manual_posting_only=true AND status='approved' AND posted_at IS NULL`, calling the appropriate platform poster route per row, marking `status='posted'` on success. Each platform call wrapped in try/catch + rate-limited; failures clear `posting_gate_approved` and write a `block_reason` so an operator must re-mark before retry. Hobby cron limit is at 4 — would replace one of the existing crons (the underused `score-and-branch` is the strongest candidate to merge into another).

Alternative: **Phase 14J.2 — Audit timeline UI.** Adds `GET /api/admin/content-calendar/posting-gate/audit?content_calendar_id=…` and surfaces a small per-row history panel on `/dashboard/content`. Lower risk than 14K (no new platform calls), higher operator value than the diagnostic script. Doesn't move publishing forward but tightens accountability for the existing manual flow.

I'd lean **14K next** since the gate exists specifically as autoposter infrastructure, but **14J.2 first** is defensible if you want operators to see audit history in-dashboard before any autoposter ships.

---

## Phase 14I Production Smoke Test (PASSED 2026-05-03)

End-to-end verification on prod after migrations 027 & 028 were applied + Phase 14I was deployed:
- ✅ Migration 027 applied: 7 new columns on `contact_events` (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `event_campaign_id`, `campaign_asset_id`, `content_calendar_id`); 5 partial indexes; 3 FKs with `ON DELETE SET NULL`.
- ✅ Migration 028 applied: `event_campaign_attribution_summary` recreated with 4 click columns at the tail (`campaign_click_count`, `campaign_page_view_count`, `campaign_first_click_at`, `campaign_latest_click_at`).
- ✅ **Synthetic click validation passed.** A test POST to `/api/webhooks/track-event` with `event=page_view`, `utm_source=facebook`, `utm_medium=event_campaign`, `utm_campaign=art-basel-miami-beach_2026_W2`, `utm_content=social_post_fca9a0dd` produced one row in `contact_events` with `event_campaign_id` and `campaign_asset_id` both resolved to non-null UUIDs.
- ✅ Diagnostic script (`scripts/diagnose-campaign-click-attribution.js`): step 1 confirmed all 7 schema columns present; step 4 (Art Basel spot check) reported **FK-attributed contact_events: 1**.
- ✅ Performance panel on `/dashboard/campaigns` → Art Basel renders Clicks: 1, Page views: 1 (no "deferred" subtext).
- ✅ Anonymous campaign visits are now persisted (the previous bail logic dropped them).
- ✅ No auto-posting occurred.

**Phase 14J is now safe to start.** No blockers. The campaign attribution stack is complete: assets generated → calendar drafts → tracking URLs materialized → clicks captured → leads/conversions surfaced. Phase 14J adds the explicit human gate that future auto-posting will require before sending anything to any platform.

---

## Phase 14J — Safe Posting Gate / Manual Publish Controls (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + migration 029 apply + deploy)

Adds an explicit human gate on `content_calendar` rows. The gate is a separate signal from `content_calendar.status` — when a row is `status='approved'`, an admin must additionally click `🟢 Mark Ready` to flip `posting_status='ready'` AND `posting_gate_approved=true`. Future autoposters MUST require both before calling any platform API. **This phase does NOT itself post.**

### Existing schema/code inspected

- `content_calendar` (migration 004) — canonical lifecycle is `status IN ('draft','approved','posted','rejected')`. Manual posting buttons on `/dashboard/content` already check `status='approved'` server-side.
- `/api/automations/post-to-instagram`, `…/post-to-facebook`, `…/post-to-twitter` — admin-gated, require `post.status='approved'`. Dashboard's "Post to IG / FB / X / Mark Posted" buttons hit these directly.
- `/api/content` PATCH — admin-gated; toggles `content_calendar.status`. Phase 14J does not touch it.
- No autoposting cron currently exists; manual posting via dashboard buttons is the only path today.

### Created

- `supabase/migrations/029_add_posting_gate_fields_to_content_calendar.sql` — adds 8 nullable columns (with defaults backfilled to existing rows): `posting_status` (CHECK `'idle'|'ready'|'blocked'`), `posting_gate_approved`, `posting_gate_approved_at`, `posting_gate_approved_by` (FK to `auth.users(id) ON DELETE SET NULL`), `posting_gate_notes`, `queued_for_posting_at`, `manual_posting_only` (DEFAULT TRUE), `posting_block_reason`. Three partial indexes (`posting_status` non-idle, `posting_gate_approved=TRUE`, `queued_for_posting_at NOT NULL`). Idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`).
- `src/lib/posting-gate.ts` — pure helpers + DB action wrappers. Exports:
  - `POSTING_STATUS_VALUES`, `PostingStatus`, `PostingGateRow`, `EligibilityResult`, `GateActionResult`.
  - `normalizePostingStatus(input)` — collapses arbitrary input to one of `idle | ready | blocked` (default `idle`).
  - `getPostingGateBlockReason(row)` — returns the first failing rule as a user-facing string, or null when fully eligible.
  - `canEnterPostingQueue(row)` → `{ ok, reason }`.
  - `buildPostingGatePayload(actor, notes?)` and `buildPostingUnqueuePayload(actor, reason?)` — pure UPDATE payload builders.
  - `markReadyForPosting({ contentCalendarId, actor, notes })` — DB action; idempotent (already-ready row → quiet success); never touches `status` or platform APIs.
  - `removeFromPostingQueue({ contentCalendarId, actor, reason })` — DB action; idempotent.
- `src/app/api/admin/content-calendar/posting-gate/route.ts` — admin-gated POST. Zod validates `{ content_calendar_id (uuid), action ('queue' | 'unqueue'), notes? }`. Maps eligibility failures to 400, missing rows to 404, DB errors to 500, success to 200 with `{ ok, content_calendar_id, posting_status, posting_gate_approved, posting_block_reason, queued_for_posting_at }`. Never auto-posts.
- `scripts/diagnose-posting-gate.js` — read-only diagnostic. Verifies migration 029 columns, distributes rows by `posting_status`, lists gate-approved rows, surfaces gate-approved rows with missing `tracking_url` (anomaly), and flags any rows that became `status='posted'` after being queued (informational — those are manual posts, expected).

### Updated

- `src/app/dashboard/content/page.tsx`
  - `ExtendedContentItem` gains optional `posting_status`, `posting_gate_approved`, `posting_block_reason`, `campaign_asset_id`, `tracking_url`.
  - Local mirror of `getPostingGateBlockReason` (kept in sync with the helper by hand) drives the UI hint.
  - New `togglePostingGate(item, action)` POSTs to the new route; updates local state; surfaces API reason via toast on failure.
  - **For `status='approved'` rows:** the existing per-platform "Post to …" buttons + "Mark Posted" button are unchanged. A new gate control sits below them:
    - If `posting_status='ready'` AND `posting_gate_approved=true` → `✅ Ready for Posting` badge + `↩ Remove from Queue` button.
    - Else if `getPostingGateBlockReason` returns a reason → muted `Gate ineligible` text with the reason in a `title` tooltip.
    - Otherwise → `🟢 Mark Ready` button with hover tooltip "Mark this row ready for the future autoposter. Manual gate only — does not post to social platforms."
  - Page header carries a small note: "🟢 Mark Ready is a manual gate only. It does not post to social platforms."

### Migration 029 details

| Column | Type | Default | Notes |
|---|---|---|---|
| `posting_status` | TEXT | `'idle'` | CHECK `IN ('idle','ready','blocked')` |
| `posting_gate_approved` | BOOLEAN | `FALSE` | true only after admin clicks Mark Ready |
| `posting_gate_approved_at` | TIMESTAMPTZ | NULL | overwritten on each queue action |
| `posting_gate_approved_by` | UUID | NULL | FK `auth.users(id) ON DELETE SET NULL` |
| `posting_gate_notes` | TEXT | NULL | free-text |
| `queued_for_posting_at` | TIMESTAMPTZ | NULL | nulled on unqueue |
| `manual_posting_only` | BOOLEAN | `TRUE` | future autoposter must skip TRUE rows |
| `posting_block_reason` | TEXT | NULL | set on Remove from Queue |

Three partial indexes:
- `idx_content_calendar_posting_status WHERE posting_status IS NOT NULL AND posting_status <> 'idle'`
- `idx_content_calendar_posting_gate_approved WHERE posting_gate_approved = TRUE`
- `idx_content_calendar_queued_for_posting_at WHERE queued_for_posting_at IS NOT NULL`

Backfills are split into separate `UPDATE`s so the migration runs cleanly even on rows inserted before column-level defaults take effect. `CHECK` constraint added separately with `DROP IF EXISTS` so re-running the migration is safe.

### Posting-gate eligibility rules

A row may enter the queue (`canEnterPostingQueue`) only when ALL of the following hold:

| Rule | Reason if violated |
|---|---|
| `status === 'approved'` | "Row status must be 'approved' to enter the posting queue (currently '{status}')." |
| `status !== 'rejected'` | "Row is rejected — cannot be queued for posting." |
| `status !== 'posted'` | "Row is already posted — gate has nothing to do." |
| `platform` non-empty | "Row has no platform set." |
| `caption` non-empty | "Row has no caption / body content." |
| `manual_posting_only !== false` | "Row is flagged manual_posting_only=false. Restore that flag before queuing." |
| Campaign-originated rows have `tracking_url` | "Campaign-originated row is missing a tracking_url. Re-push from the campaign dashboard to materialize it." |

Unqueue has no eligibility check — operators can always pull a row regardless of state.

### API route behavior

`POST /api/admin/content-calendar/posting-gate`

| Status | Meaning |
|---|---|
| 200 | `{ ok:true, content_calendar_id, posting_status, posting_gate_approved, posting_block_reason, queued_for_posting_at }` |
| 400 | Invalid input OR row ineligible (reason in body) |
| 404 | Row not found |
| 500 | DB / unexpected error |

The route NEVER calls a platform API, NEVER changes `content_calendar.status`, NEVER auto-posts.

### Dashboard changes

For `status='approved'` rows on `/dashboard/content`:
- Existing manual-posting buttons (Post to IG / FB / X, Upload to TikTok, Mark Posted) are unchanged — operator continues to publish manually as today.
- New gate column renders directly below the manual-posting buttons:
  - **Ready badge + Remove from Queue button** when the row is queued.
  - **`Gate ineligible` text** (with reason on hover) when the row fails the rules.
  - **`🟢 Mark Ready` button** otherwise.
- Header note explicitly clarifies: "Mark Ready is a manual gate only. It does not post to social platforms."

### Posting routes inspected — left unchanged (deferred)

The three platform posting routes (`/api/automations/post-to-{instagram,facebook,twitter}/route.ts`) currently require only `status='approved'`. Adding a guard that also requires `posting_gate_approved=true` would break the existing manual flow on `/dashboard/content` (operators currently click the per-platform Post button directly on approved rows).

**Decision: leave manual-posting routes unchanged.** The gate is a forward-looking signal. The future autoposter (Phase 14K+) MUST require both `posting_status='ready'` AND `posting_gate_approved=true` AND `manual_posting_only=true` (the third requirement effectively means "operator hasn't explicitly disabled manual-only enforcement"). Adding the guard to manual routes today would be regressive without operator agreement.

### Diagnostic script behavior

`node scripts/diagnose-posting-gate.js`:
1. Schema check — selects all 8 Phase 14J columns; reports missing columns with the exact migration to apply.
2. Distribution — counts `content_calendar` rows by `posting_status` (idle/ready/blocked/null/other).
3. Gate-approved rows — total + first 10 with id / status / queued_at.
4. Anomaly check — gate-approved rows with `campaign_asset_id` set but `tracking_url` NULL (should be empty; otherwise the eligibility check failed somewhere).
5. Posted-after-queued cross-check — informational; flags rows that became `status='posted'` after being queued. Expected to be non-zero only when admins use the manual posting buttons after marking ready, which is normal.

Read-only — never writes.

### Tests run this session

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 23.3s`. New route registered as `ƒ /api/admin/content-calendar/posting-gate`.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **Migration 029 must be applied before deploy.** Without it, the route's UPDATE fails with `column "posting_status" does not exist`. The dashboard would also show 500s on every Mark Ready / Remove from Queue click. Apply migration first.
- **The new `manual_posting_only` column defaults to TRUE for all rows.** Existing manual-posting flow is unaffected because the manual routes don't read this column. The future autoposter MUST honor it.
- **The CHECK constraint on `posting_status`** allows NULL plus `'idle' | 'ready' | 'blocked'`. NULL is allowed because the migration adds the column nullably first; the backfill UPDATE then sets every row to `'idle'`, but if a future code path inserts without specifying the column, the column default (`'idle'`) covers it. Belt and suspenders.
- **The eligibility check enforces `tracking_url IS NOT NULL` only when `campaign_asset_id IS NOT NULL`.** Organic content_calendar rows (weekly-content cron output, manual entries) don't have `campaign_asset_id`, so they bypass the URL requirement — which is correct (they shouldn't have a tracking_url either).
- **The dashboard's local `getPostingGateBlockReason` mirror can drift from the helper.** Kept in sync by hand. The API still wins (it returns the reason via toast), so a stale local mirror just makes the UI hint slightly inaccurate, never wrong.
- **Idempotency of unqueue.** Unqueueing a never-queued row is a no-op success. Unqueueing a ready row clears the gate but leaves `posting_gate_approved_by` unchanged as a historical record (operator who first queued is preserved). Re-queueing overwrites it.
- **No autoposter exists yet.** The gate is dormant until Phase 14K+ ships an autoposter that respects it. Operators marking rows Ready today produces no observable behavior beyond the badge + cron-side bookkeeping.

### Leo to do (per Mandatory End-of-Phase Save Protocol)

- [ ] Commit + push.
- [ ] **Apply migration 029 to Supabase prod.** Verification SQL:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'content_calendar'
    AND column_name IN ('posting_status','posting_gate_approved','posting_gate_approved_at','posting_gate_approved_by','posting_gate_notes','queued_for_posting_at','manual_posting_only','posting_block_reason')
  ORDER BY column_name;
  -- Expect: 8 rows.

  SELECT count(*) FILTER (WHERE posting_status = 'idle') AS idle,
         count(*) FILTER (WHERE posting_status IS NULL) AS null_status,
         count(*) AS total
  FROM content_calendar;
  -- Expect: idle = total, null_status = 0 (after backfill).

  SELECT indexname FROM pg_indexes
  WHERE tablename = 'content_calendar'
    AND indexname IN ('idx_content_calendar_posting_status','idx_content_calendar_posting_gate_approved','idx_content_calendar_queued_for_posting_at')
  ORDER BY indexname;
  -- Expect: 3 rows.
  ```
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test (post-deploy):
  - [ ] Open `/dashboard/content` → confirm header reads "Mark Ready is a manual gate only…"
  - [ ] On any approved row, click `🟢 Mark Ready` → confirm `✅ Ready for Posting` badge appears + `↩ Remove from Queue` button shows up.
  - [ ] Click `↩ Remove from Queue` → confirm badge disappears, button reverts to `🟢 Mark Ready`.
  - [ ] Try Mark Ready on a draft row (status ≠ approved) → confirm muted `Gate ineligible` hint appears (or the button is gated upstream).
  - [ ] (Optional) For a campaign-originated row whose `tracking_url` is missing, confirm Mark Ready is blocked with the tracking-URL reason.
- [ ] Run `node scripts/diagnose-posting-gate.js` post-deploy → confirm step 1 passes, step 2 shows distribution, step 4 reports zero anomalies.
- [ ] Verify no auto-posting occurred: no rows changed to `status='posted'` outside of explicit operator clicks.

### Recommended next phase

**Phase 14K — Autoposter cron that honors the gate.** The natural next step. Scope: a daily/weekly cron that reads `content_calendar` rows where `posting_status='ready' AND posting_gate_approved=true AND manual_posting_only=true AND status='approved' AND posted_at IS NULL`, invokes the appropriate platform poster route per row, marks `status='posted'` on success. Each platform call should be wrapped in try/catch and rate-limited; failures should set `posting_block_reason` and clear `posting_gate_approved` so an operator must re-mark before retry. The Hobby cron limit is at 4 — this would replace one of the existing crons (the underused `score-and-branch` is the strongest candidate to merge into another).

Alternative: **Phase 14K — Per-asset click attribution dashboard surface.** Continues the analytics push from Phase 14I — exposes click counts at platform/wave grain by extending the attribution view's `click_match` CTE. Doesn't require a 5th cron slot. Lower risk, higher analytic value, but doesn't move the publishing flow forward.

I'd lean **autoposter first** since the gate exists specifically as autoposter infrastructure. Doing 14K now closes the loop; per-asset attribution can come later when the gate has actually moved rows to `posted`.

---

## Phase 14H.2 Production Smoke Test (PASSED 2026-05-03)

End-to-end verification on prod after migrations 025 & 026 were applied + Phase 14H.2 was deployed:
- ✅ Migration 025 applied: `event_campaigns.event_slug` column exists; `idx_event_campaigns_event_slug` partial index exists; backfill complete (every campaign has a non-null slug).
- ✅ Migration 026 applied: `event_campaign_attribution_summary` recreated; `pg_get_viewdef` confirms the WITH-CTE references `event_slug`.
- ✅ Art Basel slug verified: `art-basel-miami-beach` (matches `slugifyEventName('Art Basel Miami Beach')`).
- ✅ Performance panel still loads on `/dashboard/campaigns`; column shape unchanged so no regression.
- ✅ Re-pushed an Art Basel asset → new tracking URL uses persisted slug from the column (not derived from event_name).
- ✅ Attribution view backwards compatible: campaigns with NULL `event_slug` (none currently in prod) would fall through to the legacy regex.
- ✅ Cron continues to backfill `event_slug` only when currently NULL (operator edits preserved).
- ✅ No auto-posting occurred.

**Phase 14I is now safe to start.** No blockers. The `event_slug` column gives click attribution a stable foreign-key-like anchor so the next phase can resolve UTM hits to specific campaigns deterministically.

---

## Phase 14I — Click Attribution via track-event (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + migrations 027 & 028 apply + deploy)

Replaces the always-zero `click_count` slot on the Performance panel with real data sourced from `contact_events`. **Read-mostly, additive, schema-only-where-needed.** No posting, no AI calls, no media generation, no campaign-generation logic change.

### Existing schema/code inspected

- `contact_events` (migration 008) — `id, contact_id (nullable), event, metadata JSONB, score_delta, created_at`. Already supports anonymous logging because `contact_id` has no NOT NULL constraint.
- `track-event` route — accepted `{ contact_id, email, event, metadata }`. Bailed early when no contact could be resolved (`return ok` with no insert), so anonymous campaign visits were dropped. Required surgery to log them.
- `contacts.custom_fields` JSONB — already powers lead-side UTM matching (Phases 14H + 14H.2). No change needed here.
- `event_campaigns.event_slug` (migration 025) — Phase 14H.2's stable slug column; click-side matching now anchors against this same column.
- `campaign_assets.id` UUID — first 8 chars (dashes-stripped) is the canonical short used in `utm_content`.

### Created

- `supabase/migrations/027_add_utm_fields_to_contact_events.sql` — adds `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` (TEXT NULL) plus `event_campaign_id`, `campaign_asset_id`, `content_calendar_id` (UUID NULL with `REFERENCES … ON DELETE SET NULL`) to `contact_events`. Five partial indexes (skip-NULLs) for fast lookups by utm_campaign / utm_medium / event_campaign_id / campaign_asset_id / content_calendar_id. Idempotent.
- `supabase/migrations/028_update_event_campaign_attribution_view_for_clicks.sql` — `CREATE OR REPLACE VIEW event_campaign_attribution_summary` extends migration 026 with FOUR new columns at the tail: `campaign_click_count`, `campaign_page_view_count`, `campaign_first_click_at`, `campaign_latest_click_at`. New `click_match` CTE counts `contact_events` matched by `(event_campaign_id = ec.id) OR (event_campaign_id IS NULL AND utm_medium='event_campaign' AND utm_campaign ~* '<slug>_<year>(_|$)')` — primary FK match for new traffic, regex fallback for any rows that predate the deploy.
- `scripts/diagnose-campaign-click-attribution.js` — read-only diagnostic. Verifies migration 027 columns exist, counts campaign clicks in the last 30 days, groups by utm_campaign with FK-resolved vs. UTM-only counts, and runs an Art Basel-specific spot check.

### Updated

- `src/app/api/webhooks/track-event/route.ts`
  - New `extractUtm(body, request)` pulls UTM from body top-level, `body.metadata`, query params, and `referrer`/`referer` URL — first non-empty wins per key. Lower-cases `utm_source`.
  - New `parseUtmCampaign(value)` → `{ slug, year, wave }` parser using regex `^([a-z0-9-]+)_(\d{4})(?:_(W[1-8]))?$`.
  - New `parseUtmContent(value)` → `{ assetType, assetIdShort }` parser using regex `^([a-z][a-z0-9_]*)_([a-z0-9]{8})$`.
  - New `resolveCampaignFromUtm(supabase, utm)` resolves to `{ event_campaign_id, campaign_asset_id, content_calendar_id }`. Matches campaign by `event_slug + event_year`. Matches asset by pulling all (campaign × asset_type) candidates and finding one whose `id.replace(/-/g, '').slice(0,8) === assetIdShort`. Asset's `content_calendar_id` is read directly from the matched row.
  - **Bail logic loosened** — the route now logs anonymous events when campaign UTM is present (`utm_medium='event_campaign'` OR `event_campaign_id` resolved). Bails only when there's no contact AND no campaign UTM.
  - Lead-score / tag updates remain gated on `resolvedId` (no change for organic traffic).
  - INSERT into `contact_events` always carries the seven new columns (NULL when not resolved).
- `src/lib/event-campaign-attribution.ts`
  - `AttributionRow` gains `campaign_click_count`, `campaign_page_view_count`, `campaign_first_click_at`, `campaign_latest_click_at`.
  - `VIEW_COLUMNS` updated to read the 4 new fields.
  - `CampaignRollup`: replaces always-zero `click_count` with real value; adds `page_view_count`, `first_click_at`, `latest_click_at`. `click_to_lead_rate` now actually computes when clicks > 0.
  - `latest_activity_at` rolls in `campaign_latest_click_at`.
- `src/app/dashboard/campaigns/page.tsx`
  - `AttributionRollup` interface mirrors helper additions.
  - `PerformancePanel` Metric grid shows real `Clicks`, `Page views`, `Leads`, `Conversions` (4 cells), then `Click → Lead`, `Lead → Member`, `Approved assets`, `Calendar rows`. The "deferred" subtext on Clicks is removed.
  - New empty-state copy when posted rows exist but no clicks yet: **"No campaign clicks captured yet. Tracking URLs are ready."**
  - Footer note rewritten — no longer says click attribution is deferred.

### track-event behavior after patch

| Scenario | Pre-Phase-14I | Post-Phase-14I |
|---|---|---|
| Known contact, no UTM | logs event, updates score/tags | unchanged |
| Known contact, campaign UTM | logs event w/o UTM, updates score/tags | logs event with UTM + resolved FKs, updates score/tags |
| Anonymous, no UTM | bails (returns ok, no insert) | unchanged |
| Anonymous, campaign UTM | **bails (returns ok, no insert)** ← bug | **logs event with UTM + resolved FKs, contact_id NULL, score_delta 0** ✓ |
| Malformed UTM tag | logs event, updates score/tags | logs event, FKs all NULL, falls back to view's substring match |

### Attribution view click behavior

- **Primary path:** `contact_events.event_campaign_id = ec.id` — set when the route resolved the UTM tag at insert time.
- **Fallback path:** `event_campaign_id IS NULL AND utm_medium='event_campaign' AND utm_campaign ~* '<slug>_<year>(_|$)'` — covers legacy rows that predate Phase 14I (organic test data) AND any rows where the route's runtime resolution failed (rare).
- `page_view_count` is a strict subset of `click_count` (filtered by `event = 'page_view'`).
- `COUNT(ce.id)` not `COUNT(*)` so LEFT JOIN nulls don't pollute the count for campaigns with zero clicks.

### Dashboard changes

- Performance panel now renders real metrics. The "deferred" badge is gone; click counts will populate as traffic flows through pushed assets' tracking URLs.
- Three states are distinguished:
  - **No signal at all** → "No conversion data yet. Campaign assets are now trackable once links receive traffic."
  - **Signal but no clicks** → "No campaign clicks captured yet. Tracking URLs are ready."
  - **Clicks present** → no banner; metrics speak for themselves.
- Approve / reject / generate / push-to-calendar flows unchanged.

### Diagnostic script

`scripts/diagnose-campaign-click-attribution.js`:
- Tests that migration 027 columns exist via a SELECT round-trip.
- Pulls last-30-days `contact_events` with `utm_medium='event_campaign'` (capped at 500).
- Groups by `utm_campaign`; reports total / page_view subset / FK-resolved / asset-resolved counts per campaign tag.
- Runs an Art Basel-specific check: how many `contact_events` are FK-attributed vs. UTM-substring-matched.
- Mirrors the read-only / no-write contract of `scripts/diagnose-tracking-urls.js`.

### Tests run this session

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 11.1s`. `ƒ /api/webhooks/track-event` still registered.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **Migration 027 must be applied before deploy.** Without it, the route's INSERT fails with `column "utm_source" does not exist` on every campaign event. The bail logic also references the columns indirectly. Apply 027 first.
- **Migration 028 references `event_campaign_id`, `utm_medium`, `utm_campaign` from `contact_events` (added by 027).** Must run 027 → 028 in order. Running 028 against a 027-less DB fails with `column does not exist`.
- **Apply order vs deploy:** apply both migrations BEFORE the new code reaches prod. The pre-Phase-14I route still works against a post-027 schema (extra columns just stay NULL on legacy inserts), so a small window between migration apply and deploy is non-breaking. The reverse — deploy before migration — is breaking (new route attempts to write columns that don't exist).
- **Asset resolution can return false negatives.** When a real campaign URL is shortened or a UTM tag is hand-edited, the parser may reject the value. The route falls back to leaving FK columns NULL; the view still counts the row via the substring fallback. So at worst, asset-level resolution is missed but campaign-level isn't.
- **Rate limit unchanged at 60 events/min/IP.** Adding the campaign-resolution lookup costs ~2 extra DB queries per matched event, but only when `utm_medium='event_campaign'`. Organic traffic is unaffected.
- **Anonymous events accumulate without contact deduplication.** A single visitor clicking a campaign link 5 times in a row produces 5 rows. The view's `COUNT(ce.id)` counts all 5 as clicks. This is intentional — we want raw click volume — but it means click-to-lead rate may overstate. If session-level deduplication becomes important, add a session id to track-event in a future phase.
- **`metadata` field type-narrowing in the route.** The previous shape allowed `metadata: any` from the body; the rewrite enforces `Record<string, unknown>` and falls back to `{}` if the input isn't an object. Existing callers (the only known one is the tracker on the public site) all send objects, so no breakage expected.

### Leo to do (per Mandatory End-of-Phase Save Protocol)

- [ ] Commit + push.
- [ ] **Apply migration 027 to Supabase prod.** Verification:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'contact_events'
    AND column_name IN ('utm_source','utm_medium','utm_campaign','utm_content','event_campaign_id','campaign_asset_id','content_calendar_id')
  ORDER BY column_name;
  -- Expect: 7 rows.

  SELECT indexname FROM pg_indexes
  WHERE tablename = 'contact_events'
    AND indexname LIKE 'idx_contact_events_%';
  -- Expect: 5 new indexes (utm_campaign, utm_medium, event_campaign, campaign_asset, content_calendar) plus the 3 from migration 008.
  ```
- [ ] **Apply migration 028 to Supabase prod.** Verification:
  ```sql
  SELECT viewname FROM pg_views WHERE viewname = 'event_campaign_attribution_summary';

  -- Confirm the new click columns are emitted:
  SELECT position('campaign_click_count' IN pg_get_viewdef('event_campaign_attribution_summary', true)) > 0
    AS has_click_count,
         position('campaign_page_view_count' IN pg_get_viewdef('event_campaign_attribution_summary', true)) > 0
    AS has_page_view_count;
  -- Expect: both true.
  ```
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test: open `/dashboard/campaigns` → Art Basel → Performance panel renders Clicks/Page views as 0, no "deferred" subtext, footer note no longer says "deferred". Click count will tick up as traffic flows through the published tracking URLs.
- [ ] Run `node scripts/diagnose-campaign-click-attribution.js` post-deploy to confirm the schema is in place; optional baseline read.

### Recommended next phase

**Phase 14J — Per-asset click attribution** is the natural next step. Today the view aggregates clicks at campaign grain. Once enough traffic has accumulated, splitting the click_match CTE by `(campaign_asset_id, platform, wave)` lets the dashboard answer: which platform / wave / asset converts best? The schema groundwork is already laid — `contact_events.campaign_asset_id` is populated when the route resolves it. Scope: rewrite the view to add per-asset click columns; thread them through the helper's `by_platform` / `by_wave` breakdowns; add a small "top-performing posts" table to the dashboard.

Alternative: **Phase 14J — Tracking pixel on landing pages.** The current track-event endpoint relies on JS clients calling it. A 1×1 transparent pixel on `/` and `/leosp` would capture clicks even from email apps that strip JS. Modest scope, complementary to Phase 14I.

I'd lean **per-asset attribution first** — it makes the existing data more useful before adding new collection paths.

---

## Phase 14H.1 — Closed (2026-05-03)

End-to-end verification on prod after migration 024 was applied + Phase 14H.1 was deployed:
- ✅ Migration 024 applied (`content_calendar.tracking_url` column + lookup index).
- ✅ Push-to-Calendar emits a resolved tracking URL with all four UTM params (`utm_source` / `utm_medium` / `utm_campaign` / `utm_content`).
- ✅ Dashboard shows `🔗 Tracking URL ready · copy` on session-pushed assets; clicking copies the URL.
- ✅ The single existing `content_calendar.tracking_url` row is correctly formed: `https://myvortex365.com/leosp?utm_source=facebook&utm_medium=event_campaign&utm_campaign=art-basel-miami-beach_2026_W2&utm_content=social_post_fca9a0dd`.
- ✅ Phase 14H.1 patch (`8582680`) shipped: `shortAssetId` rejects placeholder-shaped inputs (length+charset gate), `buildCampaignTrackingUrl` omits `utm_content` entirely when `assetId` or `assetType` is missing.
- ✅ Diagnostic script (`scripts/diagnose-tracking-urls.js`, commit `dc56330`) ran against prod and returned **0 affected rows**. No SQL repair UPDATE was needed.

**Phase 14H.2 is now safe to start.** No blockers. The remaining slug-drift risk noted in Phase 14H + 14H.1 is exactly what 14H.2 addresses: persist `event_slug` on `event_campaigns` so attribution survives event-name edits.

---

## Phase 14H.2 — Persist event_slug on event_campaigns (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + migrations 025 & 026 apply + deploy)

Locks attribution to a stable per-campaign slug chosen at insert time. **Read-mostly and additive.** No posting, no AI generation, no media generation, no caption text mutation, no route-shape change.

### Created

- `supabase/migrations/025_add_event_slug_to_event_campaigns.sql`
  - `ALTER TABLE event_campaigns ADD COLUMN IF NOT EXISTS event_slug TEXT;`
  - Backfill `UPDATE` for existing rows: `event_slug = regexp_replace(regexp_replace(lower(event_name), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')` — byte-for-byte identical to the JS helper's `slugifyEventName`. Only runs against rows where `event_slug IS NULL AND event_name IS NOT NULL AND length(trim(event_name)) > 0`.
  - Partial lookup index `idx_event_campaigns_event_slug` (skips NULLs).
  - **Conditional** unique index on `(lower(event_slug), event_year, lower(destination_city))` — wrapped in a `DO $$ ... $$` block that first checks for duplicates and only creates the index when none exist. If natural duplicates already exist in prod, the unique index is silently skipped (`RAISE NOTICE`) and the migration still completes.
- `supabase/migrations/026_update_event_campaign_attribution_view_use_event_slug.sql`
  - `CREATE OR REPLACE VIEW event_campaign_attribution_summary` with the **same column shape** as migration 023.
  - The internal `WITH utm_match` CTE's regex anchor changes from `regexp_replace(lower(event_name), ...)` to `COALESCE(NULLIF(trim(event_slug), ''), regexp_replace(...))`. Persisted slug wins; NULL slug falls back to the legacy derivation, so this migration is fully backwards compatible with rows that haven't been backfilled yet.

### Updated

- `src/lib/event-campaign-generator.ts`
  - Imports `slugifyEventName` from `campaign-tracking-url`.
  - `UpsertPayload` interface gains `event_slug: string`.
  - `buildUpsertPayload` resolves the slug as `(seed.slug && seed.slug.trim()) || slugifyEventName(seed.event_name)` — seed file is canonical, derive only when missing.
  - **Update path is slug-preserving:** the cron's UPDATE strips `event_slug` from the payload before applying it, so a re-run never overwrites an existing slug. A separate, narrow `UPDATE event_campaigns SET event_slug = ... WHERE id = ... AND event_slug IS NULL` follows the main update — this back-fills rows that predate migration 025's backfill (or any row whose slug was somehow cleared) without ever clobbering a non-null value. Soft-fails on the backfill (logs to console) so a transient failure doesn't break the cron.
  - Insert path always carries `event_slug` in the payload.
- `src/lib/campaign-tracking-url.ts`
  - `buildCampaignUtmCampaign` accepts optional `eventSlug`. When present and non-empty, used directly. When null/empty, falls back to `slugifyEventName(eventName)`.
  - `BuildTrackingUrlOptions` gains optional `eventSlug`. `buildCampaignTrackingUrl` threads it down to `buildCampaignUtmCampaign`.
  - Both paths produce byte-identical strings via the same regex, so legacy callers (without `eventSlug`) keep working unchanged.
- `src/app/api/admin/campaigns/assets/[assetId]/push-to-calendar/route.ts`
  - `CampaignCtaRow` gains `event_slug: string | null`.
  - The campaign SELECT list adds `event_slug`.
  - The `buildCampaignTrackingUrl` call passes `eventSlug: campaign.event_slug`.

### Event slug generation rules (single source of truth)

| Path | Rule |
|---|---|
| Cron INSERT | `seed.slug` (from `event-seeds.json`) when present and non-empty, else `slugifyEventName(seed.event_name)`. |
| Cron UPDATE | `event_slug` is **never overwritten**. If the row's current `event_slug` is NULL, a separate narrow UPDATE backfills it using the same rule. |
| Migration 025 backfill | `regexp_replace(regexp_replace(lower(event_name), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')` — matches `slugifyEventName` exactly. Runs only against `event_slug IS NULL` rows. |
| `slugifyEventName(name)` | `lower(name) → replace [^a-z0-9]+ with '-' → trim leading/trailing dashes`. |

### Tracking URL behavior after patch

- New pushes: `buildCampaignTrackingUrl` reads `campaign.event_slug` from the DB and uses it directly. `utm_campaign` becomes `<persisted_slug>_<year>[_<wave>]`.
- Push of a row whose campaign has NULL `event_slug` (e.g. campaign predates the backfill or the campaign is freshly seeded by an unmigrated path): the helper falls back to `slugifyEventName(event_name)`, identical to the previous Phase 14H.1 behavior. **No regression.**
- Existing `content_calendar.tracking_url` rows are not touched by this phase. They remain bit-for-bit identical to what was already stored — re-pushing a campaign asset doesn't rebuild URLs idempotently (Phase 14F's `already_pushed` short-circuit returns the existing row unchanged).

### Attribution view behavior after patch

- For campaigns where `event_slug` is non-null (after 025's backfill, every existing row qualifies), the view's regex anchor uses the persisted column. A future rename of `event_name` no longer breaks attribution.
- For campaigns where `event_slug` is null (none today, but possible if a future code path inserts without populating it), the view falls through to the same `event_name`-derived regex used in migration 023. **No regression vs. Phase 14H.**
- Column shape unchanged — no consumer of the view (helper, route, dashboard) needs a code change to read it.

### Backfill behavior

- **Migration 025** backfills every existing row where `event_slug IS NULL AND event_name IS NOT NULL`. With prod's current 6 campaigns (Art Basel, FIFA, Super Bowl, Paris Fashion Week, F1 Miami, NBA All-Star), all 6 will be backfilled in one statement.
- **Cron continues to backfill** rows that somehow end up with NULL `event_slug` post-migration (operator deletion, manual SQL, future path that inserts without slug). The narrow `.is('event_slug', null)` update is idempotent — it does nothing on rows that already have a slug.
- **Cron never overwrites** an existing slug. An operator who manually customizes `event_slug` after insert is safe.
- **Migration 026 is fully backwards compatible** with rows that aren't yet backfilled: the COALESCE fallback uses the same regex as the previous view. The combined effect is "monotonically improve attribution accuracy without breaking any existing match."

### Tests run this session

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 15.2s`. Route registry unchanged; no new endpoints in this phase.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **Migrations 025 & 026 must both be applied to Supabase prod before Phase 14H.2 deploy.** Without 025, the route's `SELECT event_slug` and the helper's `eventSlug` reads return undefined — falls back to derivation, equivalent to current behavior, no break. Without 026, the view still works but uses the legacy regex — also no break, just slug-drift risk. Net: **migrations make 14H.2 useful but the deploy is non-breaking even if migrations are skipped.** The order doesn't matter for safety; apply both before relying on persisted slug.
- **Conditional unique index in 025 may silently skip.** If any of the 6 prod rows happen to share `(slug, year, city)` (extremely unlikely with current seed data), the unique index never gets created. The `RAISE NOTICE` will surface in Supabase logs. Doesn't break the migration; just means slug uniqueness isn't enforced at the DB layer until duplicates are resolved manually. Phase 14H.2 doesn't require uniqueness for correctness — the cron's `findExisting` lookup uses event_name + year + city, not slug.
- **Slug-derivation drift between SQL and JS.** Both the view and the migration backfill use `regexp_replace(regexp_replace(lower(...), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')`. The JS helper does the same in two `.replace(...)` calls. Tested invariants: `lower → non-alnum→single-dash → trim leading/trailing dashes`. If a non-printable Unicode char ever sneaks into `event_name`, SQL's POSIX regex and JS's regex may differ on whether to treat it as alphanumeric (locale-dependent in some Postgres builds). Acceptable — current event_names are ASCII.
- **Cron UPDATE soft-fails on backfill.** The narrow `.is('event_slug', null)` update is wrapped to log-and-continue rather than throw. If the call fails (e.g. transient connection), the row keeps NULL slug and the next cron tick retries. Worst case: lead attribution falls back to the legacy regex for one cycle. Acceptable.

### Leo to do (per Mandatory End-of-Phase Save Protocol)

- [ ] Commit + push.
- [ ] **Apply migration 025 to Supabase prod.** Verification:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'event_campaigns' AND column_name = 'event_slug';
  -- Expect: 1 row.

  SELECT count(*) FILTER (WHERE event_slug IS NOT NULL) AS slugged,
         count(*) FILTER (WHERE event_slug IS NULL)     AS still_null,
         count(*) AS total
  FROM event_campaigns;
  -- Expect: slugged = total, still_null = 0 (after backfill).
  ```
- [ ] **Apply migration 026 to Supabase prod.** Verification:
  ```sql
  SELECT viewname FROM pg_views WHERE viewname = 'event_campaign_attribution_summary';
  -- Expect: 1 row (already existed; CREATE OR REPLACE VIEW just rewrote it).

  -- Confirm the view's WITH-CTE references event_slug:
  SELECT pg_get_viewdef('event_campaign_attribution_summary', true) AS definition
  WHERE position('event_slug' IN pg_get_viewdef('event_campaign_attribution_summary', true)) > 0;
  -- Expect: 1 row showing the new definition with event_slug in the COALESCE.
  ```
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] **Smoke test (post-deploy):**
  - [ ] Open `/dashboard/campaigns` → Art Basel → verify Performance panel still renders (view shape unchanged).
  - [ ] Force-regenerate one approved `social_post` asset → re-Approve → re-Push to Calendar → confirm the new `tracking_url` matches `…&utm_campaign=art-basel-miami-beach_2026_W<n>&utm_content=social_post_<8 hex>` (slug now sourced from the persisted column).
  - [ ] As a synthetic test for slug drift survival: in Supabase SQL Editor, temporarily edit `UPDATE event_campaigns SET event_name = 'Art Basel Test Rename' WHERE campaign_name LIKE 'Art Basel%';` → push another asset → confirm the new tracking URL still uses `art-basel-miami-beach` (NOT `art-basel-test-rename`). Then `UPDATE event_campaigns SET event_name = 'Art Basel Miami Beach' WHERE …;` to restore.
  - [ ] Verify no errors in browser console / Vercel logs.

### Recommended next phase

**Phase 14I — Click Attribution via track-event** is the natural next session. The persisted `event_slug` from 14H.2 means click attribution can lock to a stable column, not a derived one. Scope: extend `/api/webhooks/track-event` to extract `utm_*` from request `metadata` and store on `contact_events`, then update `event_campaign_attribution_summary` to surface a real `click_count` column (replacing the always-zero deferred slot). Closes the funnel loop the Performance panel currently signals as "deferred."

---

## Phase 14H Production Smoke Test (PASSED 2026-05-03)

End-to-end verification on prod after migration 023 was applied + Phase 14H was deployed:
- ✅ `/dashboard/campaigns` → Art Basel renders the new Performance panel between the Score panel and the Asset Bundle.
- ✅ Performance score visible (composite 0-100 driven by intrinsic event-fit + production / distribution ratios; revenue contribution still 0 today).
- ✅ Approved-asset count and calendar-row count populated from real prod data.
- ✅ Click count = 0 (labelled "deferred"), Lead count = 0, Conversion count = 0 — matches expected state until tracking URLs are materialized in published posts.
- ✅ Click→Lead and Lead→Member rates show "—" with leads = 0 (correct null-state rendering).
- ✅ Per-platform breakdown line appears when a campaign has assets across multiple platforms.
- ✅ Footer note about deferred click attribution + best-effort lead matching renders correctly.
- ✅ No regressions on approve / reject / generate / push-to-calendar flows.
- ✅ `event_campaign_attribution_summary` view confirmed via `SELECT viewname FROM pg_views WHERE viewname = 'event_campaign_attribution_summary';`.
- ✅ No auto-posting occurred.

**Phase 14H.1 is now safe to start.** The Performance panel exposes that lead/conversion metrics will stay at 0 until the placeholder tracking URLs (`?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event_slug}_{year}_{wave}`) are resolved into real URLs and emitted into published posts. Phase 14H.1 closes that loop.

---

## Phase 14H.1 — Tracking URL Materialization (in working tree, 2026-05-03 — typecheck + build pass; awaiting commit + migration 024 apply + deploy)

Resolves the placeholder tracking template (`?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event_slug}_{year}_{wave}`) into concrete URLs at push-to-calendar time. **Read-mostly and additive.** No posting, no AI generation, no media generation, no caption text mutation.

### Created

- `supabase/migrations/024_add_tracking_url_to_content_calendar.sql` — adds `content_calendar.tracking_url TEXT NULL` + a partial lookup index (`WHERE tracking_url IS NOT NULL`). Idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Existing rows unaffected (column nullable, NULL by default; legacy organic rows keep NULL). `campaign_assets.tracking_url` already exists from migration 018 line 51 — not recreated.
- `src/lib/campaign-tracking-url.ts` — pure helper module. Exports:
  - `DEFAULT_BASE_URL` constant (`https://myvortex365.com/leosp`).
  - `CAMPAIGN_UTM_MEDIUM` constant (`event_campaign`).
  - `slugifyEventName(name)` — `lower → non-alnum→dash → trim leading/trailing dashes`. Mirrors the regex in `event_campaign_attribution_summary` so the view's UTM substring match keeps working against URLs the helper produces.
  - `buildCampaignUtmCampaign({ eventName, eventYear, wave })` — builds `<slug>_<year>[_<wave>]`. Returns `''` when slug or year is missing so callers can drop the UTM rather than emit a broken value.
  - `buildCampaignTrackingUrl({ baseUrl, platform, eventName, eventYear, wave, assetType, assetId })` — uses `URL` API to preserve existing query params on `baseUrl`, then sets `utm_source` (lowercased platform), `utm_medium=event_campaign`, `utm_campaign` (when resolvable), and `utm_content` (`<asset_type>_<first 8 chars of asset id without dashes>`). Falls back to `DEFAULT_BASE_URL` when `baseUrl` is null or malformed. No env reads, no DB calls.

### Edited

- `src/app/api/admin/campaigns/assets/[assetId]/push-to-calendar/route.ts`
  - `AssetRow` and `CalendarRow` interfaces gained `tracking_url`. `AssetRow` also gained `wave`.
  - SELECT lists hoisted into `ASSET_SELECT` and `CALENDAR_SELECT` constants so all four DB reads (asset lookup, idempotency #1, idempotency #2, race-recovery requery) stay in lockstep.
  - New step 7b: load parent campaign (`event_name`, `event_year`, `cta_url`) via `event_campaigns.id = asset.campaign_id`. 500 on lookup error, 404 when the parent is missing.
  - Resolved `trackingUrl` computed via `buildCampaignTrackingUrl` and added to `calendarPayload`. Inserted on every new push.
  - Step 10 forward-link update now also back-fills `campaign_assets.tracking_url` when it is currently NULL — operator-set values are preserved.
  - Every JSON response (new push, partial-success, both idempotency-cached returns) surfaces `tracking_url` at the top level so the dashboard captures it without re-querying.
  - Top-of-file doc updated with a Phase 14H.1 addendum block.
- `src/app/dashboard/campaigns/page.tsx`
  - `AssetRow` gained optional `tracking_url`.
  - New `pushedAssetTrackingUrls: Map<string, string>` session state populated from successful push responses (same forward-compat pattern as `pushedAssetIds` from Phase 14F — when the campaign-detail API later returns `tracking_url`, the dashboard reads `asset.tracking_url` directly without further changes).
  - `CampaignDetailPanel`, `AssetGroup`, and `AssetCard` props extended with `pushedAssetTrackingUrls` / `trackingUrl`.
  - `AssetCard` action row renders a small green `🔗 Tracking URL ready · copy` button when a tracking URL is known. Clicking copies via `navigator.clipboard.writeText`. Hover tooltip shows the full URL. Hidden when no URL is known yet.

### Push-to-calendar behavior changes

- **New push:** content_calendar.tracking_url is populated; campaign_assets.tracking_url back-filled when NULL; response includes `tracking_url`.
- **Already pushed (forward link or back link):** response includes the existing `tracking_url` from the calendar row. May be NULL for rows that predate Phase 14H.1 — that is expected and signals the row should be re-pushed once schema is in place.
- **Partial success:** response includes `tracking_url` from the inserted row even when the forward-link update failed.
- **Approved body text:** **never modified.** Tracking URL lives in a separate column.
- **Posted / scheduled / approved / rejected calendar rows:** never modified by this code path. Push only INSERTs and UPDATEs `campaign_assets.content_calendar_id` + `campaign_assets.tracking_url`.

### Attribution view (migration 023)

**Not changed.** Migration 025 was **not** created. The existing view's UTM substring match against `contacts.custom_fields ->> 'utm_campaign'` already works against the URLs this phase produces (the helper's `slugifyEventName` matches the view's `regexp_replace(lower(event_name), '[^a-z0-9]+', '-', 'g')` exactly). Once a contact arrives with a URL containing `?utm_campaign=art-basel-miami-beach_2026_W1`, the view starts attributing leads — no view migration needed.

The only reason to introduce migration 025 would be to read directly from `content_calendar.tracking_url` instead of `contacts.custom_fields`. That would gain nothing (we still need the contact's UTM to know which contact attributed to which campaign) and would couple the view to dashboard-pushed rows only (excluding any non-pushed direct traffic). Skipped on purpose.

### Tests run this session

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS; `Compiled successfully in 25.2s`. Push-to-calendar route still registered.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **Migration 024 must be applied to Supabase prod before the new push behavior works end-to-end.** Until applied, the route's INSERT fails with `column "tracking_url" does not exist` and returns 500. The asset stays approved, no calendar row is created, the dashboard surfaces the error toast. Once the migration is applied, retries succeed cleanly.
- **The dashboard "Tracking URL ready · copy" button only appears for assets pushed in the current browser session OR after the campaign-detail API later starts returning `tracking_url`.** Pre-existing pushed assets (from before this phase) won't show the badge until either the asset is re-pushed (which is idempotent and surfaces the URL via the route's response) or a future API change includes the column. Same forward-compat pattern as Phase 14F's `pushedAssetIds`.
- **`navigator.clipboard.writeText` is fire-and-forget with a `.catch(() => {})` swallow.** The user gets no feedback on permission-denied. Acceptable for an internal admin surface; if it becomes an issue, swap for a toast.
- **`buildCampaignTrackingUrl` falls back to `DEFAULT_BASE_URL` when the campaign's `cta_url` is malformed** (e.g. operator edited it to a string with spaces). This is defensive but silent — a malformed cta_url is a content bug worth surfacing eventually. Acceptable for now since cta_url is operator-set and rare.
- **`campaign_assets.tracking_url` back-fill only fires on first push.** A re-push (idempotent path) does not re-fill the asset column. If an operator manually clears `campaign_assets.tracking_url` after a push, a re-push won't restore it. Acceptable: that's an edge case the operator caused.
- **Migration 024 is independent of migration 025** (which was not created). If a future phase needs to materialize migration 025, the view rewrite goes there.

### Leo to do

- [ ] Commit + push.
- [ ] **Apply migration 024 to Supabase prod.** Verification SQL:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'content_calendar' AND column_name = 'tracking_url';
  ```
  Should return one row.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test: open Art Basel on `/dashboard/campaigns` → approve a `social_post` asset → click `📅 Push to Calendar` → confirm a new green `🔗 Tracking URL ready · copy` button appears next to the `✓ Added to Calendar` badge → click the button → confirm the URL is on the clipboard and that `utm_content` ends in eight hex characters (e.g. `utm_content=social_post_7ca6bc3f`).

---

## Phase 14H.1 patch — `utm_content` placeholder defense (in working tree, 2026-05-03 — typecheck + build pass)

Smoke test of Phase 14H.1 surfaced a copied tracking URL whose `utm_content` did not contain a real 8-char short asset ID. Investigation:

- `grep` across `src/` returned **0 matches** for any literal placeholder string (`<shortid>`, `{assetId>`, `<asset_id>`, `{asset_id}`, `<8 chars>`).
- The push-to-calendar route correctly passes `asset.id` (a real Supabase UUID) into `buildCampaignTrackingUrl`.
- The dashboard copy button correctly reads `tracking_url` from the API response (no client-side URL building).

Therefore the bug class is **failure-mode permissiveness**, not a literal placeholder leak: when `assetId` is missing or malformed, the prior helper code silently emitted `utm_content=<asset_type>` (with no id suffix), leaving a half-formed param in the URL. The new code omits `utm_content` entirely in that case, per the Phase 14H.1 patch spec.

### Edited

- `src/lib/campaign-tracking-url.ts`
  - `shortAssetId` rewritten to be **placeholder-rejecting**: strips ALL non-alphanumerics (not just dashes), requires the resulting first-8-char slice to fully match `^[a-z0-9]{8}$`, and returns `''` otherwise. A real Supabase UUID like `7ca6bc3f-5cb2-4bdf-9883-1470a31c8a8f` produces `7ca6bc3f`. A literal `<shortid>` collapses to `shortid` (7 chars), fails the length gate, and returns `''`. Same for `{assetId}`, `{asset_id}`, `<asset_id>`, `<8 chars>`, and any other ad-hoc placeholder shape.
  - `buildCampaignTrackingUrl` now requires BOTH a clean `assetType` AND a real `idShort` before emitting `utm_content`. When either is missing, the URL contains `utm_source` / `utm_medium` / `utm_campaign` only — no half-formed `utm_content=social_post`. Comment in the source spells out the policy explicitly.
  - Doc-comment failure-mode bullet added so the contract is visible at the call site.

### Verified — no change needed

- Route (`src/app/api/admin/campaigns/assets/[assetId]/push-to-calendar/route.ts`) — already passes `asset.id` (real UUID from `campaign_assets`).
- Dashboard (`src/app/dashboard/campaigns/page.tsx`) — already reads `json.tracking_url` from the API response and copies it verbatim.

### One-time SQL repair (DO NOT auto-run — Leo to approve)

```sql
-- Step 1: identify any content_calendar rows whose tracking_url contains a literal
-- placeholder pattern (review before running step 2).
SELECT cc.id, cc.platform, cc.tracking_url,
       ca.id AS asset_id, ca.asset_type, ca.wave,
       ec.event_name, ec.event_year, ec.cta_url
FROM content_calendar cc
JOIN campaign_assets ca ON ca.id = cc.campaign_asset_id
JOIN event_campaigns ec ON ec.id = ca.campaign_id
WHERE cc.tracking_url IS NOT NULL
  AND (
    cc.tracking_url LIKE '%<shortid>%' OR
    cc.tracking_url LIKE '%<asset_id>%' OR
    cc.tracking_url LIKE '%{assetId}%' OR
    cc.tracking_url LIKE '%{asset_id}%' OR
    cc.tracking_url LIKE '%<8 chars>%' OR
    cc.tracking_url LIKE '%%3Cshortid%' OR
    cc.tracking_url LIKE '%%7Bshortid%' OR
    cc.tracking_url LIKE '%utm_content=' OR    -- bare equals (empty value)
    cc.tracking_url ~* 'utm_content=[a-z_]+($|&)'  -- type-only, no _<8 chars>
  );

-- Step 2: rebuild tracking_url for affected rows from the linked campaign_asset_id.
-- Mirrors the JS helper byte-for-byte:
--   slug = lower(event_name) → non-alnum→dash → trim leading/trailing dashes
--   utm_campaign = slug + '_' + year (+ '_' + wave when present)
--   utm_content = asset_type + '_' + first 8 alnum chars of asset.id (lowercased)
--   base = trim(cta_url) || fallback 'https://myvortex365.com/leosp'
--   delimiter = '&' if base already has '?', else '?'
UPDATE content_calendar cc
SET tracking_url =
  COALESCE(NULLIF(trim(ec.cta_url), ''), 'https://myvortex365.com/leosp')
  || (CASE WHEN COALESCE(NULLIF(trim(ec.cta_url), ''), 'https://myvortex365.com/leosp') LIKE '%?%' THEN '&' ELSE '?' END)
  || 'utm_source=' || lower(cc.platform)
  || '&utm_medium=event_campaign'
  || '&utm_campaign=' ||
       regexp_replace(
         regexp_replace(lower(ec.event_name), '[^a-z0-9]+', '-', 'g'),
         '^-+|-+$', '', 'g'
       )
       || '_' || ec.event_year::text
       || COALESCE('_' || ca.wave, '')
  || '&utm_content=' || ca.asset_type || '_' ||
       lower(substring(regexp_replace(ca.id::text, '[^a-z0-9]', '', 'gi') from 1 for 8))
FROM campaign_assets ca, event_campaigns ec
WHERE cc.campaign_asset_id = ca.id
  AND ca.campaign_id = ec.id
  AND cc.tracking_url IS NOT NULL
  AND (
    cc.tracking_url LIKE '%<shortid>%' OR
    cc.tracking_url LIKE '%<asset_id>%' OR
    cc.tracking_url LIKE '%{assetId}%' OR
    cc.tracking_url LIKE '%{asset_id}%' OR
    cc.tracking_url LIKE '%<8 chars>%' OR
    cc.tracking_url LIKE '%%3Cshortid%' OR
    cc.tracking_url LIKE '%%7Bshortid%' OR
    cc.tracking_url LIKE '%utm_content=' OR
    cc.tracking_url ~* 'utm_content=[a-z_]+($|&)'
  );
```

The repair query rebuilds inline from DB columns — no role-elevation, no app-server round-trip, no row deletion, no insert. Run Step 1 first to confirm the affected count, then Step 2 to repair.

### Tests run

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS — `Compiled successfully in 7.8s`
- `npm run lint` — not run; Phase 13 ESLint v8/v9 mismatch unrelated.

### Migration / deploy / smoke test

- **No new migration.** `content_calendar.tracking_url` (migration 024) is unchanged.
- **Deploy required.** Helper change is in `src/lib/`; without redeploy, prod still emits the half-formed URL.
- **Smoke test (post-deploy):** push a fresh asset, confirm `utm_content=<asset_type>_<8 hex chars>`, then push an asset with a deliberately corrupted state (won't happen organically) and confirm the URL has no `utm_content` param at all.

---

## Phase 14F + 14G Production Smoke Test (PASSED 2026-05-02)

End-to-end verification on prod after migration 022 was applied + Phases 14F and 14G were deployed:
- ✅ Migration 022 applied: `content_calendar.campaign_asset_id` column + `idx_content_calendar_campaign_asset_unique` partial unique index both confirmed.
- ✅ Approved Art Basel `social_post` assets push to `content_calendar` as drafts; pushed Art Basel drafts now appear on `/dashboard/content` and remain `status='draft'` (no auto-post).
- ✅ Idempotency verified: a second click on Push to Calendar returns `already_pushed=true` against the same `content_calendar.id` — no duplicate row.
- ✅ "✓ Added to Calendar" badge replaces the Push button after first click.
- ✅ Non-social asset types (`email_subject`, `email_body`, `dm_reply`, `landing_headline`, `lead_magnet`, `hashtag_set`) display the muted "Calendar push not yet supported for {type}" hint instead of the Push button.
- ✅ Phase 14G platform guidance line renders correctly per platform on every approved `social_post` row in the dashboard (Instagram square / Facebook link card / X 1600×900 / TikTok 1080×1920).
- ✅ No auto-posting occurred.

**Phase 14H is now safe to start.** No prerequisites pending. Phase 14H is purely additive (a SQL view + a server helper + a new admin GET route + a render-only dashboard panel). It does NOT modify posting routes, schema beyond the view, generation logic, or any existing behavior.

---

## Phase 14F Production Smoke Test (PASSED 2026-05-02)

End-to-end verification on prod after migration 022 was applied + Phase 14F was deployed:
- ✅ Migration 022 applied: `content_calendar.campaign_asset_id` column exists; `idx_content_calendar_campaign_asset_unique` partial unique index exists.
- ✅ Art Basel Miami Beach 2026 — approved a `social_post` asset → clicked `📅 Push to Calendar` → received `200 ok=true already_pushed=false` → a new `content_calendar` row appeared with `status='draft'`, the asset's caption, hashtags, and platform.
- ✅ Idempotency confirmed: clicking Push again returned `already_pushed=true` and pointed at the same `content_calendar.id`. No duplicate row.
- ✅ "✓ Added to Calendar" badge replaced the Push button after first click. Badge persists for the session.
- ✅ Approved non-social assets (`email_subject`, `email_body`, `dm_reply`, `landing_headline`, `lead_magnet`, `hashtag_set`) display the muted "Calendar push not yet supported for {type}" hint instead of the Push button. The route returns the documented 400 if invoked directly.
- ✅ No auto-posting occurred. The new calendar row remains `status='draft'` and is visible on `/dashboard/content` for manual review.
- ✅ No regressions on approve / reject / generate flows.

**Phase 14G is now safe to start.** No prerequisites pending. Phase 14G is purely additive (a new lib module + a one-line dashboard hint) and does not change posting routes, schema, or any existing behavior.

---

## Phase 14E Production Smoke Test (PASSED 2026-05-02)

End-to-end verification on prod after the 14E timeout patch + 14E.1 media-clarity patch were deployed:
- ✅ `/dashboard/campaigns` loads and displays event campaigns from the live Supabase tables
- ✅ Phase 14C cron-driven research seeded 6 event campaigns (FIFA World Cup 2026 / F1 Miami GP / Super Bowl Weekend / Paris Fashion Week / Art Basel Miami / NBA All-Star Weekend) with `campaign_scores` rows
- ✅ Selected **Art Basel Miami Beach 2026** (`7ca6bc3f-5cb2-4bdf-9883-1470a31c8a8f`) and clicked Generate Asset Bundle
- ✅ 4-batch sequential flow ran cleanly under Vercel Hobby's 10s ceiling: Llama 3.3 70B with `skip_verifier: true`
- ✅ **33 draft `campaign_assets` rows inserted** across all 10 asset types, asset-type-aware dedup confirmed working
- ✅ All 10 asset-group sections render with correct labels (Social Posts / Short-Form Video Scripts / Email Subjects / Email Bodies / DM Replies / Hashtag Sets / Image Prompts / Video Prompts / Landing Headlines / Lead Magnets)
- ✅ Image Prompts and Video Prompts sections show italic helper text and per-row "🖼️ No image generated yet" / "🎬 No video generated yet" placeholders
- ✅ Approve / Reject actions confirmed working with correct state transitions and optimistic-concurrency guard

**Phase 14F is now safe to start** — all three prerequisites from `SYSTEM_AUDIT_PHASE_14_STATUS.md` §9 are green:
1. ✅ Migrations 017-021 applied to Supabase prod
2. ✅ Phase 14E (+ patches) deployed to Vercel
3. ✅ Approval surface exercised end-to-end against the migrated DB

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

---

## Phase 14D — Campaign Generator API (DONE 2026-05-02)

Code only. Nothing deployed. Admin-only API route + a server-only generator library that loads an `event_campaigns` row, asks the OpenRouter medium-tier model for the full bundle defined in `VORTEX_EVENT_CAMPAIGN_SKILL.md` §5/§6, parses the JSON response, optionally calls the existing Claude verifier, and inserts every asset into `campaign_assets` as a draft requiring human approval. Never touches `content_calendar`. Never auto-publishes. Never overwrites `posted` / `scheduled` / `approved` rows.

**Created:**
- `src/lib/event-campaign-asset-generator.ts` — server-only library. Exposes `generateCampaignAssets({ event_campaign_id, model_override?, asset_types?, force_regenerate?, createdBy })` and the `ALL_ASSET_TYPES` / `ALL_WAVES` constants. Internally:
  - Loads the campaign row and 404s safely if absent.
  - Inspects existing `campaign_assets`. If ≥1 non-archived/non-rejected row exists and `force_regenerate` is not set, returns `{ already_exists: true, existing_count }` without calling the model.
  - When `force_regenerate=true`, archives only `status='draft'` rows (belt-and-braces filter — never touches `posted`, `scheduled`, `approved`, `idea`).
  - Builds the system + user prompt with all six skill sections inlined (formula, output spec, cruise add-on, compliance, platform voice, wave guidance).
  - Calls `runAIJob` with `jobType: 'social-pack'` so the existing AI router routes through `AI_MEDIUM_MODEL`, applies budget guards (`AI_DAILY_BUDGET_LIMIT` / `AI_MONTHLY_BUDGET_LIMIT`), retries on transient errors, and writes to `ai_jobs` + `ai_model_usage`. `model_override` is forwarded as the per-job override.
  - Parses the model output through a robust JSON extractor that strips markdown fences and handles type-coerced field names (`body|caption`, `body|script`, `body|prompt`, `landing_headline|landing_page_headline`, etc.).
  - Maps the bundle to one row per asset (10 asset types, max 33 rows + 1 hashtag-set row) and inserts everything in a single batch.
  - Computes `scheduled_for` per wave: W1 −180d, W2 −120d, W3 −90d, W4 −60d, W5 −30d, W6 −14d, W7 −7d, W8 +7d from `event_campaigns.event_start_date`. Past dates are blanked so a human can reschedule.
  - Detects banned vocabulary (`mlm`, `downline`, `network marketing`, `Travel Team Perks`, `guaranteed savings/income/earnings`) per case and tags the row's `verification_metadata.compliance_flag` so reviewers can spot them in the dashboard. Assets still insert as drafts — humans decide.
  - Calls `verifyAIOutput({ jobId, output: <concatenated text bundle>, jobType: 'social-pack' })` when `ANTHROPIC_API_KEY` is present. Failures or missing key set `verification.skipped=true` with a reason; never blocks the insert path.
- `src/app/api/admin/campaigns/generate-assets/route.ts` — POST endpoint guarded by `requireAdminUser()`. Zod-validates the body (`event_campaign_id` UUID required, optional `model_override`, optional `asset_types[]` from the canonical 10, optional `force_regenerate`). Returns 400 on invalid input, 404 when campaign not found, 502 on generation failure, 500 on unexpected throw, 200 with the full result on success or already-exists. `export const maxDuration = 60` so a Pro-plan deploy gets the full window; Hobby will still cap at 10s as documented.

**Edited:**
- `PROJECT_STATE_CURRENT.md` — this Phase 14D entry.
- `BUILD_PROGRESS.md` — Phase 14D checklist + sub-tasks.

**API contract:**
```
POST /api/admin/campaigns/generate-assets
Auth: admin only (Supabase session cookie + admin_users row)
Body:
{
  "event_campaign_id": "uuid",            // required
  "model_override":   "anthropic/claude-haiku-4.5",  // optional
  "asset_types":      ["social_post","email_body"],  // optional; default = all 10
  "force_regenerate": false                // optional; default false
}
Returns 200:
{
  "ok": true,
  "campaign_id": "uuid",
  "campaign_name": "Trinidad Carnival 2027",
  "generation_job_id": "uuid",             // ai_jobs row id
  "asset_count": 33,
  "asset_breakdown": { "social_post": 10, "short_form_script": 3, ... },
  "schedule": [{ "asset_id":"uuid","asset_type":"social_post","wave":"W2","platform":"instagram","scheduled_for":"2026-..." }, ...],
  "archived_count": 0,                     // > 0 only when force_regenerate=true
  "verification": { "status":"approved","score":92,"skipped":false },
  "warnings": [ ... ]                      // banned-term hits, parse warnings
}
```

**Tables written to (after migrations 017-021 are applied):**
- `ai_jobs` — one row per call (status, cost, tokens, model). Author = the admin user.
- `ai_model_usage` — token / cost telemetry tied to the `ai_jobs.id`.
- `ai_verification_logs` — populated only when the verifier runs (Anthropic key present + verifier didn't throw).
- `campaign_assets` — up to 33 rows per call. Always `status='draft'`, `requires_human_approval=true`, `generation_job_id` linking back to `ai_jobs`.
- `campaign_assets` (update) — only on `force_regenerate=true`: existing `status='draft'` rows for the same campaign are flipped to `status='archived'` before the new insert. Other statuses are never touched.

**Intentionally NOT done in Phase 14D:**
- No dashboard UI (Phase 14E).
- No auto-push into `content_calendar` (Phase 14F).
- No DB schema changes — all five Phase 14B migrations still apply unmodified.
- No new cron job. The route is invoked manually from the dashboard or via curl.
- No deployment from this session.

**Risks:**
- The route depends on Phase 14B migrations 017-021 being applied to Supabase prod. Until applied, the first POST will return a 502 with a "relation campaign_assets does not exist" error. Per Phase 14C notes, Leo is the one to apply the migrations.
- One LLM call must produce the full ~33-asset JSON bundle. On Vercel Hobby's 10s function ceiling, slow models can timeout; `AI_MEDIUM_MODEL` (default Llama 3.3 70B) usually fits. If the model returns truncated/invalid JSON, the route returns a 502 with `unparseable model output` and inserts nothing — the raw text is preserved on the `ai_jobs` row for debugging.
- The verifier runs on a concatenated text dump of the bundle, not on each asset individually. It catches brand-voice + banned-term issues across the bundle but can't pinpoint which asset is offending. `verification_metadata.compliance_flag` on individual rows backstops this for explicit banned terms.
- Banned-term detection is substring-based and case-insensitive. False positives are possible (e.g. "downline" inside an unrelated word). The flag is advisory — humans approve or reject the asset.
- Response payload can exceed 100 KB on a full 33-asset run. Acceptable for an admin tool; the dashboard in Phase 14E will paginate.

### Phase 14D — exit criteria

- [x] `src/lib/event-campaign-asset-generator.ts` created — loads campaign, generates bundle, parses JSON, archives drafts on regenerate, inserts assets, calls verifier when safe.
- [x] `src/app/api/admin/campaigns/generate-assets/route.ts` created — admin-gated POST with Zod validation, 400/404/200/502/500 status mapping, `maxDuration=60`.
- [x] Reuses existing `requireAdminUser`, `runAIJob`, `verifyAIOutput`, `createAdminClient` — no new auth, no new AI router, no new budget logic.
- [x] Never auto-publishes; every asset inserted as `status='draft'` with `requires_human_approval=true`.
- [x] Never writes to `content_calendar`. Never overwrites posted/scheduled/approved rows.
- [x] Duplicate-prevention logic: returns `already_exists=true` when assets exist and `force_regenerate` is not set; archives only `status='draft'` rows when forced.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` compiles cleanly; new route registered as `ƒ /api/admin/campaigns/generate-assets`.
- [ ] `npm run lint` — not run; pre-existing ESLint v8/v9 flat-config breakage from the unfinished Phase 13 lint follow-up. Not a Phase 14D regression. Leo to complete the Phase 13 lint validation step before lint becomes meaningful.
- [x] `PROJECT_STATE_CURRENT.md` + `BUILD_PROGRESS.md` updated.
- [ ] Working tree committed and pushed (Leo to run the git commands at the end of this session).
- [ ] **Leo to do:** apply Phase 14B migrations 017-021 to Supabase prod before exercising the route end-to-end.

### Next recommended phase

**Phase 14E — Dashboard Campaign Planner** — DONE 2026-05-02 (see entry below).

---

## Phase 14E — Dashboard Campaign Planner (DONE 2026-05-02)

Code only. Nothing deployed. Adds an admin-only dashboard surface for the event-campaign system: list `event_campaigns`, drill into a campaign, view its score breakdown and asset bundle, generate the bundle (calling the Phase 14D route), and approve/reject `campaign_assets` drafts. Strictly a human-approval surface — does not push to `content_calendar`, does not auto-post, does not modify schema.

**Created:**
- `src/app/dashboard/campaigns/page.tsx` — single client component. Filters (status / category / min score / search), left-rail campaign list with status / score / urgency-wave / asset-count chips, right-rail detail panel covering identity, dates, audience, all six campaign angles, latest score breakdown (10 dimensions), CTA, tracking URL. Asset section grouped by `asset_type` in the canonical 10-type order; each card shows platform, wave, status, scheduled_for, hashtags, banned-term compliance flag from `verification_metadata`, and (when present) rejection reason. Generate button posts to `/api/admin/campaigns/generate-assets`; force-regenerate button shown only when assets already exist, gated by a confirm dialog explaining "This archives existing draft assets only. Posted, approved, scheduled, and rejected assets are not overwritten." Uses existing `useToast`/`Toaster` for notifications. No new component library, no new colors — reuses `getStatusColor`, `formatDate`, `formatDateTime` from `src/lib/utils.ts`.
- `src/app/api/admin/campaigns/route.ts` — `GET`. Admin-gated via `requireAdminUser()`. Returns up to 500 campaigns ordered by `event_start_date ASC`. Optional query filters: `status` (validated against the enum), `category` (`.contains(['cat'])` against `categories TEXT[]`), `min_score` (1-100 numeric), `q` (case-insensitive `ilike` across `campaign_name`, `event_name`, `destination_city`, sanitized to strip `,()` and clamped to 200 chars). Returns each campaign enriched with `asset_counts` aggregated from a single `campaign_assets` query (one round-trip per list call, not N+1).
- `src/app/api/admin/campaigns/[id]/route.ts` — `GET`. Admin-gated. Returns the full `event_campaigns` row, all related `campaign_assets` ordered by `created_at DESC`, asset counts aggregated by status, and the latest `campaign_scores` row (with full 10-dimension `breakdown` JSONB). 404 when campaign not found.
- `src/app/api/admin/campaigns/assets/[assetId]/approve/route.ts` — `POST`. Admin-gated. Allowed only when current status is `'draft'` or `'idea'`. Sets `status='approved'`, `approved_at=now()`, `approved_by=current admin user id`. Uses an optimistic-concurrency guard (`.eq('status', asset.status)` on the update) so two clicks racing on the same asset return 409 instead of double-applying. 400 when status is not approvable, 404 when asset missing. Does not push to `content_calendar` and does not auto-post.
- `src/app/api/admin/campaigns/assets/[assetId]/reject/route.ts` — `POST`. Admin-gated. Allowed when current status is `'draft'`, `'idea'`, or `'approved'`. Sets `status='rejected'`. Optional body `{reason: string}` — when provided, merged into `verification_metadata.rejection_reason` (the table has no dedicated rejection-reason column; the JSONB metadata is the only safe place without a schema change). Same optimistic-concurrency guard. 400 when status is not rejectable.

**Edited:**
- `src/components/dashboard/sidebar.tsx` — added `{ href: '/dashboard/campaigns', label: 'Campaigns', icon: '🌍' }` between AI Center and Videos.
- `PROJECT_STATE_CURRENT.md` — this entry.
- `BUILD_PROGRESS.md` — Phase 14E checklist + sub-tasks.

**Status-transition rules (locked in by the routes):**
- `approve` accepts: `draft → approved`, `idea → approved`. Anything else returns 400.
- `reject` accepts: `draft → rejected`, `idea → rejected`, `approved → rejected`. Anything else (`scheduled`, `posted`, `archived`, `rejected`) returns 400.
- Posted assets are never modified by either route. The optimistic guard means a click on stale UI returns 409 instead of clobbering a status change made by another tab.
- Generation of new assets goes through the existing Phase 14D `POST /api/admin/campaigns/generate-assets` route — it already enforces draft-only archiving on `force_regenerate=true`. Phase 14E only adds the UI button + confirm dialog.

**Tests run:**
- `npx tsc --noEmit` — passes clean.
- `npm run build` — compiles successfully. New routes registered as `ƒ /api/admin/campaigns`, `ƒ /api/admin/campaigns/[id]`, `ƒ /api/admin/campaigns/assets/[assetId]/approve`, `ƒ /api/admin/campaigns/assets/[assetId]/reject`. New page registered as `ƒ /dashboard/campaigns`.
- `npm run lint` — fails with the **known** Phase 13 ESLint v8/v9 mismatch (`TypeError: Converting circular structure to JSON` from ESLint 8.57.1 trying to load the v9 flat config). Pre-existing — not a Phase 14E regression. Resolves once Leo runs the Phase 13 follow-up `npm install` + `npm run lint` cycle.

**Tables read from (after migrations 017-021 applied):**
- `event_campaigns` — list + detail.
- `campaign_assets` — counts + detail + approve/reject updates. Updates only touch `status`, `approved_at`, `approved_by`, `verification_metadata`. Never touches `posted_at`, `post_url`, `content_calendar_id`, `scheduled_for`, or any generation fields.
- `campaign_scores` — latest row only, for the score-breakdown panel.
- `admin_users` — via `requireAdminUser()`.

**Intentionally NOT done in Phase 14E:**
- No auto-publish, no auto-post, no `content_calendar` writes — Phase 14F is where approved assets become calendar slots.
- No edit-in-place for asset body / hashtags — the approve/reject loop is the only mutation in this phase. Editing is a future enhancement.
- No bulk approve / bulk reject — single-asset actions only.
- No new component library, no new dependencies.
- No DB schema changes — all five Phase 14B migrations still apply unmodified.
- No deployment.

**Risks:**
- The new routes depend on Phase 14B migrations 017-021 being applied to Supabase prod. Until applied, the dashboard list will return a "relation event_campaigns does not exist" error and render an empty state with a toast. Per Phase 14C/14D notes, Leo is the one to apply the migrations.
- `verification_metadata` is the only column carrying rejection reason. If Phase 14F or later refactors that JSONB, rejection reasons recorded in this phase will need a migration to relocate. Acceptable trade-off vs. introducing a schema change in 14E.
- The list query is capped at 500 rows. If the seed file ever grows past that, add server-side pagination (cursor on `event_start_date`).
- The optimistic-concurrency guard (`.eq('status', prior_status)`) only protects against in-flight races. It does not protect against a posted asset being approved by Phase 14F machinery — by design, the Phase 14E routes won't approve a `posted` asset because `posted` is not in the approvable-from set.
- The dashboard makes one `campaign_assets` count query per list refresh. On the current data scale this is fine; if assets grow past low-thousands, switch to a Postgres view that pre-aggregates counts.

### Phase 14E — exit criteria

- [x] `src/app/dashboard/campaigns/page.tsx` created — admin UI with filters, list, detail, generate button, asset approval/rejection.
- [x] `src/app/api/admin/campaigns/route.ts` created — admin-gated list with status/category/min_score/q filters; returns asset counts per campaign.
- [x] `src/app/api/admin/campaigns/[id]/route.ts` created — admin-gated detail with assets + latest score breakdown.
- [x] `src/app/api/admin/campaigns/assets/[assetId]/approve/route.ts` created — only allowed from `draft` or `idea`.
- [x] `src/app/api/admin/campaigns/assets/[assetId]/reject/route.ts` created — only allowed from `draft`, `idea`, or `approved`. Stores reason in `verification_metadata.rejection_reason` when provided.
- [x] `src/components/dashboard/sidebar.tsx` updated — Campaigns nav entry.
- [x] Reuses existing `requireAdminUser`, `createAdminClient`, `useToast`, `getStatusColor`, `formatDate`, `formatDateTime`.
- [x] No auto-publish; no `content_calendar` writes; posted assets never mutated.
- [x] Force-regenerate confirms with the exact warning copy: "This archives existing draft assets only. Posted, approved, scheduled, and rejected assets are not overwritten."
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` compiles cleanly; all 4 new routes + new page registered.
- [ ] `npm run lint` — known Phase 13 ESLint v8/v9 mismatch; not a 14E regression.
- [x] `PROJECT_STATE_CURRENT.md` + `BUILD_PROGRESS.md` updated.
- [ ] Working tree committed and pushed (Leo to run the git commands at the end of this session).
- [ ] **Leo to do:** apply migrations 017-021 to Supabase prod before exercising the dashboard end-to-end (still pending from Phase 14C/14D).

### Next recommended phase

**Phase 14F — Auto-Push Approved Campaigns into `content_calendar`** (when an admin approves a `campaign_assets` draft, the asset becomes eligible for a `content_calendar` insert so the existing posters pick it up). Requires a small schema add (`content_calendar.campaign_asset_id` nullable FK) per the roadmap. Do not start until Phase 14E is committed/pushed and migrations are applied.

---

## System Audit (2026-05-02) — READ-ONLY

A full read-only system audit was performed at HEAD `b7fc8ad`. No code was modified, nothing was deployed, no DB writes occurred. Full report in [SYSTEM_AUDIT_PHASE_14_STATUS.md](SYSTEM_AUDIT_PHASE_14_STATUS.md).

**Tests run:**
- `npx tsc --noEmit` — ✅ PASS (exit 0)
- `npm run build` — ✅ PASS (exit 0); all 5 new Phase 14E routes/pages registered
- `npm run lint` — ❌ pre-existing Phase 13 ESLint v8/v9 mismatch; not a regression

**Scores:** Revenue readiness 78 / Technical health 80 / Marketing & funnel readiness 80 / Security 85.

**Phase 14F safety verdict: ❌ NOT SAFE to start yet.** Three prerequisites must clear first:
1. Apply migrations 017-021 to Supabase prod (`supabase db push` or paste SQL Editor in order).
2. Deploy `b7fc8ad` to Vercel production (preview → prod cutover).
3. Smoke-test the dashboard campaign planner end-to-end against the migrated DB (list, generate, approve, reject).

Once all three are green, Phase 14F is a low-risk session: one schema migration adding nullable `content_calendar.campaign_asset_id`, one route to insert approved assets into `content_calendar` with `scheduled_for` derived from the wave offset, and the existing posters do the rest.

**Other open follow-ups surfaced by the audit:**
- Phase 13: `.env.local` `ANTHROPIC_API_KEY` has duplicated `sk-ant-` prefix; OpenRouter key stored under non-canonical names (`Management_Key`, `Your_new_API_key`) — code reads `OPENROUTER_API_KEY` only.
- Phase 13 lint: run `npm install` to bring in ESLint v9 then `npm run lint` to validate the flat config.
- Webhook auth helpers fail-open when the secret env var is unset (`checkFormToken`, `checkBlandWebhook`, `verifyTwilioSignature`). Tighten to fail-closed once Vercel env audit confirms all three are populated.
- No Vercel env audit has been run since Phase 11; Phase 13 follow-up `vercel env ls production` still pending.

The audit confirmed: 4-cron Hobby cap respected, no NEXT_PUBLIC env leaks, service-role key server-only, admin routes uniformly gated by `requireAdminUser()`, Surge365 path-based `/leosp` URLs correct in code (still on old `?wa=leosp` in prod until next deploy), Phase 14B-14E code internally consistent and matches the spec in `VORTEX_EVENT_CAMPAIGN_SKILL.md`.

---

## Phase 14E Timeout Patch (in working tree, 2026-05-02 — not yet committed/deployed)

A 504 was observed on `POST /api/admin/campaigns/generate-assets` for Art Basel Miami Beach 2026 (`7ca6bc3f-5cb2-4bdf-9883-1470a31c8a8f`). Root cause: Vercel Hobby's hard 10s function timeout vs. a monolithic Sonnet 4.6 + Claude verifier round-trip needing ~30-60s. The route's `export const maxDuration = 60` declaration is silently ignored on Hobby.

This patch keeps the existing route surface but makes the dashboard call it in 4 sequential, asset-type-targeted batches against the cheap model with the verifier skipped — every batch fits comfortably under 10s.

**Edited:**
- `src/lib/event-campaign-asset-generator.ts` — `inspectExistingAssets` now returns `{ liveTypes: Set<AssetType>, draftIdsByType: Map<AssetType, string[]>, totalLiveCount }`. New `archiveDraftsForTypes` archives only `status='draft'` rows for the **requested** asset types — posted/approved/scheduled/idea/rejected and drafts of other types are untouched. `generateCampaignAssets` now: (a) without `force_regenerate`, filters `requestedTypes` down to `typesToGenerate = requestedTypes − liveTypes` and short-circuits with `already_exists=true` only when ALL requested types are already covered; (b) with `force_regenerate=true`, archives draft rows of the requested types only and regenerates all of them. Added `skip_verifier?: boolean` option that bypasses the Claude verifier pass (used by the dashboard batch flow). `buildSystemPrompt` and `buildUserPrompt` now take `typesToGenerate` and emit a targeted JSON schema so the model only generates what was asked. `buildInsertRows` filters on the post-dedup `generatedTypes` set so non-force batches can never insert duplicates of already-live types.
- `src/app/api/admin/campaigns/generate-assets/route.ts` — Zod `RequestSchema` extended with optional `skip_verifier: boolean`; passed through to `generateCampaignAssets`.
- `src/app/dashboard/campaigns/page.tsx` — `handleGenerate` rewritten as a sequential 4-batch loop. Batches: `['social_post']`, `['short_form_script','email_subject','email_body']`, `['dm_reply','hashtag_set']`, `['image_prompt','video_prompt','landing_headline','lead_magnet']`. Every batch sends `model_override: 'meta-llama/llama-3.3-70b-instruct'` and `skip_verifier: true`. New `generationProgress` state drives a "Generating batch N of 4 — <label>…" button label. On a batch failure the loop stops and the error toast names the failing batch. After success, the detail panel and list refresh.

**Behavioral guarantees preserved:**
- Every inserted asset is still `status='draft'`, `requires_human_approval=true`, `generation_job_id` linked to `ai_jobs`.
- No `content_calendar` writes. No auto-publish. No schema changes.
- Force regenerate confirm dialog wording unchanged: "This archives existing draft assets only. Posted, approved, scheduled, and rejected assets are not overwritten."
- Posted, scheduled, approved, idea, rejected assets are never modified by this code path. Drafts of asset types not in the current batch are also untouched.
- Banned-term `compliance_flag` still tagged on individual rows in `verification_metadata`. Verifier skip is reported in the bundle-level `verification.skipped=true` with `reason: 'verifier skipped by caller (batched generation on Hobby)'`.

**Tests run this session:**
- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS; all routes register; no warnings introduced.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated to this patch.

**Pre-existing orphaned `ai_jobs` from the failed Art Basel attempt:** still in `running` state. Run the cleanup SQL from `SYSTEM_AUDIT_PHASE_14_STATUS.md` (line 11 of the "Recommended Cleanup" block) before retrying. Cosmetic only — does not block the retry.

**Safe to retry Art Basel after deploy:** yes. The pre-deploy attempt inserted 0 `campaign_assets` rows (verified by code path; insert is a single batch at the very end of `generateCampaignAssets`). After deploy + cleanup-SQL, clicking Generate Asset Bundle again will run the 4-batch flow against Llama 3.3 70B with no verifier — each call fits in ~5-8s on the cheap model based on the weekly-content cron's measured ~5s for a 28-post bundle.

---

## Phase 14E.1 — Campaign Dashboard Media Clarity Patch (in working tree, 2026-05-02 — not yet committed/deployed)

After the Phase 14E timeout patch landed, Art Basel Miami Beach 2026 generated 33 draft assets cleanly across the 4 batches. Operator confusion surfaced one residual UX gap: `image_prompt` and `video_prompt` rows are *prompts*, not generated media. The dashboard rendered just the prompt text with no indicator that no image/video had been produced yet, which read as "broken" rather than "expected for this phase."

This patch is dashboard-only. No API change, no schema change, no Pexels / OpenAI / HeyGen calls.

**Edited:**
- `src/app/dashboard/campaigns/page.tsx`
  - `AssetRow` interface gained optional `image_url?: string | null` and `video_url?: string | null`. The detail API does not currently select these columns, so they will be `undefined` at runtime; the UI degrades gracefully.
  - `ASSET_TYPE_LABELS.short_form_script` relabelled "Short-Form Video Scripts" (matches §6 wording).
  - New `ASSET_TYPE_HELPER_TEXT` map keyed by asset type; `image_prompt` and `video_prompt` carry the operator-facing copy ("These are image generation/fetch instructions. Actual images are created later when assets are pushed to the content calendar." / "These are video generation instructions. Actual videos are created later through the video workflow.").
  - `AssetGroup` accepts `assetType: string` and `helperText?: string`. The italic helper text renders under the group title when set; otherwise the group is unchanged.
  - `AssetCard` accepts `assetType: string`. Body of the card now renders a media block:
    - If `asset.image_url` is set: a `<img>` preview capped at `max-h-32`, rounded, with object-cover. Plain `<img>` (not `next/image`) so any future Pexels/Supabase Storage URL renders without a `next.config.js` remote-pattern change.
    - Else, only when the asset type is `image_prompt`: a muted italic placeholder "🖼️ No image generated yet. This row holds the prompt; the actual image will be created during the content-calendar push."
    - If `asset.video_url` is set: a `▶ View generated video` link in brand orange.
    - Else, only when the asset type is `video_prompt`: muted italic "🎬 No video generated yet. This row holds the prompt; the actual video will be created during the video workflow."
  - The placeholder is intentionally NOT shown on `social_post`, `email_body`, etc. — those types never expected a `image_url` at the campaign-asset stage; rendering the placeholder there would just be visual noise.

**All asset-type sections present and labelled:** Social Posts, Short-Form Video Scripts, Email Subjects, Email Bodies, DM Replies, Hashtag Sets, Image Prompts, Video Prompts, Landing Headlines, Lead Magnets. Sections with zero rows are still hidden (existing behavior).

**Tests run this session:**
- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS (no new warnings, all routes register including the unchanged `ƒ /dashboard/campaigns`)
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated to this patch.

**Behavioral guarantees preserved (re-verified):**
- No `content_calendar` writes; no auto-publish; no schema change; no Pexels / OpenAI / HeyGen call.
- Approve / reject / force-regenerate semantics from Phase 14E and the timeout patch are unchanged.
- API response shape from `GET /api/admin/campaigns/[id]` is unchanged.
- Existing assets, jobs, and verification logs are untouched.

---

## Phase 14F — Push Approved Campaign Assets into `content_calendar` (in working tree, 2026-05-02 — typecheck + build pass; awaiting commit + migration apply + deploy)

Connects approved `campaign_assets` rows to the existing `content_calendar` table so the rest of the publishing pipeline (Twitter / Facebook / Instagram poster routes; the `/dashboard/content` review surface) can pick them up. Strictly an admin-triggered, idempotent, human-approved push. **Never auto-posts.** Never calls OpenRouter / Claude / Pexels / OpenAI / HeyGen.

**Created:**
- `supabase/migrations/022_add_campaign_asset_link_to_content_calendar.sql` — adds nullable `content_calendar.campaign_asset_id UUID REFERENCES campaign_assets(id) ON DELETE SET NULL`. Adds partial unique index `idx_content_calendar_campaign_asset_unique ON content_calendar(campaign_asset_id) WHERE campaign_asset_id IS NOT NULL` — at most one calendar row per campaign asset (server-side dedup) while leaving legacy NULL rows alone. Idempotent: every operation uses `IF NOT EXISTS`. Existing rows are unaffected (column nullable, defaults NULL).
- `src/app/api/admin/campaigns/assets/[assetId]/push-to-calendar/route.ts` — admin-gated POST. Optional body `{ scheduled_for?: ISO, platform?: string }`. Loads asset → checks `status='approved'` → checks asset_type is in the calendar-pushable set (today: `social_post` only) → resolves and validates target platform against `content_calendar.platform` CHECK (`instagram|facebook|tiktok|twitter`) → validates non-empty body for the NOT NULL `caption` → derives `week_of` (Monday UTC) from override / asset.scheduled_for / now → INSERTs `content_calendar` row with `status='draft'` and `campaign_asset_id` set → UPDATEs `campaign_assets.content_calendar_id` to link back. Two layers of idempotency: forward link via `campaign_assets.content_calendar_id` (existing column from migration 018) and back link via `content_calendar.campaign_asset_id`. On a `23505` race, requeries the winning row and returns `{ ok:true, already_pushed:true }`. Partial-success path (calendar row exists but forward-link update failed) returns `{ ok:true, partial:true, warning }` so a re-click cleanly repairs the link.
- (No new file) — `src/app/dashboard/campaigns/page.tsx` extended with a new dashboard surface for the push action.

**Edited:**
- `src/app/dashboard/campaigns/page.tsx`
  - `AssetRow` gains optional `content_calendar_id?: string | null` (forward-compat — the campaign-detail API does not select this column today; see "Risks" below).
  - New top-level constants `CALENDAR_PUSHABLE_ASSET_TYPES = {'social_post'}` and `CALENDAR_PLATFORMS = {'instagram','facebook','tiktok','twitter'}` mirror the route's allowlists so the UI only shows the button where it will work.
  - New `pushedAssetIds: Set<string>` component state — tracks assets pushed during the current session so the badge appears immediately after a successful push, since the campaign-detail API does not return `content_calendar_id` today.
  - New `handlePushToCalendar(assetId)` — POSTs to the new route, surfaces result via toast (`'Pushed to content calendar as draft'` / `'Already on the content calendar'` / partial-link repair message), refreshes the campaign detail.
  - `CampaignDetailPanel`, `AssetGroup`, and `AssetCard` props extended with `pushedAssetIds`, `onPushToCalendar`, and (on `AssetCard`) the derived `pushedToCalendar` boolean.
  - `AssetCard` action row now renders:
    - `📅 Push to Calendar` button — only when `asset.status === 'approved'` AND asset_type is in the pushable allowlist AND not already pushed.
    - `✓ Added to Calendar` badge — when the asset is in the local `pushedAssetIds` set OR the API ever starts returning `content_calendar_id`. Hides the Push button.
    - Muted hint "Calendar push not yet supported for {asset_type}" — when the asset is approved but its type is not in the allowlist (gives the operator a reason rather than silently hiding the action).
  - Approve / reject / generate flows unchanged.

**Supported asset types this phase:** `social_post` only. Email / DM / hashtag-set / landing-headline / lead-magnet are explicitly out of scope because `content_calendar.platform` CHECK only allows the four social platforms. The route returns a specific 400 with the project-stipulated message ("This asset type is not yet supported for calendar push.") for unsupported types. `image_prompt` / `video_prompt` are deferred to a future media-generation phase.

**Idempotency / duplicate prevention:**
- Forward-link short-circuit: if `campaign_assets.content_calendar_id` is already set and the row exists, return it as `already_pushed: true` without inserting.
- Back-link short-circuit: if a `content_calendar` row with `campaign_asset_id = assetId` exists (even when the forward link is missing), return that row and repair the forward link.
- Partial unique index on `content_calendar.campaign_asset_id` enforces uniqueness at the DB level — a race-window double-insert returns `23505`; the route catches that, requeries, and returns the winning row.
- Posted `content_calendar` rows are never modified by this code path; the route only INSERTs and UPDATEs `content_calendar_id` on the asset.

**Behavioral guarantees:**
- Never auto-posts (the route only writes `status='draft'`; the per-platform poster routes still require `status='approved'` set manually on `/dashboard/content`).
- Never modifies posted, scheduled, or rejected `content_calendar` rows.
- Never modifies asset status; the asset stays `approved` after push.
- Never calls OpenRouter / Claude / Pexels / OpenAI / HeyGen.
- Never touches `campaign_assets.body`, `hashtags`, or `verification_metadata`.

**Tests run this session:**
- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS; new route registered as `ƒ /api/admin/campaigns/assets/[assetId]/push-to-calendar`. `Compiled successfully in 15.3s`.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated to this patch.

**Risks:**
- Migration 022 must be applied to Supabase prod **before** the new route is exercised. Until applied, the back-link lookup in step 5 of the route returns "column does not exist", and the `INSERT ... campaign_asset_id` in step 9 fails. The forward-link lookup in step 4 still works because that column exists from migration 018.
- The campaign-detail API (`GET /api/admin/campaigns/[id]`) does not select `campaign_assets.content_calendar_id` today. The "✓ Added to Calendar" badge only renders for assets pushed in the current browser session OR after a future change to the detail API. This is a documented trade-off; the route is fully idempotent so a stale "Push to Calendar" button on a previously-pushed asset is safe to click — it returns `already_pushed: true`.
- `image_prompt` / `video_prompt` rows currently store only the prompt text. Pushing to `content_calendar` is intentionally blocked for these because the existing posters expect a finished `image_url` / video. A later media-generation phase will produce the actual files first, then surface a separate path.
- Operators can still manually approve a `content_calendar` row on `/dashboard/content` and trigger a poster route. That is the existing 12.x flow and is not part of Phase 14F's surface — Phase 14F just lands the row as a draft.

**Leo to do:**
- [ ] Commit + push the patch (commands at the end of the session response).
- [ ] Apply migration 022 to Supabase prod (`supabase db push` or paste the SQL into the SQL Editor). **Required before the new route can be exercised.**
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Smoke test: open Art Basel on `/dashboard/campaigns` → approve a `social_post` asset → click `📅 Push to Calendar` → verify a `content_calendar` row with `status='draft'` and the asset's caption / hashtags / platform → confirm the badge updates → click again to confirm idempotency.

---

## Phase 14G — Per-Platform Creative Sizing & Media Rules (in working tree, 2026-05-02 — typecheck + build pass; awaiting commit + deploy)

Centralizes platform format requirements (caption / hashtag limits, image / video aspect ratios, preferred dimensions, file-size caps) into a single reusable module. Adds a one-line creative-format hint to the campaign dashboard so operators see at a glance what each platform expects. **Does not generate any media. Does not call any external API. Does not modify any DB schema. Does not change posting routes.** Pure, additive.

**Created:**
- `src/lib/social-specs.ts` — single source of truth for all 5 platforms. Exports:
  - `PlatformId` union type and `ALL_PLATFORM_IDS` array (`instagram | facebook | twitter | tiktok | youtube_shorts`).
  - `SocialSpec` interface — captures display name, allowed content types, caption max + recommended chars, hashtag max + recommended count, image / video aspect ratios, preferred dimensions array (first entry is the default), max file sizes, max video length, link-clickability and hashtag-usefulness flags, short-form-video-preferred flag, and free-form practitioner notes.
  - 5 platform spec constants populated from current (early-2026) platform docs:
    - Instagram — 2200 cap (≤150 recommended), 30 hashtag cap (~8 recommended), 1080×1080 / 1080×1350 / 1080×1920, Reel 9:16 video preferred, links not clickable.
    - Facebook — effectively unbounded caption (250 recommended), 30 hashtag cap (~2 recommended), 1200×630 link card / 1080×1080 square, links clickable.
    - X / Twitter — 280 cap (240 recommended), 2 hashtag cap (1 recommended), 1600×900 / 1200×675, 5MB image cap, 140s video cap (free tier), links clickable.
    - TikTok — 2200 cap (100 recommended), 30 hashtag cap (~4 recommended), vertical 1080×1920, 180s video cap (sweet spot 21-34s), links not clickable.
    - YouTube Shorts — 5000 description (200 recommended), 15 hashtag cap (~3 recommended), 1080×1920 vertical, 60s cap, #Shorts tag for discovery.
  - Helper functions:
    - `normalizePlatform(input)` — case-insensitive alias resolution (`'X' / 'x' / 'twitter/x'` → `'twitter'`, `'IG' / 'insta'` → `'instagram'`, `'YT Shorts' / 'shorts'` → `'youtube_shorts'`, etc.). Returns null on unknown input so callers can degrade.
    - `getSocialSpec(platform)` — returns the full `SocialSpec | null`.
    - `validateCaptionForPlatform(platform, caption)` — returns `{ ok, reason, lengthChars, maxChars, recommendedChars, overRecommended }`. `ok=false` only when over the hard max; `overRecommended=true` is a soft warning.
    - `suggestCaptionTrim(platform, caption)` — pure trim with ellipsis when over hard max.
    - `getRecommendedImageSpec(platform)` — first preferred image dimension or null.
    - `getRecommendedVideoSpec(platform)` — first preferred video dimension or null.
    - `buildPlatformGuidanceLine(platform)` — compact `"1080×1080 image · caption ≤ 150 chars · 8 hashtags"` style string for dashboard hints. Picks video for short-form-preferred platforms (TikTok, YouTube Shorts), image otherwise.

**Edited:**
- `src/app/dashboard/campaigns/page.tsx` — `AssetCard` imports `getSocialSpec` and `buildPlatformGuidanceLine` from the new module. For `social_post` rows where the platform resolves, renders a single muted line under the body text: `📐 Instagram: 1080×1080 image · caption ≤ 150 chars · 8 hashtags`. Title attribute carries the spec's free-form notes for hover detail. Hidden when the platform can't be resolved (graceful fallback). Approve / reject / push-to-calendar / generate flows unchanged.

**Content_calendar metadata storage:** **Deferred.** Reviewed `supabase/migrations/004_create_content_calendar.sql` and `022_add_campaign_asset_link_to_content_calendar.sql` — `content_calendar` has no JSONB / metadata column. Per the user's explicit instruction ("If no safe field exists, do not change schema and just leave this for a later phase"), the push-to-calendar route is unchanged. A future schema phase can add `content_calendar.platform_spec_metadata JSONB` and the push route can populate it from `getSocialSpec(asset.platform)` at insert time without further dashboard changes.

**Tests run this session:**
- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS; `Compiled successfully in 11.0s`. Route table unchanged.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated to this patch.

**Behavioral guarantees (all preserved):**
- No new external API calls. No image / video generation. No Pexels / OpenAI / HeyGen.
- No `content_calendar` writes from this phase. No schema changes.
- No changes to posting routes. No auto-posting.
- No changes to approve / reject / generate / push-to-calendar logic.
- Guidance line is render-only — never blocks any operator action.

**Risks:**
- Platform spec numbers reflect early-2026 docs and drift over time (X premium caps changed in 2024, IG Reels duration was 90s as of late 2025). When a platform officially changes a limit, edit the spec constant in `social-specs.ts` and downstream consumers (dashboard hint, future poster pre-flight) pick up the change automatically. Worst case if a number is stale: the recommendation is slightly off, not that anything posts. The hard-max numbers are conservative — when in doubt, the spec under-counts.
- The dashboard's title-attribute tooltip carrying multi-line notes uses `\n`. Rendering of the newline depends on the browser's native title implementation and can vary; this is a minor cosmetic issue, not a functional one.
- `buildPlatformGuidanceLine` returns null for unknown platforms so unrecognized values silently hide the hint. If a spec is added for a new platform that isn't yet in `normalizePlatform`'s alias map, it won't surface in the UI — keep both in sync.

**Leo to do:**
- [ ] Commit + push the patch.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`).
- [ ] Spot-check `/dashboard/campaigns` → Art Basel → confirm each `social_post` row shows the correct per-platform hint (Instagram square, Facebook link card, Twitter 1600×900, TikTok 1080×1920, etc.).

---

## Phase 14H — Conversion Tracking by Event Campaign (in working tree, 2026-05-02 — typecheck + build pass; awaiting commit + migration apply + deploy)

Foundation for closing the loop on campaign performance: which events drive clicks, leads, and conversions. **Read-only and additive.** No posting, no AI generation, no schema mutation beyond a single SQL view, no changes to existing routes.

### Existing tracking schema inspected (no surprises)

- `contact_events` (migration 008) — `id, contact_id, event, metadata JSONB, score_delta, created_at`. Populated by `POST /api/webhooks/track-event`. Today carries no UTM context — the route does not extract UTM from the request and does not associate events with campaigns.
- `contacts` (migration 001) — `custom_fields JSONB`. The lead-creation flow (`POST /api/webhooks/lead-created`) stores `{ utm_source, utm_medium, utm_campaign }` here. The existing `/dashboard/attribution` page already aggregates leads-by-UTM from this column; that's the only working UTM signal in the system today.
- `event_campaigns.tracking_url_template` (migration 017) — stores the literal string `?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event_slug}_{year}_{wave}`. Placeholders are never resolved.
- `campaign_assets.tracking_url` (migration 018, line 51) — column exists but is never populated by the Phase 14D generator.
- `content_calendar` (migrations 004 + 022) — has no tracking-URL or metadata column. Captions don't include the resolved UTM tag either.

### Created

- `supabase/migrations/023_create_event_campaign_attribution_view.sql` — read-only `event_campaign_attribution_summary` view. Grain: one row per `(event_campaign × campaign_asset × content_calendar_row)`. LEFT JOINs throughout so campaigns with no assets / assets without calendar rows / campaigns with no UTM-attributed contacts all still appear. A `WITH utm_match` CTE pre-aggregates per-campaign lead totals by matching `contacts.custom_fields ->> 'utm_campaign'` against an anchored regex `^<sluggified_event_name>_<event_year>(_|$)` with `utm_medium = 'event_campaign'`. Filters out archived/rejected assets in the asset join. Idempotent (`CREATE OR REPLACE VIEW`).
- `src/lib/event-campaign-attribution.ts` — server-only helper. Exports `AttributionRow` (matches the view), `CampaignRollup` (per-campaign aggregate), `getEventCampaignAttributionSummary(filters)`, `getEventCampaignAttributionByCampaign(campaignId)`, `rollupCampaign(rows)`, `calculateCampaignPerformanceScore(input)`. The performance score is a weighted composite (30% intrinsic event-fit / 20% production ratio / 20% distribution ratio / 30% revenue from leads + members) clamped to 0-100. The rollup uses Sets keyed by `campaign_asset_id` / `content_calendar_id` so the per-(asset × calendar) grain de-dupes cleanly when any LEFT JOIN fans out.
- `src/app/api/admin/campaigns/attribution/route.ts` — admin-gated GET. Zod validates `campaign_id` (uuid), `platform`, `wave` (W1-W8), `min_score` (1-100), `date_from`, `date_to`. Strips empty-string params before validation. Loads view rows, groups by campaign, runs `rollupCampaign` per group, sorts by `(performance_score, lead_count, asset_count)` desc. Returns `{ ok, empty, filters, totals, ranked, notes }`. The `notes` field documents the deferred-attribution caveat in-band so any future API consumer sees it.

### Edited

- `src/app/dashboard/campaigns/page.tsx`
  - New `AttributionRollup` interface mirroring the helper.
  - New `attribution` / `attributionLoading` state. Loaded lazily via `loadAttribution(id)` whenever the selected campaign changes; refreshed after a successful Push to Calendar.
  - New `PerformancePanel` component rendered between the score panel and the asset bundle. Shows: composite performance score, latest activity timestamp, 8-cell metric grid (clicks · leads · conversions · posted · click-to-lead · lead-to-conversion · approved assets · calendar rows), per-platform breakdown line, and a footer note explaining that click attribution is deferred and lead matching is best-effort.
  - Empty-state copy as spec'd: "No conversion data yet. Campaign assets are now trackable once links receive traffic." Rendered when the rollup is null OR when no metric has fired yet.
  - Approve / reject / generate / push-to-calendar flows unchanged. The performance panel is render-only.

### Tracking URL placeholder status — high-priority gap, NOT silently patched

The canonical tracking URL `?utm_source={platform}&utm_medium=event_campaign&utm_campaign={event_slug}_{year}_{wave}` is materialized **nowhere** today:

| Layer | State | What's needed |
|---|---|---|
| `event_campaigns.tracking_url_template` | placeholder string stored | spec values, never resolved |
| `campaign_assets.tracking_url` | column exists, always NULL | Phase 14D generator could resolve and store |
| Caption text | canonical short URLs only | no UTM tag appended |
| `content_calendar` | no field for tracking URL | needs schema add |

The push-to-calendar route was **not** patched in this phase because:
1. There is no field on `content_calendar` to store the resolved URL — that requires a schema change, which the user's allowlist forbids unless absolutely necessary.
2. Substituting placeholder text inside the caption would change content the operator already approved.
3. `event_slug` is not persisted on `event_campaigns` — recomputing it from `event_name` is fragile and risks drift.

**Recommended fix** (separate small phase): add `content_calendar.tracking_url TEXT NULL`, persist `campaign_assets.tracking_url` at generation time, and have the push-to-calendar route copy it through. Once that lands, `event_campaign_attribution_summary` starts returning real lead counts without any further view change.

### Metrics supported now

| Metric | Source | Notes |
|---|---|---|
| `asset_count` | `campaign_assets` (non-archived/non-rejected) | distinct |
| `approved_asset_count` | `campaign_assets.status = 'approved'` | distinct |
| `calendar_row_count` | `content_calendar` linked via `campaign_asset_id` | distinct |
| `posted_count` | `content_calendar.status = 'posted'` | distinct; today still 0 because nothing has been auto-posted from a campaign asset |
| `latest_posted_at` | `MAX(content_calendar.posted_at)` | null if nothing posted yet |
| `lead_count` | UTM substring match against `contacts.custom_fields` | best-effort; 0 today until tracking URLs land |
| `member_count` | leads filtered by `contacts.status = 'member'` | best-effort; 0 today |
| `lead_to_conversion_rate` | `member_count / lead_count` | null when leads = 0 |
| `latest_activity_at` | latest of `latest_posted_at` and `latest_lead_at` | drives the "Latest activity" line on the panel |
| `performance_score` | weighted composite 0-100 | always available; useful for ranking even with zero leads |

### Metrics deferred

- **Clicks** — `contact_events` has no UTM context today. Adding it would require either patching `track-event` to extract UTM from a `metadata.utm_*` payload (requires updates to every client-side tracker call) or adding a separate `utm_event` column and wiring it through. Not in scope for 14H.
- **Impressions** — no impression tracking exists at all. Would require platform analytics integrations (Meta Insights API, X Premium analytics, etc.) — entire phase of its own.
- **Per-(platform × wave) lead breakdown** — the UTM template includes wave, so technically extractable, but requires more SQL pattern work and a real dataset to validate against. Deferred until tracking URLs are resolved.

### Tests run this session

- `npx tsc --noEmit` — ✅ PASS (clean)
- `npm run build` — ✅ PASS; `Compiled successfully in 31.0s`. New route registered as `ƒ /api/admin/campaigns/attribution`.
- `npm run lint` — not run; pre-existing Phase 13 ESLint v8/v9 mismatch is unrelated.

### Risks

- **Migration 023 must be applied to Supabase prod before the new endpoint or dashboard panel will return data.** Until applied, `getEventCampaignAttributionSummary` throws "relation does not exist" and the dashboard renders the empty-state placeholder. The throw is caught in the dashboard fetch, so no UI breakage — just a quiet empty panel.
- **UTM regex match is brittle to event-name evolution.** If a campaign's `event_name` is later edited (e.g. "Art Basel Miami" → "Art Basel Miami Beach"), historical contacts whose UTMs used the old slug will stop attributing. Mitigation: persist `event_slug` on `event_campaigns` and match against it directly. Future small phase.
- **Lead counts will be zero in production until tracking URLs are actually published.** This is the expected state for now, not a bug. The dashboard's empty-state copy makes this clear; the API response includes a `notes.lead_attribution` field documenting the same.
- **The view performs three correlated subquery / pre-aggregations on every read.** With < 100 campaigns and < 5,000 contacts (current scale), this is fine. If contacts grow into the millions, materialize the view as a table refreshed by a daily job and switch the helper to read from the materialized table instead.
- **Performance score weights are heuristic.** They sort campaigns reasonably with the data we have today (mostly intrinsic score + asset/post counts) but will need retuning once real lead/conversion data accumulates. Retuning is a one-line edit in `calculateCampaignPerformanceScore`.

### Leo to do

- [x] Commit + push the patch — **DONE** (`2e3869d` for the patch + `4323250` for the last-known-good hash refresh; both pushed to `origin/main`; verification push returned `Everything up-to-date`).
- [x] **Apply migration 023 to Supabase prod** — **DONE.** Verified via `SELECT viewname FROM pg_views WHERE viewname = 'event_campaign_attribution_summary';` returning the view row.
- [ ] Re-deploy to Vercel prod (`npx vercel --prod --yes`). **Still pending.**
- [ ] Smoke test: open Art Basel on `/dashboard/campaigns` → confirm the new Performance panel renders with the empty-state copy + composite performance score driven by intrinsic event-fit + production/distribution ratios. **Still pending.**

### Phase 14H save state (2026-05-03)

| Step | Hash | Status |
|---|---|---|
| Phase 14H code commit | `2e3869d` | ✅ pushed |
| Last-known-good hash bump | `4323250` | ✅ pushed |
| `git push origin main` verification | — | ✅ `Everything up-to-date` |
| Migration 023 applied to Supabase prod | — | ✅ verified (`pg_views` row exists) |
| Vercel prod deploy | — | ⏳ pending |
| Performance-panel smoke test | — | ⏳ pending (depends on deploy) |

### Recommended next phase

**Phase 14H.1 — Tracking URL Materialization** is the natural next session, but **only after** the two pending items above are complete. The 14H Performance panel returns mostly empty / zero-lead data until URLs are resolved into post bodies (or a `content_calendar.tracking_url` column lands), so 14H.1 is what makes 14H operationally useful. See `BUILD_PROGRESS.md` for the scoped task list.

---

## Mandatory End-of-Phase Save Protocol — added 2026-05-03 to `CLAUDE_SESSION_SKILL.md`

A 10-rule protocol now governs the end of every phase, patch, smoke test, audit, migration, and deployment. Highlights:

1. Both tracking files (`PROJECT_STATE_CURRENT.md` + `BUILD_PROGRESS.md`) must be updated.
2. Phase-specific docs (audit reports, roadmaps, skill files, continuation files) must be on the save list.
3. A six-item phase-completion checklist (tracking docs · tests · migration · deploy · smoke test · git commands) must be ticked off before any phase is called complete.
4. The end-of-phase report must enumerate ten fields in fixed order, including the exact `git add`, commit message, and two-push verification.
5. Cache / build / secret files (`tsconfig.tsbuildinfo`, `.next/`, `node_modules/`, `.env.local`, `.claude/settings.local.json`) are excluded from staging by default.
6. Named-file staging only — never `git add .` without explicit authorization.
7. Two-push verification (`git push origin main` twice; the second must return `Everything up-to-date`).
8. Final state must be `nothing to commit, working tree clean` (with `tsconfig.tsbuildinfo` as the one acceptable straggler).
9. Migration ordering must be stated explicitly + a Supabase SQL verification query supplied.
10. Production-behavior changes require an explicit smoke-test checklist; purely-additive phases must declare "no smoke test required" in writing.

See `CLAUDE_SESSION_SKILL.md` for the canonical text.
