# VortexTrips Session Handoff — 2026-05-31

## Last Known Good Commit
`6d769d8` (Phase 21K)

## Phases Completed This Session

| Phase | What Shipped | Commit |
|---|---|---|
| 21E | YouTube video upgraded 20s → 90s (CLIP_COUNT 4→18) | `c39b1b5` |
| 21F | 7 MLM language violations purged from SBA email templates | `2a76251` |
| 21G | contacts_status_check constraint widened (bounced/unsubscribed/rejected) | `a5a1592` |
| 21H | Resend bounce webhook — auto-suppress on bounce/complaint/suppressed | `6802099` |
| 21I | TEMP DIAG logs removed from check-kling-jobs | `119cb25` |
| 21J | Inter-chunk delay (2.5s) added to send-sequences — fixes Resend 429 errors | `fb03874` |
| 21K | Stale "4 clips" comments updated in assemble-youtube-video | `6d769d8` |

## Operational Wins This Session
- Twilio A2P — VERIFIED ✅ (5/7/2026). Remove from daily checklist.
- TikTok Content Posting API — Production Live since 5/28/2026. video.publish + video.upload approved ✅
- TikTok OAuth — Production credentials set, account public, OAuth complete. Token expires 6/1/2026 7:35 PM.
- Resend webhook — Live at /api/webhooks/resend, RESEND_WEBHOOK_SECRET set in Vercel ✅
- Bounce suppression — denisemchale3@icloud.com suppressed as bounced ✅
- DB migrations 041, 042, 043 applied to production ✅

## 🔴 CURRENT BLOCKER — Facebook Token Expired

### Error
```json
{
  "error": "Error validating access token: Session has expired on Tuesday, 26-May-26 21:00:00 PDT.",
  "platform": "facebook",
  "kill_switch": "disabled"
}
```

### Current State
- autoposter_cron_enabled = FALSE (auto-disabled)
- FACEBOOK_PAGE_ACCESS_TOKEN in Vercel = expired (EAAeYrR789Z..., 245 chars)
- Facebook App ID: 2138194153633175
- App is registered under a different Facebook developer account than the personal FB page account
- The Vortex Trips Facebook PAGE is accessible from personal account but the DEVELOPER APP login is unknown

### Fix Steps
1. Find which account owns app 2138194153633175 — check email for noreply@facebookmail.com, try different Chrome profiles
2. Log into developers.facebook.com with that account
3. Graph API Explorer → VortexTrips API → Vortex Trips page → Generate Access Token
4. Exchange for permanent token via curl (see below)
5. Update FACEBOOK_PAGE_ACCESS_TOKEN in Vercel → redeploy
6. Re-enable: UPDATE site_settings SET value='true' WHERE key='autoposter_cron_enabled';
7. Test: curl -X GET "https://vortextrips.com/api/cron/autoposter-once" -H "Authorization: Bearer $CRON_SECRET"

### Token Exchange Commands (run in Claude Code)
```bash
# Step 1 — exchange for long-lived token
curl "https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=2138194153633175&client_secret=YOUR_APP_SECRET&fb_exchange_token=SHORT_TOKEN"

# Step 2 — get permanent page token
curl "https://graph.facebook.com/me/accounts?access_token=LONG_LIVED_TOKEN_FROM_STEP1"
# Use the access_token value from the response
```

### ⚠️ DO NOT create a new Facebook app
App 2138194153633175 has approved permissions that took weeks. Creating a new app abandons them.

## TikTok — Staged and Ready
Row ID: 4faa0732-9655-40cd-a7c7-3ff6ca7d7c9e
Caption: "$1,200 vacations for under $400?"
status=approved, media_status=ready, posting_status=ready, posting_gate_approved=true
⚠️ TikTok token expires 6/1/2026 7:35 PM — re-authorize at /api/auth/tiktok/login if expired

## Remaining Priorities
1. 🔴 Fix Facebook token — autoposter disabled
2. 🟡 Verify first TikTok post after autoposter re-enabled
3. 🟡 TikTok bio trim to under 80 chars
4. ⏳ TikTok Direct Post API — in review at Facebook
5. 🟢 Remove orphan env vars: FACEBOOK_APP_SECRET, NEXT_PUBLIC_FB_APP_ID, NEXT_PUBLIC_FB_LOGIN_CONFIG_ID, OPENROUTER_API_KEY

## System Status
- Funnel: ✅ LIVE
- Email nurture: ✅ Running (50/day, MLM language cleaned)
- Social autoposter: 🔴 DISABLED — Facebook token expired
- Facebook/Instagram posting: 🔴 Blocked (same expired token)
- TikTok posting: 🟡 Ready — waiting for autoposter re-enable
- YouTube posting: ✅ Active — 90s videos (18 clips)
- Resend bounce webhook: ✅ Live
- Twilio SMS: ✅ A2P Verified
- Kling + Shotstack pipeline: ✅ Active

## DB Constraints (confirmed live)
- contacts_status_check: lead, qualified, quoted, member, churned, unsubscribed, bounced, rejected
- sequence_queue_status_check: pending, sent, failed, skipped, cancelled
- ai_actions_log_action_type_check: voice-call, quote-email, onboarding-email, content-generation, admin-notification, email_bounce_suppressed, email_complaint_suppressed

## Key Files
- Autoposter: src/app/api/cron/autoposter-once/route.ts
- Resend webhook: src/app/api/webhooks/resend/route.ts
- Email templates: src/lib/email-templates.ts
- YouTube generator: src/app/api/cron/generate-youtube-video/route.ts
- Assembler: src/app/api/cron/assemble-youtube-video/route.ts
- Kling checker: src/app/api/cron/check-kling-jobs/route.ts
