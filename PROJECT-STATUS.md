# VortexTrips — Full System Status
**Last updated:** April 22, 2026  
**Branch:** main | **Deployed:** Vercel (Hobby)  
**Stack:** Next.js 14 App Router · TypeScript · Supabase · Resend · Twilio · Bland.ai · OpenAI

---

## ✅ LIVE & WORKING — Full Feature List

### Public Site
| Page | URL | Status |
|---|---|---|
| Landing page | `/` | ✅ Hero with background photo, lead form, destinations grid, quiz CTA, testimonials |
| Quote form | `/quote` | ✅ Full trip details form, AI-generated email within 2 min |
| Travel quiz | `/quiz` | ✅ 5-question quiz → personalized destination routing |
| Destination — Cancún | `/destinations/cancun` | ✅ Deals table, lead form, SMS consent |
| Destination — Paris | `/destinations/paris` | ✅ |
| Destination — Las Vegas | `/destinations/vegas` | ✅ |
| Destination — Caribbean | `/destinations/caribbean` | ✅ |
| Destination — Orlando | `/destinations/orlando` | ✅ |
| Reviews wall | `/reviews` | ✅ Public social proof + submit form (pending approval flow) |
| Join page | `/join` | ✅ Pricing $399/yr, savings calculator, money-back guarantee |
| Thank-you page | `/thank-you` | ✅ Variants: lead / quote / sba |
| Privacy policy | `/privacy` | ✅ A2P-compliant SMS clause |
| Terms of service | `/terms` | ✅ TCR-compliant SMS program terms |

### Lead Capture & CRM
| Feature | Status | Notes |
|---|---|---|
| Lead form submission | ✅ | Phone optional, SMS consent checkbox, UTM capture |
| Contact created in Supabase | ✅ | With lead_score: 20, source, UTM fields |
| Opportunity auto-created | ✅ | Stage: new-lead, pipeline: main |
| Bland.ai voice call | ✅ | Fires within 60s if phone provided; Maya persona |
| Day 0 SMS | ✅ | Fires immediately on lead creation |
| Duplicate email detection | ✅ | Returns 409, shows friendly error on form |
| SMS opt-out handling | ✅ | sms-optout tag skips SMS in sequences |

### Multi-Channel Drip Sequences (14-day)
| Step | Day | Channel | Template |
|---|---|---|---|
| 0 | Immediate | SMS | leadDay0 — Welcome |
| 1 | Day 1 | Email | leadDay1 — What you get |
| 2 | Day 2 | SMS | leadDay2 — Follow-up |
| 3 | Day 3 | Email | leadDay3 — Social proof |
| 4 | Day 5 | Email | leadDay5 — Savings table |
| 5 | Day 7 | SMS | leadDay7 — Urgency |
| 6 | Day 7+4h | Email | leadDay7 — Rate change warning |
| 7 | Day 10 | Email | leadDay10 — FAQ/objections |
| 8 | Day 12 | SMS | leadDay12 — Last chance |
| 9 | Day 14 | Email | leadDay14 — Breakup email |

Cron: `0 10 * * *` (daily 10am UTC via Vercel)

### Lead Scoring & Behavioral Branching
| Feature | Status |
|---|---|
| Base score on signup | ✅ +20 pts |
| Event scoring via /api/webhooks/track-event | ✅ 12 event types mapped |
| Intent tags: browsing / warm / hot | ✅ Auto-updated on score change |
| Hot lead detection (score >= 80) | ✅ Runs daily in send-sequences cron |
| Hot lead direct outreach | ✅ Cancels nurture, sends personal SMS + email |
| hot-lead-contacted tag prevents repeat | ✅ |

### SBA (Smart Business Affiliate) Onboarding
| Step | Trigger | Status |
|---|---|---|
| Day 0 SMS | Immediate on SBA signup | ✅ |
| Day 1 Email | Welcome + affiliate links | ✅ |
| Day 3 Email | First commission tips | ✅ |
| Day 7 SMS | Week 1 check-in | ✅ |
| Day 7+2h Email | Performance coaching | ✅ |
| Opportunity stage → member | Auto-set | ✅ |
| Lead score → 100 | Auto-set | ✅ |

### Post-Trip Review Automation
| Feature | Status |
|---|---|
| Trip logging via /api/trips | ✅ |
| Review SMS queued 2 days after return_date | ✅ |
| Review email queued 2 days after return_date | ✅ |
| Review submission form at /reviews | ✅ |
| Admin approval flow (PATCH /api/reviews) | ✅ |
| Reviews feed publicly visible when approved | ✅ |

### Content Calendar & Social Media
| Feature | Status | Notes |
|---|---|---|
| GPT-4o content generation | ✅ | 5 posts/week across 4 platforms |
| DALL-E 3 image generation | ✅ | Auto-generates for Instagram + Facebook posts |
| TikTok video scripts | ✅ | 30-45s script with [VISUAL] stage directions |
| Instagram auto-post | ✅ | Graph API v19.0 — uses DALL-E image |
| Facebook auto-post | ✅ | Graph API v19.0 — photo or text post |
| TikTok — link to creator upload | ✅ | Manual upload with generated script |
| Twitter — pre-filled tweet intent | ✅ | One-click post |
| Weekly cron content generation | ✅ | Mondays 1pm UTC |
| Content dashboard with image previews | ✅ | Approve/reject/post per-platform |

### Analytics & Attribution
| Feature | Status |
|---|---|
| Facebook Pixel | ✅ ID: 763101500966829 |
| Google Analytics 4 | ✅ G-V6Q2E47C49 |
| UTM param capture on lead create | ✅ Stored in custom_fields |
| Attribution dashboard | ✅ Source stats + UTM breakdown + intent scores |
| Contact events table | ✅ |

### Partner Lead Distribution
| Feature | Status |
|---|---|
| Partner directory (partners table) | ✅ |
| Destination + budget match scoring | ✅ |
| Partner email notification | ✅ |
| Partner SMS notification | ✅ |
| Routing log on contact | ✅ |

### Admin Dashboard
| Page | Status | Notes |
|---|---|---|
| Overview | ✅ | 8 stat cards, clickable nav, quick actions |
| Leads | ✅ | Search, filter, bulk update, slide panel |
| Members | ✅ | Active member list |
| Pipeline | ✅ | Kanban drag-and-drop, 6 stages |
| Calls | ✅ | Bland.ai call log |
| Content | ✅ | Image previews, video scripts, per-platform post buttons |
| Attribution | ✅ | Source breakdown, UTM table, intent leaderboard |
| Settings | ✅ | |

---

## Supabase Tables

| Table | Purpose |
|---|---|
| contacts | All leads and members |
| opportunities | Pipeline deals per contact |
| sequence_queue | Scheduled email/SMS steps |
| ai_actions_log | Log of all AI actions (calls, emails, SMS) |
| content_calendar | Social posts with image_url + video_script |
| admin_users | Dashboard access control |
| contact_events | Behavioral event log for scoring |
| trips | Trip records triggering review requests |
| reviews | Member reviews (pending → approved) |
| partners | Partner directory for lead routing |

### contacts key columns
id, first_name, last_name, email, phone, status, source, tags[], lead_score, custom_fields (jsonb), last_ai_action, created_at

### sequence_queue key columns
id, contact_id, sequence_name, step, channel (email|sms), template_key, scheduled_at, status (pending|sent|skipped|failed), sent_at

### content_calendar key columns
id, week_of, platform, caption, hashtags[], image_prompt, image_url, video_script, status (draft|approved|rejected|posted), posted_at

---

## Environment Variables

| Variable | Purpose | Status |
|---|---|---|
| NEXT_PUBLIC_APP_URL | Base URL for links in emails/SMS | Set |
| NEXT_PUBLIC_SUPABASE_URL | Supabase client | Set |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase client | Set |
| SUPABASE_SERVICE_ROLE_KEY | Supabase admin | Set |
| OPENAI_API_KEY | GPT-4o + DALL-E 3 | Set |
| RESEND_API_KEY | Transactional email | Set |
| BLAND_API_KEY | AI voice calls | Set |
| TWILIO_ACCOUNT_SID | SMS | Set |
| TWILIO_AUTH_TOKEN | SMS | Set |
| TWILIO_PHONE_NUMBER | SMS from number | Set |
| INSTAGRAM_BUSINESS_ACCOUNT_ID | 17841425195442497 | Set |
| INSTAGRAM_ACCESS_TOKEN | Long-lived IG token | Set |
| FACEBOOK_PAGE_ID | 1081317148396178 | Set |
| FACEBOOK_PAGE_ACCESS_TOKEN | Page posting token | NEEDS ADDING |
| NEXT_PUBLIC_FB_PIXEL_ID | 763101500966829 | Set |
| NEXT_PUBLIC_GA_MEASUREMENT_ID | G-V6Q2E47C49 | Set |
| CRON_SECRET | Protects cron endpoints | Set |

---

## Cron Jobs (Vercel — 2 max on Hobby plan)

| Job | Schedule | Purpose |
|---|---|---|
| /api/cron/send-sequences | 0 10 * * * (daily 10am UTC) | Send pending email/SMS + hot-lead branching |
| /api/cron/weekly-content | 0 13 * * 1 (Mon 1pm UTC) | Auto-generate 5 social posts |

---

## Redirect Links

| Label | URL |
|---|---|
| Free Access | vortextrips.com/free |
| Booking Portal | vortextrips.com/book |
| Join / Membership | vortextrips.com/join |
| Travel Quiz | vortextrips.com/quiz |
| Member Reviews | vortextrips.com/reviews |

---

## Bugs Fixed (April 22, 2026 Audit)

1. Phone optional — API now allows lead creation without phone; call only fires if phone provided
2. Reviews GET filter — const query → let query so destination filter applies
3. Reviews POST — contact_id no longer required; guests can submit reviews
4. Contacts API — membership_status → status column name fixed
5. SMS log label — voice-call → sms action_type for accurate dashboard metrics
6. Dashboard member count — was querying membership_status, now queries status = member
7. Quiz progress bar — was 0% on Q1, now correctly shows 20% to 100%
8. Thank-you page — removed incorrect AI framing; accurate AI consultant copy
9. Email templates — reviewRequestEmail was outside EMAIL_TEMPLATES object
10. Partners route — TypeScript spread type loss fixed with Partner interface

---

## PAUSED

- Stripe payment integration — membership purchase, auto-activation, SBA trigger on payment

---

## Suggested Next Steps

1. Add FACEBOOK_PAGE_ACCESS_TOKEN to Vercel env vars and redeploy
2. Seed approved reviews in Supabase so /reviews page shows content
3. Generate first week of content from dashboard → approve → auto-post to IG + FB
4. Add first partner to partners table to enable lead routing
5. Test full lead flow end-to-end with a real phone number
6. Enable Stripe when ready to accept membership payments
