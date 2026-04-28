# Vortex AI Command Center — Build Plan

**Created:** 2026-04-27
**Status:** AWAITING APPROVAL — no code changes yet
**Author:** Claude (Opus 4.7) for Leo
**Scope:** Add AI Command Center to existing VortexTrips Next.js app + retrofit security/migrations

---

## Executive summary (read this first)

You asked for an AI Command Center on top of VortexTrips that:
- Routes most AI work through OpenRouter (cost-optimized model selection)
- Uses Claude as a verification/review layer before publishing
- Centralizes job creation, review, approval, and push-to-calendar
- Comes with security fixes, migration cleanup, and HeyGen async refactor

**Honest scope:** This is a 1-3 week project for a senior engineer working full-time. It is **not** something to ship in one sitting safely. The plan below breaks it into 11 phases with hard checkpoints between each so we never half-ship.

**Total estimated build time (working sessions):**
- Conservative (read-write-test cycle, no surprises): **~25-35 hours**
- Realistic (with debugging + review cycles): **~40-55 hours**
- This plan assumes phases are sequential. Some can be parallelized but security comes first.

---

## ⚠️ Pre-flight — handle BEFORE Phase 1

These three items from your existing queue affect this build and should be resolved first:

| # | Item | Why it blocks |
|---|---|---|
| P-1 | **Rotate `ANTHROPIC_API_KEY`** at console.anthropic.com — exposed in screenshots | The verifier layer (Phase 4) uses this key; we should not build on a compromised credential |
| P-2 | Investigate the 4 "Needs Attention" env var flags (especially `RESEND_API_KEY`) | If any of these are stale, existing prod features (drip emails) will break the moment we redeploy |
| P-3 | Diagnose Vercel webhook flakiness or commit to CLI-deploy as primary path | Several phases need clean deploy cycles — flaky webhook = silent failures |

**Recommendation:** Do P-1 and P-2 in 5-10 minutes before starting Phase 1. P-3 can be deferred since `npx vercel --prod` works.

---

## Phase 0 — AUDIT & PLAN (✅ this document)

**Status:** Complete on this document creation. No code changes.

**Confirmed system state (2026-04-27):**

- ✅ Stack: Next.js 16.2.4, App Router, Vercel Hobby (10s function limit, daily cron only)
- ✅ Existing migrations: `001_create_contacts`, `002_create_opportunities`, `003_create_ai_actions_log`, `004_create_content_calendar`, `005_create_admin_users`
- ✅ Tables used in code WITHOUT migrations: `sequence_queue`, `site_settings`, `contact_events`, `partners`, `trips`, `reviews` (+ `lead_score` column added ad-hoc to contacts)
- ✅ Lib utilities present: `bland.ts`, `resend.ts`, `twilio.ts`, `openai.ts`, `email-templates.ts`, `utils.ts`, `supabase/{client,admin,server}.ts`
- ✅ Sidebar navItems live at `src/components/dashboard/sidebar.tsx` — 10 nav links, easy to add to
- ✅ Components: `toast`, `slide-panel` reusable from `src/components/ui/`
- ❌ No Anthropic SDK installed (`@anthropic-ai/sdk` missing from package.json)
- ❌ No OpenRouter SDK present (will use OpenAI SDK with `baseURL` override — OpenRouter is OpenAI-compatible)
- ❌ `package.json` scripts: `dev`, `build`, `lint`, `start` — **no `typecheck` script** (will use `npx tsc --noEmit` instead)

**No code changes were made during Phase 0.**

---

## Phase 1 — DATABASE MIGRATIONS

**Goal:** Establish proper migration files for all tables (existing untracked + 4 new AI tables) so the schema is reproducible.

**Time estimate:** 3-4 hours (the SQL is mechanical, but each table needs careful column inspection from code-references)

**Risk:** 🟡 Medium. Migrations themselves are non-destructive (CREATE TABLE IF NOT EXISTS), but if Supabase prod schema differs from what the code expects, applying these may fail or no-op. Need to inspect prod schema first via Supabase dashboard.

### Files to create

**Retroactive migrations (tables that already exist in prod but have no migration file):**

| # | File | Table | Notes |
|---|---|---|---|
| 1 | `supabase/migrations/006_create_sequence_queue.sql` | `sequence_queue` | Drip schedule (id, contact_id, sequence_name, step, channel, template_key, scheduled_at, status, sent_at) |
| 2 | `supabase/migrations/007_create_site_settings.sql` | `site_settings` | Key-value config (id, key UNIQUE, value JSONB, updated_at) |
| 3 | `supabase/migrations/008_create_contact_events.sql` | `contact_events` | Event tracking for lead scoring |
| 4 | `supabase/migrations/009_create_partners.sql` | `partners` | Affiliate partner records |
| 5 | `supabase/migrations/010_create_trips.sql` | `trips` | Trip history per contact |
| 6 | `supabase/migrations/011_create_reviews.sql` | `reviews` | Public testimonials |
| 7 | `supabase/migrations/012_alter_contacts_lead_score.sql` | (alters `contacts`) | `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 0` |

**New AI Command Center migrations:**

| # | File | Table |
|---|---|---|
| 8 | `supabase/migrations/013_create_ai_jobs.sql` | `ai_jobs` |
| 9 | `supabase/migrations/014_create_ai_model_usage.sql` | `ai_model_usage` |
| 10 | `supabase/migrations/015_create_ai_verification_logs.sql` | `ai_verification_logs` |
| 11 | `supabase/migrations/016_create_ai_command_templates.sql` | `ai_command_templates` |

### `ai_jobs` schema (per your spec)

```sql
CREATE TABLE ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,                      -- 'social-post', 'video-script', 'email-sequence', 'blog', etc.
  title TEXT NOT NULL,
  input_payload JSONB NOT NULL,
  output_payload JSONB,
  model_requested TEXT,
  model_used TEXT,
  provider TEXT,                               -- 'openrouter', 'anthropic', 'openai'
  status TEXT NOT NULL DEFAULT 'pending',      -- 'pending', 'running', 'completed', 'failed', 'pending_review', 'approved', 'rejected', 'needs_revision'
  cost_estimate NUMERIC(10,4),                 -- USD
  error_message TEXT,
  verified_by TEXT,                            -- 'claude', 'human', NULL
  verification_status TEXT,                    -- 'approved', 'needs_revision', 'rejected', NULL
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX idx_ai_jobs_created_by ON ai_jobs(created_by);
CREATE INDEX idx_ai_jobs_job_type ON ai_jobs(job_type);
```

### Application order

1. Apply retroactive migrations using `IF NOT EXISTS` so they no-op if tables exist (Supabase dashboard SQL editor or CLI)
2. Inspect prod schema in Supabase Studio first — record what columns each existing table actually has, so the migration matches reality
3. Apply new AI migrations (these will create tables — no risk of conflict)

### What I need from you for Phase 1

- Confirm: do you have Supabase CLI installed locally, or should I write SQL that you paste into Supabase Studio's SQL Editor?
- Permission to inspect prod schema (read-only) via the Supabase MCP if available, OR you paste me the schema dumps for the 6 untracked tables

---

## Phase 2 — ENV VARIABLES

**Goal:** Add new env vars to `.env.example` and document what's needed in Vercel for prod.

**Time estimate:** 30 minutes

**Risk:** 🟢 Low. Only edits `.env.example` (committed, no secrets). I will NOT touch `.env.local`.

### `.env.example` additions

```bash
# OpenRouter (AI gateway)
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Default model selection per task type (OpenRouter model IDs)
AI_DEFAULT_MODEL=anthropic/claude-haiku-4.5
AI_CHEAP_MODEL=meta-llama/llama-3.3-70b-instruct
AI_MEDIUM_MODEL=anthropic/claude-sonnet-4.6
AI_STRONG_MODEL=anthropic/claude-opus-4-7
AI_CODING_MODEL=anthropic/claude-sonnet-4.6
AI_VERIFIER_MODEL=anthropic/claude-opus-4-7

# Budget guardrails
AI_MONTHLY_BUDGET_LIMIT=200
AI_DAILY_BUDGET_LIMIT=20
AI_REQUIRE_HUMAN_APPROVAL=true
```

### Vercel deployment env vars (you set in dashboard)

Same variables. I'll provide a concise list at end of Phase 2 for copy-paste.

### What I need from you for Phase 2

- Your OpenRouter account + API key (https://openrouter.ai/keys)
- Confirm budget limits ($200/mo + $20/day default OK?)

---

## Phase 3 — AI ROUTER (`src/lib/ai-router.ts`)

**Goal:** Single entrypoint for all AI requests, routes by job type, logs to `ai_jobs`, never exposes keys client-side.

**Time estimate:** 4-6 hours

**Risk:** 🟢 Low (new isolated module — doesn't affect existing routes)

### Structure

```typescript
// src/lib/ai-router.ts

export type JobType =
  | 'ideas' | 'captions' | 'hashtags' | 'outlines'              // → cheap model
  | 'scripts' | 'emails' | 'landing-copy' | 'blog'              // → medium model
  | 'code' | 'security-review' | 'compliance'                   // → strong model

export interface AIJobRequest {
  jobType: JobType
  title: string
  prompt: string
  systemPrompt?: string
  inputPayload?: Record<string, unknown>
  modelOverride?: string  // admin-only escape hatch
  createdBy: string       // auth.users.id
}

export interface AIJobResult {
  jobId: string
  output: string
  modelUsed: string
  costEstimate: number
  status: 'completed' | 'failed' | 'pending_review'
  error?: string
}

export async function runAIJob(req: AIJobRequest): Promise<AIJobResult>
```

### Behaviors

1. **Model selection** based on `jobType` → reads from env (`AI_CHEAP_MODEL` etc.)
2. **OpenRouter via OpenAI SDK** with `baseURL: process.env.OPENROUTER_BASE_URL`
3. **Insert `ai_jobs` row** at start (status='running'), update at end with output, model_used, cost_estimate
4. **Cost estimation** using OpenRouter's response usage tokens × per-model rates (build a small lookup table)
5. **Retry logic** — 3 attempts on transient errors (5xx, 429, network)
6. **Budget guardrail** — query `ai_jobs` for current month's `SUM(cost_estimate)`, block if over `AI_MONTHLY_BUDGET_LIMIT`
7. **Server-side only** — file imports `process.env.OPENROUTER_API_KEY` directly, never exposed

### Files

- `src/lib/ai-router.ts` (new, ~200 lines)
- `src/lib/ai-models.ts` (new, ~80 lines — model metadata: cost-per-1k-tokens, capabilities)

---

## Phase 4 — CLAUDE VERIFICATION LAYER (`src/lib/ai-verifier.ts`)

**Goal:** Before any AI output goes live, Claude reviews it against a checklist; result logged to `ai_verification_logs`.

**Time estimate:** 3-5 hours

**Risk:** 🟡 Medium. Depends on Anthropic API working; needs a tested key (P-1 must be done).

### Structure

```typescript
// src/lib/ai-verifier.ts

export type VerificationCheck =
  | 'hallucinations'     // does it claim facts that can't be verified?
  | 'broken-links'       // any URLs that 404?
  | 'missing-cta'        // does it have a CTA where one is expected?
  | 'off-brand-tone'     // does it use forbidden words like "Travel Team Perks", "MLM", "downline"?
  | 'duplicate-content'  // is this near-identical to recent content_calendar entries?
  | 'unsafe-claims'      // medical, legal, financial, or income guarantees?

export interface VerificationResult {
  status: 'approved' | 'needs_revision' | 'rejected'
  checks: Record<VerificationCheck, { passed: boolean; note: string }>
  overallScore: number  // 0-100
  recommendations: string[]
}

export async function verifyAIOutput(
  jobId: string,
  output: string,
  jobType: string
): Promise<VerificationResult>
```

### Behaviors

1. Uses Anthropic SDK directly (not via OpenRouter) for Claude calls
2. Sends a structured verification prompt with the output and job context
3. Parses Claude's structured JSON response
4. Inserts row into `ai_verification_logs` (full audit)
5. Updates parent `ai_jobs` row with `verification_status` and `verified_by='claude'`
6. If `AI_REQUIRE_HUMAN_APPROVAL=true`, status → `pending_review` regardless of Claude's verdict
7. If false and Claude says approved, status → `approved`

### Files

- `src/lib/ai-verifier.ts` (new, ~250 lines)
- Add `@anthropic-ai/sdk` to `package.json` dependencies

---

## Phase 5 — API ROUTES (11 new admin-only routes)

**Goal:** REST endpoints for the dashboard to interact with the AI system.

**Time estimate:** 6-10 hours (each route ~30-60 min including auth, validation, logging, error handling)

**Risk:** 🟡 Medium. New routes don't affect existing routes, but auth/admin-check pattern must match existing patterns exactly.

### Routes to build

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ai/jobs/create` | Create new AI job (calls ai-router) |
| GET | `/api/ai/jobs/[id]` | Get one job with output + verification |
| POST | `/api/ai/jobs/[id]/verify` | Trigger Claude verification |
| POST | `/api/ai/jobs/[id]/approve` | Mark approved (human gate) |
| POST | `/api/ai/jobs/[id]/reject` | Mark rejected with reason |
| POST | `/api/ai/generate/content` | Specialized: generic content generation |
| POST | `/api/ai/generate/video-script` | Specialized: video script |
| POST | `/api/ai/generate/social-pack` | Specialized: 4-platform post pack |
| POST | `/api/ai/generate/email-sequence` | Specialized: email drip sequence |
| POST | `/api/ai/generate/blog` | Specialized: long-form blog |
| POST | `/api/ai/push-to-calendar` | Move approved AI job → `content_calendar` rows |

### Auth pattern (every route)

```typescript
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { data: adminUser } = await admin
  .from('admin_users')
  .select('role')
  .eq('id', user.id)
  .single()
if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

### Validation

Use a small home-rolled validator OR add `zod` (small dep, recommend it).

---

## Phase 6 — DASHBOARD PAGE (`/dashboard/ai-command-center`)

**Goal:** Single-page UI for everything: create job, view recent jobs, verify, approve, push.

**Time estimate:** 6-10 hours (real React work, multiple components, state management)

**Risk:** 🟡 Medium. Real UX decisions to make. Should reuse existing toast/slide-panel components.

### Page structure

```
/dashboard/ai-command-center
├── (left) Job creator form
│   ├── Job type dropdown (11 types)
│   ├── Model selector (override)
│   ├── Title input
│   ├── Prompt textarea (10 rows)
│   └── "Generate" button
└── (right) Job inspector
    ├── Generated output (with status badge)
    ├── Verification panel (Claude's notes)
    ├── Approve / Reject / Push to Calendar buttons
    └── Cost display
─────────────────────────────────
Recent jobs table (full width below)
├── Filters: status, model, job type, date range
├── Columns: title, type, model, status, cost, created, actions
└── Click row → opens job inspector
```

### Files

- `src/app/dashboard/ai-command-center/page.tsx` (~500 lines)
- `src/components/ai/JobCreator.tsx`
- `src/components/ai/JobInspector.tsx`
- `src/components/ai/JobsTable.tsx`
- `src/components/ai/VerificationPanel.tsx`
- Edit `src/components/dashboard/sidebar.tsx` — add nav link

### Sidebar addition

```typescript
{ href: '/dashboard/ai-command-center', label: 'AI Center', icon: '🤖' },
```

---

## Phase 7 — WORKFLOWS

**Goal:** Wire up the 5 specialized generators behind their routes.

**Time estimate:** 4-6 hours

**Risk:** 🟢 Low (uses ai-router already built; just packaging)

### Workflows

| Workflow | Output |
|---|---|
| 30-day social calendar | Array of 30+ rows for `content_calendar` (platform, week_of, caption, hashtags, image_prompt) — DRAFT status |
| Video scripts (short-form) | Hook + intro + body + CTA, 60-90 second target |
| Captions + hashtags | Per-platform (FB, IG, TikTok, X) |
| Email follow-up sequences | 7-step sequence pre-formatted for `EMAIL_TEMPLATES` |
| Blog posts | 800-1500 word article with H2 structure |

### Push to calendar logic

- Only approved jobs (status = 'approved')
- Inserts into `content_calendar` with status='approved' (skipping draft, since AI + Claude already reviewed)
- For TikTok/X: inserts row but **flags `posting_supported=false`** until posting routes exist (don't pretend it works)

### Files

- `src/lib/workflows/social-calendar.ts`
- `src/lib/workflows/video-script.ts`
- `src/lib/workflows/email-sequence.ts`
- `src/lib/workflows/blog-post.ts`

---

## Phase 8 — SECURITY HARDENING

**Goal:** Lock down the public webhooks and AI center.

**Time estimate:** 3-5 hours

**Risk:** 🟡 Medium. Webhook auth changes can break existing flows if not done carefully — need to coordinate with whatever's calling them (the homepage form for `lead-created`).

### Fixes

1. **`/api/webhooks/lead-created`** — add `X-Vortex-Form-Token` header check
   - Token stored in `NEXT_PUBLIC_FORM_TOKEN` (yes, public — it's anti-spam, not anti-attacker; combine with rate-limit)
   - Homepage form sends this header
   - Reject requests without valid token
2. **`/api/webhooks/bland`** — verify Bland.ai webhook signature (their docs require `Authorization: Bearer <secret>`)
3. **`/api/webhooks/twilio-sms`** — verify Twilio's `X-Twilio-Signature` HMAC
4. **`/api/webhooks/track-event`** — rate-limit per IP (Vercel Edge config or in-memory bucket)
5. **Stripe orphan** — `rm -rf src/app/api/webhooks/stripe/` (empty directory, currently does nothing)
6. **AI routes** — Phase 5 already covers admin-only auth; Phase 8 adds rate-limiting (10 jobs/min per user)
7. **Service role key** — already server-only in `lib/supabase/admin.ts`; audit confirms

---

## Phase 9 — HEYGEN ASYNC FIX

**Goal:** Decouple HeyGen video generation from the request lifecycle so we don't hit the 10s Vercel timeout.

**Time estimate:** 4-6 hours

**Risk:** 🟡 Medium. Existing SBA video flow is working — must not break it.

### Current flow (problem)

```
POST /api/admin/generate-sba-video
  → call HeyGen v2/video/generate (60+ seconds)
  → ❌ Vercel kills function at 10s, even if HeyGen succeeds
  → orphan video records
```

### Proposed async flow

```
POST /api/admin/generate-sba-video
  → call HeyGen (returns immediately with video_id)
  → INSERT site_settings row: { key: 'heygen_pending_<id>', value: { video_id, status: 'pending' } }
  → return 202 Accepted to client

Cron /api/cron/check-heygen-jobs (daily 8am UTC)
  → query site_settings WHERE key LIKE 'heygen_pending_%'
  → for each: GET HeyGen v1/video_status.get
  → if completed: update site_settings('sba_video_url', new URL), delete pending row
  → if failed: log error, delete pending row
```

### Files

- Edit `src/app/api/admin/generate-sba-video/route.ts`
- New: `src/app/api/cron/check-heygen-jobs/route.ts`
- Edit `vercel.json` — add cron at daily 8am UTC (Hobby allows 4 daily crons, we'd be at 4: score-and-branch 9am, send-sequences 10am, weekly-content Mon, check-heygen 8am)

**⚠️ Hobby plan caveat:** Vercel Hobby may cap total crons. Need to verify before adding 4th.

---

## Phase 10 — TESTING

**Goal:** Lint, typecheck, build all pass before deploy.

**Time estimate:** 2-3 hours

**Risk:** 🟢 Low (just verification)

### Commands

```bash
npm run lint                    # next lint
npx tsc --noEmit                # typecheck (no script in package.json)
npm run build                   # full prod build
```

### Manual checklist

1. Login flow still works (smoke test on local dev)
2. Existing /dashboard pages render without errors
3. Lead form submits → contacts row inserted (use the email test we've been blocked on)
4. FB/IG post buttons still work (no regressions)
5. New AI Center page renders
6. Create a test AI job → see it land in `ai_jobs` table
7. Trigger verification → see it land in `ai_verification_logs`
8. Approve job → verify status update

### Output

- `VORTEX_AI_COMMAND_CENTER_TEST_REPORT.md` — every file changed, every route created, every migration applied, every test result, remaining risks, deploy checklist

---

## Phase 11 — DEPLOYMENT PREP

**Goal:** Document deploy steps; do not actually deploy without your approval.

**Time estimate:** 1-2 hours

**Risk:** 🟢 Low (it's just a checklist)

### Checklist (we'd produce this)

1. ✅ All 11 new env vars in Vercel dashboard
2. ✅ All 11 migrations applied to Supabase prod (in order)
3. ✅ `npm run build` clean locally
4. ✅ Local smoke test passed
5. ✅ Deploy preview via `npx vercel` (NOT `--prod`) — test on preview URL
6. ✅ After preview check, `npx vercel --prod`
7. ✅ Post-deploy smoke test on vortextrips.com (login, AI Center, create test job)

### Rollback steps (if deploy breaks)

1. Vercel Dashboard → Deployments → find previous deploy ID → click ... → "Promote to Production"
2. Supabase migrations are forward-only; rollback DB requires manual DROP TABLE for new tables (won't affect existing data)

---

## Total scope summary

| Phase | Time | Risk | Files affected |
|---|---|---|---|
| 0 — Audit & plan | (this doc) | 🟢 | 1 (this file) |
| 1 — Migrations | 3-4h | 🟡 | 11 SQL files |
| 2 — Env vars | 30m | 🟢 | 1 (.env.example) |
| 3 — AI router | 4-6h | 🟢 | 2 new |
| 4 — Verifier | 3-5h | 🟡 | 1 new + package.json |
| 5 — API routes | 6-10h | 🟡 | 11 new |
| 6 — Dashboard page | 6-10h | 🟡 | 5 new + 1 edit (sidebar) |
| 7 — Workflows | 4-6h | 🟢 | 4 new |
| 8 — Security | 3-5h | 🟡 | 4 edits + 1 deletion |
| 9 — HeyGen async | 4-6h | 🟡 | 2 edits + 1 new |
| 10 — Testing | 2-3h | 🟢 | 1 new (test report) |
| 11 — Deploy prep | 1-2h | 🟢 | 1 new (checklist) |
| **TOTAL** | **38-58h** | | **~50 file changes** |

---

## My recommended sequencing (different from your 1→11 order)

If you want to ship value fastest while keeping risk low, I'd suggest:

### Path A — "Ship the AI part fastest" (~30 hours, 4-5 sessions)

1. Pre-flight (P-1, P-2, P-3) — 30 min
2. Phase 1 (migrations) — 3-4h *(unblocks everything)*
3. Phase 2 (env) — 30 min
4. Phase 3 (router) — 4-6h
5. Phase 4 (verifier) — 3-5h
6. Phase 5 (routes) — 6-10h (just the core 5: create, get, verify, approve, push)
7. Phase 6 (dashboard) — 6-10h (MVP scope: form + table + inspector, no fancy filters yet)
8. Phase 10 + 11 (test + deploy) — 3-5h

**Skip until proven needed:** Phase 7 (workflows can be added post-launch as wrappers), Phase 8 (security), Phase 9 (HeyGen async)

### Path B — "Do it right, all 11 phases" (~50 hours, 7-8 sessions)
Sequential 1→11 as you originally specified. Higher quality, longer runway.

### Path C — "Just security + migrations" (~10 hours)
Skip the entire AI Center for now. Just do P-1, P-2, Phase 1, Phase 8, Phase 9. Get the existing system production-grade.

---

## What I need from you to start Phase 1

1. **Pick a path** (A, B, or C) — or tell me to proceed with your original 1→11 order
2. **Pre-flight items** — confirm you'll do P-1 (rotate Anthropic key) and P-2 (check RESEND env flag) before I touch code, OR tell me to proceed and rotate after
3. **Supabase access** — do you have the Supabase CLI installed (`npx supabase`), or should I produce SQL for you to paste into Supabase Studio's SQL Editor?
4. **OpenRouter account** — do you have one with an API key? (https://openrouter.ai/keys) Or do I produce the code with `OPENROUTER_API_KEY=` placeholder for you to fill in?
5. **Budget confirmation** — `AI_MONTHLY_BUDGET_LIMIT=200`, `AI_DAILY_BUDGET_LIMIT=20` OK?
6. **`zod` for validation** — OK to add as a dep? (Tiny, well-trusted, makes Phase 5 cleaner)

---

## Hard stop

I am stopping here. **No code changes will happen until you reply with which path + answers to the 6 questions above.** This file is the only artifact created in Phase 0.
