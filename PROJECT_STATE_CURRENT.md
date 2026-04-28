# VortexTrips — Current Project State

**Last updated:** 2026-04-28
**Last known good commit:** `ad42f44` — "feat: Vortex AI Command Center (Phases 1-10) + webhook security + HeyGen async cron"
**Branch:** `main`

---

## ⚠️ HARD RULE — READ FIRST

**No phase is considered complete until:**
1. `PROJECT_STATE_CURRENT.md` is updated
2. `BUILD_PROGRESS.md` is updated
3. All changes are committed
4. `git push origin main` confirms "Everything up-to-date"

If any of those four steps is missing, the phase is **NOT done** — regardless of how working the code looks.

See `SAVE_PROTOCOL.md` for the full workflow.

---

## Current completed phase

**Phases 0 through 10 — SHIPPED** (in commit `ad42f44`).

This includes:
- Phase 0 — Audit & plan
- Phase 1 — All 11 database migrations (`supabase/migrations/006`–`016`)
- Phase 2 — Env vars (`.env.example` updated)
- Phase 3 — AI Router (`src/lib/ai-router.ts`, `src/lib/ai-models.ts`)
- Phase 4 — Claude verifier (`src/lib/ai-verifier.ts`)
- Phase 5 — 12 admin AI API routes under `src/app/api/ai/`
- Phase 6 — AI Command Center dashboard (`src/app/dashboard/ai-command-center/page.tsx` + 5 components in `src/components/ai/`)
- Phase 7 — Workflow generators (social-pack, video-script, email-sequence, blog, social-calendar)
- Phase 8 — Webhook security hardening (`src/lib/webhook-auth.ts`, `src/lib/rate-limit.ts`)
- Phase 9 — HeyGen async cron (`src/app/api/cron/check-heygen-jobs/route.ts`)
- Phase 10 — Build/typecheck/lint verification

---

## Files created/edited in the latest session

This session added the save-and-status workflow plus the image safety guard. Files touched:

**Created:**
- `BUILD_PROGRESS.md` — phase checklist
- `SAVE_PROTOCOL.md` — save-after-every-phase rule
- `IMAGE_UPLOAD_RULES.md` — 2000px max, why, how to enforce
- `src/lib/image-safety.ts` — runtime image dimension/size validator
- `scripts/resize-images.js` — local batch resize utility (opt-in, requires `sharp`)

**Edited:**
- `PROJECT_STATE_CURRENT.md` — this file (now reflects real shipped state)

---

## What is working

- AI Command Center page renders at `/dashboard/ai-command-center`
- Sidebar nav link present at `src/components/dashboard/sidebar.tsx:14`
- All AI API routes admin-gated via `src/lib/admin-auth.ts`
- Webhook signature checks live on Bland, Twilio, Stripe, HeyGen webhooks
- Rate limiting on AI generation endpoints
- HeyGen async pattern: kick off generation, daily cron checks status, no more 10s timeouts

## What is still pending

- **Phase 11 — Deploy prep** (NOT YET RUN)
  - Confirm all 11 new env vars are set in Vercel dashboard
  - Run `npm run lint && npx tsc --noEmit && npm run build` locally — must all pass
  - Deploy preview via `npx vercel`
  - Smoke test on preview URL
  - Promote to prod via `npx vercel --prod`
- Final verification of AI Center end-to-end (create → generate → verify → approve → push to calendar)

## Known issues

- Previous Claude chat froze due to images >2000px being pasted/dragged in. The image safety guard added this session is the fix; from now on, screenshots must be ≤2000px on the longest side. See `IMAGE_UPLOAD_RULES.md`.
- `package.json` has no `typecheck` script — use `npx tsc --noEmit` instead.
- Vercel Hobby plan: 10s function timeout, daily cron only, max 4 cron jobs total. We are at the limit (score-and-branch, send-sequences, weekly-content, check-heygen-jobs).

## Exact next step

1. Run the save protocol from `SAVE_PROTOCOL.md` to commit this session's work (status files + image safety guard).
2. Then — and only then — begin Phase 11 deploy prep with a local build verification.

Do **not** start Phase 11 until this commit is pushed to `origin/main` and confirmed.
