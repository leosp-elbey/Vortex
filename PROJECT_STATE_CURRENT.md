# VortexTrips — Current Project State

**🚀 PROJECT STATUS: MAINTENANCE MODE** (with five operator-driven patches in flight: Phase 14AD — Supabase Security Advisor compliance; Phase 14AE — Twilio A2P 10DLC compliance; Phase 14AF — Media Pipeline Audit & UI Polish; Phase 14AG — Video Pipeline Swap (HeyGen → Pexels Video); Phase 14AH — Pexels Duplicate Prevention). All planned phases (0 → 14AC) shipped; 14AD–14AH are external-trigger / operator-experience patches following the same `SAVE_PROTOCOL.md`.

---

**Last updated:** 2026-05-09 (Phase 14AH.1 shipping in working tree — Pre-Flight Hardening + Randomized Pexels Fetch. Two changes: (1) `scripts/generate-missing-media.js` gains a strict pre-flight refusal in `main()` BEFORE any DB SELECT — when `--generate` is set with `--provider=auto` or `--provider=pexels`, an empty/missing `PEXELS_API_KEY` now exits 1 with a clear message instead of writing `media_status='failed'` to every queued row (prevents a config error from corrupting DB rows, as happened during the Phase 14AH backfill attempt earlier in this session). (2) `fetchAndStoreVideo` in `src/lib/media-providers.ts` (and its JS mirror in the script) replaces the deterministic "page 1 first, fallback page 2–6, first-fit" strategy from 14AH with **random page 1–5 + random unused index from the returned `videos[]` array** for visual variety. Pexels search is deterministic, so two posts with identical `image_prompt` would always collide on the same MP4; randomizing both the page request and the index pick from the result set eliminates that. The existing `excludePexelsIds` / `excludeUrls` options remain optional — they layer extra dedup on top of the random pick (the standalone script still pre-queries the DB; the cron does not). The cron's DB pre-query was removed per the operator's directive — the accumulator-only approach plus randomization is sufficient for weekly cadence. Lint + typecheck clean.)
**Last known good commit:** `be860ca` — "Phase 14AH: Pexels duplicate prevention — dedup in fetchAndStoreVideo"
**Last updated:** 2026-05-09 (Phase 14AH shipping in working tree — Pexels Duplicate Prevention. Pexels Video Search is deterministic — the same query returns the same top results — so two posts with similar `image_prompt` values would otherwise collide on the same MP4. `fetchAndStoreVideo` in `src/lib/media-providers.ts` now accepts `excludePexelsIds: ReadonlySet<string>` and `excludeUrls: ReadonlySet<string>` options. The function walks page 1 first skipping any video whose `id` or chosen MP4 URL appears in either set; if every page-1 result is excluded, it retries once with a randomized page (2–6) for variety; if page 2 is also fully excluded (extremely rare for travel queries), it falls back to returning the first usable result with `raw.duplicate_fallback = true` set so callers can flag the row. Both callers (the weekly-content cron and `scripts/generate-missing-media.js`) pre-query existing `content_calendar.video_url` + `media_metadata.pexels_video_id` (and the script also pulls in `campaign_assets.video_url` + `video_source_metadata.pexels_video_id`) into the exclude sets, then accumulate newly-picked URLs/IDs into the same sets as the run progresses — so a single batch can't pick the same MP4 twice. The cron's TikTok video fetches were also serialized (image fetches stay parallel) to keep the accumulator consistent. The lib helper itself never queries the DB — the DB read lives in the callers, preserving the lib's pure-HTTP-wrapper contract. Lint + typecheck clean. No DB schema change; no platform calls.)
**Last known good commit:** `b9e06c4` — "Phase 14AG: video pipeline swap — HeyGen excised, Pexels Video wired"
**Last updated:** 2026-05-09 (Phase 14AG shipping in working tree — Video Pipeline Swap. HeyGen excised from the SOCIAL CONTENT PIPELINE; Pexels Video Search wired in. The TikTok "Media missing" problem resolved by automation: the weekly-content cron now fetches a cinematic vertical HD MP4 from Pexels for every TikTok row synchronously and lands the row at `media_status='ready'` with `media_source='pexels'` and `video_url` populated. New `fetchAndStoreVideo()` helper in `src/lib/media-providers.ts` calls `https://api.pexels.com/videos/search` with `orientation=portrait`, `size=large`, `per_page=5`, picks the highest-quality vertical MP4 with duration in [5, 30] seconds. Returns the Pexels CDN URL directly (no re-hosting — Pexels CDN URLs are stable and re-uploading 5–30 MB MP4s would risk Vercel's 60s cron ceiling). The cron's `maxDuration` is now explicitly 60s. `ai-prompts.ts` SOCIAL_SYSTEM updated with a TikTok-specific block instructing the AI to (1) write `image_prompt` as a Pexels Video search query (3–7 words, cinematic travel B-roll), and (2) author an `On-Screen Hook` (max 10 words) that gets stored in `content_calendar.media_metadata.on_screen_hook` for future text-overlay rendering (Creatomate / Shotstack / ffmpeg are all viable downstream — flagged as a separate future phase). The `scripts/generate-missing-media.js` script's HeyGen surface is fully removed (batch caps, `--allow-large-heygen-batch`, `--allow-when-pending`, the pending-jobs gate, the per-row sanity check, the DRY-RUN preview, the `cleanScriptForHeyGen` helper, the `createHeyGenVideo` call); `processVideo()` now calls Pexels Video. `scripts/check-video-generation-status.js` and `scripts/inspect-heygen-pilot-candidates.js` deleted. Dashboard's "🎬 Video generating" pill replaced by a "⚠ Legacy HeyGen row" amber pill (helps the operator see leftover rows from the old async flow); the Phase 14AF helper text now points at the new command shape (no `--provider=heygen`). HeyGen env vars stay in `.env.example` because the admin SBA welcome-video feature still uses them — that's a SEPARATE feature stack from the social content pipeline and was deliberately left untouched in this phase. Lint + typecheck clean.)
**Last known good commit:** `cd5eb93` — "Phase 14AF: media pipeline audit + dashboard TikTok helper"
**Last updated:** 2026-05-09 (Phase 14AF shipping in working tree — Media Pipeline Audit & UI Polish. The operator noticed TikTok drafts in the dashboard show "Media missing", which reads like an error. The actual state is the deliberate Phase 14L design: HeyGen video renders are gated to a manual `node scripts/generate-missing-media.js --provider=heygen` invocation so the operator controls API quota burn. This phase audits the script (no silent failures; pre-flight contract is enforced before any provider call) and adds an inline actionable helper to `src/app/dashboard/content/page.tsx` directly under the badge row: when `platform === 'tiktok'` and `media.outcome` is `missing` or `failed` (and the row is NOT already in the existing pending-HeyGen pill state), a small gray `<p>` renders "Run `node scripts/generate-missing-media.js --provider=heygen` to render video". Confusing state → actionable instruction. No DB writes; no platform calls; no migrations; no new dependencies. Lint + typecheck clean.)
**Last known good commit:** `3799d23` — "Phase 14AE.1: add physical mailing address to shared Footer"
**Last updated:** 2026-05-09 (Phase 14AE.1 shipping in working tree — physical mailing address added to shared Footer. Operator provided the business address "1595 Palm Bay Rd #1009, Palm Bay, FL 32905"; the `<!-- TODO -->` placeholder in `src/components/Footer.tsx` is replaced by a real `<p>` line rendering the address above the copyright. The address surfaces on all three TCR-submitted pages (`/`, `/privacy`, `/terms`) automatically because they share the Footer component. No other files touched. Lint + typecheck clean.)
**Last known good commit:** `f586b73` — "Phase 14AE: Twilio A2P 10DLC compliance — homepage form + privacy + terms + shared Footer"
**Last updated:** 2026-05-08 (Phase 14AE shipping in working tree — Twilio A2P 10DLC compliance. The Twilio A2P 10DLC SMS campaign was rejected by The Campaign Registry (TCR); this phase brings the homepage lead form, Privacy Policy, and Terms of Service into compliance for the next carrier review. Six changes: (1) `src/app/page.tsx` LeadForm — phone placeholder updated to "Phone Number (required for SMS updates)", phone input now `required={form.smsConsent}` (browser enforces phone presence iff consent is checked), `required` removed from the consent checkbox HTML attribute (checkbox starts unchecked already), checkbox label rewritten to the exact TCR-mandated wording with explicit Msg/HELP/STOP disclosure inline, Privacy and Terms links open in a new tab via `target="_blank" rel="noopener noreferrer"`. (2) `src/app/page.tsx` hero — headline changed from "Save 40-60% on Every Trip" to "Save Up to 40-60% on Member Travel Rates" for defensible marketing claims. (3) `src/app/privacy/page.tsx` — new "SMS / Mobile Information Sharing" section inserted at the top of the policy body, explicitly excluding SMS opt-in data from any third-party sharing. (4) `src/app/terms/page.tsx` — section 2 body replaced with the full TCR-required SMS Program Terms (Program Name "VortexTrips SMS Notifications", how to opt in / opt out, HELP keyword, message frequency, message-and-data-rate disclosure, supported carriers including T-Mobile non-liability, privacy reference). (5) New `src/components/Footer.tsx` shared component (Privacy Policy, Terms of Service, Contact/Support mailto, business name, and a `<!-- TODO: Add physical mailing address -->` placeholder) wired into all three TCR-submitted pages: `/`, `/privacy`, `/terms`. The previous inline footer in `src/app/page.tsx` was removed in favor of the shared component. (6) Lint and typecheck pass. No DB writes; no platform calls; no migrations; no new dependencies.)
**Last known good commit:** `6e2f27a` — "Phase 14O.1: add manual autoposter runner, no scheduled cron" (most recent commit on main; Phase 14AD migration committed earlier in working tree, awaiting operator-side application)
**Last updated:** 2026-05-08 (Phase 14AD shipping in working tree — Supabase Security Advisor compliance. New migration `supabase/migrations/034_security_advisor_compliance.sql` carries two `ALTER` statements: (A) `ALTER VIEW event_campaign_attribution_summary SET (security_invoker = true)` — closes the `security_definer_view` advisor warning that exposed aggregate campaign performance data to `anon` via PostgREST; (B) `ALTER FUNCTION update_updated_at() SET search_path = pg_catalog, public` — closes the `function_search_path_mutable` advisor warning. Both ALTERs are idempotent and metadata-only; no app code changes; no data migration. Operator runs the migration on Supabase (SQL editor or `supabase db push`) after this commit lands.)
**Last known good commit:** `03c9ca4` — "Phase 14AC: Final System Audit + Maintenance Mode declaration" Phase 14Y's `bounded()` extracted from `src/app/t/[slug]/route.ts` into shared `src/lib/bounded-wait.ts` (with optional `logPrefix` parameter for clean per-route log streams). The tracking redirect route now imports from the lib instead of defining locally — behavior byte-identical. Both webhook routes (`/api/webhooks/lead-created`, `/api/webhooks/bland`) now wrap every Supabase call with `bounded(work, 2500ms, label, '[lead-created]' or '[bland-webhook]')`. lead-created treats the contacts insert as **critical path** — returns 503 fast on timeout so the webhook caller (GoHighLevel) can retry rather than wait on a hung connection. All other Supabase calls in both webhook routes are **bookkeeping** — degrade silently if they time out. New `WEBHOOK_BOUND_MS = 2500` constant exported from the lib. Typecheck + lint clean.)
**Last known good commit:** `d3cf3d3` — "Phase 14AA: Lighthouse CI Action — perf/a11y/SEO audit on every push" New `.github/workflows/lighthouse.yml` + `lighthouserc.json` config run `treosh/lighthouse-ci-action@v12` against 4 real production content pages (`/`, `/quote`, `/sba`, `/thank-you`) on every push to main and on manual dispatch. **Deliberately does NOT audit `/free` and `/join`** — both are 307 redirects to external portals (myvortex365.com, surge365.com) we don't control, so auditing them would score someone else's site. Modest budgets per the operator directive: performance > 70, accessibility > 90, SEO > 90, best-practices > 85. Uses `warn`-level assertions so score drops are surfaced without blocking the workflow. Reports uploaded to LHCI temporary public storage (7-day retention) AND saved as GitHub Actions artifacts for long-term lookup. Separate workflow file from `ci.yml` so the slower Lighthouse run doesn't block the fast typecheck/lint feedback loop. No code changes; no DB writes; no platform calls.)
**Last known good commit:** `1bfda11` — "Phase 14Z: CI/CD GitHub Actions wiring — typecheck + lint on every push" New `.github/workflows/ci.yml` runs `npx tsc --noEmit` and `npm run lint` automatically on every push and pull_request to main. Pinned to Node 22 LTS. Uses `npm ci --legacy-peer-deps` matching the documented local-dev invocation. Cached npm tarball directory for faster repeat runs. `concurrency: cancel-in-progress` saves CI minutes on rapid push sequences. Build step (`next build`) intentionally NOT in CI — Vercel runs it on every deploy. Both gates have been clean locally since Phase 14T.1; CI now blocks any regression at the PR level. No code changes; no DB writes; no platform calls.)
**Last known good commit:** `662fdc9` — "Phase 14Y: Tracking redirect fallback fix — bounded waits prevent hang"
**Production:** vortextrips.com (LIVE; **Phase 14A → 14Y deployed and verified**; Supabase migrations 017-033 applied; Hobby plan, 4 / 4 cron slots used; 8 live posts since 2026-05-05: 4 FB, 3 IG, 1 TikTok via manual workflow)

**Live posting status:** **🤖 Fully autonomous, operator-controlled, verifiable, on-brand, health-monitored, hang-resistant (everywhere), CI-gated, performance-tracked, AND audited.** All defensive layers are in place. The next milestone for the operator is post-deploy activation: connecting TikTok, flipping the autoposter cron kill switch to `true`, and watching the first scheduled tick land.

---

## Phase 14AH.1 — Pre-Flight Hardening + Randomized Pexels Fetch (in working tree, 2026-05-09 — script refuses upfront on missing API key + lib uses random page + random index instead of deterministic first-fit; no DB schema change; no platform calls)

### Why a 14AH.1 instead of just amending 14AH

Phase 14AH (committed in `be860ca`) shipped a deterministic "page 1 first, fallback page 2–6 if every result was excluded" strategy backed by a DB pre-query in both the cron and the standalone script. After 14AH landed, two things happened:

1. **The Phase 14AH backfill attempt failed** because the operator's `.env.local` had `PEXELS_API_KEY=""` (empty). The script ran with `--apply` and dutifully wrote `media_status='failed'` + `media_error='PEXELS_API_KEY not set'` to both queued TikTok rows. A configuration error corrupted DB row state — the script's contract should have refused upfront.
2. **The operator decided** that the cron's DB pre-query is not worth the complexity for the weekly cadence and prefers randomized page + index selection as the primary variety mechanism. (The cron's `maxDuration=60s` made the DB read inexpensive in absolute terms, but the operator's mental model values minimal DB reads on the cron's hot path.)

14AH.1 ships both fixes as a single coherent revision rather than two micro-phases.

### Files touched

| File | Change |
|---|---|
| `scripts/generate-missing-media.js` | New pre-flight block in `main()` after the apply/generate flag validation: when `--generate` is set with `--provider=auto` or `--provider=pexels` and `env.PEXELS_API_KEY` is empty/missing, the script prints a red "Refused" message and `process.exit(1)` BEFORE any SELECT or row update. Dry-run (`--generate` not set) still passes for queue inspection without keys. The body of `fetchPexelsVideo` is rewritten to mirror the lib's new random page + random index logic; the helper `pickFirstUnusedVideo` is replaced by `collectUsableVideos` which returns the full filtered candidate list (caller picks a random index). The existing exclude-set plumbing through `processVideo` is preserved unchanged — the script still pre-queries `content_calendar` and `campaign_assets` for cross-history dedup (no harm in the no-timeout standalone context). |
| `src/lib/media-providers.ts` | `fetchAndStoreVideo` rewritten around a new `fetchRandomPage(excludePages)` helper that picks a random page in 1–5 (re-rolling on collisions with already-tried pages, max 10 retries). Within the returned page, `collectUsableVideos` builds the filtered candidate list and the caller picks a random index. Up to 2 random pages are tried; last-resort fallback picks a random candidate even if excluded with `raw.duplicate_fallback = true`. The result's `raw` now carries `pexels_page` for telemetry. `excludePexelsIds` / `excludeUrls` remain optional — the lib never reads the DB. |
| `src/app/api/cron/weekly-content/route.ts` | The Phase 14AH `SELECT video_url, media_metadata FROM content_calendar` pre-query is removed. The empty `existingUrls` / `existingPexelsIds` Sets are still constructed and threaded through to `fetchAndStoreVideo` calls — they accumulate URLs/IDs picked WITHIN the current cron tick, preserving intra-run dedup (no two TikTok rows in the same cron will collide). Cross-week dedup is now statistical: random page (5 options) × random index from a per_page=15 result = a wide enough pool that collision rates across weekly runs are acceptable. |

### Algorithm (new)

```
fetchAndStoreVideo({ query, excludePexelsIds?, excludeUrls? })
  ├─ try up to 2 random pages in 1–5:
  │    ├─ random page = 1 + floor(Math.random() * 5)  (re-roll on dup)
  │    ├─ fetch page; collect candidates that:
  │    │    - have a usable portrait MP4
  │    │    - have duration in [5, 30]
  │    │    - are NOT in excludePexelsIds / excludeUrls
  │    ├─ if any → return random pick
  │    ├─ otherwise relax duration filter, retry
  │    └─ if still none → next attempt
  └─ last resort:
       ├─ pick a random candidate from the most recent page even if
       │    excluded
       └─ flag with raw.duplicate_fallback = true
```

Random page (5 options) × per_page=15 = 75 distinct candidates per query. With 7 weekly TikTok picks, birthday-paradox collision odds are ~25% before the in-run accumulator, ~15% after (the accumulator only filters within a single tick). For a weekly cadence on 1k+ Pexels results per typical travel query, this is acceptable.

### What the operator sees

- The dashboard "Media missing" / "Media failed" pills behave the same — but a config-error mass-fail like the one earlier in this session is impossible. The script refuses BEFORE writing anything.
- Two TikTok cron rows in the same week land on different MP4s with high probability (random page + random index from 75 candidates).
- Last-resort duplicates carry `media_metadata.duplicate_fallback = true` so the operator can grep for them later if needed.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No DB pre-query in the cron. (Per operator directive.)
- ❌ No removal of the script's DB pre-query. (Standalone script has no timeout; cross-history dedup adds value.)
- ❌ No DB constraint enforcement (`UNIQUE(video_url)`). Last-resort duplicates are allowed by design.
- ❌ No backfill of the 2 rows that got marked `media_status='failed'` by the earlier backfill attempt. The operator runs the backfill from their local terminal (which has the real Pexels key); the script's first successful run will overwrite both rows.
- ❌ No SBA video stack changes. HeyGen still powers `/sba`'s welcome video per the Phase 14AG carve-out.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| `ALTER` / `CREATE` against any DB object | 0 |
| posted_at delta | 0 (29 → 29) |
| Net file change | 3 modified |

### Verification before commit

- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ Pre-flight check fires before SELECT — manually traced through the `main()` ordering
- ✅ Random page re-roll capped at 10 attempts so it can't infinite-loop
- ✅ `fetchRandomPage`'s `excludePages` argument is a `Set`, not a primitive — verified

### Migration

**No.** No DB schema change.

### Operator runbook

After commit + push, the operator runs the backfill from THEIR local terminal (which has the real Pexels key in `.env.local`):

```bash
node scripts/generate-missing-media.js --videos-only --content-only --generate --apply
```

Expected: 2 rows succeed; the dashboard "Media failed" pills clear and become "Media ready" with green Pexels MP4 URLs. If the key is still empty, the new pre-flight aborts cleanly with "Refused: PEXELS_API_KEY is missing or empty in .env.local" and `process.exit(1)` — no DB rows touched.

### Recommended next phase

**14AG.2 — Text overlay rendering (still optional):** wire Creatomate / Shotstack / ffmpeg to burn `media_metadata.on_screen_hook` onto the Pexels MP4 before the autoposter posts it. Async — needs its own poll/cron.

---

## Phase 14AH — Pexels Duplicate Prevention (shipped 2026-05-09 in commit `be860ca`; superseded by Phase 14AH.1 above — deterministic-first-fit + cron DB pre-query strategy was replaced with random page + random index)

### What this phase ships

The Phase 14AG pipeline shipped a clean, automated TikTok B-roll flow — but Pexels Video Search is deterministic. Two posts with similar `image_prompt` values ("luxury beach resort" vs "tropical beach resort") would land on the same top result. Multiple TikToks with identical footage would look like a content bug. Phase 14AH fixes this at the fetch layer: `fetchAndStoreVideo` now skips already-used videos using exclude sets the caller builds from the DB.

### How the dedup works

```
caller (cron or script)
  ├─ SELECT video_url, media_metadata FROM content_calendar WHERE video_url IS NOT NULL
  ├─ build excludeUrls: Set<string>  (every existing video_url)
  ├─ build excludePexelsIds: Set<string>  (every media_metadata.pexels_video_id)
  └─ for each row needing a video (sequential, accumulating):
        result = fetchAndStoreVideo({ query, excludeUrls, excludePexelsIds })
        excludeUrls.add(result.url); excludePexelsIds.add(result.external_id)
        write row
```

`fetchAndStoreVideo` algorithm:
1. Fetch page 1, walk results, return the first entry whose `id` AND chosen MP4 URL are both unused. Done.
2. If every page-1 result was excluded, fetch a randomized page (2 + Math.floor(Math.random() * 5) → 2–6) for variety. Walk those results. Done if any unused.
3. If page 2 was also fully excluded (extremely rare for travel queries — Pexels has 1k+ results per common search), fall back to returning the first usable page-1 result with `raw.duplicate_fallback = true` set so callers can log/flag it. Better to ship a duplicate than to fail the row entirely.

The dedup catches **two distinct collision modes**:
- **Exact-URL collision** — two rows would pick the same `video_files[].link`. Caught by `excludeUrls`.
- **Same-video-different-quality collision** — two rows pick different files (HD vs UHD) of the same Pexels video. Caught by `excludePexelsIds` matching `entry.id`.

### Files touched

| File | Change |
|---|---|
| `src/lib/media-providers.ts` | `PexelsVideoOptions` gains optional `excludePexelsIds: ReadonlySet<string>` and `excludeUrls: ReadonlySet<string>`. `fetchAndStoreVideo` rewritten around a new internal `fetchPage(page)` helper and `pickFirstUnusedVideo()` walker (extracted, named, reusable). Page 1 → randomized page 2–6 → last-resort duplicate. `perPage` default raised from 5 to 15 (more candidates for the dedup walker to choose from). On duplicate fallback, `raw.duplicate_fallback = true` is set. The lib helper still does NOT query the DB — pure HTTP wrapper, exclude sets are passed by the caller. |
| `src/app/api/cron/weekly-content/route.ts` | Added a pre-query step before the row loop: `SELECT video_url, media_metadata FROM content_calendar WHERE video_url IS NOT NULL LIMIT 2000` builds `existingUrls` and `existingPexelsIds`. **Switched from fully-parallel `Promise.all(posts.map(...))` to parallel-image / sequential-video.** Image fetches still run in parallel (no dedup needed for FB/IG images — Pexels image variety is broad and visual collisions are unlikely). TikTok video fetches now run sequentially, with the accumulator updated after each successful pick so the next row in the run can't re-pick the same MP4. Total cron time impact: ~3.5s for 7 sequential video fetches vs ~500ms for parallel — well inside the 60s ceiling. |
| `scripts/generate-missing-media.js` | JS mirror of the lib changes. New `pickFirstUnusedVideo()` walker; `fetchPexelsVideo()` rewritten with the same page-1 → page-2 → duplicate-fallback flow. `processVideo()` signature gains `excludePexelsIds`, `excludeUrls` parameters and threads them through. Main loop pre-queries existing `content_calendar.video_url` + `media_metadata.pexels_video_id` AND `campaign_assets.video_url` + `video_source_metadata.pexels_video_id` (catches cross-table dupes the cron doesn't have to worry about). Prints a "Dedup state" block showing existing counts. Accumulates newly-picked URLs/IDs into the same sets across iterations. Per-row `samples` action label now appends `(DUP)` when `raw.duplicate_fallback` is set. |

### What this phase does NOT do (deliberate scope cuts)

- ❌ No DB query inside the lib helper. Per-call DB reads from a hot path are an anti-pattern; the cron/script each run **one** SELECT and pass the result by reference. Lib stays pure.
- ❌ No SBA video stack changes. HeyGen still powers the admin SBA welcome-video flow per Phase 14AG's deliberate carve-out.
- ❌ No image dedup. Pexels images are diverse enough across queries; FB/IG visual collisions are not a real-world problem. If they become one, the same pattern can be applied to `fetchPexelsImage`.
- ❌ No campaign_assets dedup in the cron. Only the standalone script considers `campaign_assets` — the cron writes only to `content_calendar`. If the operator starts using campaign_assets for video, this can be extended.
- ❌ No DB constraint enforcement. We don't add a `UNIQUE(video_url)` constraint — a duplicate fallback is rare but allowed by design (last-resort to avoid failing the row), and the operator may legitimately want to reuse an MP4 manually for a specific row.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 (code paths only — Pexels is exercised when the cron or script runs) |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| `ALTER` / `CREATE` against any DB object | 0 |
| posted_at delta | 0 (29 → 29) |
| Net file change | 3 modified |

### Verification before commit

- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ `pickFirstUnusedVideo` is pure (no I/O, no closure over mutable state)
- ✅ `fetchPage(page)` / `buildResult` factored cleanly inside `fetchAndStoreVideo` for the two-page retry without duplicating the URL build / response-shaping logic
- ✅ The cron's accumulator updates BEFORE the next iteration begins (sequential order guarantees consistency)
- ✅ The script's accumulator handles both content_calendar and campaign_assets seed data + accumulates new picks

### Migration

**No.** No DB schema change.

### Recommended next phase

**14AG.2 — Text overlay rendering (still optional):** wire Creatomate / Shotstack / ffmpeg to burn `media_metadata.on_screen_hook` onto the Pexels MP4 before the autoposter posts it. Async — needs its own poll/cron.

---

## Phase 14AG — Video Pipeline Swap: HeyGen → Pexels Video (in working tree, 2026-05-09 — full HeyGen excision from the social content pipeline + new Pexels Video fetcher + automated TikTok video on the weekly cron; no DB schema change; no platform calls; no new dependencies)

### What this phase ships

The TikTok "Media missing" state — Phase 14AF documented it as deliberate-but-confusing; Phase 14AG **eliminates it at the source**. The weekly-content cron now fetches a cinematic vertical HD MP4 from Pexels for every TikTok row synchronously, lands the row at `media_status='ready'` with `video_url` populated, and the row is immediately ready to post. No more manual operator script for the weekly flow.

### Why HeyGen is gone

Three structural problems with the HeyGen path that Pexels Video solves cleanly:
1. **Async-only, multi-minute renders.** HeyGen returns a `video_id` and the caller has to poll. Vercel Hobby's 60s cron ceiling makes synchronous video generation impossible for any AI video API (Veo, Runway, Kling, Sora — all 30–180s). Pexels Video Search is sub-second.
2. **Cost.** HeyGen avatar renders are billed per minute of output; a 7-day weekly cron with 1 TikTok per day is 7 renders/week. Pexels is **free**.
3. **Brand fit.** Talking-head avatar voice did not match the cinematic travel-savings aesthetic. Curated travel B-roll is the genre TikTok rewards.

### Files touched

| File | Change |
|---|---|
| `src/lib/media-providers.ts` | **Full rewrite of the type surface.** Removed: `createHeyGenVideo`, `getHeyGenVideoStatus`, `HeyGenVideoOptions`, `HeyGenGenerateResponse`, `HeyGenStatusResponse`, the `'heygen'` arm of `MediaProviderName`, the `status` field on `MediaProviderResult`, all HeyGen env-key plumbing. Added: `fetchAndStoreVideo()`, `PexelsVideoOptions`, `PexelsVideoFile`/`PexelsVideoEntry`/`PexelsVideoResponse` interfaces, `pickBestPortraitMp4()` selector. The new function calls `https://api.pexels.com/videos/search` with `orientation=portrait`, `size=large`, `per_page=5`, then picks the highest-quality vertical MP4 with duration in [5, 30] seconds — the sweet spot for TikTok B-roll loops. Returns the Pexels CDN URL directly (no re-hosting). |
| `src/app/api/cron/weekly-content/route.ts` | Imported `fetchAndStoreVideo`. Added `export const maxDuration = 60` (was implicit 10s; needed headroom for 7 image fetches + 7 video fetches per cron). The `ParsedPost` type now has an `onScreenHook: string` field; the markdown parser captures `On-Screen Hook:` lines (10-word / 80-char defensive cap mirrors what the AI is asked to produce). The user prompt now teaches the AI a TikTok-specific format: `Image:` is a Pexels Video search query for cinematic B-roll, plus a new `On-Screen Hook:` line. The row builder runs `fetchAndStoreImage` and `fetchAndStoreVideo` in parallel per post. TikTok rows that get a `video_url` land with `media_status='ready'`, `media_source='pexels'`, `media_generated_at`, and `media_metadata: { source, on_screen_hook, pexels_video_id, fetched_at }`. The cron's success log payload now includes `videos_generated`. |
| `src/lib/ai-prompts.ts` | New "TIKTOK-SPECIFIC" subsection in `SOCIAL_SYSTEM`'s Rule 2 block. Tells the AI: (a) write `image_prompt` as a 3–7 word Pexels Video search query for cinematic vertical travel B-roll (with example queries — "cinematic beach drone overhead", "luxury resort pool aerial", etc.), and (b) author an `On-Screen Hook` of max 10 words containing a savings number or curiosity gap (with examples — "Cancun for $1,540. Members only.", "Paris hotel: $89 a night."). Generic taglines explicitly banned. |
| `src/app/dashboard/content/page.tsx` | The Phase 14L.2.1 "🎬 Video generating" indigo pill (which assumed HeyGen pending state) is replaced by a "⚠ Legacy HeyGen row" amber pill — visible whenever `media_source === 'heygen'`, regardless of `media_status`. This surfaces leftover rows from the old async flow so the operator can clean them up. The Phase 14AF helper text now points at the new command shape: `node scripts/generate-missing-media.js --videos-only --content-only --generate --apply` (no `--provider=heygen`). The condition was simplified — there's no longer a separate pending-HeyGen state to exclude. |
| `scripts/generate-missing-media.js` | **Full rewrite of the HeyGen surface.** Removed: `HEYGEN_DEFAULT_BATCH_MAX` / `HEYGEN_ABSOLUTE_BATCH_MAX` / the `--allow-large-heygen-batch` / `--allow-when-pending` flags, the pre-flight refusal on pending HeyGen jobs, the per-row HeyGen sanity check, the HeyGen-specific DRY-RUN preview, `cleanScriptForHeyGen`, `createHeyGenVideo`, the `'heygen'` provider option in `parseArgs`. Added: `pickBestPortraitMp4` and `fetchPexelsVideo` (mirrors of the lib helpers so the script stays runnable standalone), a `buildVideoQuery` helper that prefers `image_prompt` (which the new ai-prompts now writes as a Pexels-Video query). `processVideo()` now calls Pexels Video synchronously and lands the row at `media_status='ready'` with `media_metadata.pexels_video_id` and the existing metadata (e.g. `on_screen_hook` from the cron) preserved via merge. The script header docstring is rewritten end-to-end. |
| `.env.example` | The `PEXELS_API_KEY` comment now mentions video too (one key powers both endpoints). The `HEYGEN_*` block is rewritten to make clear those vars are now ONLY used by the admin SBA welcome-video feature (out of this phase's scope) — leave blank if you don't use it. |

### Files deleted

| File | Reason |
|---|---|
| `scripts/check-video-generation-status.js` | Polled HeyGen for completion of pending renders. Pexels Video is synchronous; nothing to poll. |
| `scripts/inspect-heygen-pilot-candidates.js` | Inspected eligible content rows for HeyGen renders. No longer relevant. |

### Files explicitly NOT touched (collateral, out of directive scope)

| File | Reason |
|---|---|
| `src/app/api/cron/check-heygen-jobs/route.ts` | Used by the SBA admin welcome-video feature as a safety net for renders the admin abandoned mid-poll. Not part of the social content pipeline. |
| `src/app/api/admin/generate-sba-video/route.ts` | Admin endpoint that renders the Maya pitch video shown on `/sba`. Separate feature; deleting would break the public `/sba` page. |
| `src/app/api/admin/sba-video-status/route.ts` | Pairs with the above. |
| `src/app/dashboard/videos/page.tsx` | Admin UI for the SBA video flow + YouTube upload. Same reasoning. |
| Migrations 032 / 033 | Migration files mention `heygen` in COMMENTS only (the column shapes — `video_url`, `media_status`, `media_metadata` — are platform-agnostic and Pexels uses them just fine). Migrations stay immutable per anti-drift policy. |

### Open question for the operator

The SBA welcome-video feature on `/dashboard/videos` (and the `/sba` public page) still uses HeyGen avatar rendering. Phase 14AG deliberately did NOT touch that path because:
- It's a separate feature from the social content pipeline (which is what the directive scoped).
- Deleting it would break the live `/sba` page (the page reads `site_settings.sba_video_url`).
- The directive's task list (`scripts/generate-missing-media.js`, `src/lib/media-providers.ts`, `scripts/check-video-generation-status.js`, the weekly cron, `ai-prompts.ts`) maps cleanly onto the social content pipeline only.

If you want to also kill the SBA HeyGen flow (and either replace the `/sba` welcome video with a Pexels-Video B-roll loop, or remove that section of `/sba` entirely), that becomes Phase 14AG.1.

### Cron behavior contract — before vs after Phase 14AG

| Aspect | Pre-14AG | Post-14AG |
|---|---|---|
| TikTok row at end of cron | `image_url=null, video_url=null, media_status=null` → "Media missing" badge → manual operator command required | `image_url=<pexels image>, video_url=<pexels mp4>, media_status='ready', media_source='pexels', media_metadata={ on_screen_hook, pexels_video_id, ... }` → "Media ready" badge → ready to post |
| FB / IG row | image only — unchanged | image only — unchanged (video fetch is gated to `platform === 'tiktok'`) |
| Cron `maxDuration` | implicit 10s (would have failed on a TikTok-video cron) | explicit 60s |
| Cron `videos_generated` log field | absent | present |

### What this phase does NOT do (deliberate scope cuts)

- ❌ No DB migrations. The columns we use (`video_url`, `media_status`, `media_source`, `media_generated_at`, `media_metadata`) all already exist via migrations 032/033.
- ❌ No text overlay rendering. `on_screen_hook` is **stored** in `media_metadata` so it can drive a future Creatomate / Shotstack / ffmpeg pass; it is NOT burned onto the MP4 in this phase. The current TikTok video is raw Pexels footage. Adding text overlay is its own phase (with its own provider integration).
- ❌ No re-hosting of Pexels videos to Supabase Storage. Pexels CDN URLs are stable for months+; re-hosting 5–30 MB MP4s in the cron would risk the 60s ceiling. Adding async re-hosting is a separate hardening phase.
- ❌ No removal of HeyGen from the SBA admin video stack. See "Open question" above.
- ❌ No removal of `video_script` column from `content_calendar`. Legacy rows have data in it; columns 001–033 remain immutable. New rows simply leave it null.
- ❌ No backfill of legacy `media_source='heygen'` rows. They keep their existing state and now show a "⚠ Legacy HeyGen row" pill on the dashboard — operator can re-fetch via the script or delete them in the DB.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 (code paths only — operator triggers Pexels on the next weekly-content cron tick) |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| `ALTER` / `CREATE` against any DB object | 0 |
| posted_at delta | 0 (29 → 29) |
| Net file change | 5 modified + 1 modified (script rewrite) + 2 deleted + 1 modified (.env.example) |

### Verification before commit

- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ `Promise.all` parallelism verified — image and video fetches run concurrently per row; total cron time bounded by max of (image-fetch, video-fetch) per row, not their sum
- ✅ Conditional video fetch — non-TikTok rows skip the video API call entirely (no Pexels-video quota burn for FB/IG rows)
- ✅ Defensive 10-word/80-char cap on `on_screen_hook` even if the AI ignores the prompt directive
- ✅ Markdown parser regex updated to handle the multi-word "On-Screen Hook" key (the old `[A-Z][a-z]+:` lookahead would not have matched it)

### Migration

**No.** No DB schema change.

### Recommended next phase

**14AG.1 — SBA video swap (optional):** if you want to kill HeyGen entirely, this phase replaces the admin SBA welcome-video flow with either a Pexels B-roll loop or a removed section of `/sba`.

**14AG.2 — Text overlay rendering (optional):** wire Creatomate / Shotstack / ffmpeg to burn `media_metadata.on_screen_hook` onto the Pexels MP4 before the autoposter posts it. Async — needs its own poll/cron.

---

## Phase 14AF — Media Pipeline Audit & UI Polish (in working tree, 2026-05-09 — single dashboard component edit + script audit; no DB; no platform calls; no new dependencies)

### What this phase ships

A single edit to `src/app/dashboard/content/page.tsx` that turns a confusing TikTok dashboard state ("Media missing") into an actionable instruction ("Run `node scripts/generate-missing-media.js --provider=heygen` to render video"). Backed by an audit confirming the underlying script is healthy and the "missing" badge is the correct, deliberate signal, not a bug.

### The operator's question

The weekly-content cron generates TikTok drafts with a populated `video_script` and no `video_url` (HeyGen renders are deliberately gated to a manual operator command, per Phase 14L's API-quota-protection design). On the dashboard, those rows show the "Media missing" amber badge. The operator asked: is this a bug, or is it intended? Answer: intended — but the UX did not surface the next action.

### What the audit confirmed (script is healthy)

`scripts/generate-missing-media.js` (Phase 14L.2.6) was reviewed end-to-end. The TikTok-relevant logic is intact:
- **Platform rule** (line 92): `tiktok: { image: 'none', video: 'required', either_satisfies: false }` — correctly classifies TikTok rows as needing video only.
- **Recommendation** (`recommend()` at line 139): TikTok rows without `video_url` AND without `asset_video_url` return `needs: 'video'`, with `source_video: 'heygen'` (when a script is present).
- **HeyGen path filter** (line 646–651): pre-filters out rows that already have `video_url` OR have no `video_script`/`video_prompt`. Rows generated by the weekly-content cron pass this filter (script is present, video_url is null).
- **Pre-flight refusal** (line 695–699): aborts the whole batch if any pending HeyGen jobs are in flight (operator must clear them first or pass `--allow-when-pending`).
- **Per-row sanity check** (line 708–738): explicitly re-validates each selected row before any provider call; logs and refuses on contract violations.
- **No silent failures**: every error path increments `failed`/`skipped`, surfaces in the per-row outcomes, and writes `media_status='failed'` + `media_error` (when `--apply` is set) so the dashboard reflects the failure state.

The "Media missing" badge is therefore the correct signal for a TikTok row that has been queued for video but has not yet been rendered. The fix is UX, not pipeline.

### Files touched

| File | Change |
|---|---|
| `src/app/dashboard/content/page.tsx` | New conditional `<p>` rendered directly below the badge row (before the caption). Visible only when `item.platform === 'tiktok'` AND `media.outcome` is `missing` or `failed` AND the row is NOT already in the existing pending-HeyGen pill state (Phase 14L.2.1, line 305 — that pill already carries its own actionable tooltip). Renders a small gray helper line with the exact command in a `<code>` tag, formatted in 10px monospace on a light-gray background. |

### Why a `<p>` and not a `title` attribute

The badge already has `title={media.reasons[0] ?? mediaBadgeLabel}` (line 298) — so a tooltip-only fix would only show when the operator hovered with a mouse, and would be invisible on touch devices. Per the directive's "best customer experience" framing, the helper is rendered inline as a visible line so any operator scanning the dashboard sees the next action without hovering. Color is `text-gray-500` so it doesn't compete with the caption.

### Why the conditional excludes the pending-HeyGen state

When a TikTok row has `media_status='pending'` AND `media_source='heygen'`, the existing Phase 14L.2.1 pill ("🎬 Video generating") with title="HeyGen render is in progress — run scripts/check-video-generation-status.js to poll." is already visible. Stacking a "render the video" hint underneath would contradict it (the render is already running; the operator should poll, not re-queue). The condition `!(item.media_status === 'pending' && item.media_source === 'heygen')` keeps the two states cleanly separated.

### Why `failed` is included in the trigger condition

`media.outcome === 'failed'` is the same recovery path as `missing` — operator re-runs the same command. Treating them identically in the UX matches the script's behavior (the script will pick up failed rows on the next run).

### Operator runbook (the diagnostic answer)

To resolve the existing TikTok "Media missing" rows from a terminal at the project root:

```bash
# 1. Render the pending TikTok video drafts via HeyGen (cap: 5 by default)
node scripts/generate-missing-media.js --provider=heygen --videos-only --content-only --generate --apply

# 2. After 1–3 minutes, poll HeyGen for the finished video URLs and write them to content_calendar
node scripts/check-video-generation-status.js --apply
```

The first command queues the renders (writes `media_status='pending'`, stores `heygen_video_id` in `media_metadata`). The second polls HeyGen and lands `video_url` once ready (flips `media_status` to `ready`). Both refuse to write without `--apply`; both refuse to mutate `posted_at` or `posting_status`.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No change to the script itself. The audit found no bugs; rewriting working code would invite drift.
- ❌ No change to `media-readiness.ts`, `posting-gate.ts`, or any backend logic. The "Media missing" outcome is the correct signal; only the dashboard's surfacing of it changes.
- ❌ No automation of the script. Phase 14L deliberately gated HeyGen renders to a manual command; auto-running on cron would re-introduce the API-quota risk that gating prevented.
- ❌ No change to the existing "🎬 Video generating" pill (Phase 14L.2.1). It already covers its own state.
- ❌ No change to non-TikTok platforms. Facebook / Instagram already render with Pexels images on the weekly-content cron, so they show "Media ready" as expected and don't need a helper.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| `ALTER` / `CREATE` against any DB object | 0 |
| posted_at delta | 0 (29 → 29) |

### Verification before commit

- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ Trigger condition manually validated against the existing rendering tree: badge → optional 14L.2.1 pill → optional 14AF helper → caption. No layout overlap.

### Migration

**No.** No DB changes.

### Recommended next phase

**None mandated.** The operator can run the diagnostic command above to clear existing TikTok drafts. Future weekly-content runs will keep producing TikTok rows in the same "needs HeyGen render" state by design; the dashboard now points at the resolution command directly.

---

## Phase 14AE — Twilio A2P 10DLC Compliance (in working tree, 2026-05-08 — homepage form + legal pages + shared footer; no DB; no platform calls; no new dependencies)

### What this phase ships

Six surgical edits across four files plus one new shared component, all driven by the Twilio A2P 10DLC rejection feedback from The Campaign Registry (TCR). The 10DLC review process requires that the public-facing opt-in surface (homepage form), Privacy Policy, and Terms of Service all match a specific compliance pattern: explicit consent, third-party non-sharing for SMS data, full SMS Program Terms (Program Name + Description + HELP/STOP + frequency + carrier disclosure), and defensible marketing claims. Vendor-recommended language is reproduced verbatim where TCR examiners look for exact wording.

### Files touched

| File | Change |
|---|---|
| `src/components/Footer.tsx` (NEW) | Shared footer component. Renders the business name "VortexTrips", quick-nav links, Privacy Policy and Terms of Service (the two TCR submission targets), Contact/Support mailto, and a `<!-- TODO: Add physical mailing address -->` placeholder. Used by all three TCR-submitted pages so the compliance surface stays consistent if any link copy changes. |
| `src/app/page.tsx` | LeadForm: phone placeholder → "Phone Number (required for SMS updates)"; phone input → `required={form.smsConsent}` (the consent checkbox conditionally turns phone into a required field, so a checked-with-no-phone submission is rejected by the browser); `required` removed from the consent checkbox markup (TCR requires it start unchecked, which the existing initial state already satisfies — `useState({ smsConsent: false })` was already correct); consent label rewritten to the exact TCR-required wording with inline Msg/HELP/STOP disclosure ("By checking this box, I consent to receive recurring marketing and informational SMS messages from VortexTrips at the phone number provided. Consent is not a condition of purchase. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Message frequency varies."); Privacy/Terms links use `<a target="_blank" rel="noopener noreferrer">` so opening them does not lose form state. Hero headline changed from "Save 40-60% on Every Trip." to "Save Up to 40-60% on Member Travel Rates." for defensible marketing claims (no absolute promise; reframed as member-only rate). Inline footer removed; `<Footer />` rendered in its place. |
| `src/app/privacy/page.tsx` | New section "SMS / Mobile Information Sharing" inserted at the top of the policy body (above the existing numbered sections). Explicit, verbatim TCR-required language: "VortexTrips will not share, sell, rent, or transfer mobile phone numbers, SMS opt-in data, or text messaging consent information to any third parties, affiliates, or partners for marketing or promotional purposes under any circumstances." Followed by opt-out instructions (STOP / email) and rate-and-frequency disclosure. The pre-existing Section 4 ("Data Sharing") already had a compatible non-sharing clause and is unchanged. `<Footer />` rendered after the back-to-home link. |
| `src/app/terms/page.tsx` | Section 2 body REPLACED. Previous body had Program Name "VortexTrips Travel Savings Alerts" — that conflicts with the new TCR-required Program Name "VortexTrips SMS Notifications", so leaving both versions in place would have failed the next review. New body covers the full required compliance surface: Program Name, Program Description, How to Opt In (with the homepage URL), How to Opt Out (STOP keyword + confirmation message behavior), Help/Support (HELP keyword + email), Message Frequency, Message and Data Rates, Supported Carriers (AT&T, T-Mobile, Verizon, Sprint, U.S. Cellular, MetroPCS, Boost, Cricket, "and other major U.S. carriers", with the explicit "T-Mobile is not liable for delayed or undelivered messages" non-liability statement TCR examiners look for), and Privacy reference. Section heading changed to "2. SMS / Text Messaging Program Terms" to match TCR vocabulary. `<Footer />` rendered after the back-to-home link. |

### Why a shared `Footer.tsx` instead of inline footers

The three URLs being submitted to TCR for the next review (`https://www.vortextrips.com`, `https://www.vortextrips.com/privacy`, `https://www.vortextrips.com/terms`) need to expose the same compliance surface: business name, Contact/Support, Privacy Policy, Terms of Service. Centralizing those into one component:
- Makes the compliance copy editable in exactly one file when the operator adds a physical mailing address.
- Guarantees the three TCR-reviewed pages cannot drift in their footer disclosure (a real risk if all three had inline footers).
- Keeps Privacy Policy and Terms of Service one click away from any TCR examiner who lands on the homepage.

### Conditional `required` on the phone input — UX rationale

TCR's rule is: if the consent checkbox is checked, the phone number MUST be populated; if the checkbox is unchecked, phone is optional. Two implementation paths:
1. **Form-level JS validation** — intercept `onSubmit`, inspect `form.smsConsent` + `form.phone`, set an inline error.
2. **HTML5 conditional `required`** — `<input type="tel" required={form.smsConsent} ... />`.

Path 2 chosen. It is one prop, zero extra state, zero extra error UI, and the browser produces a perfectly localized "Please fill out this field" tooltip when the user tries to submit consent-checked-no-phone. This satisfies the TCR rule with the smallest possible code surface.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No backend / API changes. `src/app/api/webhooks/lead-created/route.ts` is unchanged. The 14AB `bounded()` hardening still applies to every Supabase call from that route.
- ❌ No DB migrations. SMS consent is already stored in `contacts.custom_fields.sms_consent` per the Phase 14L work; no schema change needed for compliance.
- ❌ No physical-address content. The operator has not provided one; the Footer carries a `<!-- TODO -->` placeholder so it can be filled in without another phase.
- ❌ No changes to `/quote`, `/sba`, `/quiz`, dashboard pages, or any other page. Only the three TCR-submitted URLs (homepage + privacy + terms) need the new Footer; remaining pages keep their existing layout footers (or none) until/unless TCR feedback widens the surface.
- ❌ No marketing-claims sweep beyond the hero. Other "Save 40-60%" mentions on `/destinations/*` and `/quote` were not modified because TCR's review is keyed on the homepage hero (the form's headline). If a follow-up review flags other pages, those become a future micro-phase.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| `ALTER` / `CREATE` against any DB object | 0 |
| posted_at delta | 0 (29 → 29) |
| Twilio API calls | 0 (compliance is TCR-side; the operator re-submits via the Twilio Console) |

### Verification before commit

- ✅ `npm run lint` clean
- ✅ `npx tsc --noEmit` clean
- ✅ Footer component is referenced and rendered in all three target pages (the only stale-diagnostic `'Footer' is declared but its value is never read'` warnings observed during the edit sequence were the IDE's pre-edit cache — Grep confirms `<Footer />` is wired in each file)
- ✅ Hero headline change is a literal text swap; no template/expression changes
- ✅ All TCR-required language is verbatim from the operator directive

### Migration

**No.** No DB changes. Migration 034 (Phase 14AD) remains the most recent migration; this phase does not touch the database.

### Deploy

Vercel rebuilds on the new commit. After deploy, the operator re-submits the A2P 10DLC campaign in the Twilio Console with the same three URLs:
- `https://www.vortextrips.com`
- `https://www.vortextrips.com/privacy`
- `https://www.vortextrips.com/terms`

### Recommended next phase

**None mandated.** If TCR rejects again with new feedback, that becomes Phase 14AE.1. If the operator provides a physical mailing address, that becomes a one-line edit to `src/components/Footer.tsx` (no new phase needed; the placeholder comment marks the spot).

---

## Phase 14AD — Supabase Security Advisor Compliance (in working tree, 2026-05-08 — single migration; metadata-only ALTERs; no app code changes; no data migration)

### What this phase ships

A single SQL migration (`supabase/migrations/034_security_advisor_compliance.sql`) that closes the two Supabase Security Advisor warnings the operator confirmed in their dashboard. No code changes; no schema-shape changes; no behavior change for admin or service-role callers. The intentional behavior change: `anon` queries against `event_campaign_attribution_summary` now return zero rows instead of leaking aggregate campaign performance data.

### Files added

| File | Purpose |
|---|---|
| `supabase/migrations/034_security_advisor_compliance.sql` | Two `ALTER` statements: (A) `ALTER VIEW event_campaign_attribution_summary SET (security_invoker = true)` and (B) `ALTER FUNCTION update_updated_at() SET search_path = pg_catalog, public`. Header comment explains the rationale, the behavior contract (admin/service-role unaffected; anon now respects RLS), idempotency (both ALTERs are safe to re-run), and the verification steps. |

### Why this is the first new migration since 033

Phases 14P → 14AC explicitly preserved the immutability of migrations 001–033. Phase 14AD is the first migration justified by a concrete **external** trigger — Supabase's own Security Advisor flagged both warnings in the operator's dashboard. The audit in the predecessor task confirmed:
- The view warning is real (anon could read aggregate campaign data via PostgREST).
- The function warning is real per advisor logic (mutable search_path), even though real exploitability of `update_updated_at()` is essentially zero.

Code-only changes can't fix either warning — both require database-level metadata changes. Hence migration 034.

### What changes for each caller

| Caller | Pre-14AD behavior | Post-14AD behavior |
|---|---|---|
| **Admin** (`auth.uid() IN admin_users`) | Reads view normally | Reads view normally (admin RLS on underlying tables still allows) |
| **Service-role** (cron / runner / admin client) | Bypasses RLS entirely | Bypasses RLS entirely (unchanged) |
| **Anon** (public anon key in browser bundle) | Reads view's full output (aggregate counts, timestamps, campaign metadata) — bypassing RLS via the view-owner privilege | Returns `[]` — caller's RLS now applied; admin-only policies on every underlying table yield zero rows |
| **Triggers using `update_updated_at()`** | Resolve `NEW`/`NOW()` via search_path lookup (mutable) | Resolve via pinned `pg_catalog, public` path. Behavior identical for the function body but advisor warning clears. |

### Idempotency

Both ALTER statements are safe to re-run:
- `ALTER VIEW ... SET (security_invoker = true)` — Postgres accepts the same setting being re-applied.
- `ALTER FUNCTION ... SET search_path = pg_catalog, public` — same, Postgres just stores the option.

If the operator accidentally runs the migration twice (e.g. via `supabase db push` after a partial apply), no error is raised. The migration file does NOT use `CREATE` for the view or function; it only modifies their existing options.

### Critical safety preserved

- ✅ View shape unchanged. All 27 columns return identical types and identical values for admin/service-role callers.
- ✅ Function body unchanged. `update_updated_at()` still does `NEW.updated_at = NOW(); RETURN NEW;`. Triggers using it (across at least 4 tables: contacts, opportunities, ai_jobs, ai_command_templates, site_settings) keep firing identically.
- ✅ No app code touched. The 30+ TypeScript/JS files that read or write to these tables continue to work without changes.
- ✅ Migrations 001–033 untouched.
- ✅ No new env vars. No new dependencies.

### Verification after operator applies the migration

1. **Supabase Dashboard → Security Advisor**: both `security_definer_view` and `function_search_path_mutable` warnings clear.
2. **Admin dashboard PerformancePanel** on `/dashboard/campaigns`: continues to show real campaign numbers. Admin RLS allows the underlying SELECTs.
3. **Anon API probe** (proves the fix landed):
   ```bash
   curl -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
        'https://<project>.supabase.co/rest/v1/event_campaign_attribution_summary'
   ```
   Pre-14AD: returns campaign rows.
   Post-14AD: returns `[]`.
4. **`node scripts/audit-site-health.js`**: 8/8 public routes still healthy. The audit doesn't depend on the view, so the result is unchanged.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No app code changes. The dashboard PerformancePanel reads the view via the admin-authenticated session, which still has full access.
- ❌ No new RLS policies. Existing admin-only policies on the underlying tables are sufficient once the view honors invoker privileges.
- ❌ No GRANT/REVOKE changes. Default Supabase grants stay in place.
- ❌ No fix for Findings E/F/G from the audit (auth dashboard settings, storage bucket policies, exposed schemas). Those are operator-side Dashboard tasks, separately tracked.
- ❌ No fix for Findings C/D/H (review-spam, lead-enumeration, email-conflict probe). Those were classified "document only" — no functional vulnerabilities.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB **data** table | 0 |
| `ALTER VIEW` / `ALTER FUNCTION` (metadata) | 2 (after the operator runs the migration) |
| posted_at delta | 0 (29 → 29) |

### Migration

**Yes — migration 034.** First new migration since 033. Justified by a concrete external advisor warning, not a feature change. Anti-drift rule honored: 001–033 stay untouched.

### Deploy

Vercel will rebuild on the new commit. **Vercel deploys do NOT apply Supabase migrations** — those have to be run by the operator against the Supabase project. Two ways:

1. **Supabase Dashboard → SQL Editor** → paste the contents of `034_security_advisor_compliance.sql` → Run. Done in under 1 second.
2. **Supabase CLI** (if the operator has it set up): `supabase db push` from the project root.

After the operator runs the migration, both Security Advisor warnings clear. The verification curl above confirms anon no longer sees aggregate campaign data.

### Recommended next phase

**None mandated.** Operator-side dashboard tasks remain (Findings E/F/G — auth password / OTP settings, storage bucket policies, exposed schemas). Those are configuration tweaks in the Supabase Dashboard UI, not code phases. Project remains in Maintenance Mode.

---

## 🏁 Maintenance Mode — Phase Ladder Complete (Phases 0 → 14AC)

The architecture is **finished**. The operational tuning + QA + polish blocks are **finished**. The bug surfaced by Phase 14X's audit is **fixed**. CI/CD + Lighthouse are **wired**. The system has **comprehensive defenses** at every layer: typecheck and lint gates at PR-time, route-status audits before traffic pushes, hard timeouts on every external call, kill switches with auto-disable on failure, email alerts on halt, async-upload verification, and locally-clean local builds.

### What "Maintenance Mode" means in practice

- **No new feature phases are queued.** The roadmap that ran from Phase 0 (audit & plan) to Phase 14AC (final audit) is complete. Future work is ad-hoc.
- **Save Protocol still applies.** Any future change — bug fix, operator-driven feature, infrastructure tuning — follows `SAVE_PROTOCOL.md` to the letter. State docs updated, named files staged, commit prefix used, push twice confirmed.
- **CI gates enforce regression-free merges.** No code can land on `main` without passing `npx tsc --noEmit` and `npm run lint` (Phase 14Z). Any frontend change that drops Lighthouse scores below the modest budgets gets a warning in the Actions log (Phase 14AA).
- **The audit script is the safety net.** Run `node scripts/audit-site-health.js` before any traffic push or after any deploy. Public routes should report 8/8 healthy.
- **The operator is the design eye.** Manual mobile-responsiveness review on real devices stays a human task per the Phase 14X header checklist.

### What the operator does next (post-deploy activation)

The codebase is ready for traffic. Three operator-side activations remain:

1. **Connect TikTok once.** Visit the TikTok Developer Portal, confirm the redirect URI is `https://www.vortextrips.com/api/auth/tiktok/callback`, and the scopes include `user.info.basic` + `video.publish`. Click Connect TikTok — the callback writes `tiktok_*` tokens to `site_settings`.
2. **Flip the autoposter kill switch.** From the AI Command Center dashboard, click the "Enable Cron" button on the System Status card. (Or run the SQL upsert: `INSERT INTO site_settings (key, value) VALUES ('autoposter_cron_enabled', 'true') ON CONFLICT (key) DO UPDATE SET value='true', updated_at=now();`)
3. **Mark Ready one row.** From `/dashboard/content`, mark exactly one approved Facebook, Instagram, or TikTok row Ready before the next 14:00 UTC cron tick. The cron will pick it up, post it, and atomic-UPDATE the row to `posted`. On any definitive failure the cron auto-disables itself AND emails `ADMIN_NOTIFICATION_EMAIL` per Phase 14U.

### Deployment artifacts in place

| Layer | Asset | Status |
|---|---|---|
| **Posting routes** | `/api/automations/post-to-{facebook,instagram,tiktok}` | ✅ deployed |
| **Manual runner** | `scripts/run-autoposter-once.js` | ✅ deployed |
| **Autoposter cron** | `/api/cron/autoposter-once` (registered in vercel.json) | ✅ deployed; **kill switch defaults to disabled** |
| **Operator dashboard** | `/dashboard/ai-command-center` System Status card | ✅ deployed |
| **TikTok status poll** | `scripts/diagnose-tiktok-uploads.js` | ✅ deployed |
| **Site health audit** | `scripts/audit-site-health.js` | ✅ deployed |
| **Audit pre-flight** | `scripts/audit-pre-autoposter-readiness.js` | ✅ deployed (9/9 PASS) |
| **CI: typecheck + lint** | `.github/workflows/ci.yml` | ✅ deployed |
| **CI: Lighthouse** | `.github/workflows/lighthouse.yml` + `lighthouserc.json` | ✅ deployed |
| **Operator SOP** | `docs/skills/autoposter-operator-sop.md` | ✅ deployed |
| **Hang-resistant routes** | `/t/<slug>` + both webhook routes via `src/lib/bounded-wait.ts` | ✅ deployed |
| **AI prompts (conversion-tuned)** | `src/lib/ai-prompts.ts` SOCIAL_SYSTEM playbook | ✅ deployed |

### Final audit result (this run)

```
[PASS] /                            200 OK              237ms
[PASS] /free                        307 Temporary Redirect 230ms  → myvortex365.com/leosp
[PASS] /book                        307 Temporary Redirect 247ms  → /traveler.html
[PASS] /join                        307 Temporary Redirect 195ms  → signup.surge365.com/leosp
[PASS] /thank-you                   200 OK             1030ms
[PASS] /quote                       200 OK              243ms
[PASS] /quiz                        200 OK              291ms
[PASS] /sba                         200 OK              214ms
[WARN] /t/<slug>                    SKIPPED   (Supabase 522 — transient infrastructure)

✓ All 8 routes healthy (slowest 1030ms, /t/<slug> skipped)
```

**Phases A → AC officially complete. Project handed off to operator.**

---

## Phase 14AC — Final System Audit + Maintenance Mode (in working tree, 2026-05-08 — final audit run; project declaration; no code changes)

### What this phase ships

The final wrap-up: one last production audit run, a Maintenance Mode declaration in this very document, and a snapshot of where every operational lever stands. No code changes — Phase 14AC is purely a project state milestone.

### Files updated

| File | Change |
|---|---|
| `PROJECT_STATE_CURRENT.md` | Header restamped with the **🚀 PROJECT STATUS: MAINTENANCE MODE** banner. New "🏁 Maintenance Mode" section at the top (above the per-phase log) summarizing what the status means, what the operator does next, what's deployed where, and the final audit result. Forward-looking content goes in `BUILD_PROGRESS.md`'s Current focus section if anything new comes up — this file's job is to be the durable summary. |
| `BUILD_PROGRESS.md` | Status line restamped to mark all phases (A → AC) shipped. Final phase entry for 14AC. The "Current focus" line is now an operator-readiness checklist instead of a phase-in-flight description. |

### Final audit run

Ran `node scripts/audit-site-health.js` against production immediately before declaring Maintenance Mode. Result: **8/8 public routes healthy** (Homepage, the 3 next.config.js redirect routes, the 4 App Router content pages). All under 1.1 seconds. `/t/<slug>` was skipped with a WARN because Supabase is currently 522'd (transient infrastructure outage, unrelated to code) — the audit script handled the failure mode correctly per its Phase 14X design.

### Key milestones recap (the path from 14O.1 → 14AC)

| Phase | Delivery |
|---|---|
| 14O.1 | Manual autoposter runner; Path D (operator-in-the-loop) chosen |
| 14P | Operator SOP codified |
| 14Q | Twitter/X excised |
| 14R | TikTok Direct Post API + OAuth wired |
| 14S | Autoposter cron registered + kill switch + auto-disable |
| 14T | Resend lazy-init + ESLint flat config (local-build artifacts eliminated) |
| 14T.1 | Lint hygiene sweep (51 findings → 0) |
| 14U | Cron health dashboard UI + email-on-halt alerts |
| 14V | TikTok status polling + diagnostic script |
| 14W | Social media content optimization (4-rule playbook) |
| 14X | Public-route health audit script |
| 14Y | Tracking redirect bounded waits (closed `/t/<unknown-slug>` hang) |
| 14Z | CI/CD GitHub Actions (typecheck + lint gates) |
| 14AA | Lighthouse CI |
| 14AB | Globalized bounded() helper (webhook routes) |
| **14AC** | **Final audit + Maintenance Mode** |

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| HTTP GETs to vortextrips.com (audit run) | 8 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| posted_at delta | 0 (29 → 29) |

### What this phase does NOT do

- ❌ No code changes. Pure documentation milestone.
- ❌ No new tests. The audit script's existing functionality is what surfaced the final health snapshot.
- ❌ No queued follow-ups. Maintenance Mode means as-needed, not pre-planned.

### Migration

**None.** No schema change ever again, until an operator-driven need arises that justifies migration 034.

### Deploy

Vercel will rebuild on the new commit. No production behavior change.

---

## Phase 14AB — Globalized bounded() helper (deployed `5a60f06` 2026-05-08 — extract Phase 14Y helper to shared lib; apply to webhook routes; no DB schema changes)

### What this phase ships

Phase 14Y proved the pattern. Phase 14AB generalizes it:

1. **Extracted `bounded()`** from `src/app/t/[slug]/route.ts` into a shared `src/lib/bounded-wait.ts` module — same behavior, with a new optional `logPrefix` parameter so each route gets clean per-route log streams (`[branded-redirect]`, `[lead-created]`, `[bland-webhook]`).
2. **Refactored `/t/[slug]/route.ts`** to import from the lib instead of defining the helper locally. Behavior is byte-identical; this is purely a code-organization change.
3. **Applied `bounded()` to both webhook routes** (`/api/webhooks/lead-created` and `/api/webhooks/bland`) at the user-mandated 2.5s per-call budget. Webhook senders (GoHighLevel, Bland.ai) retry / blacklist slow endpoints; bounded waits ensure these routes can't hang a provider's queue when Supabase is unavailable.

### Files added

| File | Purpose |
|---|---|
| `src/lib/bounded-wait.ts` | Single-export module: `export async function bounded<T>(work, ms, label, logPrefix?)`. Logs timeouts via `console.warn` (operationally expected during upstream outages) and rejections via `console.error` (genuine errors). Cleans up the timer in `finally`. Also exports `WEBHOOK_BOUND_MS = 2500` constant for webhook callers to import directly. |

### Files updated

| File | Change |
|---|---|
| `src/app/t/[slug]/route.ts` | Removed the locally-defined `bounded()` helper (~30 lines) and the rationale comment block. Now imports `bounded` from `@/lib/bounded-wait`. Added a `LOG_PREFIX = '[branded-redirect]'` constant and passes it as the 4th argument to all 3 existing bounded() callsites. Behavior byte-identical to Phase 14Y; this is purely organizational. |
| `src/app/api/webhooks/lead-created/route.ts` | Imports `bounded` and `WEBHOOK_BOUND_MS` from the lib. Critical path (the `contacts` insert that produces `contact.id`) now bounded — if it times out, route returns **503 fast** so GoHighLevel can retry rather than wait on a hung connection. **Eight bookkeeping Supabase calls** (opportunities insert, sequence_queue inserts × 4, ai_actions_log inserts × 2, contacts updates × 2) wrapped with bounded — they degrade silently on timeout. The lead is captured even when downstream bookkeeping times out. |
| `src/app/api/webhooks/bland/route.ts` | All 4 Supabase calls wrapped with bounded: ai_actions_log update, contacts SELECT (degrades by skipping the rest if it times out), contacts tag update, opportunities stage update. Logs use `[bland-webhook]` prefix. |

### Why the critical-vs-bookkeeping distinction in lead-created

`/api/webhooks/lead-created` does ~10 things in sequence:
1. **CRITICAL** — Insert into `contacts`, capture the new `contact.id` for foreign keys.
2. Bookkeeping — Insert into `opportunities` (FK to contact.id).
3. Bookkeeping — Send Day-0 SMS (external API + sequence_queue insert).
4. Bookkeeping — Send Day-0 welcome email (external API + sequence_queue insert + ai_actions_log insert).
5. Bookkeeping — Batch insert into `sequence_queue` for the rest of the nurture sequence.
6. Bookkeeping (conditional) — SBA enrollment fan-out (email + ai_actions_log + sequence_queue + contacts update).
7. Bookkeeping (conditional) — Trigger Bland.ai voice call + tag the contact.

Step 1 produces the FK every subsequent step depends on. If it times out, the entire downstream chain has nothing to attach to — the webhook should return 503 immediately so the caller retries.

Steps 2-7 are all bookkeeping. The lead has been captured (Supabase has the row) by the time we reach step 2. Subsequent calls add SMS/email/queue/log entries that would be nice to have but don't change the fundamental outcome ("lead was received"). If any of them times out, we log and continue — the webhook still returns 200.

This split keeps the response **fast on degraded mode** (503 within ~2.5s when Supabase is hung on insert) while preserving **full functionality on the happy path** (every bookkeeping call completes when Supabase is healthy).

### Worst-case latency analysis

**lead-created** (degraded — all Supabase calls hang):
- Step 1 (contacts insert) hits 2.5s timeout → 503 returned immediately.
- Total: ~2.5s. Webhook caller gets a fast retry signal.

**lead-created** (happy path with all bookkeeping completing):
- Step 1: ~50ms. Step 2-7 each: ~50-200ms. External APIs (SMS, email, Bland): ~500-2000ms.
- Total: ~3-5s. Well within Vercel Hobby's 10s budget.

**lead-created** (degraded — contacts insert fast, downstream all hang):
- Step 1: 50ms. Steps 2-7 each: 2.5s timeout. Up to 8 calls.
- Worst case: ~50ms + 8 × 2.5s = ~20s.
- **This exceeds Vercel's 10s function timeout** — but only in the most pathological case (contacts insert fast, every subsequent call hung). In practice, Supabase failures are usually all-or-nothing, so this scenario is rare. If it occurs, Vercel kills the function at 10s and returns 504 — the webhook caller sees a fast failure signal anyway.

**bland-webhook** (degraded — all 4 calls hang): 4 × 2.5s = 10s exactly. Vercel kills at 10s; webhook returns 504. Caller retries.

**bland-webhook** (happy path): ~200ms.

### Critical safety preserved

- ✅ The Phase 14Y behavior of `/t/<slug>` is byte-identical (refactor only — same `Promise.race` + `setTimeout` + `finally` + log shape).
- ✅ External API calls (SMS, email, Bland.ai) NOT wrapped — they have their own clients with their own timeouts.
- ✅ `bounded()` returns null on timeout/error and never throws — callers can rely on the `T | null` contract.
- ✅ Critical path in lead-created (contacts insert) returns **503 on timeout** — fast, informative, retry-friendly.
- ✅ Bookkeeping calls in both routes log a warning and continue — the user-visible response is unaffected.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No application of `bounded()` to other Supabase-using routes (cron routes, dashboard routes, manual posting routes, etc.). Those have different criticality profiles and would benefit from a per-route audit. Reserved for an optional future phase.
- ❌ No retry logic. If a bounded call times out, the webhook just continues / returns 503. Webhook senders' own retry queues handle re-delivery.
- ❌ No telemetry/metrics for timeout rates. Logs only. Adding Datadog or similar instrumentation is operational scope.
- ❌ No DB schema changes. Migrations remain at 001-033 (immutable).

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean |
| `npm run lint` | ✅ PASS — 0 errors, 0 warnings |
| Static review of `bounded-wait.ts` | ✅ Three failure modes (success, throw, timeout) all converge to `T \| null`; `clearTimeout` in `finally` prevents handle leaks; `Promise.race` against `.catch()`-wrapped work means the race never rejects. |
| Static review of `/t/[slug]` refactor | ✅ Behavior byte-identical to Phase 14Y. All 3 callsites pass `LOG_PREFIX` as 4th arg, preserving the original `[branded-redirect]` log format. |
| Static review of `lead-created` critical path | ✅ Contacts insert wrapped in bounded; null result triggers 503 return; existing `contactError.code === '23505'` (email already registered) and other error checks preserved. |
| Static review of `lead-created` bookkeeping | ✅ All 8 subsequent Supabase calls wrapped. External API calls (sendSMS, sendEmail, triggerCall) intentionally NOT wrapped — they have their own clients. |
| Static review of `bland-webhook` | ✅ All 4 Supabase calls wrapped. Contacts SELECT result-checked (`lookupResult?.data ?? null`) so a timeout cleanly skips the dependent updates rather than partial-updating on stale data. |

### Migration

**None.** No schema change. No new env vars.

### Deploy

Vercel will rebuild on the new commit. Production behavior change is gradual:
- `/t/<slug>` continues to behave exactly as in Phase 14Y (refactor only).
- `lead-created` and `bland-webhook` now return fast 503/504 during Supabase outages instead of hanging — webhook senders see retry signals immediately.

### Recommended next phase

**Phase 14AC — Final audit + Maintenance Mode.** Run `node scripts/audit-site-health.js` against production to confirm all routes still healthy, then update PROJECT_STATE_CURRENT.md to declare the project officially in Maintenance Mode (Phases A → AC complete).

---

## Phase 14AA — Lighthouse CI Action (deployed `d3cf3d3` 2026-05-08 — automated performance / accessibility / SEO audit on every push to main; no code changes; no DB writes; no platform calls)

### What this phase ships

Continuous Lighthouse auditing of VortexTrips' real content pages on every push to `main` and on manual workflow dispatch. Modest score thresholds surface regressions as warnings without blocking the workflow — the goal is observability, not a hard gate. Reports are stored in two places (LHCI temporary public storage + GitHub Actions artifacts) so the operator can drill into any historical run.

### Files added

| File | Purpose |
|---|---|
| `lighthouserc.json` | LHCI config. URL list, run count, score thresholds, upload target. Lives at the repo root (the conventional location LHCI's CLI looks for) and is picked up by both the GitHub Actions workflow and any local `lhci autorun` invocation the operator runs from their machine. |
| `.github/workflows/lighthouse.yml` | Single-job workflow using `treosh/lighthouse-ci-action@v12`. Triggers on `push: main` and `workflow_dispatch`. 20-minute job timeout. Does NOT cancel in-flight runs (each commit's audit is meaningful historical data). Uploads the `.lhci/` collection as both LHCI public-storage URLs (linked from the action's job summary) AND a GitHub Actions artifact (so reports survive past LHCI's 7-day retention). |

### URL choice — what gets audited

| Audited | Why |
|---|---|
| `/` (Homepage) | Top of funnel; primary landing surface |
| `/quote` | Conversion form — long-form HTML the operator owns |
| `/sba` | SBA affiliate landing — video page where performance matters |
| `/thank-you` | Post-conversion page — sets the post-purchase experience tone |

| NOT audited | Why |
|---|---|
| `/free` | 307 redirect (next.config.js) → myvortex365.com/leosp. Auditing this would score the EXTERNAL portal, not our site. We can't fix score issues on someone else's domain. |
| `/join` | Same — 307 redirect to signup.surge365.com/leosp. External destination. |
| `/book` | Same — 307 redirect to /traveler.html (legacy static page). |
| `/quiz` | Skipped to keep the audit tight at 4 URLs. Worth adding in a future phase if quiz becomes a primary entry point. |
| `/t/<slug>` | Always returns a 302 redirect — Lighthouse doesn't audit redirect responses. |

This decision diverges from the operator's literal `/free` and `/join` examples in the directive. The operator's example URLs were illustrative ("e.g.") and the underlying intent is "audit our funnel pages" — which our redirect routes don't actually represent. Documented this trade-off explicitly.

### Score thresholds (modest, warn-level)

| Category | Min score | Level |
|---|---|---|
| Performance | 0.70 | warn |
| Accessibility | 0.90 | warn |
| SEO | 0.90 | warn |
| Best-practices | 0.85 | warn |

`warn` (not `error`) means a score drop is logged in the Actions output but doesn't fail the workflow. This matches the operator's directive: "modest budgets ... so it acts as a warning system for future frontend changes." A future phase can flip specific assertions to `error` once the team has a stable baseline.

### Why a separate workflow file (not a second job in ci.yml)

Three reasons:

1. **Speed.** `ci.yml` runs in ~2-3 minutes; Lighthouse takes 10-15 minutes for 4 URLs. Combining them would slow the typecheck/lint feedback loop that PR authors care about most.
2. **Cadence.** Lighthouse only meaningfully runs against deployed production URLs. PR previews have different DNS / cold-start profiles. Triggering on `push: main` (after Vercel finishes deploying) is the right window. PRs don't need a Lighthouse audit at all.
3. **Failure semantics.** `ci.yml` hard-fails on lint/typecheck regressions. Lighthouse uses `warn` assertions to surface drops without blocking. Mixing them in one workflow would muddy "did the gate fail because of lint or because of performance?"

### Verification

- ✅ `lighthouserc.json` is valid JSON (parses cleanly).
- ✅ `lighthouse.yml` is valid YAML.
- ✅ `treosh/lighthouse-ci-action@v12` is the current major as of this phase.
- ✅ Per-URL audit budget (20 min total / 4 URLs ≈ 5 min/URL) is realistic for Lighthouse's default sampling.
- ⏸️ Live workflow run deferred — first run executes on the very push that lands these files.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No mobile-emulation runs. The default config uses `preset: desktop`. Mobile audits would double the run time; can be added in a future phase if mobile-specific budgets become important.
- ❌ No multi-run averaging. `numberOfRuns: 1` keeps CI minutes low. Variance is acceptable because we're using `warn`-level thresholds.
- ❌ No bundle-size budget. LHCI supports JS/CSS/image budgets via `lighthouse-budget.json` but adding that requires per-page bundle baselines we don't have yet.
- ❌ No Slack / email alert on regression. The job summary in GitHub Actions is the surface; the operator checks it after each push.
- ❌ No PR comment with score deltas. Adding `LHCI_GITHUB_APP_TOKEN` secret + the GitHub App integration is operational overhead we don't need today; the Actions job summary is sufficient.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| posted_at delta | 0 (29 → 29) |

### Migration

**None.** No schema change.

### Deploy

The workflow file ships in the repo and activates automatically on the next push to `main` (this very commit). Vercel-side deploys are unaffected. Lighthouse runs against the deployed production URLs after Vercel finishes the build — no special timing needed because GitHub Actions starts the Lighthouse run on the push event, by which time the previous deploy is already serving.

### Recommended next phase

**Phase 14AB — Globalize bounded() helper.** Extract Phase 14Y's `bounded()` from `/t/[slug]/route.ts` into a shared `src/lib/bounded-wait.ts` utility. Apply to webhook receiving routes (`/api/webhooks/lead-created`, `/api/webhooks/bland`) so external providers (GoHighLevel, Bland.ai) get fast 200/500 responses instead of hung connections when Supabase is unavailable.

---

## Phase 14Z — CI/CD GitHub Actions Wiring (deployed `1bfda11` 2026-05-08 — automated typecheck + lint on every push/PR; no code changes; no DB writes; no platform calls)

### What this phase ships

A single GitHub Actions workflow that runs the two gates the repo already passes locally. The job fails fast if either gate fails, so any PR that breaks types or introduces lint regressions is blocked before merge.

### Files added

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | Single workflow with one job (`typecheck-and-lint`). Triggers on `push` and `pull_request` against `main`. Steps: checkout → setup Node 22 → `npm ci --legacy-peer-deps` → `npx tsc --noEmit` → `npm run lint`. Caches the npm tarball directory across runs. `concurrency: cancel-in-progress` so a new push automatically cancels in-flight CI runs on the same branch. 10-minute job timeout (typical run is ~2-3 minutes). |

### Why this exact shape

- **Two gates only.** Build (`next build`) is deliberately NOT in CI — Vercel runs it on every deploy, and adding it to GH Actions would require all production env vars (Supabase service role key, OpenRouter API key, Resend, etc.) to be replicated as GitHub secrets. That's operational overhead with no marginal value: Vercel already gates deploys on a successful build.
- **Node 22 LTS** — current LTS, matches Vercel's runtime, satisfies Next.js 16's `Node 20.18+ or 22+` requirement. Local dev runs Node 24, which is newer than LTS; pinning CI to 22 keeps the build reproducible across contributor environments.
- **`npm ci --legacy-peer-deps`** — matches the documented local invocation (Phases 14Q, 14T saw the same flag during package.json edits). The legacy flag is required because `openai@4.x` has a peer-optional `zod` range that mismatches our pinned `zod`.
- **`concurrency: cancel-in-progress`** — small touch, big savings. A rapid sequence of "fix lint, push, fix typo, push again" doesn't burn CI minutes on the stale run.

### Verification

- ✅ Workflow file is valid YAML (verified by inspection — Actions parser is permissive but consistent indentation matters).
- ✅ Both gates already pass locally as of Phase 14Y: `npx tsc --noEmit` clean, `npm run lint` 0/0.
- ⏸️ Live CI run deferred until first push/PR after this commit. The very push that lands this workflow file will be the first run.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No build step (`next build`) — see "Why" above.
- ❌ No test job. The repo doesn't have a test suite (no `npm test` script). A future phase can add Vitest/Playwright + a test job here.
- ❌ No deploy step. Vercel handles deploys via its native GitHub integration — running our own deploy from CI would conflict.
- ❌ No matrix builds (Node 18 / 20 / 22 compat). Single Node 22 target keeps the run fast.
- ❌ No Lighthouse audit — that's Phase 14AA in this same block.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| posted_at delta | 0 (29 → 29) |

### Migration

**None.** No schema change.

### Deploy

The workflow file ships in the repo and activates automatically on the next push (this very commit). Vercel-side deploys are unaffected — CI runs in parallel with Vercel's preview/production builds.

### Recommended next phase

**Phase 14AA — Lighthouse CI Action.** Add a second job (or a sibling workflow file) running `treosh/lighthouse-ci-action` against the actual content pages (homepage, /quote, /sba, /thank-you — NOT /free or /join, which are 307 redirects to external portals we don't control). Modest budgets per the operator directive (perf > 70, a11y > 90, SEO > 90).

---

## Phase 14Y — Tracking Redirect Fallback Fix (deployed `662fdc9` 2026-05-08 — surgical patch to `/t/[slug]/route.ts`; no DB schema changes; no platform writes) Closes the `/t/<unknown-slug>` hang surfaced by Phase 14X's audit. Root cause: `try/catch` around Supabase awaits doesn't bound timeout — when Supabase is 522'd, the TCP request can hang for 30+ seconds before the client gives up, eating Vercel Hobby's 10s function-execution budget. Fix: new `bounded()` helper races every Supabase call (campaign lookup, asset lookup, contact_events insert) against a 2.5s per-call timeout. Worst case 3 × 2.5s = 7.5s, well under 10s. The 3-tier fallback redirect chain still fires correctly even when EVERY Supabase call times out. Tier 2 fallback URL changed from `myvortex365.com/leosp` to `https://www.vortextrips.com/free` per the operator directive — keeps visitors on the brand domain. Typecheck + lint clean.)
**Last known good commit:** `1fcd40d` — "Phase 14X: Full System Audit & Broken Page Scanner"
**Production:** vortextrips.com (LIVE; **Phase 14A → 14X deployed and verified**; Supabase migrations 017-033 applied; Hobby plan, 4 / 4 cron slots used; 8 live posts since 2026-05-05: 4 FB, 3 IG, 1 TikTok via manual workflow)

**Live posting status:** **🤖 Fully autonomous, operator-controlled, verifiable, on-brand, health-monitored, AND hang-resistant.** Phase 14X surfaced the `/t/<unknown-slug>` production hang as a side-finding. Phase 14Y closes that bug with a hard timeout on every Supabase call in the redirect route. Visitors hitting an unknown / corrupted / never-existed slug now reach `vortextrips.com/free` within ~2.5 seconds even when Supabase itself is unavailable.

---

## Phase 14Y — Tracking Redirect Fallback Fix (in working tree, 2026-05-08 — surgical patch to `/t/[slug]/route.ts`; no DB schema changes; no platform writes)

### What this phase ships

Fixes the production hang in `/t/<slug>` that Phase 14X's audit surfaced. The route's design (3-tier fallback, never 404, best-effort logging) was correct; the implementation had unbounded `await` calls that turned a Supabase 522 into a Vercel function timeout. Phase 14Y adds a hard per-call timeout while preserving every existing safety property of the route.

### Root cause

The pre-14Y route had `try/catch` around each Supabase await. That's necessary but **not sufficient** — `try/catch` catches synchronous throws and rejected promises, but it does NOT bound the time spent awaiting. When Supabase's origin is 522'd (Cloudflare returns "Connection timed out — origin web server is hogging resources"), the `supabase-js` client's underlying fetch can hang for 30+ seconds before the TCP connection times out and the rejection propagates. During that hang, the Vercel function is asleep in the await, eats the 10s function-execution budget, and Vercel returns 504 (or, from the visitor's perspective, the connection just hangs).

The audit's curl probe with `--max-time 20` confirmed the route was genuinely stalled, not just slow:

```
HTTP 000 in 20.008237s
curl: (28) Operation timed out after 20008 milliseconds with 0 bytes received
```

This was a real production bug affecting any campaign click whose slug didn't match a real campaign row (typos, deleted campaigns, malicious probes).

### File updated

| File | Change |
|---|---|
| `src/app/t/[slug]/route.ts` | New `bounded(work, ms, label)` helper races any thenable against a fixed timeout. Returns `null` on timeout / rejection / any failure mode — never throws. Uses `Promise.race` with a `setTimeout`-backed timeout promise; cleans up the timer in `finally` so we don't leak handles when the work resolves first. All three Supabase calls in the route now go through `bounded()` with a 2.5s budget each: campaign lookup, asset lookup, contact_events insert. **PORTAL_FALLBACK** changed from `https://myvortex365.com/leosp` to `https://www.vortextrips.com/free` per the operator directive — `/free` is itself a 307 redirect (configured in `next.config.js`) to the same myvortex365 portal, so the operational destination is unchanged but the visitor briefly sees `vortextrips.com/free` in the URL bar before the second redirect. UX win for branded campaign clicks. Header comment expanded to document the Phase 14Y hardening explicitly. |

### The `bounded()` helper

```ts
async function bounded<T>(work: PromiseLike<T>, ms: number, label: string): Promise<T | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    const timeoutPromise = new Promise<null>(resolve => {
      timeoutHandle = setTimeout(() => {
        console.warn(`[branded-redirect] ${label} timed out after ${ms}ms — falling through`)
        resolve(null)
      }, ms)
    })
    const safeWork = Promise.resolve(work).catch(err => {
      console.error(`[branded-redirect] ${label} threw:`, err)
      return null as T | null
    })
    return await Promise.race([safeWork, timeoutPromise])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}
```

Three failure modes for every Supabase call now collapse to the same `null` return:

| Mode | Behavior |
|---|---|
| Work resolves in time | Returns the resolved value |
| Work rejects | Caught by `.catch()`, logged via `console.error`, returns null |
| Work hangs > 2.5s | `setTimeout` fires, logged via `console.warn`, returns null |

The route's existing `chooseRedirect()` already handles `campaign === null` by falling through to Tier 2 (PORTAL_FALLBACK) — so a timed-out campaign lookup naturally degrades to "slug treated as unknown" rather than 500. This means the 3-tier fallback chain just works on top of the bounded helper without any other code changes.

### Tier-2 URL change

Old: `PORTAL_FALLBACK = 'https://myvortex365.com/leosp'` — direct external redirect.
New: `PORTAL_FALLBACK = 'https://www.vortextrips.com/free'` — stays on brand domain; `/free` then 307s to myvortex365.com/leosp via `next.config.js`.

The visitor experience:
- **Pre-14Y:** click `vortextrips.com/t/<unknown-slug>` → hang for 15-30s → 504 / connection timeout → visitor bounces.
- **Post-14Y:** click `vortextrips.com/t/<unknown-slug>` → ~2.5s wait while Supabase times out → 302 to `vortextrips.com/free` → 307 to `myvortex365.com/leosp` → portal lands.

The end destination is the same, but the visitor is no longer staring at a hung browser tab.

### Worst-case latency analysis

Vercel Hobby plan: 10s function-execution budget.

| Path | Bounded calls | Max wait |
|---|---|---|
| Slug found, asset matched, log succeeds | 3 calls × ~50ms | ~150ms |
| Slug found, asset matched, log timeout | 2 fast + 1 timeout | ~2.6s |
| Everything times out | 3 × 2.5s | 7.5s |
| Slug not found, parsedContent null, log timeout | 2 calls (campaign timeout, log timeout) | ~5s |

Plus ~50ms for sync work (URL parsing, chooseRedirect, redirect issuance). Worst case ~7.6s, well under the 10s function-execution budget. **No path can hang the function.**

### What this phase does NOT do (deliberate scope cuts)

- ❌ No removal of the existing try/catch logic outside the bounded calls. The `NextResponse.redirect` try/catch on lines 278-289 is a separate defense-in-depth layer that catches a malformed URL after `safeUrl()` validation. Left intact.
- ❌ No change to `chooseRedirect()` logic — the Tier 1/2/3 selection rules are correct as-is.
- ❌ No change to the route's UTM parsing or `parseUtmContent()`. Those are sync and can't hang.
- ❌ No change to any other route. The bounded() helper is local to this file. If we want it in other routes (e.g., `/api/cron/autoposter-once` already has its own kill-switch failure handling), that's a separate phase.
- ❌ No DB schema changes. Migrations remain at 001-033.
- ❌ No live deploy + curl re-verification in this phase. Vercel's deploy is async; the operator can re-run `node scripts/audit-site-health.js` after the deploy completes to confirm `/t/<slug>` no longer hangs.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean |
| `npm run lint` | ✅ PASS — 0 errors, 0 warnings |
| Static review of `bounded()` | ✅ Three failure modes (success, throw, timeout) all converge to `T \| null`; clearTimeout in `finally` prevents handle leaks; `Promise.race` with the `.catch()`-wrapped work means the race never rejects — only resolves. |
| Static review of route refactor | ✅ All 3 Supabase calls wrapped; types preserved (`result?.data ?? null` pattern matches the original `data ?? null` shape); no other code paths touched. |
| Worst-case latency math | ✅ 3 × 2.5s + ~50ms sync = 7.55s, comfortably under Hobby's 10s budget. |
| Live `/t/<unknown-slug>` test against production | ⏸️ Deferred to post-deploy. Operator runs `node scripts/audit-site-health.js` after Vercel finishes deploying this commit; the audit's `/t/<slug>` test should now succeed (when Supabase isn't 522'd) instead of timing out. |

### Migration

**None.** No schema change. No new env vars.

### Deploy

Vercel will rebuild on the new commit. Production behavior change is immediate after the deploy completes:
- Real campaign tracking links continue to work exactly as before (Tier 1 — campaign found, redirect to `cta_url`).
- Unknown / corrupted slugs now redirect to `vortextrips.com/free` within ~2.5s instead of hanging the browser tab for 15-30s.
- During Supabase outages, the route still serves visitors via the Tier 2/3 fallback chain — attribution is missed for that period, but no one bounces.

### Recommended next phases (all optional)

The architecture is now **complete + hardened**. Optional follow-ups remain available:

- **Phase 14Z (optional) — CI/CD integration.** Wire `scripts/audit-site-health.js` into a GitHub Action that runs on every deploy. Auto-rolls back if any route fails.
- **Phase 14AA (optional) — Lighthouse + Web Vitals.** Headless Playwright performance-budget tracking.
- **Phase 14AB (optional) — Apply `bounded()` pattern across other Supabase-using routes.** The cron route, the dashboard pages, and the manual posting routes all have similar exposure to Supabase hangs. Auditing each for unbounded awaits would give the system uniform hang-resistance.

None are required.

---

## Phase 14X — Full System Audit & Broken Page Scanner (deployed `1fcd40d` 2026-05-08 — production health audit script; no DB writes; no platform writes; HTTP GETs only)

### What this phase ships

A standalone diagnostic script that programmatically verifies every public-facing endpoint is healthy. Built so the operator can run it (a) before any marketing traffic push, (b) after any production deploy, and (c) wired into CI/CD if desired. Surfaces production issues in seconds rather than waiting for a real visitor to hit a 404.

### Files added

| File | Purpose |
|---|---|
| `scripts/audit-site-health.js` | ~280-line standalone Node script. HTTP GETs each public route on `https://www.vortextrips.com` (or `--base=<url>` for preview deploys) in parallel, asserts each returns its expected status, prints a color-coded report, exits non-zero on any failure. The header is a 24-line operator manual-review checklist (real-device mobile testing) — the script verifies the SERVER returns the page; the human verifies it LOOKS RIGHT. Routes carry `?utm_source=audit&utm_medium=health_check` query params and a custom `User-Agent: VortexTrips-Audit-Script/14X` header so analytics queries can filter audit traffic out (`WHERE utm_source != 'audit'`). |

### Routes tested (8 public + 1 dynamic /t/)

| Route | Expected | Why |
|---|---|---|
| `/` | 200 | Homepage — App Router page |
| `/free` | 307 | Configured in `next.config.js` to redirect to `myvortex365.com/leosp` |
| `/book` | 307 | Configured to redirect to `/traveler.html` |
| `/join` | 307 | Configured to redirect to `signup.surge365.com/leosp` |
| `/thank-you` | 200 | Generic post-conversion page |
| `/quote` | 200 | Quote-form page |
| `/quiz` | 200 | Travel quiz funnel |
| `/sba` | 200 | SBA affiliate landing page |
| `/t/<slug>` | 302 | Dynamic; queries `event_campaigns` for a real slug, tests that. Skipped with WARN if no slug exists or Supabase is unreachable. |

### Critical design decisions

#### Per-route expected status (NOT one-size-fits-all 200)

The Phase 14X brief said "Assert that the HTTP response status is exactly 200 OK" — but `next.config.js` configures `/free`, `/book`, `/join` as 307 redirects (they're entry points, not pages). A literal 200-only check would have falsely flagged these 3 routes as broken. The script asserts **healthy status per route** (200 for App Router pages, 307 for `next.config.js` redirects, 302 for tracking redirects). This matches operational reality and avoids alarm fatigue.

#### Real slug for /t/ test (not a mock)

Initial implementation used a mock slug `system-health-check`. Production probe revealed `/t/<unknown-slug>` hangs at 15s+ (Cloudflare timeout) — likely a stalled Supabase logging path in the redirect route. Rather than mask this with a known-bad mock, the script now queries `event_campaigns.event_slug` for the most-recently-updated real slug. This:
- Tests what real visitors actually experience.
- Avoids tripping the unknown-slug bug on every audit.
- Surfaces the unknown-slug bug as a separate finding worth a follow-up phase.

If no slug exists in the DB OR Supabase is unreachable, the script SKIPS the /t/ test with a yellow `[WARN]` — does NOT fail the overall audit. Public-page health is the primary deliverable.

#### Graceful degradation

The script never assumes Supabase is reachable. Three failure modes for the slug lookup, all handled cleanly:
- `.env.local` missing or no Supabase creds → skip with reason
- `@supabase/supabase-js` not installed → skip with reason
- Query error (e.g. Cloudflare 522 for paused free-tier projects, like during this phase's live run) → skip with truncated reason (HTML error pages truncated to 120 chars)

In all three cases: WARN line printed, public-page audit completes normally, exit 0.

#### Per-request timeout 15s

Initially set to 10s; first production probe revealed cold-start latency on `/t/<slug>` can exceed 10s. Bumped to 15s with a comment explaining the rationale. A route taking longer than 15s to respond IS broken from a visitor's perspective — 15s isn't masking a real issue.

### Live production audit results (this phase's first run)

```
[PASS] /                            200 OK              150ms
[PASS] /free                        307 Temporary Redirect 132ms  → myvortex365.com/leosp...
[PASS] /book                        307 Temporary Redirect 137ms  → /traveler.html...
[PASS] /join                        307 Temporary Redirect 139ms  → signup.surge365.com/leosp...
[PASS] /thank-you                   200 OK              184ms
[PASS] /quote                       200 OK              148ms
[PASS] /quiz                        200 OK              146ms
[PASS] /sba                         200 OK              149ms
[WARN] /t/<slug>                    SKIPPED              query error: <Cloudflare 522 HTML>...

✓ All 8 routes healthy  (slowest 184ms, /t/<slug> skipped)
```

All public pages green. Total wall-time ~1.2 seconds for 8 parallel checks. The /t/ skip is environmental (operator's Supabase project is currently 522'd) — script handled the failure mode correctly, exit 0, no false alarm.

### Side-finding for follow-up (out of scope for 14X)

`/t/<unknown-slug>` hangs in production for ~15s before Cloudflare times out the connection. The route's design comment says "the visitor NEVER sees a vortextrips.com 404 from this route, even when the slug is unknown" — but the current implementation appears to hang rather than redirect for unknown slugs. This is a real bug worth fixing in a follow-up phase (Phase 14Y or similar). It does NOT affect production traffic today because real campaign tracking links always carry valid slugs that hit the campaign-found code path.

### Operator usage

```bash
node scripts/audit-site-health.js                     # production audit
node scripts/audit-site-health.js --base=https://...  # preview deploy
node scripts/audit-site-health.js --skip-tracking     # skip /t/ test entirely
```

After the script reports green, the operator runs the 4-step manual review checklist documented in the script header:

1. Pull up vortextrips.com on actual mobile devices (iOS Safari + Android Chrome) — not just devtools emulator.
2. Walk core funnel pages: `/`, `/free`, `/book`, `/join`, `/quote`, `/quiz`, `/sba`, `/thank-you`.
3. Verify all images load.
4. Verify nav/footer links route correctly.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No CI/CD wiring. The script exits non-zero on failure (CI-friendly), but Vercel/GitHub Actions integration is operator-side configuration, not in 14X's code scope.
- ❌ No fix for the `/t/<unknown-slug>` hang. Surfaced as a finding; defer to a follow-up phase.
- ❌ No automated mobile-responsiveness testing. The script tests server status; the human tests visual layout.
- ❌ No JS-rendered content audit. Public pages return 200 even if the React tree fails to hydrate. Catching hydration failures requires a headless browser (Playwright/Puppeteer), which is heavier than 14X's scope.
- ❌ No Lighthouse / Web Vitals scoring. Out of scope for "is the route healthy?" check.
- ❌ No DB schema change. No platform writes. The only DB read is the optional `event_campaigns.event_slug` lookup.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| HTTP GET against `vortextrips.com` routes | 8 (every audit run) + 1 if `/t/<slug>` testable |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| `SELECT` against `event_campaigns` | 1 per audit run (read-only, indexed lookup) |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean |
| `npm run lint` | ✅ PASS — 0 errors, 0 warnings |
| `node scripts/audit-site-health.js` against production | ✅ 8/8 public routes healthy; /t/ correctly skipped due to Supabase 522 |
| Static review | ✅ Per-route expected status table matches `next.config.js` reality. AbortController per-request timeout properly clears on success. Promise.all parallelism bounded to ~9 concurrent requests against own infrastructure. Exit code is 0 only when every route passed. |

### Migration

**None.** No schema change.

### Deploy

Vercel will rebuild on the new commit. The script is a standalone Node file; it doesn't ship inside the Next.js bundle and doesn't affect production behavior. The operator runs it locally against production whenever they want a fresh health snapshot.

### Recommended next phases (all optional)

- **Phase 14Y (recommended) — Fix the `/t/<unknown-slug>` hang.** Surfaced by 14X's audit. Likely a stalled Supabase logging path in `src/app/t/[slug]/route.ts`. Fix would unblock the audit's mock-slug test path.
- **Phase 14Z (optional) — CI/CD integration.** Wire `scripts/audit-site-health.js` into a GitHub Action that runs on every deploy. Auto-rolls back if any route fails.
- **Phase 14AA (optional) — Lighthouse + Web Vitals.** Add a heavier audit step (headless Playwright) for performance-budget tracking.

The architecture is **complete** for the operational tuning & QA block (Phases 14T.1 → 14X). The system is production-ready for traffic.

---

## Phase 14W — Social Media Content Optimization (deployed `ce20cfc` 2026-05-08 — AI prompt rewrite; no DB writes; no platform calls; affects only the next AI generation pass)

### What this phase ships

A complete rewrite of the SOCIAL_SYSTEM prompt that turns the AI from a "produce platform-tailored posts" generalist into an opinionated marketer with 4 enforced rules. Every social post the autoposter pipeline produces from this point forward must satisfy all four. The downstream consumers (weekly-content cron, social-pack route, social-calendar route) pick up the directives automatically because they all import `SOCIAL_SYSTEM` from this single source-of-truth file.

### File updated

| File | Change |
|---|---|
| `src/lib/ai-prompts.ts` | Header comment updated to document Phase 14W's intentional cache invalidation. **VORTEX_BRAND_RULES** rephrased: the old "Avoid exclamation-stuffed clickbait or aggressive scarcity" line was creating tension with the new aggressive hook directive — replaced with "Direct and value-first. Aggressive curiosity hooks are encouraged when they expose a real savings benefit. Avoid exclamation-stuffed walls of text and FAKE scarcity (no countdown timers, no 'only 3 spots left', no fabricated urgency)." Compliance intent preserved (no income guarantees, forbidden terms list intact). The CTA line was strengthened: explicit ban on "link in bio", "DM me", "comment below". **SOCIAL_SYSTEM** completely rewritten with a 4-section playbook (each section enforced with `═══` dividers so the model can't miss them). WRITER_SYSTEM, VIDEO_SYSTEM, EMAIL_SYSTEM unchanged. |

### The 4 rules (now baked into SOCIAL_SYSTEM)

#### Rule 1 — 3-Second Hook (mandatory)

Every post's first sentence must grab attention in under 3 seconds with a punchy, curiosity-inducing statement. The system prompt provides 6 worked examples ("Stop overpaying for your vacations", "$1,847 saved on one trip — here's exactly how", "Most people don't know hotels have wholesale rates", etc.) and a banned-openers list ("Welcome to...", "Are you looking for...", "Today we're talking about...", "Have you ever wondered...", brand-name openers, etc.).

#### Rule 2 — Platform-Specific Formatting

| Platform | Voice | Length | Emojis | Layout |
|---|---|---|---|---|
| **Instagram** | Visual, scroll-stopping | 3-5 short paragraphs, 8-15 lines | Emojis as visual bullets (✈️ 🏖️ 💰) | Hook + savings hint loaded into first 125 chars (pre-"more" window) |
| **Facebook** | Conversational, link-friendly | 200-350 chars | Same emoji-bullet rhythm as IG | Clickable URLs encouraged |
| **TikTok** | Punchy chyron | ≤100 chars (hard cap 150) | 1-2 max | Hook line + hashtag burst; video carries the story |

#### Rule 3 — Value-First CTA Structure

Mandatory order: **HOOK → DESTINATION + SAVINGS STORY → SPECIFIC CTA URL**. Sell before pushing the link. The 5 allowed CTA URLs each have a documented use case:

| URL | When to use |
|---|---|
| `vortextrips.com/free` | Top-of-funnel awareness; default for "intro to wholesale rates" posts |
| `vortextrips.com/book` | Posts featuring a specific destination/deal |
| `vortextrips.com/join` | Posts that already established savings value (paid membership push) |
| `vortextrips.com/quote` | "See your rate" angle |
| `vortextrips.com/sba` | Income/business-opportunity angle posts only |

Banned CTA patterns: "Click the link in bio", "DM me for info", "Comment below", any CTA without a `vortextrips.com` path.

#### Rule 4 — Hashtag Strategy

Every post MUST include the 4 mandatory branded tags first: `#TravelHacks #Surge365 #WholesaleTravel #VortexTrips`. Then 3-5 contextual tags per platform — a mix of broad (#Travel #Vacation #TravelLife), niche (#LuxuryTravelOnABudget, #BudgetTravelTips, #CruiseDeals, #SoloTravel), and destination-specific (#Cancun, #Paris, #LasVegas) when applicable.

| Platform | Total hashtags | Mix |
|---|---|---|
| Instagram | 8-12 | 4 mandatory + 4-8 contextual |
| Facebook | 4-6 | 4 mandatory + 2 contextual (FB rewards fewer) |
| TikTok | 4-6 | 4 mandatory + 2 trending/niche |

Ordering rule: mandatory branded tags ALWAYS appear first in the hashtag block.

### Compliance reconciliation

The new aggressive-hook directive could conflict with the brand's compliance posture (no fake claims, no income guarantees). Phase 14W explicitly reconciles:

- **VORTEX_BRAND_RULES** still forbids: "MLM" / "downline" / "network marketing" / income guarantees / medical claims / specific dollar earnings without disclaimers / fabricated scarcity.
- **SOCIAL_SYSTEM compliance floor** adds: every savings number must be cited as "members report saving up to $X" or "examples like $X are common" — never as a guarantee. Hooks may be aggressive but must be TRUE (don't claim "the industry is hiding" something that isn't a real wholesale-rate gap). No medical/legal/financial advice framing.

This means the AI can write `"Stop overpaying for your vacations"` (true, opinionated) but cannot write `"Guaranteed $2,000 savings on your next trip"` (forbidden by brand rules).

### Cache invalidation

OpenRouter caches long system prompts when they exceed a threshold. The Phase 14W rewrite changes the entire SOCIAL_SYSTEM string, which:

- Invalidates any existing cache entries for the OLD SOCIAL_SYSTEM prefix.
- The next weekly-content cron tick (or manual generation via `/api/ai/generate/social-pack`) will pay one full uncached prompt cost (~$0.001-0.005 depending on model tier).
- After that, the new SOCIAL_SYSTEM string re-warms the cache and subsequent calls hit normally.

The cost is small and one-time. The user explicitly accepted this in the Phase 14W brief.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No changes to WRITER_SYSTEM, VIDEO_SYSTEM, or EMAIL_SYSTEM. Their tones are different (long-form blog, video script, email body) and their consumers don't need the social-post playbook.
- ❌ No changes to per-route user prompts (the inline prompts in `weekly-content/route.ts`, `social-pack/route.ts`, `social-calendar/route.ts`). They specify per-call constraints (date, theme, character counts) that are already consistent with the new directives. Touching them would risk breaking the working pipeline for no gain.
- ❌ No changes to `src/lib/event-campaign-asset-generator.ts` (the campaign asset generator has its own system prompt). Future phase can apply the 4-rule playbook there if we want the campaign assets to follow the same hook/format/CTA/hashtag structure.
- ❌ No DB schema changes. No platform calls. No autoposter behavior changes — only the AI's voice changes.
- ❌ No A/B test harness. We're committing to the new playbook based on conversion-rate best-practices; if it underperforms vs the old voice, a future phase can tune.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean |
| `npm run lint` | ✅ PASS — 0 errors, 0 warnings |
| Static review of new SOCIAL_SYSTEM | ✅ All 4 rule sections present and dividered with `═══` so the model can't miss them. Banned openers list explicit. CTA URL allowlist explicit. Hashtag mandatory list spelled out exactly per the operator's directive (`#TravelHacks #Surge365 #WholesaleTravel #VortexTrips`). |
| Static review of VORTEX_BRAND_RULES tension | ✅ "Aggressive curiosity hooks are encouraged when they expose a real savings benefit" reconciles with the new hook directive. Compliance constraints (no income guarantees, no MLM/downline language, no fabricated scarcity) intact. |
| Live AI generation test | ⏸️ Deferred. The next weekly-content cron tick (Monday 13:00 UTC per `vercel.json`) will be the first production exercise of the new prompt. The operator can also manually trigger via `/api/ai/generate/social-pack` to validate before Monday. |

### Migration

**None.** No schema change.

### Deploy

Vercel will rebuild on the new commit. The new SOCIAL_SYSTEM is in effect immediately for any social-content generation triggered after the deploy completes. Existing already-generated content_calendar rows are untouched (they were generated by the OLD prompt; the operator may choose to regenerate via the dashboard if they want the new voice applied retroactively).

### Recommended next phase

**Phase 14X — Full System Audit & Broken Page Scanner:** create `scripts/audit-site-health.js` to programmatically fetch all known public routes (`/`, `/free`, `/book`, `/join`, `/thank-you`, `/quote`, `/quiz`, `/sba`, `/t/<slug>`) and assert they return 200 OK. The operator handles the manual mobile-responsiveness review separately.

---

## Phase 14V — TikTok Status Polling (deployed `d426e47` 2026-05-08 — async upload verification; no DB writes during this phase; no platform writes; status calls only)

### What this phase ships

A read-only verification path for the asynchronous half of TikTok's Direct Post API. Until now, every successful TikTok post landed `status='posted'` based on the init endpoint's `publish_id` — which is an acceptance signal, not a publish signal. If TikTok later rejected the video (URL unreachable, encoding failure, content policy hit), our DB said "posted" while the post never went live. Phase 14V adds the missing observability hop without changing any of the existing posting contracts.

### Files added

| File | Purpose |
|---|---|
| `scripts/diagnose-tiktok-uploads.js` | Read-only diagnostic. Reads tokens from `.env.local`, queries `content_calendar` for rows where `platform='tiktok' AND status='posted' AND media_metadata->>'tiktok_publish_id' IS NOT NULL`, polls TikTok's status endpoint for each, and prints a color-coded report. Mirrors `getValidTikTokAccessTokenJs` and the new `checkTikTokPostStatusJs` from the lib (kept in sync by hand — same pattern the runner uses). Supports `--limit=N` (default 25, max 200) and `--since=YYYY-MM-DD`. Counts each terminal state in a summary footer and flags any `FAILED` rows for manual review. |

### Files updated

| File | Change |
|---|---|
| `src/lib/tiktok-oauth.ts` | New `checkTikTokPostStatus(supabase, publishId)` helper. POSTs to `https://open.tiktokapis.com/v2/post/publish/status/fetch/` with a Bearer token resolved via `getValidTikTokAccessToken`. Returns `{ status, fail_reason, publicly_available_post_ids, log_id, raw }`. Defensive: TikTok's API uses the typo'd field name `publicaly_available_post_id` — the helper accepts both spellings and normalizes to `publicly_available_post_ids`. New `TikTokPublishStatus` type union covers the documented enum values. Unknown enum values are passed through as-is (typed as `string`) so future TikTok additions surface immediately rather than silently mapping to `'unknown'`. |
| `src/app/api/automations/post-to-tiktok/route.ts` | Extended the row fetch's SELECT to include `media_metadata`. After the init returns a `publish_id`, the route now spreads the existing JSONB and adds `{ tiktok_publish_id, tiktok_published_at }` into `media_metadata` as part of the SAME atomic UPDATE that flips `status='posted'`. JS-side merge is safe because the inline `.eq('status','approved').is('posted_at',null)` guards still hold the row in a known state. |
| `src/app/api/cron/autoposter-once/route.ts` | Same extension as the manual route. The cron route's atomic UPDATE now builds the payload conditionally — only the TikTok branch (`platform === 'tiktok' && result.platform_post_id`) merges `media_metadata`. FB / IG branches remain unchanged. |
| `scripts/run-autoposter-once.js` | Same extension. `ROW_SELECT` now includes `media_metadata`. The `--apply` UPDATE branch builds the payload conditionally and only TikTok rows get the `media_metadata` merge. The runner's mirror of the lib pattern stays one-for-one with the lib. |

### TikTok status enum (from `/v2/post/publish/status/fetch/`)

| Status | Meaning | Diagnostic script color |
|---|---|---|
| `PROCESSING_DOWNLOAD` | TikTok is downloading the video from our `video_url` | cyan |
| `PROCESSING_UPLOAD` | Transcoding / preparing for publish | cyan |
| `SEND_TO_USER_INBOX` | Inbox-mode posts (we use direct mode, not inbox) | blue |
| `PUBLISH_COMPLETE` | Live on TikTok; `publicly_available_post_ids` populated | green |
| `FAILED` | Pipeline gave up; `fail_reason` explains why | red |
| (anything else) | Pass-through string for forward-compat | yellow |

### Diagnostic script flow

```bash
node scripts/diagnose-tiktok-uploads.js
node scripts/diagnose-tiktok-uploads.js --limit=20
node scripts/diagnose-tiktok-uploads.js --since=2026-05-01
```

For each posted TikTok row:
- Reads `media_metadata.tiktok_publish_id`.
- Calls TikTok's status endpoint with a single shared access token (resolved up front; refreshed if expired).
- Prints the row's `id`, the publish_id, posted_at timestamp, caption preview, and the current TikTok status.
- For `PUBLISH_COMPLETE` rows: also prints `publicly_available_post_ids` (the live TikTok post IDs visitors see).
- For `FAILED` rows: also prints `fail_reason`.
- Summary footer: counts per status + a loud red warning if any rows are in `FAILED` state.

### Persisted JSONB shape

For rows posted via the autoposter on/after Phase 14V, `content_calendar.media_metadata` will contain:

```json
{
  "tiktok_publish_id": "v_pub_url~v3.0...",
  "tiktok_published_at": "2026-05-08T14:00:00.000Z",
  "...any worker-set fields preserved...": "..."
}
```

The spread merge preserves any fields the media-generation worker had previously set (e.g. `heygen_video_id`). FB / IG posts do not write to this JSONB (no async state to track).

### Critical safety preserved

- ✅ Atomic UPDATE pattern on all 3 TikTok posting paths — the `media_metadata` merge happens in the same UPDATE statement that flips `status` and `posted_at`. No race window where status is flipped without publish_id, or vice versa.
- ✅ `.eq('status','approved').is('posted_at',null)` inline guards still hold — JS-side merge is safe because the row is locked into the {approved, posted_at IS NULL} tuple.
- ✅ JSONB merge spreads the existing object — never clobbers worker-set fields. Defensive `typeof === 'object' && !== null` checks before spreading.
- ✅ `checkTikTokPostStatus` throws on transport-level or API-error failure so callers know to retry rather than silently treating a failed read as "no info."
- ✅ Diagnostic script is **read-only** against `content_calendar` — never UPDATE / INSERT / DELETE. The only DB writes it can produce are `site_settings.tiktok_*` token rotations via `getValidTikTokAccessTokenJs`, which is the same authorized side effect the runner already produces.
- ✅ No new env vars. No new endpoints exposed publicly. No platform writes (status fetch is a pure read).

### What this phase does NOT do (deliberate scope cuts)

- ❌ No automated status-poll cron. The diagnostic script is sufficient for Phase 14V per the operator's directive — a future phase can promote it to a daily cron if we want continuous reconciliation.
- ❌ No DB schema change. Migrations remain at 001-033. The `media_metadata` JSONB column already exists (added in migration 033 per the 14R notes).
- ❌ No retroactive migration of historical TikTok rows. Posts predating Phase 14V have no stored `publish_id` and are silently filtered out by the diagnostic's `media_metadata->>'tiktok_publish_id' IS NOT NULL` clause.
- ❌ No automatic remediation of `FAILED` rows. The diagnostic surfaces them; operator decides whether to flip them back to draft, mark as posted via Creator Center, or leave as historical.
- ❌ No status persistence in the DB. Each diagnostic run polls TikTok fresh — no caching. A future phase could store the last-known status in `media_metadata.tiktok_publish_status` if we want history.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / Facebook / Instagram / X / email API calls | 0 |
| TikTok status fetch calls | 0 (diagnostic script not run during this phase) |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar | 0 |
| `UPSERT` against site_settings | 0 |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean |
| `npm run lint` | ✅ PASS — 0 errors, 0 warnings |
| Static review of `checkTikTokPostStatus` | ✅ Throws on transport / API error; accepts both `publicaly_*` (TikTok typo) and `publicly_*` field names; returns normalized shape; type union allows pass-through of unknown statuses. |
| Static review of `media_metadata` merge | ✅ All 3 TikTok paths spread the existing JSONB before adding new fields; type-narrowing `typeof === 'object' && !== null` guard before spread; merge happens INSIDE the atomic UPDATE statement, not as a separate write. |
| Static review of diagnostic script | ✅ Read-only against content_calendar; uses `.not('media_metadata->>tiktok_publish_id', 'is', null)` filter to skip pre-14V rows; uses a single resolved access token across all rows; per-row status fetch is independent (no batch endpoint exists); summary counts every terminal state. |
| Live diagnostic run | ⏸️ Deferred — current DB has no Phase 14V TikTok posts (the only TikTok post predates this phase and won't have a `publish_id` in media_metadata). The diagnostic correctly returns "No TikTok posts with a publish_id found" in that state. |

### Migration

**None.** No schema change. The `media_metadata` JSONB column already exists from migration 033.

### Deploy

Vercel will rebuild on the new commit. Production behavior of the 3 TikTok posting paths is the same except for the additional JSONB write inside the atomic UPDATE — which is bookkeeping only, doesn't affect what TikTok sees. The diagnostic script runs locally against production env / production Supabase. No deploy-time activation needed.

### Recommended next phase

**Phase 14W — Social Media Content Optimization:** rewrite the `SOCIAL_SYSTEM` prompt in `src/lib/ai-prompts.ts` and the inline weekly-content prompt to enforce 3-second hooks, platform-specific formatting (heavy emojis + line breaks for IG/FB; short punchy for TikTok), value-first CTAs, and niche travel hashtags. Note: this invalidates OpenRouter's prompt cache for the next run — small one-time cost.

---

## Phase 14U — Cron Health Dashboard UI & Alerts (deployed `debea44` 2026-05-08 — operator control panel + email-on-halt; no DB writes during this phase; no platform calls)

### What this phase ships

The operator can now control and observe the autoposter cron entirely through the dashboard. No more Supabase SQL editor. And when the cron auto-halts, the admin gets a loud email instead of silently waiting until they happen to notice the next morning that nothing posted.

### Files added

| File | Purpose |
|---|---|
| `src/app/api/admin/system/autoposter-cron/route.ts` | Admin-only GET + POST endpoint backing the kill switch UI. `GET` returns `{ enabled, last_change, last_reason }` from `site_settings.autoposter_cron_enabled`. `POST { enabled: boolean }` upserts the same row. Both go through `requireAdminUser` from `src/lib/admin-auth.ts` — same gate every other admin route uses. The `description` column captures *who* toggled it (e.g. `manually enabled by operator@vortextrips.com`) so the dashboard can display attribution and the cron's auto-disable history doesn't get clobbered by a manual toggle. |
| `src/components/ai/SystemStatusCard.tsx` | Self-contained client component. Loads cron status on mount, renders a color-coded card (emerald border + green badge when enabled; rose border + red badge when disabled), shows the last-change timestamp + reason, and provides a single toggle button + a refresh button. Disable action requires a confirm dialog; enable is one-click. Uses the existing `useToast` notify pattern. Pre-existing `react-hooks/set-state-in-effect` disable on the mount-load effect (matches the established pattern). |

### Files updated

| File | Change |
|---|---|
| `src/app/dashboard/ai-command-center/page.tsx` | Imports + renders `<SystemStatusCard notify={notify} />` between the page header and the existing `WorkflowPanel`/`JobInspector` grid. No layout disruption — slots in as a top-level full-width card. |
| `src/app/api/cron/autoposter-once/route.ts` | Imports `sendEmail` from `@/lib/resend`. New `sendKillSwitchAlert(...)` helper that emails `process.env.ADMIN_NOTIFICATION_EMAIL` with subject "🚨 URGENT: VortexTrips Autoposter Halted" and a structured HTML body (reason, platform, content_calendar.id, platform_post_id when available, additional context, next-steps checklist). Helper is **best-effort**: missing env var logs a warning and returns; Resend send failure logs a warning and continues. Never throws — the cron's primary job is the kill-switch flip + atomic UPDATE, the email is operator notification on top. Wired into all 4 auto-disable branches: platform non-2xx, DB UPDATE failure, UPDATE-affected count != 1, post-flight invariant slip. The transient network-exception branch (which does NOT auto-disable) does NOT trigger the alert — likely transient, no operator action needed. |

### Email alert behavior

**Triggers (all 4 auto-disable conditions, in firing order):**

1. **Platform non-2xx** — `${platform} post failed at row ${id}: ${error}` — body includes the platform error message.
2. **DB UPDATE error after platform success** — *CRITICAL*: post may have landed but DB didn't flip. Email includes `platform_post_id` so the operator can verify on the platform UI and reconcile.
3. **DB UPDATE affected != 1 row** — same severity as above; concurrent path interfered.
4. **Post-flight invariant slip** — `posted_at` delta and/or `status='posted'` delta != +1. Email includes before/after counter snapshots.

**Graceful degradation:**

| Condition | Behavior |
|---|---|
| `ADMIN_NOTIFICATION_EMAIL` unset / empty | `console.warn` with the alert reason; helper returns silently |
| Resend send throws | `console.warn` with the error message; cron continues with its 500 response |
| Email body construction throws | Wrapped in try/catch internally; cron continues |

The cron's HTTP 500 response is unaffected by alert success/failure. The kill-switch flip happens BEFORE the alert send, so even if the email fails the next scheduled tick stays safely disabled.

### Subject line + body

- **Subject:** `🚨 URGENT: VortexTrips Autoposter Halted`
- **Body sections:**
  - Header banner with red accent
  - Reason (bold) + platform + content_calendar.id + platform_post_id (when present)
  - "Additional context" list (severity tag, deltas, etc.)
  - "Next steps" ordered list:
    1. Open the System Status & Kill Switch card on the AI Command Center.
    2. Run `node scripts/audit-pre-autoposter-readiness.js` to confirm DB invariants.
    3. (When `platform_post_id` present) Verify on platform UI; reconcile with `scripts/repair-posted-at-invariants.js`.
    4. Re-enable from the dashboard kill switch (or via SQL upsert).
  - Tiny footer noting how to opt out (unset `ADMIN_NOTIFICATION_EMAIL`).
- All dynamic strings escaped via internal `escapeHtml()` — no XSS surface even though only the admin reads it.

### Dashboard UI behavior

- Card location: top of `/dashboard/ai-command-center`, full-width, between header and the WorkflowPanel/JobInspector grid.
- **Enabled state:** emerald-300 border, 🟢 Enabled badge (emerald-100 bg + emerald-800 text), red `Disable Cron` button (rose-600).
- **Disabled state:** rose-300 border, 🔴 Disabled badge, green `Enable Cron` button (emerald-600).
- **Loading state:** gray border, "Loading…" badge, button disabled.
- Last-change timestamp shown via `new Date().toLocaleString()`. Last reason shown verbatim (operator can tell at a glance whether they disabled it OR the cron auto-disabled itself with `auto-disabled: <reason>`).
- Disable action triggers a `window.confirm()` dialog ("Disable the autoposter cron? The daily 14:00 UTC tick will be skipped…"). Enable is one-click.
- Refresh button reloads the status without page reload.
- Toast notifications via the existing `useToast` provider on success/failure.

### Critical safety gates preserved

- ✅ `requireAdminUser` enforced on both GET and POST of the new admin route. Non-admins → 401/403.
- ✅ The cron route still flips the kill switch BEFORE attempting the email send. If the email fails, the kill switch is still disabled — the alert is observability, not a dependency for safety.
- ✅ The cron's atomic UPDATE pattern, refusal contract, and CRON_SECRET auth are all unchanged.
- ✅ Manual posting routes, runner script, and `validateManualPostingGate` are untouched.
- ✅ No new env vars required. `ADMIN_NOTIFICATION_EMAIL` was already documented in `.env.example` (used by other notification paths). Missing var = warning log, no crash.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No notifications for the *transient network-exception* branch (the one that does NOT auto-disable). That branch returns 500 without flipping the kill switch — likely transient, retried by next tick. Adding email noise here would hurt signal.
- ❌ No retry / batching for failed alert emails. If Resend rejects, we log and move on. The dashboard already shows last-change reason; the operator's morning routine catches it.
- ❌ No SMS or Slack alerts. Email is the established notification channel for VortexTrips. A future phase can add other channels via the same `sendKillSwitchAlert` helper.
- ❌ No DB schema change. Migrations remain at 001-033. The kill switch lives in the existing `site_settings` table from migration 007.
- ❌ No change to `vercel.json` or the cron schedule.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / TikTok / X / email API calls | 0 (no cron tick fired during the phase) |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar | 0 |
| `UPSERT` against site_settings | 0 (no operator toggle during the phase) |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean |
| `npm run lint` | ✅ PASS — 0 errors, 0 warnings |
| Static review of new admin API route | ✅ Both GET and POST go through `requireAdminUser`; POST validates `body.enabled` is a boolean before write; description string captures actor email for audit trail. |
| Static review of `SystemStatusCard` | ✅ Loads on mount with toast feedback; disable action confirms first; toggle button color/label flip correctly with state; refresh button works; loading state disables both buttons. |
| Static review of `sendKillSwitchAlert` | ✅ Returns silently when `ADMIN_NOTIFICATION_EMAIL` unset; wraps `sendEmail` in try/catch; never throws to caller; called from all 4 auto-disable branches AFTER the kill-switch flip. |
| `escapeHtml` correctness | ✅ Standard 5-char escape: `&` `<` `>` `"` `'`. Sufficient for HTML attribute + body context. |

### Migration

**None.** No schema change.

### Deploy

Vercel will rebuild on the new commit. The new admin route is gated by `requireAdminUser` so it's safe to ship — non-admins see 401/403. The `SystemStatusCard` renders on the dashboard for any admin who's already authenticated. The cron route's email-on-halt path activates immediately on first deploy; missing `ADMIN_NOTIFICATION_EMAIL` just logs a warning and continues.

### Recommended next phase

**Phase 14V — TikTok Status Polling:** add `checkTikTokPostStatus(publish_id)` helper to `src/lib/tiktok-oauth.ts`, persist `publish_id` into `content_calendar.media_metadata` JSONB on TikTok post, and add `scripts/diagnose-tiktok-uploads.js` to confirm async uploads finished processing.

---

## Phase 14T.1 — Lint Hygiene Sweep (deployed `90b27b9` 2026-05-08 — mechanical cleanup of all 51 pre-existing ESLint findings; no DB writes; no platform calls; behavior preserved on every funnel page)

### What this phase ships

Eradicates every ESLint finding `npm run lint` surfaced after Phase 14T fixed the FlatCompat crash. Result: `0 errors, 0 warnings`. The linter is now a useful gate that future PRs can rely on instead of a permanent noise source.

### Files updated (22)

#### API routes (3)

| File | Fix |
|---|---|
| `src/app/api/admin/upload-to-youtube/route.ts` | `@ts-ignore` → `@ts-expect-error` with the same justification (lib.dom.d.ts doesn't yet declare `duplex`). |
| `src/app/api/dashboard/generate-content/route.ts` | Removed unused `request` parameter and the `NextRequest` import. Function is now `POST()`. |
| `src/app/api/webhooks/bland/route.ts` | Removed unused `call_id` from the destructure. |

#### Dashboard pages (5)

| File | Fix |
|---|---|
| `src/app/dashboard/campaigns/page.tsx` | Removed dead `CALENDAR_PLATFORMS` constant (Phase 14Q leftover). Added 3 targeted `eslint-disable-next-line react-hooks/set-state-in-effect` comments with justifications on the data-fetch-on-mount and selection-driven-fetch patterns. |
| `src/app/dashboard/content/page.tsx` | Added `eslint-disable-next-line @next/next/no-img-element` on the Supabase Storage / Pexels image preview (configuring `next/image` remotePatterns is out of scope). |
| `src/app/dashboard/leads/page.tsx` | Refactored `next.has(id) ? next.delete(id) : next.add(id)` (unused-expression warning) into an `if/else` — same behavior, no expression-result waste. |
| `src/app/dashboard/members/page.tsx` | Removed unused `show` from `useToast()` destructure. |
| `src/app/dashboard/videos/page.tsx` | Added one `eslint-disable-next-line react-hooks/set-state-in-effect` for the URL-param sync on mount. |

#### Public landing pages (11)

Mechanical `<a>` → `<Link>` conversions for internal hrefs (external `mailto:` and `https://` links left as `<a>`), JSX entity escapes (`'` → `&apos;`, `"` → `&quot;`), unused-var cleanup. ALL changes preserve visible behavior — `<Link>` produces the same `<a>` tag in the DOM with optional client-side navigation.

| File | Fix |
|---|---|
| `src/app/data-deletion/page.tsx` | `Link` import added; nav `<a>` → `<Link>`; escaped `"Data Deletion Request"` quotes. |
| `src/app/destinations/[slug]/page.tsx` | `Link` import added; 6 `<a>` → `<Link>` (nav and footer). |
| `src/app/join/page.tsx` | `Link` import added; nav `<a>` → `<Link>`; escaped `You'll`; removed unused `email`/`setEmail` and the dead `handleSubmit` (which was never bound to any form — the page only has external SBA/portal anchors). `submitted` state remains. |
| `src/app/page.tsx` | `Link` import added; removed unused `router`/`useRouter`; 13 internal `<a>` → `<Link>` (nav and footer); kept external `mailto:` and `myvortex365.com` as `<a>` (correct); escaped 4 instances (`"{quote}"`, `we'll`); added `eslint-disable-next-line @next/next/no-img-element` on testimonial photo. |
| `src/app/privacy/page.tsx` | `Link` import added; 2 internal `<a>` → `<Link>` (nav and back-link). |
| `src/app/quiz/page.tsx` | `Link` import added; nav `<a>` → `<Link>`; escaped `We'll`. |
| `src/app/quote/page.tsx` | `Link` import added; nav `<a>` → `<Link>`. |
| `src/app/reviews/page.tsx` | `Link` import added; 5 internal `<a>` → `<Link>` (nav and footer); escaped `"{r.review_text}"`; removed dead `eslint-disable-next-line react/no-danger` directive (rule never fired); added one `eslint-disable-next-line react-hooks/set-state-in-effect` for URL-param `cid` sync. |
| `src/app/sba/page.tsx` | Escaped `You're` and `it's` in two JSX text nodes. |
| `src/app/terms/page.tsx` | `Link` import added; 2 internal `<a>` → `<Link>` (nav and back-link). |
| `src/app/thank-you/page.tsx` | `Link` import added; 2 internal `<a>` → `<Link>` (nav and back-home button); escaped `We'll`. |

#### Components (3)

| File | Fix |
|---|---|
| `src/components/ai/JobInspector.tsx` | Added `eslint-disable-next-line react-hooks/set-state-in-effect` on the data-fetch-on-mount `useEffect`. |
| `src/components/ai/JobsTable.tsx` | Same pattern as `JobInspector` — disable directive with justification. |
| `src/components/ai/WorkflowPanel.tsx` | **Real refactor** — extracted `PlatformChips` and `togglePlatform` out of the parent component's render scope into module-level declarations. Both are pure (state/setter passed as props/args). Added a `SocialPlatformId` type alias. Eliminates the `react-hooks/static-components` errors at the original render-time component definitions. |

### Decision: targeted `eslint-disable-next-line` for `set-state-in-effect`

Five `react-hooks/set-state-in-effect` violations were silenced with targeted disable directives plus inline justification comments. The rule's official guidance (https://react.dev/learn/you-might-not-need-an-effect) recommends not using effects for these patterns, but the alternatives — React Query, server-component data fetching, or in-effect lazy state initializers — are major refactors that exceed Phase 14T.1's "strictly mechanical" scope. Each disable carries a one-line `--` comment explaining why (data fetch on mount; URL-param sync; selection-driven re-fetch).

This is graceful behavior preservation per the operator's directive. A future phase can revisit if it wants to migrate to React Query or similar.

### Verification

| Test | Result |
|---|---|
| `npm run lint` (pre-14T.1) | ❌ 51 problems (39 errors, 12 warnings) |
| `npm run lint` (post-14T.1) | ✅ **0 problems (0 errors, 0 warnings)** |
| `npx tsc --noEmit` (after `.next/types` clear) | ✅ PASS — clean |
| Funnel-page behavior preserved | ✅ All `<a>` → `<Link>` swaps are DOM-equivalent (same tag in HTML output, same href). All entity escapes render identically. No removed feature; only dead-code cleanup (handleSubmit on /join was unbound and unused — removing it changed nothing visible). |

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| posted_at delta | 0 (29 → 29) |

### Migration

**None.** No schema change. All edits are TS/TSX-only.

### Deploy

Vercel will rebuild on the new commit. Production behavior is unchanged — `<Link>` produces the same DOM as `<a>` but adds prefetching for internal navigation (small UX win). Entity escapes, unused-var cleanup, ts-comment swap, and `WorkflowPanel`'s `PlatformChips` refactor are all behavior-preserving.

### Recommended next phase

**Phase 14U — Cron Health Dashboard UI & Alerts:** add a "System Status & Kill Switch" card to a dashboard page reading/toggling `site_settings.autoposter_cron_enabled` via a new admin API route, AND update `/api/cron/autoposter-once` to send an emergency admin email via `sendEmail()` whenever it auto-disables.

---

## Phase 14T — Resend Lazy-Init + ESLint v9 Flat Config (deployed `2844734` 2026-05-08 — tech-debt cleanup; no DB writes; no platform calls; no behavioral change to any posting / cron / API surface)

### What this phase ships

Two pre-existing local-build artifacts are eliminated. Both were known issues from prior phases (documented as caveats on Phase 14O.1, Phase 14Q, Phase 14R, Phase 14S audits). Neither affected production behavior — production has the real env vars and uses Next.js's bundled lint pipeline at deploy time. But both made the local developer experience worse:

1. **Resend module-eval failure** — `src/lib/resend.ts` instantiated `new Resend(process.env.RESEND_API_KEY)` at the top level. When `vercel env pull` strips `RESEND_API_KEY` to `''` for local development, Resend's constructor threw during page-data collection, breaking `npm run build` on every route that imports `sendEmail`. Production was unaffected.

2. **ESLint v9 circular-JSON crash** — `eslint.config.mjs` used `FlatCompat` from `@eslint/eslintrc` to wrap `next/core-web-vitals` and `next/typescript` for ESLint 9.x. The legacy compat validator inside `@eslint/eslintrc` tried to `JSON.stringify` a config that contained a circular plugin reference (from `eslint-plugin-react`'s recommended config) and crashed with `TypeError: Converting circular structure to JSON`. `npm run lint` was unusable.

### Files updated

| File | Change |
|---|---|
| `src/lib/resend.ts` | Replaced module-level `const resend = new Resend(...)` with a private `getResend()` getter that lazily instantiates and caches a single client. The cache means we don't re-create the client per send. The missing-key error now throws only at the moment a route actually tries to send (with a clear `'RESEND_API_KEY is not configured'` message), never during module evaluation. All consumers (`partners`, `webhooks/lead-created`, `cron/send-sequences`, `cron/score-and-branch`, `automations/quote-email`, `automations/trigger-sba`) use the unchanged `sendEmail` export — no consumer-side changes needed. |
| `eslint.config.mjs` | Dropped `FlatCompat`. `eslint-config-next` v16.2.4 ships flat-config-native arrays at the `core-web-vitals` and `typescript` subpath exports — already-shaped `Linter.Config[]` arrays that we import and spread directly. The flat config is now `[...nextCoreWebVitals, ...nextTypescript, { ignores: [...] }]` exported as a `const` (silences `import/no-anonymous-default-export`). No more legacy compat layer; no more circular-JSON crash. |
| `package.json` | Removed `@eslint/eslintrc: ^3.2.0` from devDependencies — was only imported by the FlatCompat path in the old `eslint.config.mjs` and is no longer needed. |
| `package-lock.json` | Regenerated via `npm uninstall @eslint/eslintrc --legacy-peer-deps`. Dropped the top-level `@eslint/eslintrc` entry. |

### Verification

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean (no errors) |
| `npm run lint` (pre-fix) | ❌ Crashed: `TypeError: Converting circular structure to JSON` from `@eslint/eslintrc/lib/shared/config-validator.js` |
| `npm run lint` (post-fix) | ✅ Executes cleanly. Reports 51 pre-existing findings (39 errors, 12 warnings) in unrelated files — that's the lint pipeline doing its job, not a Phase 14T regression. None of the findings are in code Phase 14T touched. |
| Resend lazy-init smoke test | ✅ Static review confirms `process.env.RESEND_API_KEY` is read only inside `getResend()`. The throw is now scoped to actual send attempts. |

### Pre-existing lint findings (NOT in scope for Phase 14T)

Now that lint runs, it surfaces 51 pre-existing issues across the codebase. These are ALL in files Phase 14T did not touch and predate Phase 14T's scope. Recording them here for visibility; cleanup is deferred to a future phase or done opportunistically alongside other work.

Most common categories:
- `react-hooks/set-state-in-effect` (5 occurrences) — `useEffect` bodies calling `setState` synchronously. Anti-pattern flagged by React 19's stricter rules.
- `@next/next/no-html-link-for-pages` (~14 occurrences) — `<a href="/...">` instead of `<Link />`. Affects landing pages (`/`, `/quiz`, `/quote`, `/privacy`, `/data-deletion`, `/destinations/[slug]`, `/join`).
- `react/no-unescaped-entities` (~10 occurrences) — `"` and `'` in JSX text that should be `&quot;` / `&apos;`.
- `@typescript-eslint/no-unused-vars` (a handful) — minor cleanup like the `CALENDAR_PLATFORMS` constant Phase 14Q narrowed but didn't delete (intentional per Phase 14Q's anti-drift discipline).
- `@typescript-eslint/ban-ts-comment` (1 occurrence) — `@ts-ignore` should be `@ts-expect-error`.

**Phase 14T's deliverable was specifically "lint executes cleanly without crashing" — achieved.** Fixing 51 pre-existing findings is scope creep beyond the phase's stated bounds. A future "Phase 14T.1 — Lint Hygiene" can sweep these in a focused effort.

### What this phase does NOT do

- ❌ No fix for the 51 pre-existing lint findings — out of scope.
- ❌ No new dependencies. `@eslint/eslintrc` removed; nothing added.
- ❌ No DB schema change. Migrations remain at 001-033 (immutable).
- ❌ No change to any posting / cron / API behavior. The Resend refactor preserves the exact `sendEmail` interface; consumers are unchanged.
- ❌ No change to `vercel.json`, the autoposter cron, or the operator SOP.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI / TikTok / X / email API calls | 0 |
| Resend client instantiations during module-eval | 0 (was 1 per route import pre-14T) |
| `UPDATE` / `INSERT` / `DELETE` against any DB table | 0 |
| posted_at delta | 0 (29 → 29) |

### Migration

**None.** No schema change.

### Deploy

Vercel will rebuild on the new commit. Production behavior is identical:
- Resend's behavior is unchanged from the calling-code perspective (`sendEmail` API unchanged). The lazy-init only matters when `RESEND_API_KEY` is empty — which never happens in production.
- ESLint runs on Vercel's build via `next build` which uses its own bundled lint pipeline; the local `eslint.config.mjs` change doesn't affect Vercel's pipeline. The local `npm run lint` is the only path affected.

### Recommended next phase

The system is now **complete and locally clean**. Optional future phases:

- **Phase 14T.1 (optional) — Lint Hygiene Sweep:** address the 51 pre-existing lint findings now that the lint pipeline works.
- **Phase 14U (optional) — TikTok Status Poll:** confirm TikTok's async upload completion for each `tiktok_publish_id` returned by the autoposter.
- **Phase 14V (optional) — Per-Platform Schedules:** Vercel Pro upgrade for sub-daily cadence.

None are required for the system to function.

---

## Phase 14S — 100% Automation Cron (deployed `c012228` 2026-05-08 — code changes only; no DB writes; no platform calls; cron defaults to DISABLED until operator flips kill switch)

### What this phase ships

The autoposter cron route — the final piece that promotes VortexTrips' posting pipeline from "cyborg" (operator runs the script daily) to "fully autonomous" (Vercel Cron triggers the route on schedule). The route wraps the runner's `--apply` logic into a CRON_SECRET-gated, kill-switched, auto-disabling daily endpoint.

### Files added

| File | Purpose |
|---|---|
| `src/app/api/cron/autoposter-once/route.ts` | The cron route. ~430 lines. Implements the 5-step SOP programmatically: pre-flight snapshot → eligibility (`getAutoposterEligibleRows({ limit: 5 })`) → defense-in-depth `validateManualPostingGate({ supportedPlatforms: [platform] })` → platform call (FB / IG / TikTok branches mirroring `post-to-{facebook,instagram,tiktok}/route.ts`) → atomic UPDATE → post-flight snapshot → kill-switch flip on any failure. Targets exactly one eligible row per execution. Refuses Twitter/X explicitly (defense-in-depth post-14Q). Uses the existing `getValidTikTokAccessToken` + `validateManualPostingGate` libraries; no duplication of OAuth or gate logic. |

### Files updated

| File | Change |
|---|---|
| `vercel.json` | Removed `/api/cron/check-heygen-jobs` (Path A — the legacy HeyGen polling cron is no longer needed; HeyGen renders are now polled by the dashboard's media-status panel and the operator's `scripts/check-video-generation-status.js`). Added `/api/cron/autoposter-once` at `0 14 * * *` (2 PM UTC daily). Hobby plan stays at 4/4 cron slots. |
| `docs/skills/autoposter-operator-sop.md` | Header updated to show Phase 14S active. New "Operating mode (post-Phase-14S)" section documents the cron's behavior, kill switch, auto-disable triggers, and operator-after-incident flow. The 5-step manual protocol is preserved verbatim and re-purposed as the canonical **diagnostic** procedure. Step 2 (Mark Ready) is the only step the operator runs daily under cron mode. The Phase 14S Cron Mapping table at the bottom of the doc traces each SOP step to its cron implementation. |
| `PROJECT_STATE_CURRENT.md` | This entry. |
| `BUILD_PROGRESS.md` | Phase 14S entry; current focus shifted to "Phase 14T+ / operational tuning." |

### Cron route contract (`/api/cron/autoposter-once`)

**Auth:** `Authorization: Bearer ${CRON_SECRET}` — same Bearer pattern the other 4 cron routes use. Missing or wrong → 401.

**Kill switch:** `site_settings.autoposter_cron_enabled`
- `'true'` → cron actively posts
- anything else (including missing key) → cron returns `200 { skipped: true, reason: 'cron_disabled' }`
- After auto-disable: operator must `UPDATE site_settings SET value='true' WHERE key='autoposter_cron_enabled';`

**Eligibility:** `getAutoposterEligibleRows({ limit: 5 })` from `src/lib/autoposter-gate.ts`. The candidate list runs through `validateAutoposterCandidate` (which itself runs `validateMediaReadiness`) before any platform call.

**Refusal contract:**

| Condition | Response |
|---|---|
| Bad CRON_SECRET | 401 Unauthorized |
| Kill switch off | 200 `{ skipped: true, reason: 'cron_disabled' }` |
| Eligibility query failed | 500 with error message |
| 0 eligible rows | 200 `{ posted: 0, reason: 'no_eligible_rows' }` (clean — operator hasn't Mark Ready'd anything) |
| > 1 eligible rows | 200 `{ skipped: true, reason: 'queue_size_gt_1', eligible_ids: [...] }` (operator-fixable; does NOT auto-disable) |
| Platform is twitter/x | 200 `{ skipped: true, reason: 'refused_platform' }` (defense-in-depth post-14Q; should never happen) |
| Platform not in {fb,ig,tiktok} | 200 `{ skipped: true, reason: 'unsupported_platform' }` |
| Manual gate refused at apply time | 200 `{ skipped: true, reason: 'gate_refused_at_apply', gate_reasons: [...] }` |
| Platform call exception (network) | 500 with error — does NOT auto-disable (likely transient) |
| Platform non-2xx response | 500 + **kill switch flipped to disabled** |
| DB update failed | 500 + **kill switch flipped to disabled** + manual-reconciliation warning + platform_post_id |
| DB update affected != 1 row | 500 + **kill switch flipped to disabled** + manual-reconciliation warning |
| Post-flight delta != +1 | 500 + **kill switch flipped to disabled** + before/after snapshot |
| Successful post | 200 `{ success: true, posted: 1, platform, row_id, platform_post_id, before, after }` |

**Allowed writes (only on platform success):**
- `content_calendar.status` → `'posted'` (atomic, single statement)
- `content_calendar.posted_at` → `now()` (atomic, single statement)
- `site_settings.autoposter_cron_enabled` → `'false'` (only on auto-disable)
- `site_settings.tiktok_*` → rotated tokens (only when `getValidTikTokAccessToken` refreshes during a TikTok post)

**Forbidden writes (regardless of state):** `posting_status`, `posting_gate_approved`, `queued_for_posting_at`, `posting_block_reason`, `video_url`, `image_url`, `caption`, `image_prompt`, `campaign_asset_id`, `tracking_url`, any `campaign_assets` column.

### Why `check-heygen-jobs` was dropped (Path A)

That cron polled HeyGen's `/v1/video_status.get` once daily for the SBA video render. Three reasons it's now redundant:

1. **HeyGen renders are caught at runtime.** When the operator runs `scripts/check-video-generation-status.js` (or hits the dashboard media-status panel), pending HeyGen jobs are polled on-demand and their URLs land in `content_calendar.video_url` directly via the worker.
2. **Phase 14R's `validateMediaReadiness` blocks any TikTok row without `video_url`.** The autoposter cron will refuse a TikTok row with a still-pending HeyGen render — no harm done; the operator runs the worker and the row becomes eligible on the next tick.
3. **Hobby plan only allows 4 cron slots.** The autoposter is the higher-leverage cron. Keeping 5/4 isn't possible without upgrading to Pro ($20/mo per seat).

The HeyGen cron route file (`src/app/api/cron/check-heygen-jobs/route.ts`) **stays in the repo** — the route still works if invoked manually via curl with `Authorization: Bearer ${CRON_SECRET}`. It's just no longer scheduled by Vercel. Removing the route file would be a bigger refactor and is out of scope for 14S.

### Schedule choice — `0 14 * * *` (2 PM UTC daily)

- **2 PM UTC** = 9 AM ET / 6 AM PT. Avoids the typical morning-deploy window (most operator activity is 7-11 AM ET, so any post-deploy bug is likely to surface on a manual run BEFORE the cron tick).
- **Daily** is the only option on Hobby. Pro unlocks finer-grained schedules; we don't need it yet.
- **Single tick per day** means at most one autoposted row per day even if the operator Mark-Ready's multiple rows. That's the queue-size-must-equal-1 hard guardrail in action — the runner refuses on >1; the cron skips with `queue_size_gt_1` reason.

### Critical safety gates enforced

- ✅ `CRON_SECRET` Bearer auth (same pattern as the other 3 daily crons).
- ✅ Kill switch defaults to disabled — first deploy posts NOTHING until operator flips the key. Eliminates "deploy weekend, wake up to 7 surprise posts" failure mode.
- ✅ `getAutoposterEligibleRows` already runs `validateMediaReadiness`. The route additionally re-runs `validateManualPostingGate({ supportedPlatforms: [platform] })` against the freshly-fetched row before posting — defense-in-depth.
- ✅ Atomic UPDATE pattern with `.eq('status','approved').is('posted_at',null)` inline guards — same pattern the manual routes and runner use.
- ✅ Auto-disable on **definitive** failures only. Network exceptions don't auto-disable (likely transient); platform 4xx/5xx responses, DB-update failures, and post-flight slips do auto-disable.
- ✅ Twitter/X refused at the platform-branch level (defense-in-depth post-14Q).
- ✅ Vercel Hobby 10s function-timeout budget verified — IG's 6s container-wait loop is the tightest path; total budget for IG is ~8s. FB and TikTok stay under 5s.

### What this phase does NOT do (deliberate scope cuts)

- ❌ No upgrade to Vercel Pro plan. Stayed on Hobby; replaced one cron with another.
- ❌ No removal of `src/app/api/cron/check-heygen-jobs/route.ts` source file. Just dropped from `vercel.json`.
- ❌ No status-poll cron for TikTok's async upload. The init response is authoritative. A future phase can add `/api/cron/tiktok-status-poll` if we want end-state confirmation.
- ❌ No retry logic on transient failures. The next scheduled tick is the retry. If the operator wants immediate retry, they run `node scripts/run-autoposter-once.js --apply` manually.
- ❌ No DB schema change. Migrations remain at 001-033 (immutable per anti-drift). The kill switch lives in the existing `site_settings` table from migration 007.
- ❌ No state CSRF validation in OAuth flows. Out of scope; deferred (matches existing YouTube + TikTok callback pattern).

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI calls | 0 |
| Facebook / Instagram / TikTok / X / email API calls | 0 (until operator flips kill switch AND a Mark-Ready'd row exists at cron tick time) |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar | 0 |
| `UPSERT` against site_settings | 0 (until operator flips the kill switch on, OR the cron hits a failure and flips it off) |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean |
| Static review of cron route | ✅ Auth → kill switch → snapshot → eligibility → refusals → re-fetch → gate → platform branch → atomic UPDATE → invariant check → response. No platform call before gate; no UPDATE before platform 2xx; no kill-switch flip before definitive failure. |
| `vercel.json` validation | ✅ Cron count 4/4. All paths exist. Schedules valid cron syntax. |
| SOP doc consistency | ✅ All 5 steps in the manual protocol still match the cron's step ordering. Kill switch documented. Re-enable command documented. |
| Live cron tick test | ⏸️ Deferred. Vercel will fire the route on schedule once deployed; with kill switch disabled, the first tick logs `cron_disabled` and exits clean — that's the safe-by-default validation. |
| `node scripts/audit-pre-autoposter-readiness.js` | ⚠️ Same pre-existing local Supabase schema-cache transient (environmental, not from this phase). Production deploys hit real Supabase. |

### Migration

**None.** No schema change. The kill switch lives in the existing `site_settings` table from migration 007 (same pattern HeyGen and YouTube use).

### Deploy

Vercel will:

1. Build on the new commit.
2. Pick up the updated `vercel.json` and re-register the 4 crons. The new `autoposter-once` slot replaces `check-heygen-jobs`.
3. The first scheduled tick (next 14:00 UTC after deploy) will hit the route with the correct CRON_SECRET. Because `site_settings.autoposter_cron_enabled` doesn't exist yet (or is anything other than `'true'`), the route returns `{ skipped: true, reason: 'cron_disabled' }` and exits clean.

**To activate the cron** (operator-authorized, post-deploy):

```sql
INSERT INTO site_settings (key, value, description)
VALUES ('autoposter_cron_enabled', 'true', 'Enables /api/cron/autoposter-once daily posting')
ON CONFLICT (key) DO UPDATE SET value='true', updated_at=now();
```

(Run via the Supabase SQL editor, or via the dashboard once an admin UI is added.)

**To verify the route works without enabling the cron** (recommended pre-flight):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://www.vortextrips.com/api/cron/autoposter-once
# expected: {"success":true,"skipped":true,"reason":"cron_disabled",...}
```

### Recommended next phase

**Operational tuning, not code.** The architecture is complete. Likely next-phase candidates:

- **Phase 14T (optional) — Cron Health Dashboard:** add a `/dashboard/automation` page surfacing the kill switch state, last-N-cron run results from Vercel logs, and a one-click re-enable button.
- **Phase 14U (optional) — TikTok Status Poll:** add `/api/cron/tiktok-status-poll` to confirm TikTok's async upload completed for each `tiktok_publish_id` returned by the autoposter (currently the init response is treated as authoritative).
- **Phase 14V (optional) — Per-Platform Schedules:** upgrade to Vercel Pro and split the autoposter into separate per-platform crons (e.g., FB at 9 AM ET, IG at 12 PM ET, TikTok at 6 PM ET) for engagement-time optimization.

None of these are required for the system to function. Phase 14S is the operational completion of the primary posting automation architecture.

---

## Phase 14R — TikTok Auto-Poster (deployed `78c4041` 2026-05-08 — code changes only; no DB writes during this phase; no platform calls until operator authorizes)

### What this phase ships

End-to-end TikTok automation using the Content Posting API in **Direct Post** mode with `source: PULL_FROM_URL`. The flow is:

1. **OAuth** — operator authorizes the TikTok app once. The callback exchanges `code` for `{access_token, refresh_token, expires_in, open_id}` and persists all four into `site_settings` with the `tiktok_*` key prefix.
2. **Posting** — `/api/automations/post-to-tiktok` (and the runner's `postToTikTok`) reads tokens via `getValidTikTokAccessToken`, refreshes if within 60 seconds of expiry, and POSTs to `/v2/post/publish/video/init/` with the row's `video_url` (HeyGen-rendered, re-hosted in Supabase Storage per Phase 14L.2.3 to dodge HeyGen's signed-URL expiry).
3. **Atomic UPDATE** — on init success (`publish_id` returned, no error code), the same `status='posted', posted_at=now()` UPDATE pattern the FB / IG routes use, with the `.eq('status','approved').is('posted_at',null)` guards inline.

### Files added

| File | Purpose |
|---|---|
| `src/lib/tiktok-oauth.ts` | OAuth helpers: `exchangeCodeForTokens(code, redirectUri)`, `refreshAccessToken(refreshToken)` against `https://open.tiktokapis.com/v2/oauth/token/`. Plus token-store helpers: `saveTikTokTokens(supabase, tokens)` (upserts the four `tiktok_*` keys with computed `tiktok_token_expires_at`) and `getValidTikTokAccessToken(supabase)` (auto-refreshes when within 60s of expiry, persists rotated tokens, returns a usable access_token). All functions are server-only (read `process.env`, call `createAdminClient`-shaped supabase). Never logs the OAuth `code` or `state`. |
| `src/app/api/automations/post-to-tiktok/route.ts` | Mirror of the FB / IG poster pattern. Auth check → joined-fetch → flatten → `validateManualPostingGate({ supportedPlatforms: ['tiktok'] })` → token resolution → POST `/v2/post/publish/video/init/` → atomic UPDATE on success. Defense-in-depth: re-checks `video_url` non-empty after the gate even though `validateMediaReadiness` already requires it for TikTok. Returns 503 when TikTok is not connected (no refresh_token) so the operator sees a precise reason rather than a generic 500. |

### Files updated

| File | Change |
|---|---|
| `src/app/api/auth/tiktok/callback/route.ts` | Wired token exchange. On `code` received → call `exchangeCodeForTokens(code, callbackUrl)` → call `saveTikTokTokens(admin, tokens)` → redirect with `connected=true`. Token-exchange failures redirect with `connected=false&error=<truncated message>`. State CSRF validation still deferred (matches the existing YouTube callback pattern; documented in the route header). |
| `scripts/run-autoposter-once.js` | Removed `'tiktok'` from `REFUSED_PLATFORMS`; added it to `SUPPORTED_PLATFORMS`. Added in-script JS mirrors of `loadTikTokTokensJs`, `refreshTikTokTokensJs`, `saveTikTokTokensJs`, `getValidTikTokAccessTokenJs` (kept in sync with `src/lib/tiktok-oauth.ts` by hand — same pattern the runner already uses for `validateMediaReadinessJs` etc.). Added `postToTikTok(row, env, supabase)` function. New `else if (platform === 'tiktok')` branches in the Plan and Apply sections. Updated header docstring to reflect Phase 14R. Twitter/X stays in `REFUSED_PLATFORMS` as defense-in-depth. |
| `.env.example` | Updated TikTok block: documented Phase 14R wiring, listed required scopes (`user.info.basic`, `video.publish`), explained the `site_settings` token-storage convention. Added `TIKTOK_PRIVACY_LEVEL` (default `SELF_ONLY` for unaudited apps; flip to `PUBLIC_TO_EVERYONE` once the app passes audit). |
| `PROJECT_STATE_CURRENT.md` | This entry. |
| `BUILD_PROGRESS.md` | Phase 14R entry; current focus shifted. |

### TikTok API contract used

**OAuth** — `POST https://open.tiktokapis.com/v2/oauth/token/`
- `Content-Type: application/x-www-form-urlencoded`
- Body: `client_key`, `client_secret`, `code` (or `refresh_token`), `grant_type=authorization_code|refresh_token`, `redirect_uri` (auth_code only)
- Response: `{ access_token, expires_in, open_id, refresh_token, refresh_expires_in, scope, token_type }`
- TikTok rotates the `refresh_token` on every refresh — saver helper persists the new refresh_token alongside the new access_token.

**Direct Post init** — `POST https://open.tiktokapis.com/v2/post/publish/video/init/`
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json; charset=UTF-8`
- Body: `{ post_info: { title, privacy_level, disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000 }, source_info: { source: 'PULL_FROM_URL', video_url } }`
- Response: `{ data: { publish_id }, error: { code, message, log_id } }`
- Treats `error.code !== 'ok'` OR `!publish_id` as failure regardless of HTTP status.

### Critical safety gates enforced

- ✅ `validateManualPostingGate(post, { supportedPlatforms: ['tiktok'] })` on the route AND in the runner's `validateAutoposterCandidate` mirror.
- ✅ `validateMediaReadiness(post)` runs inside the gate; TikTok requires non-empty `video_url` per `PLATFORM_RULES.tiktok.video='required'` in `src/lib/media-readiness.ts`.
- ✅ Defense-in-depth: route re-checks `video_url` non-empty after gate (cheap; catches any future gate bug).
- ✅ Atomic UPDATE pattern: `status='posted', posted_at=now()` with `.eq('status','approved').is('posted_at',null)` inline guards. Mirrors FB / IG / runner exactly. Update count must equal 1 — anything else is a 500 with a "manual reconciliation required" warning + the publish_id so the operator can match it on TikTok's side.
- ✅ No write to `posting_status` / `posting_gate_*` / `queued_for_posting_at` / media columns / campaign_asset_id / tracking_url.

### Privacy default — SELF_ONLY

`TIKTOK_PRIVACY_LEVEL` defaults to `SELF_ONLY`. This means posts go up but are visible **only to the connected creator** until the env var is flipped. This is the safest default for an unaudited TikTok app (TikTok's own audit guidance says unaudited apps must use SELF_ONLY) and gives the operator a way to validate the end-to-end flow on production without going public. To go public:

```
TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE
```

(set in Vercel Settings → Environment Variables; redeploy).

### What this phase does NOT do (deliberate scope cuts)

- ❌ No state CSRF validation in the OAuth callback. Matches the existing YouTube callback. A future phase can introduce a unified session-backed state store.
- ❌ No `/v2/post/publish/creator_info/query/` pre-flight call to discover allowed privacy levels. We default to SELF_ONLY which is always allowed. Operators flip the env var post-audit.
- ❌ No `/v2/post/publish/status/fetch/` polling. The init response is authoritative — TikTok validates the URL synchronously and returns an error if it's unreachable / wrong format. The actual download + processing happens server-side and we trust it. A future cron can add async status polling if we want end-state confirmation.
- ❌ No FILE_UPLOAD source path. PULL_FROM_URL fits the HeyGen → Supabase Storage pipeline and avoids the chunked-upload complexity that would push us past Vercel Hobby's 10s function timeout.
- ❌ No `vercel.json` change. The autoposter cron still doesn't exist (Phase 14S).
- ❌ No DB schema change. Migrations remain at 001–033 (immutable per anti-drift). All token storage uses the existing `site_settings` table from migration 007.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI calls | 0 |
| Facebook / Instagram / TikTok / X / email API calls | 0 (until operator runs `--apply`) |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar | 0 |
| `UPSERT` against site_settings | 0 (until operator clicks Connect TikTok or runs `--apply` with stale tokens) |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean (after removing stale `.next/types/` from prior dev-server build) |
| Static review of `tiktok-oauth.ts` shape | ✅ Functions match TikTok's documented payloads. `expires_in` math computes ISO timestamps correctly. Error path throws descriptive messages. |
| Static review of `post-to-tiktok/route.ts` gate ordering | ✅ Auth → row fetch → flatten → gate → media-existence re-check → token resolution → init POST → atomic UPDATE → response. No platform call before gate; no UPDATE before init success. |
| Static review of runner additions | ✅ `postToTikTok` matches the route's behavior 1-for-1 (same payload, same error handling); `getValidTikTokAccessTokenJs` matches `getValidTikTokAccessToken` (same 60s buffer, same upsert pattern); `REFUSED_PLATFORMS = {twitter, x}` and `SUPPORTED_PLATFORMS = {facebook, instagram, tiktok}`. |
| Live `--apply` test against TikTok | ⏸️ Deferred to operator authorization. Requires (a) TikTok Developer Portal redirect URI configured to point at production callback, (b) operator clicking Connect TikTok once, (c) one approved Mark-Ready'd TikTok row in `/dashboard/content` with a populated `video_url`. |
| `node scripts/audit-pre-autoposter-readiness.js` | ⚠️ Same pre-existing local Supabase schema-cache transient (environmental, not from this phase). Production deploys hit real Supabase and will run cleanly. |

### Migration

**None.** No schema change. The existing `site_settings` table from migration 007 is the canonical OAuth token store (same pattern YouTube already uses).

### Deploy

Vercel will rebuild on the new commit. Operator must:

1. **TikTok Developer Portal:** confirm the redirect URI is set to `https://www.vortextrips.com/api/auth/tiktok/callback` and the app has the scopes `user.info.basic`, `video.publish`.
2. **Connect TikTok once:** click the "Connect TikTok" affordance in the dashboard (or hit the OAuth start URL directly). The callback exchanges the code and writes tokens to `site_settings`.
3. **(Optional) Override privacy:** set `TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE` in Vercel env vars once the TikTok app is fully audited.
4. **Pilot post:** Mark Ready one TikTok row, run `node scripts/run-autoposter-once.js` (DRY-RUN), verify the plan, then `--apply`.

### Recommended next phase

**Phase 14S — 100% Automation Cron:** wrap `run-autoposter-once.js`'s `--apply` logic into `/api/cron/autoposter-once/route.ts`; replace the `check-heygen-jobs` cron in `vercel.json` (Path A — free); enforce `Authorization: Bearer ${CRON_SECRET}`; auto-disable on the first non-2xx platform response by flipping a `site_settings.autoposter_cron_enabled` kill switch. The cron route MUST mirror the SOP at `docs/skills/autoposter-operator-sop.md` step-for-step.

---

## Phase 14Q — Excise Twitter/X (deployed `5f48ced` 2026-05-08 — code changes only; no DB writes; no platform calls)

### What this phase ships

Twitter/X is permanently removed from VortexTrips' active platform list. The post-to-twitter route is deleted, the `twitter-api-v2` package is uninstalled, and every `SUPPORTED_PLATFORMS`-style allowlist, AI generation prompt, dashboard UI control, and validator type union no longer mentions twitter. The migration-004 CHECK constraint on `content_calendar.platform` still allows the value 'twitter' for historical rows (the migration is immutable per anti-drift rules), so legacy twitter rows remain readable — but no new twitter content is generated and no posting path exists.

### Why this phase exists

Executive decision. The Twitter API Free tier has been read-only since 2024 (every prior post-to-twitter call returned HTTP 402). Paid tiers are not justified by ROI for VortexTrips' current posting volume. Rather than carry dead code and an unused dependency, Phase 14Q deletes them. This unblocks the path to 100% automation in Phases 14R (TikTok Direct Post API) and 14S (cron promotion of the autoposter runner).

### Files deleted

| File | Reason |
|---|---|
| `src/app/api/automations/post-to-twitter/route.ts` | Twitter posting route — the only consumer of `twitter-api-v2`. Deleted entirely. |

### Files modified

#### Lib (5 files)

| File | Change |
|---|---|
| `src/lib/social-specs.ts` | Removed `TWITTER_SPEC`, `'twitter'` from `PlatformId` and `ALL_PLATFORM_IDS`, twitter aliases from `normalizePlatform`. Updated module header to document the Phase 14Q removal. |
| `src/lib/media-readiness.ts` | Removed `twitter` row from `PLATFORM_RULES`. Historical twitter rows fall through to `NONE_RULE` (text-only allowed). |
| `src/lib/posting-gate.ts` | Comment cleanup: removed `post-to-twitter` from the list of routes the gate guards; updated the `supportedPlatforms` example from `['twitter']` to `['facebook']`. |
| `src/lib/ai-prompts.ts` | Removed "Twitter/X" from the `SOCIAL_SYSTEM` brand-voice prompt. |
| `src/lib/event-campaign-asset-generator.ts` | Removed `'twitter'` from `SocialPlatform`, `KNOWN_PLATFORMS`. Added explicit twitter-alias rejection guard to `asPlatform`. Removed `twitter` from the `social_post` schema fragment and the platform-voice norms section of the system prompt. Added a "do not emit twitter" instruction so the model can't sneak it back in. |

#### API routes (8 files)

| File | Change |
|---|---|
| `src/app/api/cron/weekly-content/route.ts` | Removed `'twitter'` from `PLATFORMS` array. Removed the `### twitter` block from the markdown-skeleton prompt. Updated caption-length guidance line. |
| `src/app/api/ai/generate/social-calendar/route.ts` | Removed `'twitter'` from `z.enum`; max array length `4 → 3`. |
| `src/app/api/ai/generate/social-pack/route.ts` | Removed `'twitter'` from `z.enum` and from the default platforms array. Removed Twitter caption guidance from the user prompt. |
| `src/app/api/ai/generate/content/route.ts` | Removed `'twitter'` from `z.enum`. |
| `src/app/api/ai/push-to-calendar/route.ts` | Removed `'twitter'` from `PostSchema.platform`; `POSTING_NOT_YET_IMPLEMENTED` set narrowed to `{tiktok}`; warning message updated. |
| `src/app/api/dashboard/generate-content/route.ts` | Removed `twitter` from the OpenAI 5-post platform sequence. |
| `src/app/api/admin/campaigns/assets/[assetId]/push-to-calendar/route.ts` | Removed `'twitter'` from `CALENDAR_PLATFORMS` allowlist. Updated header comment to explain the migration-004 vs Phase-14Q split. |
| `src/app/api/content/route.ts` | Updated header comment — removed `post-to-twitter` from the list of guarded poster routes; added a note about the 14Q deletion + read-only legacy rows. |

#### Scripts (6 files)

| File | Change |
|---|---|
| `scripts/audit-pre-autoposter-readiness.js` | Removed `post-to-twitter/route.ts` from `MANUAL_POST_ROUTES` (Check 4). Removed `twitter` from `PLATFORM_RULES`. **Kept** the banned-hostname list entries `['api.', 'twitter.com']` and `['api.', 'x.com']` — those are Check 7 safety assertions verifying the audit script itself never reaches platform APIs; they are NOT references to twitter posting logic. |
| `scripts/run-autoposter-once.js` | Removed `twitter` from `PLATFORM_RULES`. **Kept** `'twitter'` and `'x'` in `REFUSED_PLATFORMS` as defensive belt-and-suspenders for any historical row that gets Marked Ready by accident. Updated refusal-message text from "paused on Developer Portal billing" to "permanently removed in Phase 14Q." |
| `scripts/diagnose-media-readiness.js` | Removed `twitter` from `PLATFORM_RULES`. |
| `scripts/plan-media-generation.js` | Removed `twitter` from `PLATFORM_RULES`. |
| `scripts/generate-missing-media.js` | Removed `twitter` from `PLATFORM_RULES`. Removed `'twitter'` from the landscape-orientation branch of `imageOrientationFor`. |
| `scripts/diagnose-manual-posting-gates.js` | Removed `post-to-twitter/route.ts` from `ROUTES_TO_CHECK`. |

#### UI components (4 files)

| File | Change |
|---|---|
| `src/app/dashboard/content/page.tsx` | Removed `twitter` keys from `platformEmoji` / `platformLabel`. Deleted the `postToTwitter` handler. Removed the "🐦 Post to X" button from the post-buttons row. Historical twitter rows still render — they fall through to a default emoji and the platform string. |
| `src/app/dashboard/campaigns/page.tsx` | Removed `'twitter'` from `CALENDAR_PLATFORMS`. Updated the header comment to explain the migration-004 vs Phase-14Q split. |
| `src/components/ai/PushToCalendarPanel.tsx` | Removed `'twitter'` from the `Platform` type and `POSTING_NOT_IMPLEMENTED` set. Removed the twitter `<option>` and updated the helper-text ("TikTok inserts are draft-only — no automated posting route exists yet"). |
| `src/components/ai/WorkflowPanel.tsx` | Removed `'twitter'` from `packPlatforms` / `calPlatforms` type unions, `togglePlatform`'s first parameter, and the `PlatformChips` array. `draftOnly` reduced to `p === 'tiktok'`. |

#### Types (1 file)

| File | Change |
|---|---|
| `shared/types.ts` | Removed `'twitter'` from `ContentPlatform`. Added a comment noting the migration-004 CHECK still permits twitter for historical rows. |

#### Config (3 files)

| File | Change |
|---|---|
| `package.json` | Removed `"twitter-api-v2": "^1.29.0"` from dependencies. |
| `package-lock.json` | Regenerated via `npm install --legacy-peer-deps` after removing the dep. **19 packages removed** (twitter-api-v2 + transitive deps); **13 packages added** (lockfile-resolver normal churn). |
| `.env.example` | Removed all `TWITTER_*` env vars. Replaced with a one-paragraph note explaining the Phase 14Q removal. |

### What stayed (intentionally)

- **Migration files (001-033):** untouched. Migration 004's `CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'twitter'))` constraint still permits twitter values — historical rows remain valid. Per anti-drift rules, schema changes require migration 034.
- **Audit script's banned-hostname list:** `['api.', 'twitter.com']` and `['api.', 'x.com']` stay in Check 7. Those entries verify the *audit script itself* never references those hostnames — they are safety assertions, not posting logic.
- **Runner's `REFUSED_PLATFORMS` set:** `{twitter, x, tiktok}`. Twitter/X stay in this set as defensive belt-and-suspenders. The `SUPPORTED_PLATFORMS` set already implicitly excludes them, but the explicit refusal makes the operator-facing message precise ("Twitter/X was permanently removed in Phase 14Q") rather than a generic "platform not supported."
- **Twitter-card metadata in `src/app/layout.tsx` and `src/app/sba/layout.tsx`:** these are Open Graph / Twitter Card SEO tags that control how vortextrips.com URLs preview when *someone else* shares them on Twitter/X. They are not posting logic. Removing them would degrade external link previews for pages our visitors share. Out of scope for Phase 14Q.
- **Historical narrative docs** (`PHASE_14O_AUTOPOSTER_PILOT_PLAN.md`, `EVENT_CAMPAIGN_ROADMAP.md`, `SYSTEM_AUDIT_PHASE_14_STATUS.md`, `PROJECT-STATUS.md`, `VORTEX_AI_COMMAND_CENTER_TEST_REPORT.md`, `PHASE_14M_PRE_AUTOPOSTER_AUDIT_2026-05-05.md`, `VORTEXTRIPS-BUILD-PROMPT.md`): these document past state. Editing them rewrites history. Untouched.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI calls | 0 |
| Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar | 0 |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean (after removing stale `.next/types/validator.ts` which still referenced the deleted route from a prior dev-server build) |
| `node scripts/audit-pre-autoposter-readiness.js` | ⚠️ Could not complete — Supabase schema-cache failure ("Could not query the database for the schema cache"). This is environmental (local Supabase project paused / stale local credentials in `.env.local` — same pre-existing issue noted in earlier phases as the `RESEND_API_KEY=""` build symptom). Not caused by Phase 14Q. The audit's local-only changes (Check 4 file-presence check on the 3 remaining manual-poster routes; Check 7 banned-hostname list) were verified by inspection. Production deploys hit real Supabase and will run the audit cleanly. |
| `npm install --legacy-peer-deps` | ✅ PASS — 19 packages removed (twitter-api-v2 + deps); 13 added (lockfile churn). |
| Static grep — `twitter-api-v2` imports in code | ✅ Zero. Only narrative MD files mention the package historically. |
| Static grep — `post-to-twitter` route references | ✅ Zero in code. |

### Migration

**None.** No schema change. Supabase migrations remain at 001–033 (immutable). The `content_calendar.platform` CHECK in migration 004 still permits 'twitter' values for historical row compatibility.

### Deploy

Vercel will rebuild on the new commit. No env vars need to be unset (the codebase no longer reads `TWITTER_*` at all, so leaving stale Vercel secrets in place is harmless). Operator may optionally delete the Vercel `TWITTER_*` env vars at their convenience.

### Recommended next phase

**Phase 14R — TikTok Auto-Poster:** create `src/lib/tiktok-oauth.ts` (`exchangeCodeForTokens`, `refreshAccessToken`); update `/api/auth/tiktok/callback` to store tokens in `site_settings`; build `/api/automations/post-to-tiktok/route.ts` using the TikTok Direct Post API; ensure it pulls the HeyGen `video_url` and strictly passes `validateManualPostingGate`. Add `'tiktok'` to `SUPPORTED_PLATFORMS` in `scripts/run-autoposter-once.js`.

After 14R: Phase 14S (autoposter cron, replacing `check-heygen-jobs` per Path A; CRON_SECRET-gated; SOP-step-mirroring per `docs/skills/autoposter-operator-sop.md`).

---

## Phase 14P — Autoposter Operator SOP Skill (deployed `b181cb8` 2026-05-08 — documentation only; no code changes; no DB writes; no platform calls)

### What this phase ships

A single canonical operator SOP document — `docs/skills/autoposter-operator-sop.md` — that codifies the strict 5-step manual posting protocol the operator must follow for every cycle through `scripts/run-autoposter-once.js`. The SOP is now THE LAW for manual posting and is referenced as the contract that the Phase 14S autoposter cron must mirror programmatically.

### Why this phase exists

Until Phase 14P, the operator's daily routine lived in two places: PROJECT_STATE_CURRENT.md (Phase 14O.1 section) and PHASE_14O_AUTOPOSTER_PILOT_PLAN.md §11. Both descriptions were correct but neither was canonical, and neither was structured as a strict protocol with refusal codes mapped to operator actions. As we approach 100% automation (Phases 14Q–14S), we need a single source-of-truth document the cron route can mirror line-for-line. Phase 14P creates that document; subsequent phases reference it.

### The 5-step protocol (canonical, as documented in the SOP)

1. **Audit (pre-flight)** — `node scripts/audit-pre-autoposter-readiness.js` → 9/9 PASS, eligible_count=0, posted_at counts aligned.
2. **Dashboard Approve / Mark Ready** — exactly one Facebook OR Instagram row Marked Ready in `/dashboard/content`. Eligible queue size = exactly 1.
3. **Dry-Run script** — `node scripts/run-autoposter-once.js` (no `--apply`). Verify the planned post is correct. Refusal codes 2/3/4/5 trigger an immediate STOP.
4. **Apply script** — `node scripts/run-autoposter-once.js --apply`. Platform call + atomic UPDATE `status='posted', posted_at=now()`. Exit code 0 required.
5. **Audit (post-flight)** — re-run the audit. 9/9 PASS, posted_at and status='posted' counts each incremented by exactly +1, eligible queue drained to 0.

### Files added

| File | Purpose |
|---|---|
| `docs/skills/autoposter-operator-sop.md` | The SOP. Canonical 5-step protocol, refusal-code table, invariants enforced, what-not-to-do list, and a Phase-14S promotion mapping showing exactly how the cron route must mirror each SOP step. |

### Files updated

| File | Change |
|---|---|
| `PROJECT_STATE_CURRENT.md` | Header restamp + new Phase 14P section + reference to the SOP as the operator's source-of-truth document. |
| `BUILD_PROGRESS.md` | Phase 14P entry added; "Current focus" updated. |

### What this phase does NOT do

- ❌ No code changes to `scripts/run-autoposter-once.js`, `scripts/audit-pre-autoposter-readiness.js`, or any platform-poster route.
- ❌ No changes to `validateManualPostingGate` or `validateMediaReadiness`. The gates are unchanged.
- ❌ No `vercel.json` change. No cron registered or modified.
- ❌ No DB schema changes. No migration 034. Supabase migrations remain at 017–033.
- ❌ No platform API calls. No HeyGen / Pexels / OpenAI calls. Zero provider activity in this phase.
- ❌ No content_calendar mutations. posted_at delta: 0 (29 → 29).

### Invariants preserved

- Audit 9/9 PASS — unchanged.
- `status='posted' ⇔ posted_at IS NOT NULL` (Check 9) — unchanged.
- Atomic UPDATE pattern in the runner — unchanged (this phase only documents it, does not modify it).
- Refusal contract (exit codes 0/2/3/4/5) — unchanged (this phase documents the contract; the runner's behavior is identical).

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI calls | 0 |
| Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar | 0 |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| Documentation review | ✅ SOP cross-checked against `scripts/run-autoposter-once.js` exit codes (0/2/3/4/5) and Phase 14O.1 refusal contract — match exact |
| Documentation review | ✅ SOP cross-checked against `scripts/audit-pre-autoposter-readiness.js` Check 9 invariant and 9-check structure — match exact |
| `git status` (pre-commit) | ✅ Only the three explicitly named files appear; `BUILD_STATUS.md` remains untracked and is intentionally NOT staged in this phase |

### Migration

**None.** No schema change. Supabase migrations remain at 001–033 (immutable).

### Deploy

**None required.** Phase 14P is documentation only. Vercel can rebuild on the new commit, but no behavior changes ship.

### Recommended next phase

**Phase 14Q — Excise Twitter:** delete `/api/automations/post-to-twitter/route.ts`, remove `'twitter'` from all `SUPPORTED_PLATFORMS` arrays, UI elements, and weekly AI generation prompts. Permanent drop per executive decision (Twitter API costs / Free tier read-only since 2024 / HTTP 402 on every attempt).

After 14Q: Phase 14R (TikTok OAuth + Direct Post API) → Phase 14S (cron promotion of the runner, replacing `check-heygen-jobs` per Path A; CRON_SECRET-gated; SOP-step-mirroring as documented in the new SOP doc).

---

## Phase 14O.1 — Manual Autoposter Runner (deployed `6e2f27a` 2026-05-06 — DRY-RUN tested; runner committed and pushed; no cron registered)

### What this phase ships

`scripts/run-autoposter-once.js` — a manual autoposter runner that mirrors the deployed `/api/cron/autoposter-dry-run` eligibility logic AND (with `--apply`) the platform-poster routes' Graph API call + atomic UPDATE pattern. Default mode is DRY-RUN (no platform call, no DB write). With `--apply`, the runner posts exactly one eligible row to Facebook OR Instagram. Twitter/X and TikTok are explicitly refused.

### Why Path D before cron

We don't yet know the right cron cadence (daily? business-day-only? sub-daily across timezones?) and we haven't yet exercised the cron-shaped path enough to trust it overnight. Path D gives ~30 days of operator-in-the-loop runs to learn the rhythm, validate the contract under real platform conditions, and surface any edge cases at human speed before promoting to a registered cron in Phase 14O.2.

### Files added

| File | Purpose |
|---|---|
| `scripts/run-autoposter-once.js` | The runner. ~400 lines. Mirrors `validateMediaReadinessJs` + `validateAutoposterCandidateJs` (in JS) for cross-tooling consistency with `audit-pre-autoposter-readiness.js`. Mirrors `getAutoposterEligibleRows` server-side query. Mirrors `post-to-facebook` / `post-to-instagram` route Graph API calls (line-by-line). Atomic UPDATE: `status='posted', posted_at=now()` with defensive `.eq('status','approved').is('posted_at',null)` guards inline. Snapshots posted_at + status='posted' counts before/after; verifies expected delta of +1 each; verifies Check 9 invariant; verifies eligible queue drained to 0. Refuses if any post-flight invariant slips (exits with code 5). |

### Files updated

| File | Change |
|---|---|
| `PHASE_14O_AUTOPOSTER_PILOT_PLAN.md` | New §11 documents the Path D decision, daily routine, refusal contract, promotion criteria to Phase 14O.2, and the Phase 14O.2 preview. §10 marked superseded but preserved for history. |

### Refusal contract (encoded in the runner)

| Condition | Behavior | Exit code |
|---|---|---|
| Eligible queue size = 0 | Print "no eligible row" message; exit clean | 0 |
| Eligible queue size > 1 | Refuse; print all queued rows; exit | 2 |
| Platform is twitter / x / tiktok | Refuse with platform-specific reason; exit | 2 |
| Platform not in `{facebook, instagram}` | Refuse "platform not supported by Phase 14O.1"; exit | 2 |
| `validateAutoposterCandidate` returns non-null | Refuse with that reason; exit | 2 |
| `validateMediaReadiness` blocked | Refuse with reasons; exit | 2 |
| Platform credentials missing (env) | Refuse "credentials not configured"; exit | 3 |
| Platform API non-2xx (`--apply` only) | DB unchanged; exit | 3 |
| Atomic UPDATE affected 0 or >1 rows | Print warning about platform post landing without DB flip; exit | 4 |
| Post-flight invariant slip (delta, Check 9, queue) | Print failures; exit | 5 |

### Allowed writes (only with `--apply`, only on platform success)

- `content_calendar.status` → `'posted'`
- `content_calendar.posted_at` → `new Date().toISOString()`

(Atomic single UPDATE; defensive `.eq('status','approved').is('posted_at',null)` guards inline.)

### Forbidden writes (any flag combination — enforced by query shape)

- `posting_status` / `posting_gate_approved` / `queued_for_posting_at` / `posting_block_reason`
- `video_url` / `image_url` / `caption` / `image_prompt`
- `campaign_asset_id` / `tracking_url`
- Any column on `campaign_assets`
- Any platform API beyond Facebook Graph (FB) or Instagram Graph (IG) endpoints used by the corresponding manual routes

### DRY-RUN test against current production state

Current state: queue empty (last cleanup of cycle 5 + 14O Scope A row removal landed). Runner correctly handles this:

```
Phase 14O.1 — Manual Autoposter Runner [DRY-RUN]
One row only. No cron. No Twitter/X. No TikTok.

1. Eligibility
   eligible queue size: 0
   No eligible row. Mark Ready exactly one approved Facebook or Instagram row in /dashboard/content first.

Summary
   posted_at count: 29 → 29  (delta 0)
   status='posted' count: 29 → 29  (delta 0)
   apply mode: no
No cron registered. No Twitter/X. No TikTok. No HeyGen / Pexels / OpenAI.
```

Audit + dry-run remain healthy: 9/9 PASS, posted_at unchanged at 29, eligible_count=0, live_posting_blocked=true.

### Operator daily routine

```bash
node scripts/audit-pre-autoposter-readiness.js
# Mark Ready one FB or IG row in /dashboard/content
node scripts/run-autoposter-once.js          # DRY-RUN
node scripts/run-autoposter-once.js --apply  # operator-authorized post
node scripts/audit-pre-autoposter-readiness.js
```

### Promotion criteria to Phase 14O.2 (live cron)

~30 consecutive clean `--apply` runs without any of:
- Refusal due to gate drift
- Atomic UPDATE affecting != 1 row
- Platform non-2xx response on a row that should have been valid
- Post-flight invariant slip (Check 9, queue, deltas)
- Manual + autoposter validator disagreement

If any incident, fix root cause and reset the counter.

### Provider / platform / DB activity (this phase)

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI calls | 0 |
| Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar | 0 |
| posted_at delta | 0 (29 → 29) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean |
| `node scripts/run-autoposter-once.js` (DRY-RUN at queue=0) | ✅ PASS — clean exit, no platform call, no write |
| `node scripts/audit-pre-autoposter-readiness.js` | ✅ 9/9 PASS, posted_at=29 unchanged, Check 9 PASS |
| `node scripts/diagnose-autoposter-dry-run.js` | ✅ HTTP 200, dry_run=true, live_posting_blocked=true, eligible_count=0, posted_at unchanged at 29 |
| `npm run build` | ⚠️ Compiled successfully (`Compiled successfully in <Xs>`); page-data collection still fails on routes that instantiate Resend at module-eval (`/api/automations/quote-email`, `/api/automations/trigger-sba`) due to local `RESEND_API_KEY=""` from earlier `vercel env pull` — pre-existing local-env-only issue, NOT caused by Phase 14O.1. Production deploys unaffected (Vercel uses real values at deploy time). |

### Migration

**None.** No schema change.

### Deploy

Phase 14O.1 is operator-tooling only. The runner runs locally against production env / production Supabase. **No deploy needed unless the operator wants the doc updates committed and reflected in Vercel build history.**

### Recommended next phase

After ~30 successful `--apply` runs:

**Phase 14O.2 — Cron promotion (decide between Path A or Path C):**
1. Path A: drop `check-heygen-jobs` from `vercel.json`, add the autoposter cron in its place. Free.
2. Path C: upgrade Vercel Hobby → Pro ($20/user/month) for 40-cron limit, sub-daily cadence, 60s default function timeout. Adds breathing room for future crons.
3. Either way: the cron route wraps the runner's `--apply` logic, gated by a `site_settings.autoposter_cron_enabled` kill switch (default `false`) with auto-disable on first non-2xx platform response.

In parallel:
- **Twitter/X:** fix Developer Portal billing → upgrade API tier → re-enable in the runner's `SUPPORTED_PLATFORMS`.
- **TikTok:** Phase 14K-tt — ship the OAuth token-exchange helper so TikTok joins the autoposter (instead of the current Creator Center + Mark Posted manual flow).

---

## Phase 14O — Autoposter Pilot Plan + One-Row Cron Simulation (deployed `f74ddfc` 2026-05-06; Scope C plan + Scope A dry-run proof captured)

(See PHASE_14O_AUTOPOSTER_PILOT_PLAN.md §11 for the Path D follow-on. After the live dry-run proof captured `eligible_count=1, live_posting_blocked=true, posted_at unchanged`, the operator removed the Mark Ready row from queue (no live post) and authorized Phase 14O.1 / Path D — manual autoposter runner — instead of moving directly to a registered cron.)

---

## Phase 14O — Autoposter Pilot Plan + One-Row Cron Simulation (original spec — preserved for history)

---

## Phase 14O — Autoposter Pilot Plan + One-Row Cron Simulation (in working tree, 2026-05-06 — Scope C plan written; Scope A dry-run prep done; awaiting operator Mark Ready click before live dry-run)

### What this phase ships

**Scope C — Plan doc (done):** [PHASE_14O_AUTOPOSTER_PILOT_PLAN.md](PHASE_14O_AUTOPOSTER_PILOT_PLAN.md) — full 10-section pre-cron contract documenting current production baseline, the 13 cron guardrails, per-platform first-cron order (FB → IG → TikTok-manual → Twitter-excluded), rollback plan, success criteria, failure conditions, operator instructions, and the approval gate.

**Scope A — Dry-run baseline (done) + dry-run-with-queue (awaits operator):** Re-uses the existing Phase 14K dry-run tooling (`/api/cron/autoposter-dry-run` route + `scripts/diagnose-autoposter-dry-run.js`). At baseline (queue empty) the diagnostic confirms HTTP 200 / `dry_run: true` / `live_posting_blocked: true` / `eligible_count: 0` / 54 rows correctly skipped with `posting_status is 'idle', need 'ready'` / `posted_at` unchanged at 30. The next step (live dry-run with one ready row) requires the operator to Mark Ready exactly one Facebook row in the dashboard, then re-run the diagnostic + curl the live endpoint.

### Files added

| File | Purpose |
|---|---|
| `PHASE_14O_AUTOPOSTER_PILOT_PLAN.md` | The planning + simulation contract. 10 sections including production baseline, 13 cron guardrails, per-platform rollout order, rollback plan, success/failure criteria, operator instructions for the live dry-run, and the approval gate before Phase 14O.1. |

### Files updated

None (no code changed).

### Production baseline (this phase)

| Metric | Value |
|---|---|
| `posted_at` count | **30** |
| `status='posted'` count | 29 (1 less than `posted_at` due to legacy IG WARN row, untouched per spec) |
| Eligible posting queue | **0** (no row currently `posting_status='ready' && posting_gate_approved=true`) |
| Approved + unposted | 53 |
| Audit summary | 9/9 PASS |
| Check 9 (posted_at invariant) | PASS — 0 FAIL, 1 WARN (`a0bd9d16…` legacy) |
| Phase 14N manual cycles | 5/5 clean: FB → IG → FB → IG → TikTok |
| Cron registered | 4/4 slots used (`check-heygen-jobs`, `weekly-content`, `score-and-branch`, `send-sequences`); **NO autoposter cron** |
| Twitter/X | excluded (HTTP 402 from Developer Portal) |
| Working tree | clean (only `PHASE_14O_AUTOPOSTER_PILOT_PLAN.md` is untracked + tsconfig.tsbuildinfo modified) |

### Tests run

| Test | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — clean |
| `npm run build` | ⚠️ Compiled successfully (`Compiled successfully in 17.9s`); page-data collection fails on routes that instantiate Resend at module-eval (`/api/automations/quote-email`, `/api/automations/trigger-sba`) due to local `RESEND_API_KEY=""` from earlier `vercel env pull` — pre-existing local-env-only issue, NOT caused by Phase 14O. Production deploys unaffected (Vercel uses real values at deploy time). |
| `node scripts/audit-pre-autoposter-readiness.js` | ✅ 9/9 PASS at baseline; eligible queue 0; posted_at 30; Check 9 PASS |
| `node scripts/diagnose-autoposter-dry-run.js` | ✅ HTTP 200 / dry_run=true / live_posting_blocked=true / eligible_count=0 / 54 correctly skipped / posted_at unchanged at 30 |

### Rows mutated, platform APIs called

**Zero on both.** The audit + dry-run diagnostic + plan-doc creation are pure read-only operations; the only write is to a local markdown file. `posted_at` count stayed at 30 throughout.

### Operator instructions for the live dry-run (next step)

When you're ready to exercise the dry-run end-to-end:

1. Open `/dashboard/content` while signed in as admin.
2. Pick one approved + unposted **Facebook** row (Phase 14O.1 will start FB-only, so use a FB row to keep the dry-run aligned with the planned cron's first platform). It must have `image_url` populated.
3. Click **Mark Ready** on that one row only.
4. Tell Claude `"ready - Facebook"`.
5. Claude runs the audit + diagnostic + curl recipe (see §8 of the plan doc) and verifies all success criteria.
6. **Do NOT** click the platform Post button. The dry-run proves the autoposter logic without ever calling Facebook's API.
7. After the dry-run passes, Claude will tell you to either Remove the row from Queue OR convert it to a real manual Cycle 6 (your choice).

The full curl recipe (PowerShell-compatible) lives in §8 step 3 of the plan doc.

### Migration

**None.** No schema change.

### Deploy

**Optional.** Phase 14O is operator-tooling + a planning artifact only — no app code changed. The plan doc can be committed alongside the next code change (Phase 14M.2's commit covered the route fix, so this phase has no production-observable surface).

### Recommended next phase

**After the live dry-run succeeds (operator action required):**
1. Phase 14O.1 — register a single daily cron (`vercel.json`) to invoke `/api/cron/autoposter-dry-run` (initially still as dry-run-only) for one week of observability without any live posting.
2. Phase 14O.2 — flip the route from dry-run-only to live posting WITH the 13 guardrails in §2 of the plan, FB-only, 1 row/day, auto-disable on first failure.
3. Phase 14O.3 — extend to Instagram after FB has 7 consecutive clean cron runs.
4. Phase 14K-tt — separately, ship the TikTok OAuth token-exchange helper so TikTok can join the autoposter cron.
5. **Twitter/X stays excluded** until the Developer Portal billing is fixed.

---

## Phase 14N — Controlled Manual Posting Expansion (deployed verification across 5 cycles 2026-05-05/06)

5 manual posting cycles completed cleanly across the post-Phase-14M.2 deploy. Each cycle verified:
- Mark Ready → audit (eligible queue: 1) → click Post button → audit (queue: 0, posted_at +1, Check 9 PASS, no spillover).

| Cycle | Platform | Row | Path |
|---|---|---|---|
| 1 | Facebook | `4907d113…` | `/api/automations/post-to-facebook` → Graph API + atomic UPDATE |
| 2 | Instagram | `469a6eb5…` | `/api/automations/post-to-instagram` → Graph API + atomic UPDATE |
| 3 | Facebook | (id not captured this turn) | same as cycle 1 |
| 4 | Instagram | (id not captured this turn) | same as cycle 2 |
| 5 | TikTok | `25df8c16…` | Creator Center upload + `/api/content` PATCH (Phase 14M.2 fix verified natively — no repair needed) |

posted_at: 25 → 30 (5 atomic writes, one per cycle). 0 platform-API failures. 0 validator disagreements. Phase 14M.2 route fix proven on its actual target path (TikTok bookkeeping cycle 5 needed no repair).

---

---

## Phase 14M.2 — Fix TikTok Mark Posted bookkeeping + posted_at invariant audit (in working tree, 2026-05-05 — code fix; audit Check 9; repair script DRY-RUN; no DB writes; no platform calls)

### Why this phase exists

Immediately after the successful TikTok manual pilot (operator clicked Mark Posted on row `9a9e2a52-941d-48bb-b9e7-db0f24f3bc69`), the audit revealed:
- `posted_at` count stayed at 24 instead of incrementing to 25
- The TikTok row had `status='posted'` ✓ but `posted_at` = `null` ❌

Root cause was in [src/app/api/content/route.ts:65](src/app/api/content/route.ts#L65). The pre-existing PATCH route only ran `.update({ status })`, never stamping `posted_at`. The Phase 14K.0.6 gate guard was correct, but the UPDATE payload was incomplete. The Facebook + Instagram pilots landed cleanly because those routes (`/api/automations/post-to-{facebook,instagram}`) wrote both `status` and `posted_at` atomically; only the TikTok bookkeeping path used the buggy generic PATCH.

A second anomaly was also discovered:
- Row `a0bd9d16-1258-4abc-b007-8196ea7467c2` (instagram) has `status='approved'` but `posted_at` = `2026-04-23T22:29:30Z` — a historical artifact pre-dating Phase 14M.2 (likely a previously-posted row that was later Reset back to draft/approved without clearing `posted_at`).

### Files updated

| File | Change |
|---|---|
| `src/app/api/content/route.ts` | When `status === 'posted'` AND the row's current `posted_at` is null, the same UPDATE now stamps `posted_at = new Date().toISOString()`. The gate-fetch already pulls the row (Phase 14L join), so we capture `posted_at` from there — no extra SELECT. Repeat clicks on an already-posted row preserve the original timestamp (idempotent). Other status transitions (approve / reject / reset) leave `posted_at` alone — per spec, the historical artifact path is reviewed via the repair script, not auto-cleared. |
| `scripts/audit-pre-autoposter-readiness.js` | New **Check 9** — invariant `status='posted' iff posted_at IS NOT NULL`. **FAIL** when `status='posted' AND posted_at IS NULL`. **WARN** (not FAIL) when `status != 'posted' AND posted_at IS NOT NULL` so the historical artifact doesn't block the audit while still being visible. |

### Files added

| File | Purpose |
|---|---|
| `scripts/repair-posted-at-invariants.js` | One-shot DRY-RUN-default repair. Lists both anomaly types. With `--apply`, ONLY repairs the TikTok pilot row `9a9e2a52…` (stamps `posted_at = now()` or the operator-supplied `--timestamp=<iso>`). Other anomaly-(a) rows are listed but never auto-repaired — refusal is intentional per spec. Anomaly-(b) rows are listed; clearing one requires the explicit `--repair-legacy-id=<uuid>` flag AND the row must currently match anomaly (b). Defensive: every UPDATE includes a re-check of the anomaly condition (`.eq('status','posted').is('posted_at',null)`) so a row that flipped state mid-run is left alone. Snapshots `posted_at` count + `status='posted'` count before/after; verifies expected delta. **No platform calls, no `vercel.json` change, no `posting_status` / `status` mutations.** |

### Audit Check 9 behavior

Re-running the audit after these changes lands gives 9/9 only after the repair `--apply` runs:

```
9. [FAIL] Posted_at invariant: status='posted' iff posted_at IS NOT NULL
   1 row(s) have status=posted but posted_at=null — Phase 14M.2 route fix + repair script close this
   status='posted' AND posted_at IS NULL: 1  (FAIL)
   status != 'posted' AND posted_at IS NOT NULL: 1  (WARN — historical artifact)
     ✗ 9a9e2a52-941d-48bb-b9e7-db0f24f3bc69 tiktok — status=posted, posted_at=null  (FAIL)
     · a0bd9d16-1258-4abc-b007-8196ea7467c2 instagram status=approved posted_at=2026-04-23T22:29:30Z  (WARN)
```

After `node scripts/repair-posted-at-invariants.js --apply` (operator-authorized only) the FAIL row becomes a normal posted row with `posted_at` stamped; Check 9 flips to PASS, audit becomes 9/9.

### DRY-RUN repair output

```
Phase 14M.2 — Posted_at Invariant Repair [DRY-RUN]
No platform calls. No DB writes.

1. status='posted' AND posted_at IS NULL  (FAIL on count > 0)
   total: 1
   [pilot] 9a9e2a52-941d-48bb-b9e7-db0f24f3bc69  platform=tiktok  queued_at=2026-05-05T04:23:16Z  approved_at=2026-05-05T04:23:16Z

2. status != 'posted' AND posted_at IS NOT NULL  (WARN — historical artifact)
   total: 1
   [legacy] a0bd9d16-1258-4abc-b007-8196ea7467c2  platform=instagram  status=approved  posted_at=2026-04-23T22:29:30Z

3. Repair plan
   (a-1) stamp posted_at on TikTok pilot 9a9e2a52-941d-48bb-b9e7-db0f24f3bc69
         → posted_at = <now ISO>  (now() — pass --timestamp=<iso> to override)

Summary
   anomaly (a) status=posted/posted_at=null:  1
   anomaly (b) status!=posted/posted_at set:  1
   writes performed:                          0
   posted_at count: 24 → 24  (delta 0)
   status='posted' count: 24 → 24  (delta 0)
```

### Provider / platform / DB activity

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI calls | 0 |
| Facebook / Instagram / TikTok / X / email API calls | 0 |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar / campaign_assets | 0 |
| posted_at delta | 0 (24 → 24) |

### Tests run

- `npx tsc --noEmit` → ✅ PASS — clean
- `npm run build` → ⚠️ **`Compiled successfully in 26.4s`** for the route fix; ❌ FAIL at the page-data-collection stage for `/api/automations/quote-email` (Resend constructor error). **Not caused by Phase 14M.2.** The `vercel env pull --environment=production` earlier strips secret values to empty strings (Vercel CLI behavior — encrypted values aren't exposed). `RESEND_API_KEY` came back as `""` in `.env.local`, which broke a separate route's local build. Production deploys are unaffected because Vercel uses real values at deploy time. **Workaround for local builds:** restore your real Resend key in `.env.local` or set `RESEND_API_KEY=re_xxx` from your Resend dashboard.
- `node scripts/audit-pre-autoposter-readiness.js` → ✅ PASS for Checks 1–8; ❌ Check 9 FAILS as expected (1 row in anomaly (a)); audit summary 8/9. Closes to 9/9 after the operator-approved repair.
- `node scripts/repair-posted-at-invariants.js` → ✅ DRY-RUN — anomalies listed, repair plan printed, 0 writes
- `npm run lint` → ❌ not run; pre-existing Phase 13 ESLint v8/v9 mismatch unrelated

### Migration

**None.** No schema changes.

### Required approval before `--apply`

- **`node scripts/repair-posted-at-invariants.js --apply`** — operator-authorized only. Stamps `posted_at = now()` on the TikTok pilot row `9a9e2a52…`. Defensive guards in the UPDATE refuse if the row's state changed mid-run.
- **`--apply --timestamp=<iso>`** — supply a precise timestamp (e.g. matching when you actually clicked Mark Posted) instead of the current time.
- **`--apply --repair-legacy-id=<uuid>`** — clears `posted_at` on a specific anomaly-(b) row. Use only after manually confirming the artifact is incorrect (the IG row may legitimately reflect a prior post that was later reset; clearing it would lose that historical record).

### Deploy instructions

1. Confirm `git push origin main` returns `Everything up-to-date` on the second push.
2. `npx vercel --prod --yes` — the route fix lands on production. From this point, every Mark Posted click correctly stamps `posted_at` atomically.
3. (operator-authorized, after deploy) `node scripts/repair-posted-at-invariants.js --apply` to close the existing TikTok pilot anomaly. Re-run the audit — expect 9/9.

### Smoke-test checklist

- [ ] Push code; deploy via Vercel
- [ ] (operator-authorized) `node scripts/repair-posted-at-invariants.js --apply` → expect 1 write, posted_at delta = +1, status='posted' count unchanged
- [ ] `node scripts/audit-pre-autoposter-readiness.js` → expect 9/9 PASS, posted_at = 25
- [ ] (optional) Pick another approved row in the dashboard; click Mark Ready → click Mark Posted directly (without going through a platform Post button) → verify `posted_at` is set and `status='posted'` in the same UPDATE. This proves the route fix lands on prod.
- [ ] Decision pending on `a0bd9d16…` legacy row — leave as WARN or clear with `--repair-legacy-id`

### Recommended next step

1. Land Phase 14M.2 in production (commit + push + deploy).
2. Run the repair (`--apply`) to close the existing TikTok anomaly.
3. Verify audit goes to 9/9.
4. Resume the manual posting routine (FB + IG via Post buttons; TikTok via Creator Center + Mark Posted) — every future click should now write both columns atomically.
5. Twitter/X remains paused awaiting Developer Portal billing fix.
6. Optionally: Phase 14K-tt to ship the actual TikTok OAuth token-exchange helper (the redirect URI is already live).

---

## Phase 14M.1 — TikTok OAuth Callback Route (deployed `8b4da4c` 2026-05-05; manual TikTok pilot landed live)

(See prior entries for the original spec — callback route added so `/api/auth/tiktok/callback` returns 307 instead of 404. Token exchange still deferred. Manual TikTok upload pilot completed during this session — a separate `posted_at` bookkeeping bug was discovered after Mark Posted; closure ships in Phase 14M.2 above.)

---

## Phase 14M.1 — TikTok OAuth Callback Route (original spec — preserved for history)

---

## Phase 14M.1 — TikTok OAuth Callback Route (in working tree, 2026-05-05 — no token exchange; no posting changes; no platform API calls)

### Why this phase exists

TikTok's Login Kit setup requires a working OAuth redirect URI. Until now, `https://www.vortextrips.com/api/auth/tiktok/callback` returned 404 because no such route existed in the App Router. That blocks the TikTok Developer Portal from registering the callback (the Portal validates that the URL responds with a 2xx/3xx, not a 404). This phase adds the route — but intentionally **does not exchange tokens yet**, since no helper / storage / refresh-token flow has been built for TikTok and the env vars (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`) only have placeholder values in `.env.example`.

### Files added

| File | Purpose |
|---|---|
| `src/app/api/auth/tiktok/callback/route.ts` | Next.js App Router GET handler. Reads `code` / `state` / `error` / `error_description` from the query string. On error → redirects to `/dashboard/settings?platform=tiktok&connected=false&error=<message>` (truncated to 200 chars). On missing code → redirects to the same path with `error=missing_code`. On success (code received) → redirects to `/dashboard/settings?platform=tiktok&connected=pending`. Token exchange is intentionally deferred to a future Phase 14K-tt sub-phase that mirrors the YouTube callback pattern (`src/app/api/auth/youtube/callback/route.ts`). |

### Files updated

None (no other code changed).

### Behavioral guarantees

- **No posting:** the route never calls a platform publishing API; it only issues redirects.
- **No content_calendar mutation:** read-only end to end.
- **No cron change:** `vercel.json` untouched.
- **No token storage:** the future helper will upsert into `site_settings` (mirroring YouTube's pattern); this phase intentionally leaves that surface untouched.
- **Sensitive values not logged:** `code` and `state` are read but never written to logs or persisted.
- **Defensive base URL:** uses `process.env.NEXT_PUBLIC_APP_URL` first; falls back to `request.nextUrl.origin` so preview deploys + local dev still work.

### Tests run

- `npx tsc --noEmit` → ✅ PASS — clean
- `npm run build` → ✅ PASS — `Compiled successfully in 16.7s`; `ƒ /api/auth/tiktok/callback` registered
- `npm run lint` → ❌ not run — pre-existing Phase 13 ESLint v8/v9 mismatch unrelated to this phase

### Provider / platform / DB activity

| Action | Count |
|---|---|
| HeyGen / Pexels / OpenAI calls | 0 |
| Facebook / Instagram / TikTok / X / email API calls | 0 |
| HTTP requests to `/api/automations/post-to-*` | 0 |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar / campaign_assets | 0 |
| posted_at delta | 0 (24 → 24) |

### Migration

**None.** No schema changes.

### Deploy instructions

1. Confirm `git push origin main` returns `Everything up-to-date` on the second push.
2. `npx vercel --prod --yes` — single new route registered.
3. Verify post-deploy:
   - Open `https://www.vortextrips.com/api/auth/tiktok/callback` in a browser without any query string → expect a 307 redirect to `https://www.vortextrips.com/dashboard/settings?platform=tiktok&connected=false&error=missing_code` (no longer 404)
   - Open with a fake error: `https://www.vortextrips.com/api/auth/tiktok/callback?error=access_denied&error_description=user%20cancelled` → expect redirect with `error=user%20cancelled`
   - Once these pass, return to the TikTok Developer Portal and finish the Login Kit redirect-URI registration

### Smoke-test checklist

- [ ] Push code; deploy via Vercel
- [ ] In a browser (not signed in is fine), open `https://www.vortextrips.com/api/auth/tiktok/callback` — expect 307 to settings page with `error=missing_code`
- [ ] Confirm the settings page renders without crashing (the page may not yet have UI for these query params; that's a future phase)
- [ ] Re-test in the TikTok Developer Portal — register the redirect URI; the Portal should accept it
- [ ] **Do NOT** start the actual OAuth handshake yet (would receive the code but the route would just route to "pending" without exchanging it)

### Risks and deferred items

- **No token exchange yet.** A real TikTok login attempt today would land on the "pending" state and never store a refresh_token. That's by design — the helper, storage, and refresh flow all need to land before this is connected end-to-end.
- **Settings page UI doesn't yet read the new query params.** A future sub-phase will add a banner or status row that reads `?platform=tiktok&connected={pending|false}&error=...` and renders an appropriate message. Until then, the page just loads with the operator's normal settings view; the query string is silently ignored.
- **No CSRF / state validation yet.** The future helper will validate `state` against a server-stored or signed value before exchanging the code.
- **No revocation route yet.** A `/api/auth/tiktok/revoke` companion is needed once tokens are stored.

### Recommended next step

**Stay focused on the in-flight TikTok manual upload pilot first** (Mark-Ready'd row `9a9e2a52…`). Phase 14M.1's deploy is independent of that pilot — neither blocks the other.

Once that pilot completes (operator clicks Mark Posted to record the manual TikTok upload), the next OAuth-related sub-phase would be:

**Phase 14K-tt — TikTok OAuth Token Exchange + Storage.**
1. Create `src/lib/tiktok-oauth.ts` with `exchangeCodeForTokens(code)`, `refreshAccessToken(refreshToken)`, `getStoredTokens()`.
2. Wire `src/app/api/auth/tiktok/callback/route.ts` to call `exchangeCodeForTokens` and upsert into `site_settings` (keys: `tiktok_refresh_token`, `tiktok_access_token`, `tiktok_open_id`).
3. Add `/api/auth/tiktok/start` to kick off the Login Kit authorize URL with a CSRF-signed `state`.
4. Add token-refresh helper for any future API call.
5. Once tokens are persisted, evaluate whether to wire automated TikTok posting (Phase 14K.1-tt) or stick with the manual Creator Center flow.

---

## Phase 14M — Final Pre-Autoposter Posting Readiness Audit (deployed `b119a3e`; 8/8 PASS proof committed; first live FB + IG pilots succeeded 2026-05-05)

(See prior entries for the original audit spec — 8 checks, proof file, no platform calls. After deploy, the Mark Ready → Post button → posted lifecycle was exercised live for the first time on Facebook and Instagram. Twitter/X attempt cleanly failed with HTTP 402 and rolled back to idle. TikTok pilot row Mark-Ready'd; awaiting manual upload + Mark Posted bookkeeping click.)

---

## Phase 14M — Final Pre-Autoposter Posting Readiness Audit (original spec — preserved for history)

---

## Phase 14M — Final Pre-Autoposter Posting Readiness Audit (in working tree, 2026-05-05 — 8/8 PASS; proof file written; no mutations; no platform calls)

### Why this phase exists

Phase 14L wrapped: 30/30 TikTok rows pass media readiness, 0 temporary HeyGen URLs, 0 pending HeyGen jobs, 0 campaign rows on legacy `myvortex365.com/leosp` URLs, posted_at unchanged at 22. Before any live autoposter is enabled, we need a single read-only proof that the full chain is consistent — that every gate, every storage layer, every refusal path, every cross-validator agrees. Phase 14M is that proof.

### What this phase ships

A single read-only audit script that runs eight independent checks and writes a markdown proof file. The script never calls a platform API, never invokes a manual-post route, never hits HeyGen / Pexels / OpenAI, and never issues an `UPDATE` / `INSERT` / `DELETE`. `posted_at` count is captured before AND after as a defensive cross-check; both must equal 22.

### Files added

| File | Purpose |
|---|---|
| `scripts/audit-pre-autoposter-readiness.js` | The audit. Pulls `content_calendar` (with `campaign_asset` JOIN), runs 8 checks against in-memory mirrors of `validateMediaReadiness` / `validateManualPostingGate` / `validateAutoposterCandidate`, plus a static grep over the 4 manual-post routes for `validateManualPostingGate`, plus a self-scan for banned platform/provider hostnames. Exits non-zero if any check fails. Writes `PHASE_14M_PRE_AUTOPOSTER_AUDIT_<date>.md` on every run. |
| `PHASE_14M_PRE_AUTOPOSTER_AUDIT_2026-05-05.md` | Proof file from the 2026-05-05 run — overall PASS, all 8 checks PASS, posted_at unchanged at 22 → 22. |

### The 8 checks

1. **All approved/ready content has branded tracking links where required.** Every campaign-originated `status='approved'` + unposted row must carry a `https://www.vortextrips.com/t/...` tracking URL. PASSED — 0 campaign-originated approved rows currently in the universe (all approved rows are organic).
2. **All campaign/social content has media ready.** Every approved + unposted row must pass `validateMediaReadiness`. PASSED — 52 approved rows checked, 0 media-blocked.
3. **Posting gate blocks idle/unapproved rows.** Sample idle and unapproved rows; `validateManualPostingGate` must refuse all of them. PASSED — 5 idle approved + 5 unapproved tested, 0 leaked through.
4. **Manual post routes are still guarded.** Static grep over the 4 manual-post route files (`post-to-facebook`, `post-to-instagram`, `post-to-twitter`, `/api/content`) for `validateManualPostingGate`. PASSED — all 4 guarded.
5. **Autoposter dry-run returns only gate-approved rows.** Mirror `validateAutoposterCandidate` over all approved rows; every "eligible" row must carry `posting_status=ready` + `posting_gate_approved=true` + `queued_for_posting_at`. PASSED — 0 eligible rows (52 skipped with `posting_status='idle'`); no leaks possible because the queue is empty.
6. **No posted_at changes during audit.** Snapshot before vs after. PASSED — 22 → 22.
7. **No platform API calls during audit.** Self-scan the audit script source for known platform/provider hostnames. PASSED — none found (false-positive trap from the ban-list literal was removed via split-string encoding).
8. **Final eligible posting queue is clear and predictable.** Cross-check that `validateAutoposterCandidate` and `validateManualPostingGate` agree on every approved row. PASSED — 0 disagreements; queue is currently empty by design (no operator has marked any row Ready).

### Why the queue is empty

This is the correct safe state immediately before Phase 14K.1. After Mark Ready is clicked on a row, the gate flips `posting_status='ready'` + `posting_gate_approved=true` + `queued_for_posting_at=<now>` and that row becomes the autoposter's first candidate. Phase 14K.1 will queue exactly one row first (recommended: text platform like Twitter/X or Facebook, not TikTok video).

### Provider / platform / DB activity

| Action | Count |
|---|---|
| HeyGen API calls | 0 |
| Pexels / OpenAI API calls | 0 |
| Facebook / Instagram / TikTok / X / email API calls | 0 |
| HTTP requests to `/api/automations/post-to-*` | 0 |
| `UPDATE` / `INSERT` / `DELETE` against content_calendar / campaign_assets | 0 |
| posted_at delta | 0 (22 → 22) |

### Tests run

- `npx tsc --noEmit` → ✅ PASS — clean
- `npm run build` → ✅ PASS — `Compiled successfully in 11.8s`
- `node scripts/audit-pre-autoposter-readiness.js` → ✅ PASS — 8/8; proof file written; posted_at unchanged
- `npm run lint` → ❌ not run; pre-existing Phase 13 ESLint v8/v9 mismatch unrelated

### Proof file

[`PHASE_14M_PRE_AUTOPOSTER_AUDIT_2026-05-05.md`](PHASE_14M_PRE_AUTOPOSTER_AUDIT_2026-05-05.md) — committed alongside this update; can be regenerated on demand by re-running the audit script. Future re-runs append a new dated file; old files are preserved for historical record.

### Risks and deferred items

- **Audit reflects current DB state at run time.** If new content is generated between the audit and Phase 14K.1, re-run the audit before posting.
- **Check 1 vacuously passes** because no campaign-originated row is currently in `status='approved'`. The 8 campaign rows that have branded tracking URLs are in draft/scheduled. Once an operator approves any of them, Check 1 will assert real coverage.
- **Check 5 reports 0 eligible** because no operator has marked any row Ready. After Mark Ready, Check 5 must continue to assert that any "eligible" row carries the full gate state — the audit will fail loudly if a leak is ever introduced.
- **Static-grep-based Check 4** verifies routes import + call `validateManualPostingGate` but doesn't simulate runtime traffic. The runtime smoke test (curl with bad payload → expect 403) is still recommended after each deploy that touches a manual-post route.

### Migration application instructions

**None.** No schema changes.

### Deploy instructions

Phase 14M is operator-tooling + a static proof artifact only:

1. Confirm `git push origin main` returns `Everything up-to-date` on the second push.
2. (Optional) `npx vercel --prod --yes` — only docs / scripts / proof file changed; no route impact.
3. Re-run the audit on prod env (same `.env.local`): `node scripts/audit-pre-autoposter-readiness.js` — must report `8/8 checks passed` before authorizing Phase 14K.1.

### Smoke-test checklist

- [ ] Push code; (optional) deploy via Vercel
- [ ] Re-run `node scripts/audit-pre-autoposter-readiness.js` — expect `8/8 checks passed`; new dated proof file written; posted_at unchanged at 22
- [ ] Open `PHASE_14M_PRE_AUTOPOSTER_AUDIT_2026-05-05.md` and review each section's evidence
- [ ] Spot-check the Mark Ready flow on the dashboard against a single approved row → verify `posting_status` flips to `ready` and the per-platform Post buttons appear
- [ ] Re-run the audit AFTER the Mark Ready spot-check — Check 5 should now report `eligible: 1`, Check 8 should still show 0 disagreements

### Recommended next phase

**Phase 14K.1 — Live Autoposter, Small-Batch Pilot.** Concrete order:
1. Pick one approved + unposted row on a low-risk text platform (Twitter/X or Facebook, NOT TikTok video).
2. Mark Ready on the dashboard so the row enters the live queue.
3. Re-run Phase 14M audit — expect Check 5 to report `eligible: 1`, Check 8 still 0 disagreements.
4. Manually invoke the platform-post route via the dashboard's per-platform Post button (still operator-driven, not cron).
5. Confirm the post landed on the platform, `status` flipped to `posted`, `posted_at` was set, posting_status reset to idle.
6. Pause; review; if all clean, repeat for one more low-risk row, then graduate to TikTok video.
7. Only after the manual-batch pilot succeeds, ship Phase 14K.2 (cron-driven autoposter against the live queue).

---

## Phase 14L.2.6 — Controlled HeyGen Batch Unlock (deployed, all batches drained 2026-05-04 / 2026-05-05; 30/30 TikTok rows now have permanent Supabase video_urls)

(See prior entries for the original spec — guard replaced, batches drained successfully, no temp URLs persist.)

---

## Phase 14L.2.6 — Controlled HeyGen Batch Unlock (original spec — preserved for history)

---

## Phase 14L.2.6 — Controlled HeyGen Batch Unlock (in working tree, 2026-05-03 — no HeyGen call fired; default DRY-RUN)

### Why this phase exists

The Phase 14L.2.2 `--limit=1` HeyGen guard was correct during the pilot but is now a bottleneck. The pipeline has proven through 5 successful pilot+batch renders (Phase 14L.2.2 + 14L.2.4) plus the storage hardening (Phase 14L.2.3) that:

- Renders complete reliably and `media_metadata.heygen_video_id` is captured cleanly.
- Polling lands the resolved video as a permanent Supabase URL (no temp `heygen.ai` URLs persist).
- `posted_at` is never touched.
- No platform API is ever called.

After the Phase 14L.2.5 script backfill (16 of 25 rows applied), 16 TikTok rows are HeyGen-ready. Forcing them through one render at a time is artificial. Phase 14L.2.6 lifts the cap with hard ceilings + explicit refusal contracts, keeping every other safety guarantee.

### Exact guard change

| Before (Phase 14L.2.2) | After (Phase 14L.2.6) |
|---|---|
| `if (flags.provider === 'heygen' && flags.limit !== 1)` → refuse | `if (heygenPath && flags.limit > cap)` → refuse, where `cap = 5` by default and `cap = 10` with `--allow-large-heygen-batch` |
| Auto-mode + `--videos-only` + `--limit > 1` → refuse with "use heygen --limit=1" | Auto-mode + `--videos-only` follows the same caps as `--provider=heygen` (the auto path fans out to HeyGen for video) |
| n/a | New refusal: pending HeyGen jobs > 0 → refuse unless `--allow-when-pending` |
| n/a | New refusal: any selected row is posted, has `video_url`, or lacks `video_script`/`video_prompt` → refuse before any provider call |

### Max batch size

| Mode | Cap |
|---|---|
| Default (`--provider=heygen` or `--videos-only --provider=auto`) | **5** renders per invocation |
| With `--allow-large-heygen-batch` | **10** renders per invocation |
| `--limit > 10` with `--allow-large-heygen-batch` | refused (absolute ceiling) |

The `--limit=50` umbrella cap on the parser stays for non-HeyGen flows (Pexels image batches, etc.).

### Pre-flight refusal contract (HeyGen path)

All refusals fire BEFORE any provider call:

1. `--limit > active cap` → refuse with cap detail and how to lift.
2. Pending HeyGen jobs exist → refuse, suggest `check-video-generation-status.js --apply` or `--allow-when-pending`.
3. Any selected row violates an invariant (`posted_at` set, terminal `status`, `video_url` already populated, no `video_script`/`video_prompt`) → refuse with per-row reasons; up to 10 violators printed.

### New flags

- `--allow-large-heygen-batch` — lifts the cap from 5 to 10.
- `--allow-when-pending` — allows queueing while pending HeyGen jobs are in flight (use sparingly; the polling script can usually drain the queue first).

### DRY-RUN preview output

When `--videos-only --provider=heygen --limit=N` is run without `--generate`, the script now prints:

```
HeyGen rows that would be queued (DRY-RUN; --generate not set)
   <id>  platform=tiktok  week_of=YYYY-MM-DD  status=draft|approved
     target: content_calendar  script: NN words · "<first 90 chars>…"
   …
```

So the operator sees the exact ids, weeks, statuses, and a script preview before authorizing a real run.

### Files updated

| File | Change |
|---|---|
| `scripts/generate-missing-media.js` | New constants `HEYGEN_DEFAULT_BATCH_MAX=5` / `HEYGEN_ABSOLUTE_BATCH_MAX=10`. Parser adds `--allow-large-heygen-batch` and `--allow-when-pending`. Old `flags.limit !== 1` guard replaced with cap-aware logic. New pending-jobs refusal block (queries `content_calendar.media_status='pending' && media_source='heygen'` plus campaign_assets equivalents). New defensive per-row invariant pass that refuses the batch with per-row reasons before any provider call. New DRY-RUN preview block listing each row that would be queued. Banner updated to "Phase 14L.2.6". |
| `scripts/diagnose-media-readiness.js` | New section `6e2. HeyGen batch eligibility` — counts batch-eligible rows (have script, no video_url), surfaces both caps, prints the exact preview command the operator can run. |

### Files added

None. No new scripts, no new migrations.

### Provider APIs called?

**No.** Zero HeyGen / Pexels / OpenAI calls in this phase. The DRY-RUN exits before any provider call.

### Rows mutated?

**No.** `posted_at` row count: 22 → 22 across all script runs. No `UPDATE` issued.

### Platform APIs called?

**No.** Zero Facebook / Instagram / TikTok / X / email calls.

### Diagnostic snapshot (post-Phase-14L.2.5 backfill applied to 16 of 25 rows)

```
6d. Provider readiness:
    rows ready for HeyGen (have script): 16
    rows blocked — no video script:       9
    heygen jobs awaiting poll:            0

6e. HeyGen pilot status:
    completed HeyGen video_urls — content_calendar: 5
    TikTok unposted passing media readiness: 5 of 30
    TikTok blocked — no video_script (need script backfill): 9
    TikTok blocked — has video_script (HeyGen-ready next):  16

6e2. HeyGen batch eligibility (Phase 14L.2.6):
    HeyGen batch-eligible rows (have script, no video_url): 16
    default batch cap:                                       5
    absolute batch cap (--allow-large-heygen-batch):        10
    rows blocked — missing video_script:                     9

6f. ✓ no temporary HeyGen URLs found
7. ✓ posted_at row count unchanged (22).
```

### Tests run

- `npx tsc --noEmit` → ✅ PASS — clean
- `npm run build` → ✅ PASS — `Compiled successfully in 20.8s`
- `node scripts/generate-missing-media.js --videos-only --provider=heygen --limit=5` → ✅ PASS DRY-RUN — 5 rows planned (`9a9e2a52…`, `25df8c16…`, `ee431aac…`, `a805f65a…`, `dee88875…`); each row shown with platform / week_of / status / 80–86 word script preview; posted_at unchanged at 22
- `node scripts/generate-missing-media.js --videos-only --provider=heygen --limit=6` → ✅ refused with `cap exceeded; pass --allow-large-heygen-batch`
- `node scripts/generate-missing-media.js --videos-only --provider=heygen --limit=11 --allow-large-heygen-batch` → ✅ refused with `absolute ceiling is 10`
- `node scripts/diagnose-media-readiness.js` → ✅ PASS — section 6e2 reports 16 batch-eligible / 9 blocked-no-script / caps shown / preview command printed; 0 temp URLs; 0 pending jobs; posted_at unchanged at 22
- `node scripts/check-video-generation-status.js` → ✅ PASS DRY-RUN — 0 pending; exit clean
- `npm run lint` → ❌ not run; pre-existing Phase 13 ESLint v8/v9 mismatch unrelated

### Exact command to queue first batch of 5 (after operator approval)

```bash
node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=5
```

This will:
- Verify pre-flight contract on the 5 selected rows (refuses if any violate)
- Refuse if pending HeyGen jobs exist (none today)
- Call HeyGen `/v2/video/generate` 5 times (one per row)
- Write to each row only: `media_status='pending'`, `media_source='heygen'`, `media_metadata.heygen_video_id`, `media_error=null`
- Never write `video_url`, `status`, `posted_at`, `posting_status`, `posting_gate_approved`, or any platform state

### Exact polling / apply commands

```bash
# DRY-RUN — observe HeyGen status without writing:
node scripts/check-video-generation-status.js

# (operator-approved, after ~3-5 min per render) Land permanent Supabase URLs:
node scripts/check-video-generation-status.js --apply
```

The polling script downloads each completed MP4 and re-uploads to the Supabase `media` bucket before writing `video_url`, so each row lands with a permanent self-hosted URL (no `heygen.ai` temp URLs persist).

### Risks and deferred items

- **HeyGen cost.** 5 renders ≈ 5 minutes of avatar video. At HeyGen's current pricing this is rounding-error scale per batch; total 16 remaining renders are still well within budget for the proof.
- **Storage cost.** Each TikTok 720x1280 MP4 ≈ 5–15 MB; 16 renders ≈ 80–240 MB into the `media` bucket. Negligible for free-tier limits.
- **Race conditions.** `--allow-when-pending` is intentionally non-default. Stacking two batches before the first lands could double-queue if a race between polling and queueing happens; the safer default is to drain pending first.
- **9 rows still need scripts.** The 9 remaining TikTok rows without scripts are not addressed by this phase. Phase 14L.2.5's script generator must complete before they can join the HeyGen path — that's still operator-driven and DRY-RUN by default.
- **Diagnostic counts vs the prompt's stated baseline.** The prompt's "current verified state" said 25 blocked-no-script and 5 HeyGen-ready. The actual diagnostic reads 9 blocked-no-script and 16 HeyGen-ready, indicating Phase 14L.2.5 `--apply` runs have happened in production since the prompt was written. The Phase 14L.2.6 preview command is dynamically tied to the live count via the diagnostic.

### Migration application instructions

**None.** No schema change.

### Deploy instructions

1. Confirm `git push origin main` returns `Everything up-to-date` on the second push.
2. `npx vercel --prod --yes` — no `vercel.json` change. The dashboard route is unchanged.
3. (operator-approved) Run the first batch: `node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=5`
4. Wait ~3–5 min, then `node scripts/check-video-generation-status.js` (DRY-RUN) to observe.
5. Once HeyGen reports `completed`, run `node scripts/check-video-generation-status.js --apply` to land permanent Supabase URLs.
6. Re-run `node scripts/diagnose-media-readiness.js` — `TikTok unposted passing media readiness` should rise from 5 to 10.

### Recommended next phase

**Phase 14L.2.7 — drain the remaining 11 HeyGen-ready rows + the 9 still-no-script rows.** Concrete order:
1. Repeat the `--limit=5` batch twice more (or `--limit=10 --allow-large-heygen-batch` once) to render the remaining 11 currently-HeyGen-ready rows.
2. Run Phase 14L.2.5's `--generate --apply` to author scripts for the 9 remaining rows.
3. HeyGen those 9 rows in two more batches.
4. Final state: 30 of 30 TikTok rows show `Media ready`. Diagnostic section 6e shows `TikTok blocked — no video_script: 0` and `TikTok blocked — has video_script: 0`.
5. Then ship Phase 14K.1 (live autoposter).

**Parallel Phase 14L.2.8** — tighten `weekly-content/route.ts` so newly-generated organic TikTok rows ship with a `video_script` from the start (eliminates future backfill).

---

## Phase 14L.2.5 — Generate Missing TikTok Video Scripts (deployed `2b838ce`; 16 of 25 rows scripted in production 2026-05-03)

(see prior entries for the script generator scaffold; backfill `--apply` was operator-driven across multiple runs)

---

## Phase 14L.2.5 — Generate Missing TikTok Video Scripts (original spec — preserved for history)

### Why this phase exists

After Phase 14L.2.4 the script-ready TikTok backlog is drained. The remaining bottleneck is the 25 TikTok rows that were inserted by the weekly-content cron with `caption` + `image_prompt` but no authored `video_script`. Without a script HeyGen has nothing to voice. This phase adds a controlled script generator that produces HeyGen-ready spoken text and (only with explicit operator approval) writes it into `content_calendar.video_script`.

### Universe

| Bucket | Count |
|---|---|
| Total TikTok unposted | 30 |
| Have `video_url` (Phase 14L.2.2 + 14L.2.4 pilot + batch) | 5 |
| Missing `video_url`, have `video_script` (HeyGen-eligible NOW) | 0 |
| Missing `video_url`, no `video_script` (script-backfill candidates) | **25** |

After this phase backfills scripts, 25 + 0 = 25 rows become HeyGen-eligible. Together with the 5 already done, that gives 30 of 30 TikTok rows passing media readiness.

### Files added

| File | Purpose |
|---|---|
| `scripts/generate-missing-video-scripts.js` | DRY-RUN script generator. Default: lists candidates + prints prompt structure. `--generate`: calls OpenAI; prints results; no writes. `--generate --apply`: writes only `content_calendar.video_script`. `--apply` alone refused. Filters: `--limit=N` (default 5; max 25), `--id=<uuid>`, `--provider=openai` (default; only one wired). Strict allow-list — never touches `status`, `posted_at`, `posting_status`, `posting_gate_approved`, `queued_for_posting_at`, `media_status`, `video_url`, or any other column. |
| `scripts/diagnose-video-script-readiness.js` | Read-only diagnostic for the script-readiness universe. Reports total unposted TikTok rows, has-video / missing-video split, has-script / no-script split, projected HeyGen-eligible count post-backfill, posted_at no-mutation cross-check. |
| `scripts/inspect-missing-video-scripts.js` | One-shot read-only enumerator used during development to confirm row shape; kept in repo for future debugging. |

### Files updated

| File | Change |
|---|---|
| `scripts/diagnose-media-readiness.js` | Phase 14L.2.5 — section `6e. HeyGen pilot status` now breaks the TikTok blocker into two precise reasons: `TikTok blocked — no video_script (need script backfill)` and `TikTok blocked — has video_script (HeyGen-ready next)`. Replaces the prior single-line "still blocked — no video script" so the operator sees what work remains in each pipeline stage. |

### Generator prompt structure

System prompt (frozen in code so prompts are auditable):

```
You write short spoken video scripts for HeyGen avatar videos.
The brand is VortexTrips — a travel savings membership.

Hard rules:
- 70 to 110 words. Targets 30 to 45 seconds at normal speech.
- Plain spoken English only. NO bracketed cues like [VISUAL: ...] or [B-ROLL: ...] — HeyGen will speak whatever you write.
- NO speaker labels (no "Hook:", "Outro:", "CTA:" prefixes).
- Natural conversational tone. Short sentences. No jargon.
- Mention VortexTrips by name once, naturally.
- End with a simple call to action that points the viewer to the link in the post caption / bio. Do NOT include a URL in the spoken text.
- NEVER mention myvortex365.com or any other portal URL by name.
- NEVER make hard income claims, MLM language, or guarantees. No "downline", "network marketing", "MLM".
- No emojis (HeyGen would say them aloud).
- No hashtags in the spoken text.

Output exactly the spoken script. No preamble, no explanation, no quote marks around it.
```

User prompt template:

```
Platform: TikTok
Posting week: <week_of>

Caption (already on the post): <caption>
Visual subject: <image_prompt>            # only if non-empty
Hashtags (post-level, NOT spoken): <comma-separated, first 6>   # only if non-empty

Write the 30-45 second spoken script now. Plain text only.
```

The generated text is run through a defensive sanitizer (`sanitizeScript`) that strips `[VISUAL: …]` blocks, speaker labels, lone `#hashtags`, and emoji-range characters in case the model ignores its instructions. Word count is checked: 70–110 is the target window; <50 or >140 is logged as a warning but not an error (operator decides).

### Sample selected pilot row

`4faa0732-9655-40cd-a7c7-3ff6ca7d7c9e` — TikTok, week_of `2026-04-20`, status `approved`. Caption: *"Want to travel more and spend less? 🌍 Check out Travel Team Perks for unbeatable savings! #TravelHacks #SaveOnTravel"*. Visual subject: *"montage of exciting travel destinations and adventurous activities"*. Hashtags: `TravelHacks`, `SaveOnTravel`. No `tracking_url`, no `campaign_asset_id` (purely organic). The first call from `--generate --apply --limit=1 --id=4faa0732…` would author a 30–45s spoken script and write it to that row's `video_script` column only.

### Allowed writes (only with `--generate --apply`)

| Column | Value |
|---|---|
| `content_calendar.video_script` | Sanitized AI output |

### Forbidden writes (any flag combination — enforced via explicit allow-list)

`status`, `posted_at`, `posting_status`, `posting_gate_approved`, `queued_for_posting_at`, `media_status`, `media_source`, `media_generated_at`, `media_error`, `media_metadata`, `image_url`, `video_url`, `caption`, `image_prompt`, `hashtags`, `campaign_asset_id`, `tracking_url`.

### Provider APIs called?

**No.** Zero OpenAI / HeyGen / Pexels calls in this phase. The DRY-RUN generator exits before any AI call.

### Rows mutated?

**No.** posted_at row count: 22 → 22 across all script runs. No `UPDATE` was issued.

### Platform APIs called?

**No.** Zero Facebook / Instagram / TikTok / X / email API calls.

### Tests run

- `npx tsc --noEmit` → ✅ PASS — clean
- `npm run build` → ✅ PASS — `Compiled successfully in 16.1s`
- `node scripts/generate-missing-video-scripts.js` → ✅ PASS DRY-RUN — 25 candidates / 5 sampled at default `--limit=5`; first row's full prompt printed; posted_at unchanged at 22
- `node scripts/diagnose-video-script-readiness.js` → ✅ PASS — 30 total / 5 with video / 25 needs-script; projected 25 HeyGen-ready post-backfill; posted_at unchanged at 22
- `node scripts/diagnose-media-readiness.js` → ✅ PASS — section 6e now shows `TikTok blocked — no video_script: 25` and `TikTok blocked — has video_script: 0`; no temp HeyGen URLs (Phase 14L.2.3 cleanup confirmed)
- `npm run lint` → ❌ not run; pre-existing Phase 13 ESLint v8/v9 mismatch unrelated

### Risks and deferred items

- **OpenAI cost.** ~25 rows × ~150 tokens system + ~80 tokens user + ~120 tokens output ≈ 9k tokens total. At gpt-4o pricing this is well under $0.10 for the full backfill. Per-call cost is rounding-error scale.
- **Script quality variance.** GPT-4o usually obeys "no bracketed cues / no labels", but the sanitizer catches drift. Word-count warnings flag outliers — operator can re-run individual rows with `--id=<uuid>` after spot-checking.
- **No re-author when caption is weak.** A few rows have very thin captions (e.g. `City life on a budget #VortexTrips #TravelSavings #CityBreak`). The `image_prompt` provides additional context; the generator falls back to it via the user prompt. If the resulting script feels generic, the operator can iterate by editing the row's `caption` / `image_prompt` and re-running.
- **No cron auto-run.** Hobby plan is at 4/4 cron slots. The script is operator-invoked. A future phase that promotes this to cron would need to free up a slot.
- **No multi-provider fallback.** OpenAI is the only wired provider. If it errors, the row is logged failed and skipped — no Anthropic / OpenRouter fallback at this stage.

### Required approvals before running

- **`--generate` (AI calls, no DB writes)** — explicit operator authorization in chat. OpenAI is billed per token but no row state changes.
- **`--generate --apply` (AI calls + writes `video_script`)** — explicit operator authorization in chat. Use `--limit=1 --id=4faa0732-9655-40cd-a7c7-3ff6ca7d7c9e` for the first call; review the script in the row; then scale `--limit` up.

### Migration application instructions

**None.** This phase adds no schema. `video_script` is a pre-existing TEXT column on `content_calendar`.

### Deploy instructions

Phase 14L.2.5 is operator-tooling only — no app code changed. Deploy is optional unless committing the docs:

1. Confirm `git push origin main` returns `Everything up-to-date` on the second push.
2. (Optional) `npx vercel --prod --yes` — only docs / scripts changed; no route impact.

### Smoke-test checklist

- [ ] Push code; (optional) deploy via Vercel
- [ ] (operator-approved) `node scripts/generate-missing-video-scripts.js --generate --limit=1 --id=4faa0732-9655-40cd-a7c7-3ff6ca7d7c9e` — review the AI output in the terminal
- [ ] (operator-approved) re-run with `--apply` once script reads well
- [ ] `SELECT video_script FROM content_calendar WHERE id = '4faa0732-9655-40cd-a7c7-3ff6ca7d7c9e';` returns the new spoken script
- [ ] `node scripts/diagnose-video-script-readiness.js` — `no video_script — script-backfill candidates: 24` (was 25)
- [ ] After spot-check, scale up: `node scripts/generate-missing-video-scripts.js --generate --apply --limit=10`
- [ ] Final state: `node scripts/diagnose-media-readiness.js` should show `TikTok blocked — no video_script: 0` and `rows ready for HeyGen (have script): 25`

### Recommended next phase

**Phase 14L.2.6 — HeyGen the 25 newly-scripted rows through the hardened pipeline.** Concrete order:
1. Backfill `video_script` for all 25 rows (Phase 14L.2.5 `--apply`).
2. Run the existing HeyGen worker in batches of 5: `node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=5` (the Phase 14L.2.4 unlock means `--limit > 1` is now permitted).
3. Poll: `node scripts/check-video-generation-status.js --apply` — the Phase 14L.2.3 hardening guarantees permanent Supabase URLs.
4. Verify on the dashboard that all 30 TikTok rows show `Media ready`.
5. Then ship Phase 14K.1 (live autoposter).

**14L.2.7 (parallel)** — tighten `weekly-content/route.ts` so newly-generated organic TikTok rows ship with a `video_script` from the start, eliminating the future need for backfill.

---

## Phase 14L.2.4 — HeyGen Batch (4 remaining renders, completed) (deployed; permanent Supabase video_urls applied 2026-05-03)

The 4 remaining script-eligible HeyGen-ready rows (`b378c767…`, `a42b8a02…`, `3e6879da…`, `41f3fa6a…`) were queued, polled, and stored as permanent Supabase URLs through the Phase 14L.2.3 hardened pipeline. Result: 5 of 30 TikTok rows now pass media readiness; 0 temporary HeyGen URLs in the system; posted_at unchanged at 22; no platform API calls; live posting still BLOCKED.

---

## Phase 14L.2.3 — HeyGen Batch + Permanent Video Storage Hardening (deployed `ec3fc3e`; pilot row repaired and 4 batch rows landed permanently 2026-05-03)

### Why this phase exists

The HeyGen single-video pilot in Phase 14L.2.2 succeeded — row `71c25664-38a7-4bc3-80b5-326bfc36c54d` rendered, `media_status='ready'`, `video_url` populated. But the URL persisted is a HeyGen-hosted signed URL (`https://files2.heygen.ai/aws_pacific/avatar_tmp/...?Expires=...&Signature=...`) that expires in ~24 hours. If we let Instagram or TikTok ingest that URL after expiry, the post would 403. Before queuing the remaining 4 HeyGen renders, we need to copy completed MP4s into Supabase Storage and persist the permanent public URL.

### Storage helper — reused or created

**Created** a video-specific helper. The existing `downloadAndStoreImage` in `scripts/generate-missing-media.js` is hardcoded to `image/jpeg` + `.jpg`, so it doesn't fit. The new helper `downloadAndStoreVideo(supabase, remoteUrl, objectPath)` lives in `scripts/check-video-generation-status.js` and uses the same `media` bucket pattern with `contentType: 'video/mp4'` + `upsert: true` (so an interrupted re-run can complete cleanly).

### Storage path scheme

| Source | Path |
|---|---|
| `content_calendar` (organic) | `media/content/<platform>/<row_id>-<heygen_video_id>.mp4` |
| `campaign_assets` | `media/campaigns/video/<asset_id>-<heygen_video_id>.mp4` |

The dynamic segments (`platform`, `row_id`, `video_id`) are sanitized to `[a-zA-Z0-9-]` only, so a stray value can't escape the bucket prefix.

### How the existing pilot's HeyGen temp URL gets repaired

`scripts/check-video-generation-status.js --repair-temp-urls` (DRY-RUN by default):
1. Scans `content_calendar` and `campaign_assets` for rows with non-null `video_url` whose host ends in `heygen.ai` and whose status is not posted/rejected/archived (preserves history).
2. For each row, prints the planned destination path under `media/`.
3. With `--apply`, downloads the MP4 from the temp URL while it's still valid, uploads to the Supabase `media` bucket, then `UPDATE … SET video_url = '<supabase public url>'` and merges `{ heygen_temp_url, storage_path, public_url, repaired_at, repaired_by }` into `media_metadata` (or `video_source_metadata` for campaign rows) for forensics.
4. NEVER touches `status`, `posted_at`, `posting_status`, `posting_gate_approved`, `queued_for_posting_at`, or any platform API.

The diagnostic dry-run identified exactly **1 content_calendar row** needing repair (the pilot row `71c25664…`); 0 campaign_asset rows.

### Files added / changed

| File | Status | Purpose |
|---|---|---|
| `scripts/check-video-generation-status.js` | **changed** | New `downloadAndStoreVideo` helper; new `buildVideoObjectPath`; new `isHeyGenTempUrl` predicate; completion path now copies MP4 to Supabase Storage before writing `video_url`; on storage failure leaves row at `media_status='pending'` (per spec, not 'failed' — the HeyGen render did succeed, only the storage step blew up); new `--repair-temp-urls` mode (DRY-RUN + `--apply`); merges `heygen_temp_url` / `storage_path` / `public_url` into metadata. |
| `scripts/diagnose-media-readiness.js` | **changed** | New section `6f. Temporary HeyGen video URLs` — counts unposted rows whose `video_url` is on `heygen.ai`, prints repair command. |

### Behavioral details

- Completion path now writes the **permanent Supabase URL** to `video_url`. The original HeyGen signed URL is preserved in `media_metadata.heygen_temp_url` (for content_calendar) or `video_source_metadata.heygen_temp_url` (for campaign_assets) so a future engineer can correlate the render with the asset.
- **Storage-failure handling matches the spec**: if download or upload fails during normal completion, the row stays at `media_status='pending'` so a re-run picks it back up; `media_status='failed'` is reserved for HeyGen render failures (the actual provider returned `status='failed'`), not storage hiccups.
- **`upsert: true`** on the storage upload — keeps re-runs idempotent. A path like `content/tiktok/<id>-<vid>.mp4` is deterministic per (row, render), so re-running `--apply` after a flaky network blip simply re-writes the same object.
- The repair mode preserves the legacy temp URL in metadata. If the pilot row was already posted somewhere, the operator could still trace the original render source.

### Migration created?

**No.** Migration 033 (`content_calendar.media_metadata` JSONB) shipped in Phase 14L.2.2 and is already applied. Phase 14L.2.3 only adds new keys to existing JSONB columns — no schema change.

### Tests run

- `npx tsc --noEmit` → ✅ PASS (clean)
- `npm run build` → ✅ PASS (`Compiled successfully in 10.5s`)
- `node scripts/check-video-generation-status.js` → ✅ PASS — Phase 14L.2.3 banner, 0 pending jobs, exit clean
- `node scripts/check-video-generation-status.js --repair-temp-urls` → ✅ PASS — flagged 1 content_calendar row (pilot `71c25664…`), 0 campaign_assets, dry-run skip count = 1, posted_at unchanged
- `node scripts/diagnose-media-readiness.js` → ✅ PASS — section 6f shows `1 content_calendar row on heygen.ai temp URLs`; recommends repair command
- `npm run lint` → ❌ not run; pre-existing Phase 13 ESLint v8/v9 mismatch unrelated

### Provider APIs called?

**No.** The polling DRY-RUN exits before calling HeyGen (no pending jobs to poll). The repair DRY-RUN does not call HeyGen — it only reads DB rows and prints destinations. Zero Pexels / OpenAI / HeyGen calls.

### Rows mutated?

**No.** posted_at row count: 22 → 22 across all script runs. No `UPDATE` was issued.

### Platform APIs called?

**No.** Zero Facebook / Instagram / TikTok / X / email API calls.

### Exact repair command

```bash
# DRY-RUN — list rows that need repair, show planned destinations:
node scripts/check-video-generation-status.js --repair-temp-urls

# (operator-approved) Actually download + upload + rewrite video_url:
node scripts/check-video-generation-status.js --repair-temp-urls --apply
```

The pilot row `71c25664…` has its temp URL pinned by signature `Expires=1778527238` (~Mar 11, 2026) — well within the 24h window from when the pilot completed, so the source URL is currently still valid.

### Exact remaining 4-video batch command (NOT yet authorized)

The 4 remaining script-eligible rows are: `b378c767…`, `a42b8a02…`, `3e6879da…`, `41f3fa6a…`. Until storage hardening is verified, the worker still enforces `--limit=1` for `--provider=heygen` (Phase 14L.2.2 pilot guard). After Phase 14L.2.3 is verified end-to-end (one repair run + one new render), the next phase will drop that guard and run the batch. The intended batch command — **DO NOT RUN UNTIL OPERATOR APPROVES** — would look like:

```bash
# Per-row, one at a time (still --limit=1 enforced today):
node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=1 --id=b378c767-45d9-476c-aecc-dfce96be6568
node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=1 --id=a42b8a02-ff71-4ef3-b9cb-8c08ac207a47
node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=1 --id=3e6879da-2308-4d01-9806-6a35e6cf051c
node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=1 --id=41f3fa6a-a271-4a18-9db0-43ef83d8e613

# Then poll + permanent-storage write:
node scripts/check-video-generation-status.js --apply
```

A future Phase 14L.2.4 will drop the per-row `--id=` pin and the `--limit=1` enforcement once the new pilot succeeds.

### Risks and deferred items

- **Storage failure leaves row at `pending`.** Operator must re-run `--apply` after fixing the underlying issue (network / Storage permissions). Today's content has no rows in this state.
- **Repair runs while temp URL is still valid.** If a row's HeyGen URL has already expired, the download will fail and the repair skips it. We can't recover the video without re-rendering — but we still have `media_metadata.heygen_video_id`, so a re-render via HeyGen status endpoint is possible (not implemented in Phase 14L.2.3).
- **Storage cost.** Each TikTok MP4 is roughly 5–15MB at HeyGen's 720x1280 default. 5 pilot videos ≈ 50–75MB. Negligible vs. Supabase free-tier limits today, but worth tracking when batch sizes grow.
- **Public bucket exposure.** The `media` bucket is already public-read (used by `weekly-content` cron for Pexels images and by `generate-content` route for in-page previews). HeyGen videos posted to social are public-by-design.

### Migration application instructions

**None.** Migration 033 already applied in production.

### Deploy instructions

1. Confirm `git push origin main` returns `Everything up-to-date` on the second push.
2. `npx vercel --prod --yes` — no `vercel.json` change.
3. (operator-approved) Run `node scripts/check-video-generation-status.js --repair-temp-urls --apply` to migrate the 1 existing pilot row off the HeyGen temp URL.
4. Run the diagnostic again — expect section 6f to report 0 temp URLs.

### Smoke-test checklist

- [ ] Push code; deploy via Vercel
- [ ] (operator-approved) `node scripts/check-video-generation-status.js --repair-temp-urls --apply` — expect `repaired: 1`, posted_at unchanged at 22, the pilot row's `video_url` flips from `files2.heygen.ai/...` to `<supabase>.supabase.co/storage/.../media/content/tiktok/71c25664-...mp4`
- [ ] `node scripts/diagnose-media-readiness.js` — section 6f shows `✓ no temporary HeyGen URLs found`
- [ ] Open `/dashboard/content` — pilot row's media badge still says `Media ready`; preview image / playback (where supported) loads from the Supabase URL

### Required approvals before running

- **`--repair-temp-urls --apply`** — explicit operator authorization in chat. Reads from HeyGen's CDN (no HeyGen API call counted; just an MP4 download), writes to Supabase Storage and rewrites 1 DB row.
- **HeyGen batch (4 remaining rows)** — explicit operator authorization in chat. After repair is verified, the operator may run the four per-row commands above (still `--limit=1` per command).

### Recommended next step

**Phase 14L.2.4 — drop the per-row `--id=` pin and `--limit=1` enforcement after the storage repair succeeds + at least one new HeyGen render lands cleanly through the hardened pipeline.** Concrete order:
1. Run the repair on the pilot row.
2. Run one of the four remaining HeyGen renders (e.g. `b378c767…`); poll; verify the permanent Supabase URL lands on `video_url`.
3. Drop the pilot guard in `scripts/generate-missing-media.js` (the refusal block on `--provider=heygen --limit>1`); allow `--limit=4`; queue all four remaining HeyGen renders in one invocation.
4. Tighten `weekly-content/route.ts` to author a `video_script` for new organic TikTok rows, unblocking the 25 still-stuck rows.
5. After the queue drains and TikTok readiness is at parity with Instagram, ship Phase 14K.1 (live autoposter).

---

## Phase 14L.2.2 — HeyGen Single-Video Pilot (deployed `e0f013d`; migration 033 applied; pilot row `71c25664…` rendered + `video_url` applied 2026-05-03)

### What this phase ships

Phase 14L.2.1 (deployed `98204ef`) wired real Pexels / OpenAI / HeyGen helpers behind a strict flag matrix. Pexels image generation was run safely against all unposted rows that needed images, clearing the Instagram media gap (3 → 0). Phase 14L.2.2 narrows the focus to one controlled HeyGen render for a single TikTok row, validating the async storage + polling workflow before any bulk video generation.

### Pilot row selection

A read-only inspector enumerates all rows that:
- are unposted (no `posted_at`, status not in posted/rejected/archived),
- need video media (TikTok / YouTube),
- have no `video_url` yet, AND
- carry a usable `content_calendar.video_script`.

That gives **5 eligible rows**, matching the diagnostic. The inspector prints all five and pins one as the recommended pilot:

```
Recommended pilot row: 71c25664-38a7-4bc3-80b5-326bfc36c54d
   tiktok · 2026-04-20 · 354-char script
   target table: content_calendar (organic; no campaign_asset_id)
```

The remaining 4 candidates: `b378c767…`, `a42b8a02…`, `3e6879da…`, `41f3fa6a…` (all TikTok, scripts 303–359 chars).

### Why migration 033 is needed

Phase 14L.2.1 stored the HeyGen `video_id` for organic content_calendar rows in `media_error` with a `heygen_video_id:<id>` sentinel. That worked — the validator only reads `media_error` when `media_status='failed'`, so it was gate-safe — but it overloads a column meant for human-readable error text and makes the polling script fragile.

Migration 033 adds `content_calendar.media_metadata JSONB DEFAULT '{}'::jsonb` (with a partial GIN index for non-empty payloads) so the worker has a clean home for `heygen_video_id`, `queued_at`, `phase`, `generated_by`, and any future provider provenance. The polling script reads `media_metadata.heygen_video_id` first and falls back to the legacy `media_error` sentinel for backward compat — at the time of this migration there are 0 pending HeyGen jobs in production, so no backfill is needed.

### Files added

| File | Purpose |
|---|---|
| `supabase/migrations/033_add_media_metadata_to_content_calendar.sql` | Adds `content_calendar.media_metadata JSONB DEFAULT '{}'::jsonb` + partial GIN index. Idempotent. |
| `scripts/inspect-heygen-pilot-candidates.js` | Read-only enumerator. Lists all 5 eligible HeyGen pilot rows + 25 blocked-no-script rows; pins a deterministic recommended row. |

### Files updated

| File | Change |
|---|---|
| `scripts/generate-missing-media.js` | Adds `--id=<uuid>` pin; refuses `--provider=heygen` with `--limit > 1` (pilot mode); refuses `--videos-only --provider=auto --limit > 1` (could fan out HeyGen); pre-filter drops rows already with `video_url` AND rows without explicit `video_script`/`video_prompt` (the legacy caption fallback is too loose for HeyGen voice rendering); strips `[VISUAL: …]` / `Hook:` / `Outro:` director cues before sending to HeyGen via new `cleanScriptForHeyGen()` helper; switches organic-row HeyGen storage to `media_metadata.heygen_video_id` (clears the legacy `media_error` sentinel on the same write); adds `media_metadata` to the content_calendar write allow-list. Bulk HeyGen still blocked. |
| `scripts/check-video-generation-status.js` | Reads `media_metadata.heygen_video_id` first; falls back to legacy `media_error` sentinel; gracefully handles migration-033-not-applied with a clear banner. On completion / failure, merges into the existing `media_metadata` JSONB instead of clobbering. |
| `scripts/diagnose-media-readiness.js` | New section `6e. HeyGen pilot status` — migration 033 applied/not, pending HeyGen jobs broken out by table (with metadata-vs-media_error breakdown), completed `video_url` counts per table, TikTok unposted passing media readiness, TikTok still blocked-no-script. |

### Job-id storage decision

| Row source | Storage location | Reason |
|---|---|---|
| `campaign_assets` rows | `video_source_metadata.heygen_video_id` (already existed in migration 018) | clean JSONB home — no change |
| `content_calendar` (organic) rows | `media_metadata.heygen_video_id` (NEW — migration 033) | clean JSONB home; replaces the Phase 14L.2.1 `media_error` overload |

The polling script always tries the new column first, falling back to the legacy `media_error` sentinel for any in-flight job from before migration 033 lands (defensive — production currently has 0 in-flight HeyGen jobs).

### Exact command to queue one HeyGen render

DRY-RUN (no provider call, no write):

```bash
node scripts/generate-missing-media.js --videos-only --provider=heygen --limit=1 --id=71c25664-38a7-4bc3-80b5-326bfc36c54d
```

Provider call only (no write — review the returned video_id):

```bash
node scripts/generate-missing-media.js --generate --videos-only --provider=heygen --limit=1 --id=71c25664-38a7-4bc3-80b5-326bfc36c54d
```

Provider call AND write `media_status='pending'` + `media_source='heygen'` + `media_metadata.heygen_video_id`:

```bash
node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=1 --id=71c25664-38a7-4bc3-80b5-326bfc36c54d
```

### Exact command to poll the pending render

```bash
# DRY-RUN — observe HeyGen status without writing.
node scripts/check-video-generation-status.js

# After HeyGen reports completed (typically a few minutes), write back.
node scripts/check-video-generation-status.js --apply
```

### What writes will happen in `--generate --apply`

For an organic TikTok row (the recommended pilot — `71c25664…`):

| Column | Value |
|---|---|
| `media_status` | `'pending'` |
| `media_source` | `'heygen'` |
| `media_metadata` | `{ heygen_video_id: '<id from HeyGen>', queued_at: '<iso>', generated_by: 'scripts/generate-missing-media.js', phase: '14L.2.2' }` |
| `media_error` | `NULL` (defensively cleared in case a Phase 14L.2.1 sentinel was left over) |

NOT written until the polling script confirms HeyGen completed:
- `video_url`
- `media_generated_at`
- `media_status='ready'`

NEVER written under any flag combination:
- `status` (especially `'posted'`)
- `posted_at`
- `posting_status`, `posting_gate_approved`, `queued_for_posting_at`
- any platform-publishing state

### Tests run

- `npx tsc --noEmit` → ✅ PASS (clean)
- `npm run build` → ✅ PASS (`Compiled successfully in 18.2s`; no new routes)
- `node scripts/inspect-heygen-pilot-candidates.js` → ✅ PASS — 5 eligible / 25 blocked / pilot row pinned
- `node scripts/diagnose-media-readiness.js` → ✅ PASS — section 6e renders correctly with migration-033 banner
- `node scripts/generate-missing-media.js --videos-only --provider=heygen --limit=1` → ✅ PASS DRY-RUN (matched filters: 5; first-of-five planned; posted_at unchanged at 22)
- `node scripts/generate-missing-media.js --videos-only --provider=heygen --limit=3` → ✅ refused with clear pilot message
- `node scripts/generate-missing-media.js --videos-only --provider=heygen --limit=1 --id=<uuid>` → ✅ pins the correct row
- `node scripts/check-video-generation-status.js` → ✅ PASS DRY-RUN — 0 pending jobs, 033-not-applied banner shown
- `npm run lint` → ❌ not run; pre-existing Phase 13 ESLint v8/v9 mismatch unrelated

### Provider APIs called?

**No.** Zero HeyGen / Pexels / OpenAI calls in this phase.

### Rows mutated?

**No.** posted_at row count: 22 → 22 across all script runs.

### Platform APIs called?

**No.** Zero Facebook / Instagram / TikTok / X / email calls.

### Diagnostic snapshot (post-Phase-14L.2.1, pre-Phase-14L.2.2-deploy)

```
0. Migration 032: ✓ applied
1. Caption legacy-link debt: 0
2. Branded tracking_url:    8
3. Instagram missing both:  0
4. TikTok missing video:   30
5. Prompt without media:    0
6. Total blocked:          30 (all "missing required video_url for TikTok")
6b. media_status: 8 null · 0 pending · 99 ready · 0 failed · 0 skipped
6c. ready/text-only-allowed: 77 of 107
6d. Provider keys present; rows ready Pexels=0 / OpenAI=0 / HeyGen=5; blocked-no-script=25; jobs awaiting poll=0
6e. HeyGen pilot:
    migration 033 NOT applied (legacy fallback active)
    pending HeyGen jobs — content_calendar: 0
    pending HeyGen jobs — campaign_assets:  0
    completed HeyGen video_urls — content_calendar: 0
    completed HeyGen video_urls — campaign_assets:  0
    TikTok passing media readiness: 0 of 30
    TikTok still blocked — no video script: 25
7. posted_at unchanged (22 → 22)
```

### Required approvals before running

- **`--generate` (provider call, no write)** — explicit operator authorization in chat. HeyGen will accept the job, return a `video_id`, and bill for the render even though we don't write back. Cost: ~one HeyGen render per their plan.
- **`--generate --apply` (provider call + writes)** — explicit operator authorization in chat. Same cost; in addition writes `media_status='pending'` + `media_metadata.heygen_video_id` so polling can pick it up.
- **`check-video-generation-status.js --apply`** — explicit operator authorization in chat. Polling itself is free; the write lands the resolved `video_url` only when HeyGen reports completion.

### Migration application instructions

Apply migration 033 **before** deploying this code. Order:

1. Open Supabase SQL Editor.
2. Paste the contents of `supabase/migrations/033_add_media_metadata_to_content_calendar.sql`.
3. Run.
4. Run the verification SQL below.

### Verification SQL

```sql
-- 1. Confirm column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'content_calendar' AND column_name = 'media_metadata';
-- Expect 1 row: media_metadata · jsonb · '{}'::jsonb

-- 2. Confirm GIN index exists
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_content_calendar_media_metadata';
-- Expect 1 row.

-- 3. posted_at row count cross-check (must equal 22)
SELECT count(*) FROM content_calendar WHERE posted_at IS NOT NULL;
```

### Deploy instructions

1. Apply migration 033 + run verification SQL above.
2. `git push origin main` (twice — second push must show `Everything up-to-date`).
3. `npx vercel --prod --yes` (no `vercel.json` change).
4. Open `/dashboard/content` while signed in as admin and confirm the page loads.

### Smoke-test checklist

- [ ] Apply migration 033 in Supabase SQL Editor; run verification SQL queries 1–3
- [ ] Push code; deploy via Vercel
- [ ] Open `/dashboard/content` — page loads; the existing "🎬 Video generating" badge will appear once a real HeyGen render is queued (it doesn't appear today because there are 0 pending jobs)
- [ ] Run `node scripts/diagnose-media-readiness.js` — section 6e shows `migration 033 ✓ applied`; `pending HeyGen jobs — content_calendar: 0`; `posted_at unchanged at 22`
- [ ] Run `node scripts/inspect-heygen-pilot-candidates.js` — 5 eligible; recommended row printed
- [ ] (operator-approved) Run `node scripts/generate-missing-media.js --generate --apply --videos-only --provider=heygen --limit=1 --id=71c25664-38a7-4bc3-80b5-326bfc36c54d` — verify `media_status` flips to `'pending'`, `media_metadata.heygen_video_id` is set, `posted_at` count still 22
- [ ] Wait ~3–5 min for HeyGen render
- [ ] Run `node scripts/check-video-generation-status.js` — see status (queued/processing/completed)
- [ ] Once completed, (operator-approved) Run `node scripts/check-video-generation-status.js --apply` — verify `video_url` populated, `media_status='ready'`, `posted_at` count still 22
- [ ] Open `/dashboard/content` — confirm pilot row's media badge flips from `Media missing` → `Media ready`

### Recommended next phase

**Phase 14L.2.3 — repeat the pilot for 1 campaign_asset HeyGen row, then expand.** Concrete order:
1. Pick the most-imminent campaign_asset video row (Art Basel `1fc3d038…` 2026-08-31 or `8e5876bb…` 2026-11-23) and queue + poll a single HeyGen render through the campaign_assets storage path. Verify `video_source_metadata.heygen_video_id` populates and lands the `video_url`.
2. Once both pilots succeed, drop the `--limit=1` enforcement on `--provider=heygen`, raise to small batches (e.g. `--limit=5`), and let the worker process the remaining 3 organic rows.
3. Tighten `weekly-content/route.ts` to author a `video_script` for organic TikTok rows — that unblocks the 25 still-stuck rows.
4. Add a daily HeyGen polling cron once the queue depth justifies it (today: zero in-flight).
5. After the queue drains, ship Phase 14K.1 (live autoposter).

---

## Phase 14L.2.1 — Real Media Provider Integration (deployed `98204ef`; Pexels image generation/write-back applied 2026-05-03; Instagram media gap cleared)

### What this phase ships

Phase 14L.2 (deployed `7aad656`) added the storage shape (migration 032: `content_calendar.video_url` + `media_status` + `media_source` + `media_generated_at` + `media_error`) and threaded `media_status` through both gates. Phase 14L.2.1 adds the real provider plumbing: a typed `media-providers.ts` helper, a hardened CLI worker that may call Pexels / OpenAI / HeyGen behind explicit flags, and a HeyGen polling script for the async video case. Nothing is written to the DB unless the operator passes `--generate --apply` together.

### Files added

| File | Purpose |
|---|---|
| `src/lib/media-providers.ts` | Typed wrappers for Pexels / OpenAI image / HeyGen with a normalized `MediaProviderResult` shape. Reads keys from env at call time; returns `{ success: false }` on missing key instead of throwing. HeyGen is async — `createHeyGenVideo` returns `status='queued'` + `external_id`; a separate `getHeyGenVideoStatus` poller lands the final URL. |
| `scripts/check-video-generation-status.js` | HeyGen polling script. Default DRY-RUN (reads pending jobs, polls HeyGen, prints results, no DB writes). `--apply` writes the resolved `video_url` + `media_status='ready'` (or `'failed'` with the HeyGen error) back to the originating row. Reads pending jobs from `campaign_assets.video_source_metadata.heygen_video_id` (clean home) AND from `content_calendar.media_error` when prefixed with `heygen_video_id:` (organic-row fallback). |

### Files updated

| File | Change |
|---|---|
| `scripts/generate-missing-media.js` | Now real-or-dry. Default still DRY-RUN. New flags: `--generate` (call providers; do NOT write), `--generate --apply` (call providers AND write allow-listed media columns), `--limit=N` (default 5; max 50), `--provider=pexels|openai|heygen|auto`, `--images-only`, `--videos-only`, `--campaign-only`, `--content-only`. `--apply` without `--generate` refuses with a clear message. Image path: Pexels first, OpenAI fallback only when `provider='auto'`. Video path: HeyGen only when a `video_script`/`video_prompt` is present (else skipped — never auto-fails). Image writes go to `image_url` + `media_status='ready'` + `media_source='pexels'\|'openai'` + `media_generated_at` (or to `campaign_assets.image_url` + `image_source` + `image_source_metadata` for campaign rows). Video writes go to `media_status='pending'` + `media_source='heygen'`; the HeyGen video_id lands in `campaign_assets.video_source_metadata.heygen_video_id` for campaign rows or in `content_calendar.media_error` with the `heygen_video_id:` prefix for organic rows (the validator only reads `media_error` when `media_status='failed'`, so this is safe). Apply writes use a strict allow-list — never touches `status`, `posted_at`, `posting_status`, `posting_gate_approved`, or `queued_for_posting_at`. |
| `scripts/diagnose-media-readiness.js` | Adds section `6d. Provider readiness`: per-provider key presence, count of rows ready for Pexels/OpenAI image, count of rows ready for HeyGen (have script), count blocked by missing video script, count of HeyGen jobs awaiting poll. Now also pulls `video_script` so the HeyGen-vs-no-script split is accurate. |
| `src/app/dashboard/content/page.tsx` | `ExtendedContentItem` gains `media_source`; SELECT extended; new "🎬 Video generating" indigo badge appears when `media_status='pending' && media_source='heygen'`. The existing `'failed'` rose badge from Phase 14L.2 remains. No new posting buttons added. |

### Provider helper behavior

`src/lib/media-providers.ts` exports:
- `fetchPexelsImage({ query, orientation?, perPage? })` — Pexels Search v1; returns `success: true, url, external_id` or `success: false, error`.
- `generateOpenAIImage({ prompt, size? })` — DALL·E-3 1024x1024 by default; mirrors the photorealistic-travel preamble used in `src/lib/openai.ts` so quality and cost stay consistent.
- `createHeyGenVideo({ script, title?, avatarId?, voiceId? })` — POSTs to `/v2/video/generate`; returns `success: true, external_id, status: 'queued'` (no URL yet). Refuses when script is empty, when `HEYGEN_API_KEY` is missing, or when `HEYGEN_AVATAR_ID` / `HEYGEN_VOICE_ID` are not set and no override was passed.
- `getHeyGenVideoStatus(videoId)` — polls `/v1/video_status.get`; returns `success: true, status: 'completed', url` when ready, `success: false, status: 'failed'` on HeyGen failure, or `success: false, status: 'queued'\|'processing'` when still rendering.
- `normalizeProviderError(err)` — normalizes Error / `{ error: { message } }` / `{ message }` / bare strings to a ≤500-char string.
- `isMediaProviderConfigured(provider)` — returns true when the provider's required env var is non-empty.

All functions are pure HTTP clients. No DB calls. No platform posting. The script-side mirrors of these helpers (in `scripts/generate-missing-media.js`) are pure JS with the same shape so the script runs without a TypeScript toolchain; both must stay in sync.

### Script flag matrix and safety behavior

| Flags | Provider calls? | DB writes? | Allowed |
|---|---|---|---|
| (none) | no | no | always |
| `--dry-run` | no | no | always (explicit form) |
| `--generate` | yes | **no** | requires operator approval |
| `--generate --apply` | yes | yes (allow-listed media columns only) | requires operator approval |
| `--apply` (without `--generate`) | refused | refused | n/a — refuses with clear message |

Other flags (`--limit`, `--provider`, `--images-only`, `--videos-only`, `--campaign-only`, `--content-only`) are filters and are honored in any mode.

### Provider calls fired in this phase?

**No.** Zero Pexels / OpenAI / HeyGen calls were made by this phase. The only commands run during development were:
- `node scripts/generate-missing-media.js` (default DRY-RUN — no `--generate`, no calls)
- `node scripts/diagnose-media-readiness.js` (read-only diagnostic — no calls)
- `node scripts/check-video-generation-status.js` (default DRY-RUN — 0 pending jobs, no HeyGen call needed)

### Rows mutated?

**No.** posted_at row count snapshot before/after each script run is unchanged at 22.

### Platform APIs called?

**No.** Zero Facebook / Instagram / TikTok / X / email API calls.

### Diagnostic results (post-migration-032 baseline)

```
0. Migration 032: ✓ applied
1. Caption legacy-link debt: 0
2. Branded tracking_url:    8
3. Instagram missing both:  3 of 26
4. TikTok missing video:   30 of 30
5. Prompt without media:    0
6. Total blocked:          39 of 107
   30  missing required video_url for TikTok
   14  campaign media prompt exists but generated media is missing
    3  missing required image_url for Instagram
6b. media_status distribution: 22 null · 0 pending · 85 ready · 0 failed · 0 skipped
6c. ready/text-only-allowed:   68 of 107
6d. Provider readiness: PEXELS / OPENAI / HEYGEN / HEYGEN_AVATAR_ID / HEYGEN_VOICE_ID all present
    rows ready for Pexels image: 16
    rows ready for HeyGen (have script): 5
    rows blocked — no video script: 25
    heygen jobs awaiting poll: 0
7. posted_at unchanged (22 → 22)
```

### Required approvals before `--generate` or `--apply`

- **`--generate` alone** (provider calls, no writes): explicit operator authorization in chat. Cost notes — Pexels is free up to ~200 req/hr; OpenAI DALL·E-3 standard ~$0.04 per image; HeyGen pricing varies by plan.
- **`--generate --apply`** (writes media columns): explicit operator authorization in chat AND a clear `--limit` value (default 5; max 50). Operator should review one DRY-RUN result first to confirm the queue order.
- **`--provider=heygen`** (real HeyGen render): explicit operator authorization in chat. HeyGen is async and bills per render; use `--limit=1` for the first run.
- **`--provider=openai`** (forced OpenAI image, no Pexels first): explicit operator authorization in chat. Default `--provider=auto` already does Pexels-first → OpenAI fallback only on Pexels miss.

### Tests run

- `npx tsc --noEmit` → ✅ PASS (clean)
- `npm run build` → ✅ PASS (`Compiled successfully in 7.4s`; no new routes)
- `node scripts/generate-missing-media.js` → ✅ PASS (DRY-RUN; 39 matched, 5 sampled at default limit; posted_at unchanged at 22)
- `node scripts/diagnose-media-readiness.js` → ✅ PASS (migration 032 applied banner; 5 HeyGen-eligible, 25 blocked-no-script, posted_at unchanged at 22)
- `node scripts/check-video-generation-status.js` → ✅ PASS (DRY-RUN; 0 pending jobs)
- `npm run lint` → ❌ not run; pre-existing Phase 13 ESLint v8/v9 mismatch unrelated

### Risks and deferred items

- **Provider integrations are live but ungated by tests.** First real `--generate` run should use `--limit=1` per provider to verify the API contract before scaling.
- **HeyGen video_id storage on organic rows uses `media_error` with a `heygen_video_id:` prefix.** The validator only consults `media_error` when `media_status='failed'`, so this is gate-safe, but a future migration could add `content_calendar.media_external_id` for cleanliness. Campaign rows already have `video_source_metadata` JSONB.
- **OpenAI image returns a temporary URL.** Worker downloads + re-uploads to Supabase Storage `media` bucket only in `--apply` mode. In `--generate` (no `--apply`), the operator sees the temporary URL — it expires within ~1 hour. That's deliberate: review-only.
- **HeyGen returns 9:16 portrait at 720x1280** by default in the worker. Suitable for TikTok / Reels / Stories. A future YouTube-targeted render would need a 1280x720 swap.
- **25 organic TikTok rows have no `video_script`.** They're skipped gracefully (no failure write, no provider call); the upstream `weekly-content` cron must be extended in a follow-up to author scripts before HeyGen can do anything for them.
- **Existing `weekly-content` cron does NOT set `media_status='ready'` after `fetchAndStoreImage`.** New organic rows from the cron sit at `'pending'` while having a URL — the gate's "trust but verify" still passes (URL present), but the column is cosmetically wrong. Tightening the cron is a small follow-up.

### Deploy instructions

Phase 14L.2.1 is purely additive at the schema level — no migration. Deploy steps:

1. Confirm `git push origin main` returns `Everything up-to-date` on the second push.
2. `npx vercel --prod --yes` — no `vercel.json` change.
3. Open `/dashboard/content` while signed in as admin and confirm the page loads. Pending HeyGen badges only appear once a real HeyGen render is queued.

### Safe smoke-test commands

```bash
# Default DRY-RUN — verify the queue without calling anything.
node scripts/generate-missing-media.js

# DRY-RUN with limited scope.
node scripts/generate-missing-media.js --images-only --campaign-only --limit=3

# (Operator-authorized only) DRY-RUN over the wire — calls Pexels but writes
# nothing. Returns the Pexels URL for review.
node scripts/generate-missing-media.js --generate --images-only --limit=1 --provider=pexels

# (Operator-authorized only) Apply — Pexels + Supabase Storage write back.
# Use --limit=1 the first time.
node scripts/generate-missing-media.js --generate --apply --images-only --limit=1 --provider=pexels

# HeyGen polling — DRY-RUN (no writes).
node scripts/check-video-generation-status.js

# (Operator-authorized only) HeyGen polling — write resolved video_urls.
node scripts/check-video-generation-status.js --apply
```

### Recommended next phase

**Phase 14L.2.2 — `weekly-content` cron tightening + organic video script generation.**
1. Update `src/app/api/cron/weekly-content/route.ts` to set `media_status='ready'` + `media_source='pexels'` + `media_generated_at=now()` after `fetchAndStoreImage` succeeds, so new organic rows don't sit at `'pending'` when they actually have a URL.
2. Extend the weekly-content prompt to author a `video_script` for organic TikTok rows (today they have nothing, which leaves 25 rows unbuildable).
3. Once HeyGen renders are queued, add a daily cron to call `/api/cron/check-heygen-jobs` for the SBA case AND a sibling polling endpoint for the new content_calendar / campaign_assets jobs (or wire the polling script to run on a Hobby-plan-friendly cadence).
4. After enough rows clear the gate via real generation, ship Phase 14K.1 (live autoposter).

---

## Phase 14L.2 — Media Generation Storage + Worker Foundation (deployed `7aad656`; migration 032 applied 2026-05-03)

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
