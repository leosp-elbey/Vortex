# VortexTrips — Full System Status
**Last updated:** April 23, 2026  
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
| SBA landing page | `/sba` | ✅ Affiliate pitch, earnings table, FAQ, opt-in form |
| Join page | `/join` | ✅ Pricing $399/yr, savings calculator, money-back guarantee |
| Booking bridge | `/traveler.html` | ✅ Shows leosp code, steps, then sends to travmanity.com |
| Thank-you page | `/thank-you` | ✅ Variants: lead / quote / sba |
| Privacy policy | `/privacy` | ✅ A2P-compliant SMS clause |
| Terms of service | `/terms` | ✅ TCR-compliant SMS program terms |

### Short Links (next.config.js redirects)
| Shortlink | Destination | Purpose |
|---|---|---|
| `/go` | `/traveler.html` | Booking bridge — shows leosp code |
| `/book` | `/traveler.html` | Booking bridge — shows leosp code |
| `/free` | `https://myvortex365.com/leosp` | Free savings account signup |
| `/join` | `https://signup.surge365.com/signup` | SBA affiliate enrollment |

### Three Affiliate URLs (memorize these)
| Purpose | URL |
|---|---|
| Free savings account | `https://myvortex365.com/leosp` |
| Book a trip (needs code leosp) | `https://travmanity.com/Page/Home/wa=leosp?FpSubAffiliate` |
| SBA / earn opportunity | `https://signup.surge365.com/signup` |

### DNS & Hosting
| Domain | Config | Status |
|---|---|---|
| `vortextrips.com` | A record → 76.76.21.21 (Vercel) — DNS only in Cloudflare | ✅ Valid |
| `www.vortextrips.com` | CNAME → 0e96721237cabeff.vercel-d… — DNS only | ✅ Valid — Production |
| `vortextrips.com` redirects | 307 → www.vortextrips.com (Vercel setting) | ✅ Active |

---

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

### Multi-Channel Drip Sequences (14-day leads)
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

### MLM Bulk Import & 13-Step Nurture
| Feature | Status |
|---|---|
| CSV drag-and-drop importer | ✅ at `/dashboard/import` |
| Flexible column parser (first_name, firstname, etc.) | ✅ |
| Preview table with valid/invalid row highlighting | ✅ |
| Batch insert (groups of 50, dedup by email) | ✅ |
| 13-step MLM sequence auto-enrolled on import | ✅ |
| Steps 1-7: Days 0/2/4/6/9/12/15 | ✅ |
| Steps 8-13: Months 1/2/3/4/5/6 | ✅ |

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
| Import Leads | ✅ | CSV drag-and-drop at /dashboard/import |
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
| TWILIO_PHONE_NUMBER | +13213217815 | Set |
| INSTAGRAM_BUSINESS_ACCOUNT_ID | 17841425195442497 | Set |
| INSTAGRAM_ACCESS_TOKEN | Long-lived IG token | Set |
| FACEBOOK_PAGE_ID | 1081317148396178 | Set |
| FACEBOOK_PAGE_ACCESS_TOKEN | Page posting token | ⚠️ NEEDS ADDING TO VERCEL |
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

## Twilio SMS Status

| Item | Status |
|---|---|
| Account | Active |
| Phone number | +1 (321) 321-7815 |
| A2P 10DLC campaign | ⚠️ Pending TCR approval (submitted ~April 21, 2026) |
| Inbound webhook | Set — /api/webhooks/twilio-sms |
| STOP/HELP handling | ✅ Coded and live |
| SMS sending | Blocked until TCR approves A2P campaign |

---

## PAUSED

- Stripe payment integration — membership purchase, auto-activation, SBA trigger on payment

---

## Pending Tasks (pick up here)

1. **Add FACEBOOK_PAGE_ACCESS_TOKEN** to Vercel env vars → redeploy (Facebook auto-posting blocked without it)
2. **End-to-end email flow test** — submit lead form with real email, verify Day 1 email arrives in inbox
3. **Seed approved reviews** — add 3-5 real reviews to Supabase reviews table so /reviews page has content
4. **Add first partner** to partners table to enable lead routing
5. **Stripe integration** — membership purchase → auto-activate contact + trigger SBA sequence (PAUSED)

---

## Recent Changes (April 23, 2026)

- **DNS fixed** — Cloudflare A record updated to 76.76.21.21 (Vercel IP), root domain added to Vercel
- **Booking bridge live** — `/traveler.html` shows leosp code before sending to travmanity.com
- **Short links trimmed** — kept `/go`, `/book`, `/free`, `/join`; removed `/booking` and `/book-now`
- **Stale pages deleted** — `src/app/booking/`, `src/app/book-now/`, `src/app/go/` removed
- **Branding fixed** — "Travel Team Perks" removed from destination page footers
- **SBA page** — `/sba` built and live with earnings table, FAQ, opt-in form
- **MLM bulk import** — CSV uploader at `/dashboard/import` with 13-step nurture sequence
- **Twilio webhook** — `/api/webhooks/twilio-sms` handles STOP/HELP/START inbound SMS
