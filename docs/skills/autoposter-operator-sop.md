# Autoposter Operator SOP — VortexTrips

**Phase introduced:** 14P
**Status:** MANDATORY for every manual posting cycle on the VortexTrips autoposter.
**Supersedes:** ad-hoc operator routines documented across PROJECT_STATE_CURRENT.md and PHASE_14O_AUTOPOSTER_PILOT_PLAN.md §11. This document is now the canonical procedure.
**Anti-drift:** This SOP is the law. Any deviation requires an explicit operator-authorized phase that updates this file.

---

## Purpose

Codify the exact 5-step manual posting protocol the operator must follow for every approved row that flows through the autoposter pipeline. This protocol is the human-in-the-loop substitute for a registered cron during Phase 14O.1 / Path D, and it is the contract the future autoposter cron (Phase 14S) must mirror.

The protocol enforces:

- **One row, one click, one cycle.** Never more than one eligible row in the queue at posting time.
- **No platform call without a passing audit.** Every cycle starts and ends with `scripts/audit-pre-autoposter-readiness.js` at 9/9 PASS.
- **No DB write without a successful platform call.** Atomic UPDATE pattern: `status='posted', posted_at=now()` only after the platform returns 2xx.
- **No bypass of `validateManualPostingGate` or `validateMediaReadiness`.** These two are absolute law.

---

## Scope

**Applies to:** Facebook + Instagram posting via `scripts/run-autoposter-once.js` (Phase 14O.1).

**Does NOT apply to:**

- TikTok manual upload via Creator Center + Mark Posted bookkeeping (Phase 14M.2 path) — this is a separate manual flow until Phase 14R lands the TikTok Direct Post API.
- Twitter/X — explicitly refused by the runner (HTTP 402 on Free tier; permanently dropped per Phase 14Q).
- Any future cron-shaped path — Phase 14S will wrap this same protocol into a route, but the cron must enforce the same five gates programmatically.

---

## The 5-Step Protocol (STRICT ORDER)

Every manual posting cycle MUST execute these five steps in order. Skipping a step or reordering them is a protocol violation.

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
2. Click **Mark Ready** on **exactly one** Facebook OR Instagram row.
3. Confirm the row now shows `posting_gate_approved=true` and `queued_for_posting_at` is set.

**Required outcome:** Eligible queue size = **exactly 1**.

- Two or more Ready rows is a refusal condition (the runner will exit with code 2).
- A Ready row on a refused platform (Twitter/X/TikTok) is also a refusal condition.
- If the dashboard shows the wrong row Ready, click **Unqueue** and start Step 2 over.

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

## Promotion to Cron (Phase 14S)

Phase 14S will wrap the runner's `--apply` logic into `/api/cron/autoposter-once/route.ts`, gated by `CRON_SECRET` and a `site_settings.autoposter_cron_enabled` kill switch. When that ships, the cron route MUST encode this SOP's 5 gates programmatically:

| SOP step | Cron equivalent |
|---|---|
| Step 1 — Audit pre-flight | Pre-flight assertion: Check 9 PASS, eligible queue snapshot |
| Step 2 — Mark Ready | (Operator-driven; cron does not Mark Ready — it only posts what is already Ready) |
| Step 3 — Dry-Run | Pre-flight gate: `validateManualPostingGate` + `validateMediaReadiness` + queue-size-exactly-1 check |
| Step 4 — Apply | Platform call + atomic UPDATE |
| Step 5 — Audit post-flight | Post-flight assertion: Check 9 PASS, deltas == +1, queue drained to 0; on slip, auto-disable the cron |

This SOP is the source-of-truth for that cron's behavior. If the SOP and the cron disagree, the cron is wrong.
