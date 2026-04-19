# VortexTrips — Backend Documentation

Travel savings membership platform built on Next.js + Supabase with AI-powered lead automation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.4 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| AI Calls | Bland.ai |
| AI Content | OpenAI GPT-4o |
| Email | Resend |
| Hosting | Vercel |
| DNS / CDN | Cloudflare |

---

## Dependencies

### Production

| Package | Version | Purpose |
|---|---|---|
| `next` | ^16.2.4 | App framework — routing, SSR, API routes |
| `react` | ^18 | UI library |
| `react-dom` | ^18 | React DOM renderer |
| `@supabase/supabase-js` | ^2.47.10 | Supabase client — database, auth, RLS |
| `@supabase/ssr` | ^0.5.2 | Supabase SSR helpers for Next.js (async cookie handling) |
| `openai` | ^4.77.0 | OpenAI SDK — GPT-4o completions for quote emails and content |
| `resend` | ^6.12.0 | Transactional email delivery |

### Development

| Package | Version | Purpose |
|---|---|---|
| `typescript` | ^5 | Type checking |
| `tailwindcss` | ^3.4.1 | Utility-first CSS |
| `postcss` | ^8 | CSS processing |
| `autoprefixer` | ^10.4.20 | CSS vendor prefixes |
| `eslint` | ^8 | Linting |
| `eslint-config-next` | ^16.2.4 | Next.js ESLint rules |
| `@types/node` | ^20 | Node.js types |
| `@types/react` | ^18 | React types |
| `@types/react-dom` | ^18 | React DOM types |

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Bland.ai — AI voice calls
BLAND_API_KEY=your-bland-api-key

# OpenAI — GPT-4o content generation
OPENAI_API_KEY=your-openai-api-key

# Resend — transactional email
RESEND_API_KEY=your-resend-api-key

# App
NEXT_PUBLIC_APP_URL=https://www.vortextrips.com
ADMIN_NOTIFICATION_EMAIL=your-admin-email
CRON_SECRET=your-cron-secret
```

All production env vars are set in **Vercel → Project → Settings → Environment Variables**.

---

## Database Schema (Supabase)

| Table | Purpose |
|---|---|
| `contacts` | All leads and members |
| `opportunities` | Pipeline stages per contact |
| `ai_actions_log` | Log of every AI action (calls, emails, content) |
| `content_calendar` | AI-generated social media content |
| `admin_users` | Dashboard access control (references `auth.users`) |

Migrations are in `supabase/migrations/` and must be run in order (001–005).

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/webhooks/lead-created` | POST | Saves contact, creates opportunity, triggers Bland.ai call |
| `/api/webhooks/bland` | POST | Bland.ai call completion callback |
| `/api/automations/quote-email` | POST | Generates AI quote via OpenAI and sends via Resend |
| `/api/cron/weekly-content` | GET | Generates weekly social content (requires `CRON_SECRET` header) |
| `/api/contacts` | GET / PATCH | Contact CRUD |
| `/api/pipeline` | GET / PATCH | Pipeline stage management |

---

## Local Development

```bash
# Install dependencies
npm install --legacy-peer-deps

# Run dev server
npm run dev

# Build for production
npm run build
```

---

## Deployment

- **Platform:** Vercel
- **Install command:** `npm install --legacy-peer-deps`
- **Live URL:** https://www.vortextrips.com
- **GitHub:** https://github.com/leosp-elbey/Vortex

Pushes to `main` auto-deploy via Vercel GitHub integration.
