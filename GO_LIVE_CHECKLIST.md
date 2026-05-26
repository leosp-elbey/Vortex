# VortexTrips Go-Live Checklist

> ⚠️ **BEFORE RE-ENABLING INSTAGRAM:** investigate whether Supabase Storage
> public URLs are fetchable by Meta's media crawler. Row `b3e6ce95` failed 4
> times on the container status check despite a valid token and a
> browser-accessible image. If the issue is structural, all IG posts in the
> queue will hit the same wall.

**Last updated:** 2026-05-24

---

> 📝 **Scaffold note.** This file was created during the 2026-05-24
> session closeout. It currently contains only the items that were
> explicitly tracked in this session — the full pre-existing checklist
> from the prior session's draft needs to be merged in before this file
> is the canonical source. Items below are accurate; what's missing is
> additional tier items, not corrections to these.

---

## TIER 2 — Caption / content system

- 2.1 Caption template (HOOK → CONTRAST → PROOF → CTA) — 🟢 **Done** (Phase 19.1)
- 2.2 Caption backfill — all 114 active content_calendar rows regenerated — 🟢 **Done** (Phase 19.2)
- 2.5 Homepage savings claim standardized to "up to 75% off" — 🟢 **Done** (Phase 19.1, commit `1b058b6`)
- 2.7 Instagram image URL compatibility with Meta crawlers — 🔴 **Under investigation** (Phase 20.2). If Supabase Storage URLs are unfetchable by Meta, ALL Instagram posts will fail. High priority before re-enabling Instagram queue.

## TIER 3 — Analytics / instrumentation

- 3.1 Vercel Analytics — 🟢 **Done**
- 3.2 Facebook Pixel — 🟢 **Done**

## TIER 4 — SMS / compliance

- 4.2 SMS safety layer — 🟢 **Done** (Phase 18.1)
- 4.3 End-to-end SMS confirmed — 🟢 **Done**
- 4.4 Kill switch OFF (safe-default) — 🟢 **Done**

## TIER 5 — Reliability / infrastructure

- 5.8 Autoposter auto-disable bug (silent kill-switch write failure) — 🟢 **Fixed** (Phase 20.0, commit `84978be`)

---

## Outstanding (from session closeout)

1. **Row b3e6ce95 IG failure root cause (Phase 20.2 follow-up).** May affect ALL future Instagram posts if structural.
2. **TikTok account still private.** Pending Bytedance Content Posting API audit; all TikTok posts invisible until resolved.
3. **YouTube never tested end-to-end.** OAuth complete, no rows queued.
4. **Social bios not yet updated.** Copy drafted, Leo to apply manually.
5. **Facebook pinned post not yet added.** Copy drafted, Leo to apply manually.
6. **Traffic acquisition — zero strategy in place.** The #1 blocker for member growth. Deserves a dedicated session.
