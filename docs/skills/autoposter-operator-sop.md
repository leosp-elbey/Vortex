# Autoposter Operator SOP — VortexTrips

**Phase introduced:** 14P
**Phase 14S:** Cron now active. The 5-step manual protocol below is preserved as **diagnostic** procedure; daily posting is handled automatically.
**Status:** MANDATORY for every manual diagnostic cycle on the VortexTrips autoposter. The cron mirrors this SOP step-for-step on the schedule registered in `vercel.json`.
**Supersedes:** ad-hoc operator routines documented across PROJECT_STATE_CURRENT.md and PHASE_14O_AUTOPOSTER_PILOT_PLAN.md §11. This document is now the canonical procedure.
**Anti-drift:** This SOP is the law. Any deviation requires an explicit operator-authorized phase that updates this file.

---

## Operating mode (post-Phase-14S)

**🤖 Fully automated.** The cron at `/api/cron/autoposter-once` runs daily on the schedule registered in `vercel.json` and posts exactly one eligible Mark-Ready'd row per execution to Facebook, Instagram, or TikTok via the same gate / atomic-UPDATE contract this SOP describes.

**Kill switch:** `site_settings.autoposter_cron_enabled`
- `'true'` → cron actively posts
- anything else (including missing) → cron returns `{ skipped: true, reason: 'cron_disabled' }`

**Auto-disable on failure.** The cron flips the kill switch back to `'false'` automatically on any of:
- platform non-2xx response,
- atomic UPDATE affecting != 1 row,
- post-flight invariant slip (posted_at delta != +1, status='posted' delta != +1).

After an auto-disable, the operator must investigate and manually re-enable:
```sql
UPDATE site_settings SET value='true' WHERE key='autoposter_cron_enabled';
```

**Operator's daily responsibilities under cron:**
1. Mark Ready exactly one approved row per day (or less; the cron is fine with 0 eligible).
2. Watch Vercel logs for `[autoposter-once]` entries.
3. Run the diagnostic 5-step procedure below WHENEVER something looks off (failed cron, posted_at drift, kill switch flipped) — that's the protocol's new role.

---

## Purpose (diagnostic mode)

Codify the exact 5-step manual posting protocol the operator must follow when running the `scripts/run-autoposter-once.js` runner directly — for diagnosis, for one-off backfills when the cron is disabled, or for verifying behavior before re-enabling the kill switch after an incident.

The protocol enforces:

- **One row, one click, one cycle.** Never more than one eligible row in the queue at posting time.
- **No platform call without a passing audit.** Every cycle starts and ends with `scripts/audit-pre-autoposter-readiness.js` at 9/9 PASS.
- **No DB write without a successful platform call.** Atomic UPDATE pattern: `status='posted', posted_at=now()` only after the platform returns 2xx.
- **No bypass of `validateManualPostingGate` or `validateMediaReadiness`.** These two are absolute law.

The cron route `/api/cron/autoposter-once` enforces these exact same invariants programmatically (see Phase 14S promotion mapping at the bottom of this doc).

---

## Scope

**Applies to:** Facebook, Instagram, AND TikTok posting via `scripts/run-autoposter-once.js` (Phase 14O.1 + Phase 14R) OR via the cron at `/api/cron/autoposter-once` (Phase 14S).

**Does NOT apply to:**

- Twitter/X — permanently dropped per Phase 14Q. The runner's `REFUSED_PLATFORMS` set keeps `twitter` and `x` as defensive; the cron route mirrors the refusal.
- One-off manual posts via the dashboard's "Post to FB / Post to IG" buttons — those go through `/api/automations/post-to-{facebook,instagram,tiktok}` which apply the same gate but skip the audit + queue-size invariants.

---

## The 5-Step Protocol (STRICT ORDER) — diagnostic / one-off use

Every manual posting cycle MUST execute these five steps in order. Skipping a step or reordering them is a protocol violation. The cron at `/api/cron/autoposter-once` runs an automated equivalent on the schedule in `vercel.json`; this manual procedure is what you fall back to for diagnostics.

### Step 1 — Audit (pre-flight)

```bash
node scripts/audit-pre-autoposter-readiness.js
```

**Required outcome:** **9/9 PASS.**

- Check 9 (`status='posted' iff posted_at IS NOT NULL`) MUST be PASS with **0 anomaly-(a)** rows.
- Anomaly-(b) WARN is acceptable only if it has been operator-acknowledged for that specific row; a new WARN that wasn't there last cycle blocks the cycle.
- `eligible_count` should be 0 at this point (we haven't marked anything Ready yet).
- `posted_at` count and `status='posted'` count MUST match exactly.

If any of the 9 checks fails, **stop**. Diagnose root cause. Do not proceed to Step 2.

### Step 2 — Dashboard Approve / Mark Ready (exactly one row)

In `/dashboard/content`:

1. Identify the row to post. It must already be in `status='approved'` (the AI / operator approval step happens earlier and is out of scope for this SOP).
2. Click **Mark Ready** on **exactly one** Facebook, Instagram, OR TikTok row.
3. Confirm the row now shows `posting_gate_approved=true` and `queued_for_posting_at` is set.

**Required outcome:** Eligible queue size = **exactly 1**.

- Two or more Ready rows is a refusal condition (the runner will exit with code 2; the cron returns `skipped: true, reason: 'queue_size_gt_1'`).
- A Ready row on Twitter/X is also a refusal condition (the runner refuses; the cron returns `skipped: true, reason: 'refused_platform'`).
- If the dashboard shows the wrong row Ready, click **Unqueue** and start Step 2 over.

**Note for cron mode:** under Phase 14S, this is the only step the operator performs daily. The cron handles Steps 1, 3, 4, 5 automatically.

### Step 3 — Dry-Run script (no platform call, no DB write)

```bash
node scripts/run-autoposter-once.js
```

**Required outcome:** Clean exit (code 0) with the planned post printed.

- The runner prints the row it would post: `id`, `platform`, `caption preview`, `media URL`.
- **Verify the platform is `facebook` or `instagram`.** If the runner refuses (code 2) for any reason — wrong platform, queue size != 1, validator non-eligible, media-blocked — **stop**. Fix the root cause in the dashboard or the data, then return to Step 1.
- This is the operator's last chance to catch a bad row before the platform call. Read the printed plan carefully. If anything looks wrong (wrong caption, wrong media, wrong platform), Unqueue and start over from Step 1.

**Forbidden:** Skipping the dry-run "to save time." The dry-run is the cheap dress rehearsal. Phase 14O.1's whole reason for existing is the dry-run + apply two-step.

### Step 4 — Apply script (operator-authorized post)

```bash
node scripts/run-autoposter-once.js --apply
```

**Required outcome:** Clean exit (code 0) with `apply mode: yes`, `posted_at delta: +1`, `status='posted' delta: +1`.

The runner will:

1. Re-run all gate checks (pre-flight) — must still pass.
2. Call the platform (Facebook Graph API or Instagram Graph API).
3. On 2xx: atomic UPDATE `content_calendar.status='posted', posted_at=now()` with defensive `.eq('status','approved').is('posted_at',null)` guards inline.
4. Run post-flight invariants — Check 9 must hold, eligible queue must drain to 0, deltas must equal +1.

**Refusal codes (any non-zero exit means STOP):**

| Exit code | Meaning | Operator action |
|---|---|---|
| 0 | Clean — proceed to Step 5 | — |
| 2 | Pre-flight refusal (queue size, platform, validator, media) | Investigate the printed reason; fix in dashboard or data; return to Step 1 |
| 3 | Platform credentials missing OR platform non-2xx | DB unchanged. Investigate platform credentials / API status. Row stays `status='approved'`. |
| 4 | Atomic UPDATE affected 0 or >1 rows | **Critical** — platform may have posted but DB didn't flip. Manually verify on the platform. Use `scripts/repair-posted-at-invariants.js` if needed. |
| 5 | Post-flight invariant slip | Audit will diagnose. Do NOT post again until 9/9 PASS is restored. |

### Step 5 — Audit (post-flight)

```bash
node scripts/audit-pre-autoposter-readiness.js
```

**Required outcome:** **9/9 PASS** with `posted_at` and `status='posted'` counts both incremented by exactly +1 from Step 1's snapshot.

- Check 9 MUST still be PASS. A new anomaly-(a) means the atomic UPDATE didn't fire correctly even though the apply step exited 0 — this is a Stop-Everything condition; investigate before any further posting.
- `eligible_count` MUST be 0 (the Ready row drained to `posted`).
- If anything is off, **stop** and diagnose. Do not start a new cycle until 9/9 PASS is restored.

---

## Invariants Enforced by This SOP

The SOP exists to keep these invariants intact across every cycle:

1. **Queue invariant:** eligible queue size is exactly 1 at apply time, exactly 0 immediately before and after.
2. **Posted_at invariant:** `status='posted' ⇔ posted_at IS NOT NULL`. (Audit Check 9.)
3. **Atomic UPDATE invariant:** the UPDATE that flips `status` and `posted_at` is a single statement guarded by `.eq('status','approved').is('posted_at',null)` and affects exactly 1 row.
4. **Gate invariant:** `validateManualPostingGate` and `validateMediaReadiness` MUST allow the row before any platform call. Bypassing either is a protocol violation regardless of operator intent.
5. **Platform invariant:** only `facebook` or `instagram` reach the platform-call branch in 14O.1. Twitter/X and TikTok are refused at runner level.
6. **Provider invariant:** zero HeyGen / Pexels / OpenAI calls during a posting cycle. Media is already finalized at approval time.

---

## What the Operator Must NOT Do

- ❌ Mark Ready more than one row at a time.
- ❌ Skip Step 1 ("the audit was clean an hour ago").
- ❌ Skip Step 3 (the dry-run).
- ❌ Run `--apply` twice in a row without re-running the audit.
- ❌ Hand-edit `content_calendar.status` or `content_calendar.posted_at` in Supabase to "fix" a stuck row. Use `scripts/repair-posted-at-invariants.js` instead, with operator authorization.
- ❌ Add a row to the queue while another row is mid-cycle.
- ❌ Run the apply step against a TikTok or Twitter/X row. The runner will refuse, but don't try.
- ❌ Treat a code-3 platform failure as "the row didn't post" without verifying on the platform UI. (Code 3 means the DB is unchanged, but the platform state is what the platform says it is.)

---

## Reference

- **Runner:** `scripts/run-autoposter-once.js` (Phase 14O.1)
- **Audit:** `scripts/audit-pre-autoposter-readiness.js` (Check 9 added in Phase 14M.2)
- **Repair tool:** `scripts/repair-posted-at-invariants.js` (DRY-RUN-default; `--apply` requires explicit row IDs)
- **Gate functions:** `validateManualPostingGate`, `validateMediaReadiness` — these are the ABSOLUTE LAW for content publishing
- **Pilot plan:** `PHASE_14O_AUTOPOSTER_PILOT_PLAN.md` §11 (Path D context and 30-run promotion criteria)
- **Save protocol after every cycle:** N/A — posting cycles do not require a commit. The SOP applies to repository changes via `SAVE_PROTOCOL.md`, not to posting cycles themselves.

---

## Phase 14S Cron Mapping — how the route mirrors this SOP

The cron at [`src/app/api/cron/autoposter-once/route.ts`](../../src/app/api/cron/autoposter-once/route.ts) implements the SOP's 5 steps programmatically:

| SOP step | Cron implementation |
|---|---|
| Step 1 — Audit pre-flight | `snapshotPostedCounts(supabase)` captures `posted_at` count + `status='posted'` count before any platform call. Equivalent to Check 9's invariant baseline. |
| Step 2 — Mark Ready | **Not done by the cron** — operator-driven. The cron only posts what is already Ready. |
| Step 3 — Dry-Run / gate | `getAutoposterEligibleRows({ limit: 5 })` returns only rows that pass `validateAutoposterCandidate` (which already runs `validateMediaReadiness`). Cron then re-fetches the chosen row and runs `validateManualPostingGate(post, { supportedPlatforms: [platform] })` as defense-in-depth. Refuses if queue size != 1, refuses if platform is twitter/x, refuses if platform is unsupported. |
| Step 4 — Apply | Platform call (FB photo→feed fallback, IG container→wait→publish, or TikTok Direct Post init) followed by atomic UPDATE: `status='posted', posted_at=now()` with `.eq('status','approved').is('posted_at',null)` inline guards. Update count must equal 1. |
| Step 5 — Audit post-flight | `snapshotPostedCounts(supabase)` again — `posted_at` delta must equal +1, `status='posted'` delta must equal +1. On slip, the cron flips `site_settings.autoposter_cron_enabled` to `'false'` and returns 500. |

**Auto-disable triggers** (any of these flip the kill switch and stop the next tick):
- Platform non-2xx response
- DB UPDATE failed
- DB UPDATE affected count != 1
- Post-flight delta != +1 on either counter

**Operator response after auto-disable:**
1. Read Vercel logs for the `[autoposter-once] CRITICAL` entry — it carries the row_id, platform, platform_post_id (if landed), and reason.
2. Run `node scripts/audit-pre-autoposter-readiness.js` to inspect the database state.
3. If the platform post landed but the DB didn't flip (the warning case): use `scripts/repair-posted-at-invariants.js` with explicit `--apply --id=<row_id>`.
4. If the platform refused the post: fix the root cause (token expired, media URL unreachable, etc.) THEN re-enable: `UPDATE site_settings SET value='true' WHERE key='autoposter_cron_enabled';`.
5. Run the manual 5-step protocol once on a fresh Mark-Ready'd row to verify the fix before letting the cron resume.

**This SOP is the source-of-truth for the cron's behavior. If the SOP and the cron disagree, the cron is wrong.**
