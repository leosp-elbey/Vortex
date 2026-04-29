# VortexTrips Build Progress

**Last updated:** 2026-04-28
**Last commit:** `f2b41e6`

Legend: `[x]` shipped · `[~]` in progress · `[ ]` pending · `[!]` blocked

---

## Phases

- [x] **Phase 0 — Audit & plan** (`VORTEX_AI_COMMAND_CENTER_PLAN.md`)
- [x] **Phase 1 — Database migrations** (`supabase/migrations/006`–`016`)
- [x] **Phase 2 — Env vars** (`.env.example` updated; Vercel vars set)
- [x] **Phase 3 — AI Router** (`src/lib/ai-router.ts`, `src/lib/ai-models.ts`)
- [x] **Phase 4 — Claude verifier** (`src/lib/ai-verifier.ts`)
- [x] **Phase 5 — API routes** (12 routes under `src/app/api/ai/`)
- [x] **Phase 6 — Dashboard page** (`/dashboard/ai-command-center` + 5 components, sidebar link)
- [x] **Phase 7 — Workflows** (social-pack, video-script, email-sequence, blog, social-calendar)
- [x] **Phase 8 — Security hardening** (`src/lib/webhook-auth.ts`, `src/lib/rate-limit.ts`)
- [x] **Phase 9 — HeyGen async** (`src/app/api/cron/check-heygen-jobs/route.ts`)
- [x] **Phase 10 — Local testing** (lint, typecheck, build pass before commit `ad42f44`)
- [x] **Phase 10.5 — Save protocol + image safety guard** (commit `f2b41e6`)
- [~] **Phase 11 — Deploy prep & production deploy** (in progress)

---

## Current focus

**Phase 11 — Deploy prep + production deploy.**

Sub-tasks:
- [ ] Local build verification: `npm run lint && npx tsc --noEmit && npm run build`
- [ ] Verify 11 new env vars present in Vercel dashboard (Leo)
- [ ] Deploy preview: `npx vercel` and smoke test on preview URL
- [ ] Promote to prod: `npx vercel --prod` and smoke test on vortextrips.com
- [ ] Run save protocol (update MD files, commit, push)

---

## Blocked / pending items

- [ ] Verify all 11 new env vars are present in Vercel dashboard
- [ ] Run final local build: `npm run lint && npx tsc --noEmit && npm run build`
- [ ] Deploy preview, smoke test, then promote to prod
- [ ] End-to-end AI Center test (job → verify → approve → push to calendar)

## Notes

- Previous Claude chat froze because images >2000px were attached. Image safety guard now in place; rule is documented in `IMAGE_UPLOAD_RULES.md`.
- Vercel Hobby plan caps: 10s function timeout, daily cron only, 4 cron jobs max — we're at 4.
