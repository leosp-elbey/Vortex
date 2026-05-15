# VortexTrips — Master Stack Inventory

> **Single source of truth for every service, env var, cron, route, table, and integration wired into this codebase.**
>
> Generated: 2026-05-15 · Source: live codebase sweep (no memory, no assumptions)
>
> **Symbol key:** ✅ active and used · ⚠️ wired with concern noted · 🟡 wired, manual/operator-only · ❌ broken · 🔍 not built · 💤 referenced in code but never invoked at runtime

---

## 0. Architecture at a Glance

```
Browser / Form submissions
        ↓
Next.js 16.2.4 App Router (Vercel Pro)
        ↓
        ├── Public pages (/, /quote, /quiz, /sba, /destinations/[slug], /reviews, /thank-you, /join, /privacy, /terms, /data-deletion, /login, /reset-password)
        ├── Admin pages (/dashboard/*)
        ├── API routes (/api/automations/*, /api/cron/*, /api/webhooks/*, /api/admin/*, /api/ai/*, /api/auth/*)
        ↓
Supabase Postgres 15+ (RLS on all sensitive tables; service-role bypasses for admin/cron paths)
        ↓
Third-party integrations (Resend, Twilio, Bland.ai, TikTok, Meta Graph API, HeyGen, OpenAI, Pexels)
```

- **Hosting:** Vercel Pro (60s function ceiling, multiple cron slots)
- **Domain:** `https://www.vortextrips.com`
- **Auth:** Supabase Auth (cookie-based session, RLS-gated)
- **Build:** TypeScript strict mode, `tsc --noEmit` exits 0 as of 2026-05-15

---

## 1. Third-Party Services Inventory

Every external service that is actually called from `src/`. Verified by greping every `fetch('https?://...` and every wrapper lib.

| # | Service | Purpose | Files | Auth method | Status |
|---|---|---|---|---|---|
| 1 | **Supabase** (Postgres + Auth) | DB, RLS-gated tables, OAuth session, admin user gate | `src/lib/supabase/{admin,server,client}.ts` + every API route | Service Role key (admin) / Anon key (browser+server) | ✅ |
| 2 | **Resend** | Transactional email (welcome, nurture, SBA sequence, admin health alerts) | `src/lib/resend.ts`, `src/lib/email-health.ts`, `src/lib/email-templates.ts` | API key (`RESEND_API_KEY`) | ✅ |
| 3 | **Twilio** (REST API direct, no SDK) | SMS sends, inbound STOP/HELP webhook | `src/lib/twilio.ts`, `src/app/api/webhooks/twilio-sms/route.ts` | Account SID + Auth Token + HMAC-SHA1 signature on inbound | ✅ (A2P 10DLC submission pending) |
| 4 | **Bland.ai** | Outbound AI voice calls within 5 min of lead opt-in | `src/lib/bland.ts`, `src/app/api/webhooks/bland/route.ts` | `BLAND_API_KEY` (out), `BLAND_WEBHOOK_SECRET` (in) | ✅ |
| 5 | **TikTok Content Posting API** | Auto + manual publish travel videos to `@vortextrips` | `src/lib/tiktok-oauth.ts`, `src/app/api/automations/post-to-tiktok/route.ts`, `src/app/api/auth/tiktok/{login,callback,status}/route.ts`, `src/app/api/cron/autoposter-once/route.ts` | OAuth 2.0 with refresh-token rotation (stored in `site_settings` table) | ⚠️ Production-live but **unaudited**; publishes as `SELF_ONLY` until Content Posting API audit clears |
| 6 | **Meta Graph API v25.0 (Facebook)** | Page photo + feed posts | `src/app/api/automations/post-to-facebook/route.ts` | Static Page Access Token (`FACEBOOK_PAGE_ACCESS_TOKEN`) | ⚠️ Static token, no refresh, no monitoring |
| 7 | **Meta Graph API v25.0 (Instagram)** | Business-account image posts (container → publish flow) | `src/app/api/automations/post-to-instagram/route.ts` | Static IG Access Token (`INSTAGRAM_ACCESS_TOKEN`) | ⚠️ Static token, no refresh, no monitoring |
| 8 | **OpenAI** | DALL-E image generation + GPT completions (lead scoring, content gen) | `src/lib/openai.ts`, `src/lib/media-providers.ts`, `src/app/api/dashboard/generate-content/route.ts` | API key (`OPENAI_API_KEY`) | ✅ |
| 9 | **Pexels** | Stock travel images + videos (PULL_FROM_URL proxied through verified domain for TikTok) | `src/lib/media-providers.ts`, `src/app/api/dashboard/generate-content/route.ts` | API key (`PEXELS_API_KEY`) | ✅ |
| 10 | **HeyGen** | AI avatar video generation for SBA campaign | `src/app/api/admin/generate-sba-video/route.ts`, `src/app/api/admin/sba-video-status/route.ts`, `src/app/api/cron/check-heygen-jobs/route.ts` | API key (`HEYGEN_API_KEY`) | 🟡 Admin-trigger only, polled by cron |
| 11 | **YouTube Data API** | Upload videos to YouTube (built but unscheduled) | `src/app/api/auth/youtube/{route,callback}/route.ts`, `src/app/api/admin/upload-to-youtube/route.ts` | OAuth 2.0 (Google) | 💤 Built, no cron fires it |
| 12 | **Google OAuth (oauth2.googleapis.com)** | YouTube auth handshake | `src/app/api/auth/youtube/callback/route.ts`, `src/app/api/admin/upload-to-youtube/route.ts` | Client ID + Secret | 💤 Same — only used during YouTube flows |
| 13 | **OpenRouter** | (Was intended for multi-model routing) | — | env var present, never read in `src/` | 🔍 Not wired |
| 14 | **Anthropic** | (Was intended for Claude API) | — | env var present, never read in `src/` (Anthropic SDK is imported in `src/lib/ai-models.ts` for metadata only) | 🔍 Not wired |
| 15 | **Make.com** | — | — | — | 🔍 Not wired — no outbound calls to `*.make.com` anywhere in `src/`. If Make.com is part of the architecture, it must be a webhook *consumer* of our endpoints, not a service we call |
| 16 | **GoHighLevel (GHL)** | — | — | — | 🔍 Not wired in code. Mentioned in CLAUDE.md as a destination for lead flows; presumably consumes our `/api/webhooks/lead-created` |

**Verified outbound hosts (every external fetch in `src/`):**
- `api.bland.ai/v1/calls`
- `api.openai.com/v1/{chat/completions,images/generations}`
- `api.heygen.com/v1/video_status.get` + `video.generate`
- `api.resend.com/{emails,emails/...}`
- `api.pexels.com/{v1/search,videos/search}`
- `api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json` (called from `src/lib/twilio.ts`)
- `open.tiktokapis.com/v2/{oauth/token,post/publish/video/init,post/publish/creator_info/query,post/publish/status/fetch}`
- `graph.facebook.com/v25.0/{page_id|ig_account_id|container_id}/*`
- `oauth2.googleapis.com/token` (YouTube)
- `www.googleapis.com/upload/youtube/v3/videos`

---

## 2. Environment Variables Inventory

35 keys in `.env.local`. Sorted alphabetically. Status reflects whether `process.env.X` is referenced anywhere in `src/`.

| Variable | Service | Used in (representative file) | Status |
|---|---|---|---|
| `ADMIN_NOTIFICATION_EMAIL` | Resend (alerts) | `src/app/api/cron/send-sequences/route.ts:12` | ✅ active |
| `ANTHROPIC_API_KEY` | Anthropic (intended) | `src/lib/ai-models.ts:14` (metadata only) | 💤 stored, never used in a fetch |
| `BLAND_API_KEY` | Bland.ai | `src/lib/bland.ts:49` | ✅ active |
| `BLAND_WEBHOOK_SECRET` | Bland.ai webhook validation | `src/lib/webhook-auth.ts:13` | ✅ active |
| `CRON_SECRET` | Vercel cron bearer auth | `src/app/api/cron/*/route.ts` (4 files) | ✅ active |
| `FACEBOOK_APP_SECRET` | (intended for FB Login flow) | — | 🔍 orphan |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Meta Graph (FB) | `src/app/api/automations/post-to-facebook/route.ts:7` | ⚠️ static token, no refresh |
| `FACEBOOK_PAGE_ID` | Meta Graph (FB) | `src/app/api/automations/post-to-facebook/route.ts:6` | ✅ active |
| `HEYGEN_API_KEY` | HeyGen | `src/app/api/admin/generate-sba-video/route.ts:28` | ✅ active |
| `HEYGEN_AVATAR_ID` | HeyGen | `src/app/api/admin/generate-sba-video/route.ts:35` | ✅ active |
| `HEYGEN_VOICE_ID` | HeyGen | `src/app/api/admin/generate-sba-video/route.ts:41` | ✅ active |
| `INSTAGRAM_ACCESS_TOKEN` | Meta Graph (IG) | `src/app/api/automations/post-to-instagram/route.ts:7` | ⚠️ static token, no refresh |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Meta Graph (IG) | `src/app/api/automations/post-to-instagram/route.ts:6` | ✅ active |
| `NEXT_PUBLIC_APP_URL` | All routes (URLs for webhooks/CTAs) | `src/lib/{twilio,bland}.ts`, `src/lib/tiktok-oauth.ts` | ✅ active |
| `NEXT_PUBLIC_FB_APP_ID` | (intended for FB Login JS SDK) | — | 🔍 orphan |
| `NEXT_PUBLIC_FB_LOGIN_CONFIG_ID` | (intended for FB Login JS SDK) | — | 🔍 orphan |
| `NEXT_PUBLIC_FB_PIXEL_ID` | Facebook Pixel tracking | `src/app/layout.tsx:45` | ✅ active |
| `NEXT_PUBLIC_FORM_TOKEN` | Anti-bot token on public forms | `src/app/page.tsx`, `src/app/quiz/page.tsx`, `src/components/ExitIntent.tsx`, `src/lib/webhook-auth.ts` | ✅ active |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics | `src/app/layout.tsx:46` | ✅ active |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser/SSR | `src/lib/supabase/{client,server}.ts` | ✅ active |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase browser/SSR | `src/lib/supabase/{client,server}.ts` | ✅ active |
| `OPENAI_API_KEY` | OpenAI | `src/lib/openai.ts:22,48`, `src/lib/media-providers.ts:227` | ✅ active |
| `OPENROUTER_API_KEY` | OpenRouter (intended) | — | 🔍 orphan |
| `PEXELS_API_KEY` | Pexels | `src/lib/media-providers.ts` | ✅ active |
| `RESEND_API_KEY` | Resend | `src/lib/resend.ts:24`, `src/lib/email-health.ts:92` | ✅ active |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin client | `src/lib/supabase/admin.ts:6` | ✅ active |
| `TIKTOK_CLIENT_KEY` | TikTok OAuth | `src/lib/tiktok-oauth.ts` (via `getTikTokClientKey()`), `src/app/api/auth/tiktok/login/route.ts` | ✅ active |
| `TIKTOK_CLIENT_KEY_SANDBOX` | TikTok OAuth (sandbox toggle) | `src/lib/tiktok-oauth.ts` (when `TIKTOK_USE_SANDBOX=true`) | 💤 sandbox-only, not active in production |
| `TIKTOK_CLIENT_SECRET` | TikTok OAuth | same as above | ✅ active |
| `TIKTOK_CLIENT_SECRET_SANDBOX` | TikTok OAuth (sandbox toggle) | same as above | 💤 sandbox-only |
| `TIKTOK_REDIRECT_URI` | TikTok OAuth callback | `src/app/api/auth/tiktok/{login,callback}/route.ts` | ✅ active |
| `TWILIO_ACCOUNT_SID` | Twilio | `src/lib/twilio.ts:1` | ✅ active |
| `TWILIO_AUTH_TOKEN` | Twilio (+ signature validation) | `src/lib/twilio.ts:2`, `src/lib/webhook-auth.ts:29` | ✅ active |
| `TWILIO_PHONE_NUMBER` | Twilio sender | `src/lib/twilio.ts:3` | ✅ active (value: `+13213217815`) |
| `YOUTUBE_CLIENT_ID` | Google OAuth (YouTube) | `src/app/api/auth/youtube/route.ts:15` | 💤 wired, no cron uses it |
| `YOUTUBE_CLIENT_SECRET` | Google OAuth (YouTube) | `src/app/api/auth/youtube/callback/route.ts:18` | 💤 wired, no cron uses it |

**Also referenced in code but injected by Vercel (NOT in `.env.local`):** `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL`, `TIKTOK_USE_SANDBOX` (toggle, optional).

**Orphans (in `.env.local` but never read in `src/`):**
- `FACEBOOK_APP_SECRET`
- `NEXT_PUBLIC_FB_APP_ID`
- `NEXT_PUBLIC_FB_LOGIN_CONFIG_ID`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY` (only referenced as metadata, no fetch)
- `TIKTOK_CLIENT_KEY_SANDBOX`, `TIKTOK_CLIENT_SECRET_SANDBOX` (toggle is off in production)

---

## 3. Cron Jobs

All crons defined in [vercel.json](vercel.json). Vercel Pro plan supports multiple per project (not Hobby's 1/day).

| Path | Schedule (cron expr) | Schedule (UTC) | What it does | Auth |
|---|---|---|---|---|
| `/api/cron/weekly-content` | `0 13 * * 1` | Mondays 13:00 | Generates the week's content calendar (AI + Pexels) | Bearer `CRON_SECRET` |
| `/api/cron/send-sequences` | `0 10 * * *` | Daily 10:00 | Drains pending `sequence_queue` rows (email + SMS), 50/tick in parallel chunks of 10. Includes inline email-health alert. | Bearer `CRON_SECRET` |
| `/api/cron/score-and-branch` | `0 9 * * *` | Daily 09:00 | Re-scores contacts, branches inactive ones to suppressed status | Bearer `CRON_SECRET` |
| `/api/cron/autoposter-once` | `0 14,18,22 * * *` | Daily 14:00 + 18:00 + 22:00 | Picks oldest eligible `content_calendar` row by `queued_for_posting_at`, dispatches to FB/IG/TikTok, atomic UPDATE on success | Bearer `CRON_SECRET` + kill-switch (`site_settings.autoposter_cron_enabled`) |

**Cron-adjacent routes** (callable manually but not on a schedule):
- `/api/cron/autoposter-dry-run` — dry-run sibling of `autoposter-once`
- `/api/cron/check-heygen-jobs` — polls HeyGen for pending video renders

**Operator-run scripts** (NOT scheduled):
- `scripts/check-email-stats.js` — pulls Resend last-36h delivery stats. Header comment says "daily at 10am UTC" but **no cron fires it** — only manual `node scripts/check-email-stats.js`.
- `scripts/audit-site-health.js` — sweeps public routes for HTTP status.
- `scripts/run-autoposter-once.js` — JS mirror of the autoposter cron, callable from CLI.
- `scripts/diagnose-tiktok-uploads.js` — TikTok status-fetch diagnostic.

---

## 4. Public-Facing Routes

### 4.1 Public pages (no auth required)

| Path | Purpose |
|---|---|
| `/` | Homepage / opt-in landing page |
| `/quote` | Travel quote request form |
| `/quiz` | Lead-qualification quiz |
| `/sba` | Smart Business Affiliate (SBA) landing page |
| `/destinations/[slug]` | Dynamic destination detail pages |
| `/reviews` | Customer reviews (public-read RLS) |
| `/thank-you` | Post-submit confirmation |
| `/join` | Membership signup |
| `/privacy` | Privacy Policy (Twilio TCR / TikTok-compliant) |
| `/terms` | Terms & Conditions (Twilio SMS Program section + TikTok integration disclosure) |
| `/data-deletion` | Required for Meta/TikTok app compliance |
| `/login` | Operator login (Supabase Auth) |
| `/reset-password` | Password reset |

### 4.2 Admin pages (Supabase Auth required, gated by `admin_users` table)

| Path | Purpose |
|---|---|
| `/dashboard` | Admin overview / metrics |
| `/dashboard/leads` | Leads list |
| `/dashboard/members` | Paid members list |
| `/dashboard/pipeline` | Opportunities pipeline view |
| `/dashboard/calls` | Bland.ai call log |
| `/dashboard/campaigns` | Event campaign manager |
| `/dashboard/content` | Content calendar (drafts/approved/posted) |
| `/dashboard/videos` | Video asset manager (HeyGen + uploads) |
| `/dashboard/import` | Bulk contact import |
| `/dashboard/attribution` | UTM / source attribution view |
| `/dashboard/ai-command-center` | AI tooling hub (generate scripts, sequences, blog, etc.) |
| `/dashboard/settings` | TikTok connect, kill-switches, integrations config |

### 4.3 Public-facing API endpoints (callable from external systems)

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/webhooks/lead-created` | POST | New lead capture (form / GHL / external webhook) | `x-vortex-form-token` header (fail-open if unset) + 10/min/IP rate limit |
| `/api/webhooks/twilio-sms` | POST | Inbound SMS replies (STOP/HELP) | Twilio HMAC-SHA1 signature (strict) |
| `/api/webhooks/bland` | POST | Bland.ai call status callbacks | Bearer `BLAND_WEBHOOK_SECRET` (fail-open if unset) |
| `/api/webhooks/track-event` | POST | Browser analytics events | No auth — 60/min/IP rate limit only |
| `/api/auth/tiktok/login` | GET | Start TikTok OAuth flow | Admin user only |
| `/api/auth/tiktok/callback` | GET | TikTok OAuth callback (state-CSRF cookie validated) | TikTok-signed redirect |
| `/api/auth/tiktok/status` | GET | Reports TikTok connection state | Admin |
| `/api/auth/youtube` | GET | Start YouTube OAuth | Admin |
| `/api/auth/youtube/callback` | GET | YouTube OAuth callback | Google-signed redirect |
| `/api/contacts` | GET | List contacts (RLS-gated) | Supabase Auth |
| `/api/contacts/import` | POST | Bulk contact import | Supabase Auth + admin |
| `/api/pipeline` | GET | Pipeline data | Supabase Auth |
| `/api/trips` | GET | Trips list | Public-read |
| `/api/partners` | GET | Partner list | Public-read |
| `/api/reviews` | GET | Approved reviews | Public-read (status=approved only via RLS) |
| `/api/content` | GET/PATCH | Content calendar CRUD | Admin |
| `/api/sba-video` | GET | Public SBA promo video URL | Public-read |
| `/api/automations/post-to-tiktok` | POST | Manual TikTok post | Admin + 10/hr/user rate limit |
| `/api/automations/post-to-facebook` | POST | Manual FB post | Admin |
| `/api/automations/post-to-instagram` | POST | Manual IG post | Admin |
| `/api/automations/quote-email` | POST | Send manual quote email | Admin |
| `/api/automations/trigger-sba` | POST | Manually trigger SBA sequence | Admin |
| `/api/admin/*` | various | Admin tooling (campaigns, video gen, posting gate, system controls, env-check) | Admin only |
| `/api/ai/*` | various | AI generation (jobs, sequences, blog, video script, social pack, social calendar, content, push-to-calendar) | Admin only |
| `/api/dashboard/generate-content` | POST | Generate dashboard content (AI + Pexels) | Admin |

**Total API route count:** 55 files under `src/app/api/**/route.ts`.

---

## 5. Database Tables (Supabase Postgres)

Derived from 34 migration files in `supabase/migrations/`. Row counts cannot be read from this session — query Supabase to populate the `Rows` column.

| # | Table | Purpose | RLS | Migration |
|---|---|---|---|---|
| 1 | `contacts` | All leads + members | ✅ admin-only | `001_create_contacts.sql` + `012_alter_contacts_lead_score.sql` |
| 2 | `opportunities` | Pipeline rows per contact (`main` / `sba` pipelines) | ✅ admin-only | `002_create_opportunities.sql` |
| 3 | `ai_actions_log` | Audit trail of every AI/automated action per contact | ✅ admin-only | `003_create_ai_actions_log.sql` (RLS enabled in `005`) |
| 4 | `content_calendar` | Scheduled social posts with `status` (draft/approved/posted/rejected), `posting_status` (idle/ready/blocked), `posting_gate_approved` flag, `media_metadata` JSONB | ✅ admin-only | `004` + `022,024,029,032,033` (additive columns) |
| 5 | `admin_users` | Whitelist of operator UUIDs allowed to access admin routes | ✅ admin-only | `005_create_admin_users.sql` |
| 6 | `sequence_queue` | Pending email + SMS sends with `sequence_name`, `step`, `channel`, `template_key`, `scheduled_at`, `status` | ✅ admin-only | `006_create_sequence_queue.sql` |
| 7 | `site_settings` | Key-value store for TikTok tokens, autoposter kill-switch, etc. (`key` PK) | ✅ admin-only | `007_create_site_settings.sql` |
| 8 | `contact_events` | Event log (visits, clicks, conversions) with UTM fields | ✅ admin-only | `008` + `027` (UTM cols) |
| 9 | `partners` | Affiliate / Surge365 partners reference data | ✅ admin-only | `009_create_partners.sql` |
| 10 | `trips` | Trips reference data | ✅ admin-only | `010_create_trips.sql` |
| 11 | `reviews` | Customer testimonials (`status='approved'` publicly readable) | ✅ admin-write + public-read on approved | `011_create_reviews.sql` |
| 12 | `ai_jobs` | Background AI job queue (script gen, etc.) | ✅ admin-only | `013_create_ai_jobs.sql` |
| 13 | `ai_model_usage` | Per-model token/cost tracking | ✅ admin-only | `014_create_ai_model_usage.sql` |
| 14 | `ai_verification_logs` | AI output verification audit | ✅ admin-only | `015_create_ai_verification_logs.sql` |
| 15 | `ai_command_templates` | Reusable AI prompt templates | ✅ admin-only | `016_create_ai_command_templates.sql` |
| 16 | `event_campaigns` | Marketing campaigns (slug-keyed) | ✅ admin-only | `017` + `025` (slug col) |
| 17 | `campaign_assets` | Generated images/videos linked to campaigns | ✅ admin-only | `018_create_campaign_assets.sql` |
| 18 | `campaign_scores` | Per-campaign performance metrics | ✅ admin-only | `019_create_campaign_scores.sql` |
| 19 | `event_sources` | Traffic source dictionary | ✅ admin-only | `020_create_event_sources.sql` |
| 20 | `campaign_schedule` | Campaign send schedule | ✅ admin-only | `021_create_campaign_schedule.sql` |
| 21 | `posting_gate_audit` | Append-only audit of every `posting_gate_approved` flip | ✅ admin-only | `030_create_posting_gate_audit.sql` |

**Views:**
- `event_campaign_attribution_view` — joins `event_campaigns` + `contact_events` for UTM attribution dashboards (created in `023`, updated in `026,028`).

**Data fix migrations (no schema change):**
- `031_rewrite_legacy_tracking_urls.sql` — historical URL rewrite
- `034_security_advisor_compliance.sql` — Supabase Security Advisor compliance pass

**Total:** 21 tables + 1 view + 34 migrations.

---

## 6. Facebook + Instagram Token Architecture — Definitive Answer

This is the area with the most ambiguity, so it gets its own deep dive.

### 6.1 Where the tokens live

| Variable | Storage location | Read from |
|---|---|---|
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Vercel env var + local `.env.local` | [post-to-facebook/route.ts:7](src/app/api/automations/post-to-facebook/route.ts#L7) only |
| `FACEBOOK_PAGE_ID` | Vercel env var + local `.env.local` | [post-to-facebook/route.ts:6](src/app/api/automations/post-to-facebook/route.ts#L6) only |
| `INSTAGRAM_ACCESS_TOKEN` | Vercel env var + local `.env.local` | [post-to-instagram/route.ts:7](src/app/api/automations/post-to-instagram/route.ts#L7) only |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Vercel env var + local `.env.local` | [post-to-instagram/route.ts:6](src/app/api/automations/post-to-instagram/route.ts#L6) only |

**Both tokens are stored ONLY as env vars. Neither is persisted to Supabase. Neither is refreshed automatically.**

Compare to TikTok, which stores `tiktok_{access,refresh}_token` and `tiktok_token_expires_at` rows in the `site_settings` table and refreshes via [getValidTikTokAccessToken()](src/lib/tiktok-oauth.ts#L347) automatically.

### 6.2 What KIND of token are they?

The code does not declare token type — it just uses whatever string is in the env var. To answer "are they 60-day or permanent" definitively, you need to look at how each token was minted:

- **Facebook Page Access Token** — Meta supports two types:
  1. **Short-lived page token** — expires in ~1 hour, never the right choice for server use.
  2. **Long-lived page token** — typically 60 days. Generated by exchanging a long-lived user token for a page token via Graph API.
  3. **"Never-expiring" page token** — Meta no longer issues these by default. The only way to get one is to derive it from a long-lived user token where the user is a Page admin, **AND** the resulting page token inherits no expiration *if* it was minted this exact way. Many older accounts still have these from before Meta tightened the rules.

  **Without checking the token's current expiry via the debug_token endpoint, the codebase cannot tell you which type yours is.** Run this to find out:
  ```bash
  curl -s "https://graph.facebook.com/debug_token?input_token=$FACEBOOK_PAGE_ACCESS_TOKEN&access_token=$FACEBOOK_PAGE_ACCESS_TOKEN" | jq '.data.expires_at, .data.data_access_expires_at'
  ```
  - `expires_at: 0` → never expires (Page Access Token derived from long-lived user token with `manage_pages` permission)
  - `expires_at: <unix timestamp>` → expires on that date; standard 60-day token

- **Instagram Business Access Token** — Same situation. IG Graph API tokens linked to a FB Business account inherit the underlying FB user token's expiry. The Meta-recommended pattern is to mint via the long-lived user token flow, which produces a 60-day token that can be refreshed.

  Same debug call works:
  ```bash
  curl -s "https://graph.facebook.com/debug_token?input_token=$INSTAGRAM_ACCESS_TOKEN&access_token=$FACEBOOK_PAGE_ACCESS_TOKEN" | jq '.data.expires_at'
  ```

### 6.3 How they're used in code

**Facebook** ([post-to-facebook/route.ts](src/app/api/automations/post-to-facebook/route.ts)):
1. Admin clicks "Post to FB" on dashboard.
2. Route reads `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_ACCESS_TOKEN` from env.
3. If post has `image_url`, POSTs to `graph.facebook.com/v25.0/{PAGE_ID}/photos` with `{url, caption, access_token}`.
4. On photo failure, falls back to text-only `/feed` POST.
5. No retry, no token refresh, no expiry check. If token is expired, Meta returns 401 → route surfaces "Facebook API error" → toast shows error.

**Instagram** ([post-to-instagram/route.ts](src/app/api/automations/post-to-instagram/route.ts)):
1. Admin clicks "Post to IG" on dashboard.
2. Route requires `image_url` (Instagram does not support text-only).
3. Three-step container flow:
   - `POST /{IG_ACCOUNT_ID}/media` with `{access_token, caption, image_url, media_type:'IMAGE'}` → returns `container_id`.
   - Poll `GET /{container_id}?fields=status_code,status` up to 6× at 1s intervals (max 6s) waiting for `status_code='FINISHED'`.
   - `POST /{IG_ACCOUNT_ID}/media_publish` with `{creation_id, access_token}` → returns post ID.
4. Tight against Vercel function budget — 6s polling + 2× API calls + DB update must fit under 60s ceiling. In practice fine for image posts.

### 6.4 What's NOT in the code

- ❌ No FB/IG token refresh helper analogous to `getValidTikTokAccessToken`.
- ❌ No periodic Graph `/me` healthcheck cron to detect token expiry before it breaks posts.
- ❌ No platform post ID persisted back to `content_calendar.media_metadata` (TikTok stores `tiktok_publish_id`; FB/IG just flip `status='posted'`). Cross-platform reconciliation harder.
- ❌ No rate limit on FB/IG manual post routes (TikTok has 10/hr/user).

### 6.5 Practical implication

If Leo's FB token is the "never-expiring" type, the static-env-var pattern is fine. If it's a 60-day token, posts will silently start failing in ~60 days of issue date with no warning. Same for IG.

**Recommended verification:** Run the `debug_token` curl above and record the `expires_at` value somewhere durable. Set a calendar reminder for 50 days from issue date to rotate.

---

## 7. What's NOT Wired (for clarity)

These are commonly assumed parts of the stack that are **not actually wired in `src/`** as of 2026-05-15:

| Service | Status | Notes |
|---|---|---|
| Make.com | 🔍 Not wired | No outbound calls anywhere. If Make.com is used, it's calling our webhooks, not us calling Make. |
| GoHighLevel API | 🔍 Not wired | Only mentioned in `CLAUDE.md`. Our `/api/webhooks/lead-created` is *consumable* by GHL, but we don't call GHL. |
| Anthropic Claude API | 🔍 Not wired | `ANTHROPIC_API_KEY` is in `.env.local` but only used for SDK metadata in `src/lib/ai-models.ts:14`. No actual Anthropic completion calls in `src/`. |
| OpenRouter | 🔍 Not wired | `OPENROUTER_API_KEY` is in `.env.local` but never read. |
| ManyChat | 🔍 Not built | Mentioned in `CLAUDE.md`. No code. |
| Twitter/X auto-post | 🔍 Refused | Explicitly disabled in [autoposter-once/route.ts:77](src/app/api/cron/autoposter-once/route.ts#L77) (Phase 14Q). |
| YouTube cron upload | 💤 Built but unscheduled | OAuth + upload route exist but no `vercel.json` cron fires them. Manual-only via dashboard. |
| Daily email-health report to `leoelbey@gmail.com` | 🔍 Not built | `runHealthCheck()` inside `send-sequences` cron only fires on YELLOW/RED verdict to `ADMIN_NOTIFICATION_EMAIL` (env var). No unconditional daily report exists. |
| Distributed rate limiter | 🔍 Not built | `src/lib/rate-limit.ts` is in-memory only — resets on Vercel cold-start. |
| Bland.ai env-var presence check | 🔍 Not built | `BLAND_API_KEY` is asserted non-null at call time, fails late if missing. |

---

## 8. Notable Architecture Patterns

- **Posting gate** ([src/lib/posting-gate.ts](src/lib/posting-gate.ts) + migrations 029,030): every social post must pass `status='approved' AND posting_status='ready' AND posting_gate_approved=true` before any platform API is called. Cron and manual buttons share the same gate function.
- **Bounded waits** ([src/lib/bounded-wait.ts](src/lib/bounded-wait.ts)): webhook endpoints wrap critical Supabase calls in a 2.5s timeout so a hung DB connection returns 503 fast (lets upstream queues retry) rather than holding the function open.
- **Sequence suppression** ([src/lib/sequence-suppression.ts](src/lib/sequence-suppression.ts)): single source of truth for "do not contact" statuses (`churned`, `unsubscribed`, `bounced`, `rejected`). Imported by send-sequences cron, lead-created webhook, and contacts/import route — all three honor the same list.
- **Atomic UPDATE guards**: poster routes use `.eq('status', 'approved').is('posted_at', null)` on every status-flip to prevent double-posting under concurrency.
- **Kill switches**: `site_settings.autoposter_cron_enabled` flips to `'false'` automatically on platform failure or post-flight invariant slip — cron stops, manual unlock required.
- **TikTok URL ownership proxy**: Pexels CDN URLs go through `/v/p/*` Edge rewrite to `videos.pexels.com/video-files/*` so the URL host (`www.vortextrips.com`) matches the verified domain in TikTok's Developer Portal.

---

## 9. Version + Build Snapshot (2026-05-15)

- Next.js: `16.2.4`
- TypeScript: `5.x`, strict mode enabled, `tsc --noEmit` exits 0
- Supabase JS: `@supabase/supabase-js@2.47.10`
- Resend: `resend@6.12.0`
- OpenAI SDK: `openai@4.77.0`
- Anthropic SDK: `@anthropic-ai/sdk@0.91.1` (metadata only)
- No Twilio SDK — direct REST calls
- No Facebook SDK — direct Graph API calls
- No TikTok SDK — direct REST calls
- No Bland.ai SDK — direct REST calls
- No HeyGen SDK — direct REST calls

---

## 10. Source of Truth Updates

This file should be regenerated whenever:
- A new third-party service is added (new entry in §1)
- A new env var is added (new entry in §2)
- A new cron is added or removed (update §3)
- A new public route or admin endpoint is added (update §4)
- A new migration is run (update §5)
- FB/IG/TikTok token plumbing changes (update §6)

It is NOT a substitute for reading the code — it's an index.
