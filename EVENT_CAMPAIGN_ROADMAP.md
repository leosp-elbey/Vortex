# Event Campaign Roadmap

**Status:** Phase 14A complete (skill spec only). Phases 14B-14H are scoped but not started.
**Created:** 2026-05-02
**Companion file:** `VORTEX_EVENT_CAMPAIGN_SKILL.md`

This roadmap turns the event-campaign skill into running automation. Each phase is a separate session per the one-phase-per-session rule.

---

## Phase 14A — Skill file only (DONE 2026-05-02)

- Created `VORTEX_EVENT_CAMPAIGN_SKILL.md` with purpose, formula, categories, timing waves, output spec, cruise add-on logic, compliance rules, automation rules, scoring rubric, and 15 seed campaigns.
- Created this roadmap file.
- Surge365 signup CTAs swept across the codebase to the path-based `/leosp` URL.
- No database or app code changed.

**Exit criteria:** skill file exists, roadmap exists, signup URLs canonical, markdown updated, working tree clean and pushed.

---

## Phase 14B — Campaign Calendar Schema

Goal: persist event campaigns and their generated assets in Supabase so the system can keep state across runs.

Tables (proposed; final shape decided in 14B session):
- `event_campaigns` — one row per (event × year). Holds `campaign_name`, `destination`, `event_name`, `event_type[]`, `audience[]`, `travel_dates`, `score`, `status` (draft/active/archived).
- `campaign_assets` — one row per generated asset (post, email, video script, image prompt). FK to `event_campaigns.id`. Holds `wave`, `platform`, `body`, `image_url`, `scheduled_for`, `published_at`, `engagement_json`.
- `campaign_scores` — score history per (campaign × week). Tracks how scoring drifts as events approach.
- `event_sources` — registry of where event data came from (manual seed, API, scrape, partner feed). Holds `source_name`, `source_url`, `last_pulled_at`, `enabled`.
- `campaign_schedule` — joins `campaign_assets` to a calendar slot for the existing `content_calendar` cron to consume.

Migrations land in `supabase/migrations/0XX_event_campaigns.sql`. Add RLS policies that mirror existing `content_calendar` rules.

**Exit criteria:** migrations applied locally + on Supabase prod, types regenerated, no schema warnings.

---

## Phase 14C — Event Research Cron

Goal: weekly job that pulls upcoming events and writes candidates into `event_campaigns` with an initial score.

- New cron route: `src/app/api/cron/event-research/route.ts`. Runs weekly. Reuses existing cron-secret auth.
- Initial event sources (Phase 14C uses a hand-curated seed list — no scraping):
  - Static JSON in `src/lib/event-seeds.json` covering the 15 example campaigns + the "second-pass" list from `VORTEX_EVENT_CAMPAIGN_SKILL.md` §10.
  - Optional: ICS feeds from public event calendars where freely available.
- Scoring uses the rubric in §9 of the skill file. Logic lives in `src/lib/event-scoring.ts`.
- Inserts into `event_campaigns` with `status='candidate'` until a generator promotes them.
- Vercel Hobby cron limit: we are at 4 cron jobs (`score-and-branch`, `send-sequences`, `weekly-content`, `check-heygen-jobs`). Phase 14C must either replace one or merge into the weekly-content cron. Default: merge into `weekly-content` as a Monday pre-step.

**Exit criteria:** cron runs successfully on prod, fills `event_campaigns` with at least 15 candidates, scores written.

---

## Phase 14D — Campaign Generator API

Goal: turn a scored candidate into a full campaign object matching §5/§6 of the skill file.

- New API route: `src/app/api/ai/generate-event-campaign/route.ts`. Admin-only; mirrors existing AI route auth pattern.
- Input: `event_campaign_id` plus optional `wave` override (default = all 8).
- Steps:
  1. Load candidate from `event_campaigns`.
  2. Build prompt that embeds the skill file's formula, output spec, compliance rules, and the candidate's data.
  3. Call OpenRouter cheap-tier model via existing `ai-router.ts`.
  4. Validate JSON shape against §5/§6.
  5. Call Claude verifier (`ai-verifier.ts`) for compliance + brand check.
  6. Insert `campaign_assets` rows with `status='draft'`, `requires_human_approval=true`.
  7. Log to `ai_jobs` and `ai_model_usage`.
- Reuses existing budget guards. No new env vars.

**Exit criteria:** generator produces a complete asset set for at least 3 seed campaigns, all assets pass Claude verification, all rows visible in admin dashboard.

---

## Phase 14E — Dashboard Campaign Planner

Goal: surface the event campaigns inside the existing AI Command Center so a human can approve, edit, or reject drafts.

- New page: `src/app/dashboard/event-campaigns/page.tsx`.
- New components in `src/components/ai/`:
  - `EventCampaignList.tsx` — sortable by score, urgency, event date.
  - `EventCampaignDetail.tsx` — shows the full campaign object with each asset editable.
  - `WaveCalendar.tsx` — visual 8-wave calendar with green/yellow/red status.
- Sidebar nav entry under the existing AI Command Center group.
- Approval action: flips `campaign_assets.status` from `draft` to `approved` and stamps `approved_by`/`approved_at`.

**Exit criteria:** admin user can approve a draft campaign in the dashboard, change is persisted, and the asset becomes eligible for the next phase.

---

## Phase 14F — Auto-Push Approved Campaigns into `content_calendar`

Goal: connect approved `campaign_assets` to the existing posting infrastructure.

- Approved assets get rows inserted into `content_calendar` with `scheduled_for` derived from the wave's posting schedule.
- The existing `weekly-content` and per-platform posters (`post-to-twitter`, etc.) pick up the rows with no further changes.
- Add a foreign key `content_calendar.campaign_asset_id` (nullable) so we can trace which event drove which post.

**Exit criteria:** an approved Trinidad Carnival W1 post lands in `content_calendar`, gets posted by the existing pipeline at the scheduled time, and the link-back FK resolves.

---

## Phase 14G — Per-Platform Creative Sizing & Video/Image Rules

Goal: ensure every generated asset hits the right aspect ratio and length per platform.

- Build `src/lib/social-specs.ts` (already on the long-running TODO list) and consume it in the generator.
- Specs to encode:
  - Instagram feed 1:1 / 4:5 — image ≤ 30 MB, video ≤ 60 sec.
  - Instagram Reels 9:16 — 15-90 sec.
  - TikTok 9:16 — 9-180 sec sweet spot 21-34 sec.
  - X feed 16:9 / 1:1 — image ≤ 5 MB, video ≤ 2:20.
  - Facebook feed 1.91:1 / 1:1 — image ≤ 8 MB.
  - YouTube Shorts 9:16 — ≤ 60 sec.
- The image generator pipeline reads specs and resizes accordingly using the existing image-safety guard.
- Video generation (HeyGen) reads specs to pick aspect ratio.

**Exit criteria:** at least one asset per platform passes the platform's API upload check on the first try.

---

## Phase 14H — Conversion Tracking by Event Campaign

Goal: prove which event campaigns actually drive signups and bookings.

- Every `campaign_asset` carries a `tracking_url_format` (already required in §5 of the skill file). Format: `?utm_source=<platform>&utm_medium=event_campaign&utm_campaign=<event>_<year>_<wave>`.
- New table or view that joins `events` (the existing analytics table) to `campaign_assets.id` via UTM parsing.
- Admin dashboard widget shows: campaign → assets → clicks → leads → free-portal signups → SBA enrollments.
- Roll-up per (event × year) so we can decide whether to invest more next cycle.

**Exit criteria:** dashboard shows at least one campaign with non-zero clicks attributed and tied back to the originating event.

---

## Cross-cutting rules (applies to all 14B-14H phases)

- One phase per session.
- Every phase ends with `PROJECT_STATE_CURRENT.md` + `BUILD_PROGRESS.md` updates and a clean push.
- Compliance §7 of the skill file is enforced in code starting in Phase 14D and never weakened.
- Vercel Hobby cron limit (4 jobs max) constrains 14C — plan a merge, not a new cron.
- Budget guards (`AI_DAILY_BUDGET_LIMIT`, `AI_MONTHLY_BUDGET_LIMIT`) apply automatically via `ai-router.ts`. Do not add a parallel budget system.
- Human approval is mandatory through Phase 14F. Auto-approval (if ever introduced) is a separate phase that requires explicit Leo authorization.
