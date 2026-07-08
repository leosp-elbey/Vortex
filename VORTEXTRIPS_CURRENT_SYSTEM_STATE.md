# VORTEXTRIPS CURRENT SYSTEM STATE

Last verified date:
2026-07-08 (populated from repo/code inspection this session. NOTE: several in-repo handoff docs reference late-May / early-June 2026 dates and events; treat any date-sensitive claim below as pending live re-verification against Vercel / Supabase / the platform dashboards.)

Current known architecture:
- Next.js: YES — App Router + TypeScript (src/app). Primary framework.
- Supabase: YES — Postgres DB + auth + storage. Migrations present through 043 (041/042/043 authored this session; live application not yet confirmed).
- Vercel: YES — deployment target, Pro plan. Crons defined in vercel.json (9 of 40 slots used).
- Resend: YES — transactional/nurture email (src/lib/resend.ts) + new bounce/complaint webhook (src/app/api/webhooks/resend).
- Social autoposter: YES — /api/cron/autoposter-once (FB / IG / TikTok). Currently DISABLED (kill switch off).
- Make.com: NOT FOUND in repo. Legacy/stale reference only (see archive).
- GoHighLevel: NOT FOUND as a build in repo. Only an inbound /api/webhooks/lead-created endpoint (GHL may POST leads to it). No GHL workflows live in this repo.
- Chatbot: NOT FOUND in repo. Planned in stale docs only.
- Voice AI: Bland.ai present — src/lib/bland.ts + /api/webhooks/bland.
- TikTok: OAuth login/callback + Direct Post integration present (src/lib/tiktok-oauth.ts). Sandbox/production toggle via TIKTOK_USE_SANDBOX. Token likely expired (see blockers).
- Facebook: Graph API v25.0 posting present. Token EXPIRED (see blockers).
- Booking flow: /book route — 307 redirect (per prior audit → traveler.html).
- Join flow: /join route — 307 redirect (→ signup.surge365.com/leosp).
- Free offer flow: /free route — 307 redirect (→ myvortex365.com/leosp).

Current production status:
- Website: LIVE (vortextrips.com / www.vortextrips.com canonical).
- Free page: LIVE (redirect).
- Booking page: LIVE (redirect).
- Join page: LIVE (redirect).
- Lead capture: homepage LeadForm + /api/webhooks/lead-created. Organic-lead-per-day tracking NOT yet built to the 20/day standard.
- Email nurture: RUNNING — send-sequences cron, batch 50, chunk 10, 2.5s inter-chunk delay added this session (Resend rate-limit safety). MLM language purged from SBA templates this session.
- SMS: Twilio A2P 10DLC VERIFIED (per memory); send path gated by consent + kill switch. Live enable state unconfirmed.
- Social posting: DISABLED — autoposter kill switch off; auto-disabled on Facebook token failure.
- Token status: FACEBOOK_PAGE_ACCESS_TOKEN EXPIRED (session expired 2026-05-26 per Graph). INSTAGRAM_ACCESS_TOKEN likely same expired value. TikTok token per handoff expired 2026-06-01.
- Cron status: 9/40 Vercel cron slots used. Autoposter cron effectively halted (kill switch).
- Database: Supabase; migrations through 043. 041 (contacts_status widen), 042 (sequence_queue +cancelled), 043 (ai_actions_log +suppression types) authored this session — LIVE APPLICATION NOT CONFIRMED.
- Deployment: Vercel Pro. Enable-Cron admin button fix committed this session (aecff72) — pending deploy verification.

Known stale items:
- Older CLAUDE.md / MASTER_PROJECT.md / EXECUTE.md priority stack references Make.com/GHL first. NEITHER exists in the live repo.
- Current system is repo-based (Next.js/Supabase/Vercel/Resend/autoposter).
- Social token documentation is outdated (FB "permanent/never-expires" claim in old docs is contradicted by the live expiry).
- Any dates before the current date must be verified against live dashboards.

Current top priority:
1. Refresh the Facebook Page token (and Instagram token — separate env var) → update in Vercel → redeploy. Unblocks the autoposter.
2. Deploy + verify the Enable-Cron admin button fix (commit aecff72), then re-enable the autoposter once tokens are valid.
3. Stand up the organic lead engine toward 20 qualified leads/day with source tagging + daily tracking.

Current blockers:
1. Facebook Page Access Token expired 2026-05-26 → autoposter auto-disabled. IG token likely same value.
2. TikTok access token expired ~2026-06-01 → re-authorize at /api/auth/tiktok/login before any TikTok post.
3. Uncommitted session code + unconfirmed application of migrations 041/042/043 to production.

Next logical build step:
1. Clear the token blockers so existing automation runs, then build the VORTEXTRIPS_LEAD_ENGINE.md daily 20-lead capture + tracking layer (source tags, qualified-lead fields, daily count) on top of the existing lead-created webhook and dashboard.
