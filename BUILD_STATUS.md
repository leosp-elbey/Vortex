# VortexTrips — Build Status Snapshot

**Generated:** 2026-05-07
**HEAD on origin/main:** `6e2f27a` — "Phase 14O.1: add manual autoposter runner, no scheduled cron"
**Working tree:** clean
**Production:** [vortextrips.com](https://www.vortextrips.com) — LIVE
**Supabase migrations applied:** 017–033 (33 migrations total in repo, all applied)
**Vercel:** Hobby plan, 4/4 cron slots used
**Next.js:** 16.2.4 with Turbopack
**Total commits:** 145

This is a top-to-bottom snapshot of what's shipped, what's working in production, what's blocked or paused, and what still needs work. Companion to:
- [PROJECT_STATE_CURRENT.md](PROJECT_STATE_CURRENT.md) — current-phase narrative state
- [BUILD_PROGRESS.md](BUILD_PROGRESS.md) — chronological phase log
- [PHASE_14O_AUTOPOSTER_PILOT_PLAN.md](PHASE_14O_AUTOPOSTER_PILOT_PLAN.md) — autoposter cron-promotion contract
- [SAVE_PROTOCOL.md](SAVE_PROTOCOL.md) — mandatory end-of-phase save discipline

---

## 1. Top-line production metrics

| Metric | Value |
|---|---|
| Live posts to date (manual workflow) | 9 platform posts: 4 Facebook + 4 Instagram + 1 TikTok |
| `posted_at` count | **29** (matches `status='posted'` count exactly) |
| `status='posted'` count | **29** |
| Approved + unposted rows in queue | 53 |
| Eligible posting queue (gate-approved) | **0** (queue empty by design — operator clicks Mark Ready per cycle) |
| Posting gate audit | **9/9 PASS** (all invariants healthy) |
| Cron / live autoposter | **OFF** (manual runner only — Phase 14O.1 / Path D) |
| Twitter/X | paused (Developer Portal billing — HTTP 402) |
| Active Vercel deployment | `dpl_DRN42VtmCdsvXeirQxQ2LxbKPMEA` |

---

## 2. Architecture / stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend / API | Next.js 16.2.4 (App Router) on Vercel | 51 API routes |
| Database | Supabase (Postgres) | 33 migrations · RLS enforced · service-role key for admin scripts |
| Object storage | Supabase Storage `media` bucket | Pexels images + HeyGen MP4s, public-read |
| Auth | Supabase Auth + admin_users allow-list | dashboard gated behind `admin_users` table |
| AI router | OpenRouter (gateway) | for content gen + verifier |
| AI models | Anthropic Claude (Opus/Sonnet/Haiku), OpenAI GPT-4o, DALL·E-3, OpenRouter | configured via `AI_*` env vars |
| Image search | Pexels API | primary content image source |
| Image generation | OpenAI DALL·E-3 | fallback when Pexels misses |
| Video generation | HeyGen v2 | text → MP4 with avatar; 9:16 portrait for TikTok |
| Voice | Bland.ai | post-lead callback automation |
| Email | Resend | transactional + sequences |
| SMS | Twilio | sequence drips + lead notifications |
| Social Graph APIs | Meta Graph v25 (Facebook + Instagram) | live · `/api/automations/post-to-{facebook,instagram}` |
| TikTok | Manual Creator Center upload | Login Kit redirect URI live; token exchange deferred |
| Twitter/X | not connected | API tier billing required (HTTP 402) |
| Hosting / cron | Vercel Hobby | 4 cron slots used |
| Source control | GitHub `leosp-elbey/vortex` (`main` branch) | |

---

## 3. What's shipped — by phase

### Phases 0–13 (foundation, pre-Phase-14)

| Phase | Status | Description |
|---|---|---|
| 0 — Audit & plan | ✅ shipped | `VORTEX_AI_COMMAND_CENTER_PLAN.md` |
| 1 — Database migrations | ✅ shipped | migrations 001–016 (contacts, leads, content_calendar, ai_jobs, ai_actions_log, ai_model_usage, ai_verification_logs, ai_command_templates) |
| 2 — Env vars | ✅ shipped | `.env.example` documented; Vercel prod env populated |
| 3 — AI Router | ✅ shipped | `src/lib/ai-router.ts` + `src/lib/ai-models.ts` |
| 4 — Claude verifier | ✅ shipped | `src/lib/ai-verifier.ts` |
| 5 — API routes | ✅ shipped | 12 AI routes under `src/app/api/ai/` |
| 6 — Dashboard | ✅ shipped | `/dashboard/ai-command-center` + 5 components, sidebar wired |
| 7 — Workflows | ✅ shipped | social-pack, video-script, email-sequence, blog, social-calendar |
| 8 — Security hardening | ✅ shipped | `src/lib/webhook-auth.ts` + `src/lib/rate-limit.ts` |
| 9 — HeyGen async | ✅ shipped | `/api/cron/check-heygen-jobs` for SBA video |
| 10 — Local testing | ✅ shipped | lint/typecheck/build pass before commit |
| 10.5 — Save protocol + image safety | ✅ shipped | [SAVE_PROTOCOL.md](SAVE_PROTOCOL.md) + `src/lib/image-safety.ts` |
| 11 — Production deploy | ✅ shipped | first prod deploy `dpl_qDc73T2dNmEmtQZPajwZpdAW6R6H` |
| 12 — Funnel pages | ✅ shipped | `/free`, `/book`, `/join`, `/thank-you`, `/quote`, `/quiz`, `/sba`, `/destinations/[slug]` |
| 13 — Stability layer | ✅ shipped | env audit + lint config (commit `04d397c`) — *⚠️ ESLint v8/v9 mismatch is a known unresolved local artifact from this phase* |

### Phase 14 — Event Campaign Engine + Posting Pipeline

This is the heart of recent work. The architecture for ingesting destination/event opportunities, generating per-platform content, gating it through human review, and posting it through controlled paths.

#### 14A–14G — Event Campaign Engine foundations

| Phase | Commit | Description |
|---|---|---|
| 14A | `dd01930` | Event campaign skill + corrected Surge365 CTAs |
| 14B | `8340a62` | Campaign calendar schema (migrations 017–021): `event_campaigns`, `campaign_assets`, `campaign_scores`, `event_sources`, `campaign_schedule` |
| 14C | `f4bae3a` | Event research engine — seeds, scoring, generator wired into weekly cron |
| 14D | `410e0a8` | Campaign generator API + asset generator library |
| 14E | `b7fc8ad` | Dashboard campaign planner UI + admin campaign asset routes |
| 14E.1 | `a91acd3` | Image/video prompt placeholder rendering for campaign dashboard |
| 14F | `e4737e0` | Push approved campaign assets into `content_calendar` as drafts (migration 022 — bridge column) |
| 14G | `ca7c2e4` | Per-platform creative sizing + media rules |

#### 14H series — Tracking URL infrastructure

| Phase | Commit | Description |
|---|---|---|
| 14 audit | `302a099` | Read-only system audit (Phase 14 mid-stream check) |
| 14H | `2e3869d` | Conversion tracking by event campaign — attribution view + helper + admin endpoint + dashboard performance panel (migration 023) |
| 14H.1 | `69d354d` | Tracking URL materialization on push-to-calendar (migration 024 — `content_calendar.tracking_url` column) |
| 14H.1 patch | `8582680` | Harden tracking URL helper against placeholder asset IDs |
| 14H.1 diag | `dc56330` | Tracking URL diagnostic helper script |
| 14H.2 | `783703e` | Persist event slugs for stable campaign attribution (migration 025 — `event_campaigns.event_slug`) |
| (mid) | `c01ee05` | Mandatory end-of-phase save protocol enforced |
| 14I | `c9956f5` | Click attribution via `/api/webhooks/track-event` UTM capture (migrations 026–028) |

#### 14J series — Posting gate (manual publish controls)

| Phase | Commit | Description |
|---|---|---|
| 14J | `0b3896a` | Safe posting gate / manual publish controls (migration 029 — gate columns: `posting_status`, `posting_gate_approved`, `posting_gate_approved_{at,by}`, `posting_gate_notes`, `queued_for_posting_at`, `manual_posting_only`, `posting_block_reason`) |
| 14J.1 | `764a6db` | Posting gate audit trail (migration 030 — `posting_gate_audit` table) |
| 14J.2 | `2abb1cf` | Branded tracking links + redirect route (`/t/<slug>`) |
| 14J.2.1 | `dec7bb3` | Hardened branded tracking redirect |

#### 14K series — Autoposter dry-run + manual route gating

| Phase | Commit | Description |
|---|---|---|
| 14K dry-run | `0faf4ff` | Autoposter eligibility helper (`src/lib/autoposter-gate.ts`) + manual cron route `/api/cron/autoposter-dry-run` (NEVER posts; tripwire `hardBlockLivePosting`) |
| 14K patch | `63bb4ba` | Remove `updated_at` dependency from dry-run query (column doesn't exist) |
| 14K.0.5 | `0c81df2` | `validateManualPostingGate` enforced in `/api/automations/post-to-{facebook,instagram,twitter}` routes |
| 14K.0.6 | `6b86b1a` | `/api/content` PATCH `→ posted` transition gated with `validateManualPostingGate(bookkeepingOnly: true)` (closes the last bypass) |

#### 14L series — Media readiness + generation pipeline

| Phase | Commit | Description |
|---|---|---|
| 14L | `810999e` | Media readiness gate (`src/lib/media-readiness.ts`) + caption legacy-link cleanup script |
| 14L.1 | `7e8ec63` | Tracking URL backfill + media generation planner (DRY-RUN) |
| 14L.2 | `7aad656` | Media storage migration 032 (`content_calendar.video_url`, `media_status`, `media_source`, `media_generated_at`, `media_error`) + dry-run media-generation worker scaffold |
| 14L.2.1 | `98204ef` | Real Pexels / OpenAI / HeyGen provider integration (`src/lib/media-providers.ts`) with strict flag matrix |
| 14L.2.2 | `e0f013d` | HeyGen single-video pilot scaffold + migration 033 (`content_calendar.media_metadata` JSONB) |
| 14L.2.3 | `ec3fc3e` | Permanent video storage hardening — completion path copies HeyGen MP4 → Supabase Storage; `--repair-temp-urls` scanner |
| 14L.2.4 | (no separate commit — operator-driven runs) | Remaining 4 HeyGen renders queued + landed permanently |
| 14L.2.5 | `2b838ce` | TikTok video-script backfill generator + readiness diagnostic |
| 14L.2.6 | `9690f31` | Controlled HeyGen batch unlock — replaces Phase 14L.2.2 `--limit=1` pilot guard with default-cap-5 / `--allow-large-heygen-batch`-cap-10 + pre-flight refusal contract |

#### 14M series — Pre-autoposter audit + Mark Posted fix

| Phase | Commit | Description |
|---|---|---|
| 14M | `b119a3e` | Pre-autoposter posting readiness audit script (`scripts/audit-pre-autoposter-readiness.js`) — 8 checks initially; first canonical proof file written |
| 14M.1 | `8b4da4c` | TikTok OAuth callback route `/api/auth/tiktok/callback` (no token exchange yet — unblocks Login Kit registration) |
| 14M.2 | `224e01b` | `/api/content` PATCH atomic `posted_at` fix + Audit Check 9 (posted_at invariant) + repair script (`scripts/repair-posted-at-invariants.js`) |

#### 14N — Manual posting validation

| Phase | Date | Description |
|---|---|---|
| 14N | 2026-05-05 / 06 | 5 manual posting cycles (FB×2, IG×2, TikTok×1) — all clean; `posted_at: 25 → 30` (later 29 after legacy IG WARN cleanup); zero validator disagreements; zero spillover; Phase 14M.2 atomic-write proven on every cycle |

#### 14O series — Autoposter pilot plan + manual runner

| Phase | Commit | Description |
|---|---|---|
| 14O Scope C | `f74ddfc` | [PHASE_14O_AUTOPOSTER_PILOT_PLAN.md](PHASE_14O_AUTOPOSTER_PILOT_PLAN.md) — full pre-cron contract (10 sections) including 13 cron guardrails, per-platform first-cron order, rollback plan, success/failure criteria, approval gate |
| 14O Scope A | (same commit; runtime proof) | Live `/api/cron/autoposter-dry-run` curl with `eligible_count: 1, dry_run: true, live_posting_blocked: true, posted_at unchanged` — 6/6 success criteria met |
| 14O.1 | `6e2f27a` | Manual autoposter runner (`scripts/run-autoposter-once.js`) — Path D adopted before any cron; ~30 manual `--apply` cycles target before promotion to cron |

---

## 4. What's working end-to-end (validated flows)

### Lead → Member funnel
1. Visitor lands on `/free` → submits opt-in form (Phase 12 funnel)
2. Webhook `/api/webhooks/lead-created` records to `contacts` + writes audit log
3. Bland.ai callback fires within minutes (Phase 9)
4. Email + SMS sequences kick off via Twilio + Resend (Phase 10)
5. Member upgrades via `/join` → Surge365 sign-up (`leosp` CTA)

### Content generation → publish
1. Weekly cron `/api/cron/weekly-content` generates ~10 social posts (caption + DALL-E or Pexels image) per week
2. Posts land in `content_calendar` with `status='draft'`
3. Operator opens `/dashboard/content` → reviews each row → clicks **Approve** or **Reject**
4. Approved row stays `posting_status='idle'` until **Mark Ready** click → flips to `posting_status='ready'` + `posting_gate_approved=true` + `queued_for_posting_at=now()`
5. Per-platform Post button renders only when row passes media readiness + gate fields
6. Click → platform Graph API call (FB / IG) → atomic UPDATE `status='posted', posted_at=now()`
7. Tracking link `/t/<slug>?utm_*` resolves to `event_campaigns.cta_url` and logs to `contact_events`

### Click attribution
1. Branded tracking URL `https://www.vortextrips.com/t/<event_slug>?utm_source=...&utm_medium=event_campaign&utm_campaign=<slug>_<year>_<wave>&utm_content=<asset_type>_<id_short>`
2. `/t/[slug]` route logs click to `contact_events` with full UTM resolution + FK to `event_campaigns` and `campaign_assets`
3. 302 redirect to `event_campaigns.cta_url` (typically `myvortex365.com/leosp`) with UTM params stripped from the final destination
4. Attribution view `event_campaign_attribution_v2` joins click events back to source campaigns for dashboard reporting

### Media generation pipeline
1. Pexels image (primary): `scripts/generate-missing-media.js --generate --apply --images-only`
2. OpenAI DALL-E (fallback): same script with `--provider=openai`
3. HeyGen video: same script with `--provider=heygen --limit=1..10` (cap-5 default; cap-10 with `--allow-large-heygen-batch`)
4. HeyGen polling: `scripts/check-video-generation-status.js --apply` downloads MP4 → uploads to Supabase Storage → writes permanent URL to `video_url`
5. Repair temp URLs: `--repair-temp-urls --apply` finds any `heygen.ai` host URLs and re-uploads to Supabase Storage

### Posting gate enforcement
1. Manual platform routes (`/api/automations/post-to-{facebook,instagram,twitter}`) — all gated via `validateManualPostingGate(post, { supportedPlatforms: ['<platform>'] })`
2. Generic `/api/content` PATCH `→ posted` — gated via `validateManualPostingGate(post, { bookkeepingOnly: true })` (Phase 14K.0.6)
3. Atomic `posted_at` write on `→ posted` transition (Phase 14M.2)
4. Audit `scripts/audit-pre-autoposter-readiness.js` enforces 9 invariants including the gate state, manual + autoposter validator agreement, and the `status='posted' iff posted_at IS NOT NULL` invariant

### Operator daily workflow (current state)
```bash
# Pre-flight
node scripts/audit-pre-autoposter-readiness.js
# Mark Ready ONE row in /dashboard/content (browser)
node scripts/run-autoposter-once.js          # DRY-RUN
node scripts/run-autoposter-once.js --apply  # operator-authorized post
# Post-flight
node scripts/audit-pre-autoposter-readiness.js
```

---

## 5. What's deferred or blocked

| Item | Status | Blocker | Resolution path |
|---|---|---|---|
| **Twitter/X live posting** | paused | HTTP 402 from `api.twitter.com` — Developer Portal API tier requires Basic ($100/mo) for write/post access | Upgrade Twitter Developer Portal → re-include `twitter` in `SUPPORTED_PLATFORMS` set in runner script + posting routes |
| **TikTok automated posting** | manual only | OAuth token-exchange helper not built; only Login Kit redirect URI is live | Phase 14K-tt — build `src/lib/tiktok-oauth.ts` + wire token storage in `site_settings` (mirror YouTube callback pattern) |
| **Live autoposter cron** | OFF by design | No cron registered yet; ~30 manual `--apply` runs are the gate | Phase 14O.2 — choose Path A (drop `check-heygen-jobs` slot, free) or Path C (Vercel Pro $20/mo for 40-cron limit + sub-daily cadence) |
| **Local `RESEND_API_KEY=""` build issue** | known | `vercel env pull` strips secret values to empty strings; `Resend(key)` constructor fails at module-eval | Either restore the real Resend key in `.env.local` manually OR move Resend client construction out of module-eval (lazy init at first call) |
| **Phase 13 ESLint v8/v9 mismatch** | known | `npm run lint` throws `TypeError: Converting circular structure to JSON` due to mixed `@eslint/eslintrc` + flat config artifacts | Pick one config style (flat OR rc), regenerate config, drop the other |
| **Legacy YouTube cron slot** | held | `check-heygen-jobs` cron was originally for SBA video; SBA video already populated; cron is largely no-op | Drop it in Phase 14O.2 (Path A) or repurpose its handler for a daily-maintenance handler that runs autoposter + something else |

---

## 6. What still needs work (active backlog)

### Near-term (next 1–2 weeks)

1. **Phase 14O.1 manual run cadence** — accumulate ~30 clean `--apply` cycles via `scripts/run-autoposter-once.js`. Each cycle: Mark Ready one FB or IG row, audit, run, audit. Track failures or refusals; reset counter on incident.
2. **Antigravity / OpenRouter integration testing** — currently in progress. First test (read-only summary) staged; second test (4-file code review) holstered. Goal: validate Antigravity as a developer-assist layer that obeys the read-only/no-edit/no-commit contract.
3. **Twitter/X Developer Portal upgrade decision** — operator needs to decide whether to pay for Basic API tier or skip Twitter entirely.
4. **TikTok caption decision** — operator's TikTok pilot used a non-truncated caption; future TikTok rows may need caption length validation (TikTok has a ~2200-char limit, but recommended is much shorter).

### Medium-term (next 1 month)

5. **Phase 14O.2 — cron promotion**. Either:
   - Path A: drop `check-heygen-jobs` from `vercel.json`; register `/api/cron/autoposter-once` (new wrapper around the runner script's logic); 1 row/day; auto-disable on first non-2xx
   - Path C: upgrade to Vercel Pro for headroom + sub-daily cadence
6. **Phase 14K-tt — TikTok OAuth token exchange**.
   - `src/lib/tiktok-oauth.ts`: `exchangeCodeForTokens` + `refreshAccessToken` + `getStoredTokens`
   - Update `/api/auth/tiktok/callback` to call exchange + upsert `site_settings.tiktok_*` keys
   - New `/api/auth/tiktok/start` to kick off Login Kit with CSRF state
   - `/api/automations/post-to-tiktok` route once tokens are storable
7. **Weekly-content cron tightening** — set `media_status='ready'` + `media_source='pexels'` + `media_generated_at=now()` atomically with `image_url` write in `fetchAndStoreImage` success path. Currently new rows sit at `'pending'` despite having a URL.
8. **Resend lazy-init fix** — move `new Resend(...)` from module-eval to first-use inside the route handler. Eliminates the local-build `RESEND_API_KEY=""` failure mode without restoring the real key.

### Longer-term (next quarter)

9. **Cron-driven autoposter at scale** — once Phase 14O.2 has 7+ consecutive clean runs on Facebook, extend to Instagram (Phase 14O.3), then TikTok after 14K-tt ships (Phase 14O.4).
10. **TikTok automated posting** — full path: Phase 14K-tt OAuth + new platform-poster route + autoposter eligibility extension.
11. **Twitter/X reactivation** — once API tier is paid, remove from `REFUSED_PLATFORMS` set in runner; add automated posting cycles to the 5-manual-cycle Phase 14N pattern.
12. **Email + SMS sequence content audit** — content was authored in earlier phases; review for current branding and CTA URLs (`vortextrips.com/book` vs `/join`).
13. **Bland.ai voice-AI script refresh** — original SBA-pitch script may need updates as offering matures.
14. **Conversion attribution dashboard polish** — `dashboard/attribution` page exists but operator hasn't validated it against real prod click data yet.
15. **Phase 13 ESLint config fix** — pick flat-config or rc-style and stick to one. Currently `npm run lint` throws a circular-JSON error.
16. **Operational runbooks** — convert key operator workflows (Mark Ready → Post → Verify) into a short SOP doc so a second admin could be onboarded.

---

## 7. Open decisions awaiting operator input

1. **Cron path for Phase 14O.2** — Path A (free, drop `check-heygen-jobs`) vs Path C (Pro, $20/mo, 40-cron + sub-daily)
2. **Twitter/X investment** — pay for Basic API tier ($100/mo = $1,200/yr) vs drop Twitter from the platform mix
3. **TikTok automation depth** — invest in OAuth helper for full automation vs continue Creator Center manual upload indefinitely
4. **Antigravity scope** — read-only assistant indefinitely, or eventually grant read+propose then read+apply (with Claude as final reviewer at every step)
5. **Cron cadence philosophy** — 1 row/day weekday-only, 1/day 7-day-week, or 2-3/day across timezones (only feasible on Pro)

---

## 8. Production cron jobs (current `vercel.json`)

| Slot | Path | Schedule | Purpose | Active? |
|---|---|---|---|---|
| 1 | `/api/cron/check-heygen-jobs` | `0 2 * * *` daily 2am UTC | SBA video render polling | ⚠️ largely no-op; SBA video populated; candidate for removal in Phase 14O.2 |
| 2 | `/api/cron/weekly-content` | `0 3 * * 1` Monday 3am UTC | Weekly content generation (10 posts/week) | ✅ active |
| 3 | `/api/cron/score-and-branch` | `0 4 * * *` daily 4am UTC | Lead scoring + pipeline branch routing | ✅ active |
| 4 | `/api/cron/send-sequences` | `0 5 * * *` daily 5am UTC | Email + SMS sequence drips | ✅ active |
| — | `/api/cron/autoposter-dry-run` | unregistered | Available via curl with `CRON_SECRET`; never auto-fires | ⏳ proven via Phase 14O Scope A |

---

## 9. Operational scripts (in `scripts/`)

23 scripts total. The autoposter / posting-gate set:

| Script | Purpose | Default mode |
|---|---|---|
| `audit-pre-autoposter-readiness.js` | 9-check audit + proof file write | read-only |
| `diagnose-autoposter-dry-run.js` | Hits `/api/cron/autoposter-dry-run` + verifies contract assertions | read-only |
| `diagnose-manual-posting-gates.js` | Static-grep verifies all 4 manual-post routes import `validateManualPostingGate` | read-only |
| `diagnose-posting-gate.js` | Live state of gate columns across all rows | read-only |
| `diagnose-posting-gate-audit.js` | Recent posting_gate_audit log entries | read-only |
| `diagnose-tracking-urls.js` | Branded vs legacy tracking URL counts | read-only |
| `diagnose-branded-redirect.js` | Click attribution health for `/t/<slug>` | read-only |
| `diagnose-campaign-click-attribution.js` | Per-campaign click attribution rollup | read-only |
| `diagnose-media-readiness.js` | Media gap report + provider readiness + temp-URL warning + HeyGen pilot status | read-only |
| `diagnose-video-script-readiness.js` | TikTok script-presence audit | read-only |
| `generate-missing-media.js` | Pexels / OpenAI / HeyGen image+video generation worker | DRY-RUN; `--generate` calls providers; `--apply` writes |
| `generate-missing-video-scripts.js` | OpenAI script-backfill for TikTok rows | DRY-RUN; `--generate --apply` writes |
| `check-video-generation-status.js` | HeyGen render polling + permanent-URL writeback | DRY-RUN; `--apply` writes; `--repair-temp-urls --apply` repairs |
| `inspect-heygen-pilot-candidates.js` | Read-only: list HeyGen-eligible TikTok rows | read-only |
| `inspect-missing-video-scripts.js` | Read-only: list TikTok rows lacking scripts | read-only |
| `inspect-null-tracking-rows.js` | Read-only: rows missing tracking_url | read-only |
| `plan-media-generation.js` | Group missing-media rows by campaign × platform × asset_type | read-only |
| `repair-posted-at-invariants.js` | One-shot fix for status/posted_at drift | DRY-RUN; `--apply --id=<uuid>` writes |
| `backfill-content-calendar-tracking-urls.js` | Backfill missing tracking URLs on campaign rows | DRY-RUN; `--apply` writes |
| `cleanup-legacy-caption-links.js` | Rewrite captions containing legacy `myvortex365.com/leosp` | DRY-RUN; `--apply` writes |
| `run-autoposter-once.js` | **Phase 14O.1** manual autoposter runner | DRY-RUN; `--apply` posts ONE row to FB or IG only |
| `resize-images.js` | Pre-flight image resize for chat / dashboard upload | read-only / writes locally |

---

## 10. Database schema highlights

### `content_calendar` (the hub)

Created in migration 004; extended through migrations 022, 024, 029, 032, 033.

| Column | Source | Purpose |
|---|---|---|
| `id`, `week_of`, `platform`, `caption`, `hashtags`, `image_prompt`, `status`, `posted_at`, `created_at` | 004 | base lifecycle |
| `image_url`, `video_script` | (out-of-band, pre-014L) | legacy media columns |
| `campaign_asset_id` | 022 | FK to `campaign_assets` for campaign-originated rows |
| `tracking_url` | 024 | branded `/t/<slug>?utm_*` URL; populated on push-to-calendar |
| `posting_status`, `posting_gate_approved`, `posting_gate_approved_at`, `posting_gate_approved_by`, `posting_gate_notes`, `queued_for_posting_at`, `manual_posting_only`, `posting_block_reason` | 029 | Phase 14J posting gate |
| `video_url`, `media_status`, `media_generated_at`, `media_source`, `media_error` | 032 | Phase 14L.2 media generation state (pending / ready / failed / skipped) |
| `media_metadata` (JSONB) | 033 | Phase 14L.2.2 — clean home for HeyGen `video_id`, provider provenance, queue/completion timestamps |

### `event_campaigns`

Created migration 017. Schema for destination/event campaigns (e.g. Art Basel, F1 Miami).
- `event_name`, `event_year`, `event_slug`, `event_date_*`, `cta_url`
- Status: `idea` → `researching` → `approved` → `running` → `paused` → `archived`
- Migrations 023, 026, 028: layered attribution view rebuilds

### `campaign_assets`

Created migration 018. One row per generated content piece per campaign.
- `wave` (W1–W8), `asset_type` (social_post / short_form_script / email_subject / email_body / dm_reply / hashtag_set / image_prompt / video_prompt / landing_headline / lead_magnet)
- `body`, `hashtags`, `image_url`, `video_url`, `image_source` / `video_source` + `*_metadata` JSONB
- `tracking_url`, `scheduled_for`, `posted_at`, `post_url`
- `status`: `idea` / `draft` / `approved` / `scheduled` / `posted` / `archived` / `rejected`
- FK back to `content_calendar.id` via `content_calendar_id`

### `posting_gate_audit`

Created migration 030. Append-only log of every posting gate state transition.
- `content_calendar_id`, `action` (`queue` / `unqueue` / `blocked`), previous/new state, `actor_id` + `actor_email` (denormalized), `notes`, `block_reason`, `metadata` (JSONB)

### Other tables (from earlier phases)

`contacts`, `ai_jobs`, `ai_actions_log`, `ai_model_usage`, `ai_verification_logs`, `ai_command_templates`, `admin_users`, `contact_events`, `event_sources`, `campaign_scores`, `campaign_schedule`, `site_settings`.

---

## 11. Audit invariants (the 9 checks)

`scripts/audit-pre-autoposter-readiness.js` enforces these. ALL must pass before any autoposter cron is enabled.

1. **Branded tracking links** — every campaign-originated approved + unposted row carries `https://www.vortextrips.com/t/<slug>` tracking_url
2. **Media readiness** — every approved + unposted row passes `validateMediaReadiness` (platform-specific image/video requirements)
3. **Posting gate refuses idle / unapproved** — sample idle approved + unapproved rows; `validateManualPostingGate` blocks all
4. **Manual post routes guarded** — static grep over `/api/automations/post-to-{facebook,instagram,twitter}/route.ts` and `/api/content/route.ts` confirms each imports + calls `validateManualPostingGate`
5. **Autoposter dry-run gate-only** — `validateAutoposterCandidate` over all approved rows; every "eligible" row has `posting_status='ready' + posting_gate_approved=true + queued_for_posting_at`
6. **No `posted_at` mutation during audit** — count snapshot before vs after; delta must be 0
7. **No platform API calls during audit** — script self-scan for hostnames (graph.facebook.com, api.tiktok.com, api.heygen.com, etc.) returns 0 matches
8. **Manual + autoposter validators agree** — every approved row produces the same allow/refuse decision from both
9. **Posted_at invariant** — `status='posted' iff posted_at IS NOT NULL`. FAIL on `status='posted' AND posted_at IS NULL`. WARN (not FAIL) on `status != 'posted' AND posted_at IS NOT NULL` (covers historical artifacts)

Current state: **9/9 PASS, 0 WARN** (legacy IG WARN cleared 2026-05-06 via `repair-posted-at-invariants.js --apply --repair-legacy-id=...`).

---

## 12. Save protocol (mandatory)

Per [SAVE_PROTOCOL.md](SAVE_PROTOCOL.md), every phase MUST end with:

1. `PROJECT_STATE_CURRENT.md` updated
2. `BUILD_PROGRESS.md` updated
3. `git status` shows only intended changes
4. Stage by **named files** only (never `git add .` / `-A` / `-u`)
5. Commit with phase number prefix
6. `git push origin main` twice — second must show `Everything up-to-date`
7. `tsconfig.tsbuildinfo` excluded by default (Rule 5/6)
8. Final `git status` must show clean tree (or `tsconfig.tsbuildinfo` only modified — restore it)

This is enforced automatically by Claude (or the operator's review of Antigravity output) at the end of every phase. **No phase is complete until all 8 conditions are satisfied.**

---

## 13. How to read this doc going forward

This file is a snapshot — it captures state as of 2026-05-07. It will go stale within days as new phases ship.

For the LATEST state, always read in this order:
1. [PROJECT_STATE_CURRENT.md](PROJECT_STATE_CURRENT.md) — narrative state of the current phase
2. [BUILD_PROGRESS.md](BUILD_PROGRESS.md) — chronological log; "Current focus" section is authoritative
3. `git log --oneline -10` — recent commits in case docs lag the code
4. `node scripts/audit-pre-autoposter-readiness.js` — live system health (read-only; outputs to terminal + writes a dated proof file)

If those four agree, the system is in a known-good state. If they disagree, the audit is the source of truth — fix the docs to match.
