# Phase 14O — Autoposter Pilot Plan + One-Row Cron Simulation

**Date:** 2026-05-06
**Author:** VortexTrips operator + Claude
**Status:** Plan + simulation only. Live cron explicitly NOT enabled.

---

## Purpose

Document the safety contract and rollout plan for promoting the autoposter from manual → cron-driven, AND prove via dry-run that the existing autoposter pipeline correctly identifies a single eligible row without making any platform calls. Phase 14O does NOT enable cron. A successor Phase 14O.1 may enable a tightly-bounded daily cron once every guardrail in this document is satisfied for several consecutive days.

---

## 1. Current production baseline (2026-05-06)

| Metric | Value |
|---|---|
| `posted_at` count | **30** |
| `status='posted'` count | 29 (1 less than `posted_at` due to legacy IG WARN row `a0bd9d16…`, untouched per spec) |
| Eligible posting queue | **0** (no row currently `posting_status='ready' && posting_gate_approved=true`) |
| Approved + unposted rows | 53 (available for future Mark Ready clicks) |
| Audit summary | **9/9 PASS** |
| Audit Check 9 (`status='posted' iff posted_at IS NOT NULL`) | PASS — 0 FAIL rows; 1 WARN (`a0bd9d16…`) |
| Validator disagreements | 0 |
| Cron / live autoposter | **OFF** by design |
| Vercel cron slots | 4 / 4 (Hobby plan) — `check-heygen-jobs`, `weekly-content`, `score-and-branch`, `send-sequences`. **No autoposter cron registered.** |
| Phase 14M.2 route fix | deployed (`/api/content` PATCH stamps `posted_at` atomically with `status='posted'`) |
| Last 5 manual posting cycles (Phase 14N) | 5/5 clean: FB → IG → FB → IG → TikTok |
| Twitter/X | paused on HTTP 402 (Twitter Developer Portal billing/tier issue — `api.twitter.com` post API requires Basic tier ≥ $100/mo) |
| TikTok OAuth token exchange | NOT yet built. Manual flow only (Creator Center upload + dashboard `Mark Posted` bookkeeping). Callback route `/api/auth/tiktok/callback` is live but stops at "connected=pending". |
| Temporary HeyGen URLs in production | 0 (Phase 14L.2.3 storage hardening confirmed) |
| Working tree | clean |

---

## 2. Proposed Phase 14O.1 live cron guardrails

A future cron may run only when ALL of the following invariants are wired into the cron's eligibility helper AND verified by `audit-pre-autoposter-readiness.js` immediately before any platform call:

1. **Daily only.** No sub-daily cadence. Schedule registered in `vercel.json` as `0 14 * * *` (or similar — single time per day).
2. **Max 1 row per run.** Hard ceiling. The cron caps `--limit=1` regardless of eligible queue size. Repeated runs across days — never multiple per day, never multiple rows in one run.
3. **`posting_status === 'ready'`** — the operator must have explicitly clicked Mark Ready.
4. **`posting_gate_approved === true`** — same source.
5. **`queued_for_posting_at IS NOT NULL`** — concrete proof Mark Ready ran.
6. **`manual_posting_only === true`** — defense in depth; auto-bypassing routes never mark rows ready, so this is always true today, but the cron will refuse to post any row where this is `false`.
7. **`status === 'approved'`** AND **`posted_at IS NULL`** — pre-flight lifecycle gate.
8. **Media readiness pass** — `validateMediaReadiness` must return `blocked: false`. For Instagram this requires `image_url` OR `video_url`; for TikTok requires `video_url`.
9. **Branded tracking link when campaign-originated** — if `campaign_asset_id IS NOT NULL`, then `tracking_url` MUST start with `https://www.vortextrips.com/t/`. Legacy `myvortex365.com/leosp` URLs are rejected by the existing gate.
10. **Twitter/X excluded.** Cron eligibility filter explicitly drops `platform='twitter'` until the Developer Portal billing is fixed AND a separate operator authorization re-includes it.
11. **Auto-disable on first failure.** If the platform API call returns non-2xx, OR if any post-flight invariant check fails (`posted_at` not set, `status` not flipped, audit Check 9 regresses), the cron writes a flag (e.g. `site_settings.autoposter_cron_enabled=false`) AND skips all subsequent runs until an operator manually re-enables.
12. **Pre-flight + post-flight audit emission.** Each cron run logs (and ideally upserts to `ai_actions_log` or a new `autoposter_runs` table) the eligible queue size, the selected id, the platform call result, the post-flight `posted_at`/`status` state, and any invariant deltas.
13. **Idempotency.** Re-running the cron against the same ready row is a no-op once `status='posted'` has been set (pre-flight check `posted_at IS NULL` blocks re-post).

---

## 3. Per-platform first cron order

When Phase 14O.1 ships, the cron will start narrowly and expand only after each platform proves itself for several consecutive days.

| Order | Platform | Why this order | Path | Status today |
|---|---|---|---|---|
| 1 | Facebook | Cleanest: Graph API v25, page-token-based, atomic UPDATE in `/api/automations/post-to-facebook`. 2 manual cycles already verified clean. | `POST /v23.0/{page_id}/photos` (or `/feed`) → `UPDATE content_calendar SET status='posted', posted_at=now()` | ready |
| 2 | Instagram | Same Meta Graph path; container + publish two-step. 2 manual cycles already verified clean. | `POST /v25.0/{ig_account}/media` → poll `status_code` → `POST /v25.0/{ig_account}/media_publish` → atomic UPDATE | ready |
| 3 | TikTok | **Manual only for now.** `Upload to TikTok` button opens Creator Center; operator uploads + clicks dashboard `Mark Posted`. Phase 14M.2 fix verified this path on Cycle 5 of Phase 14N. | dashboard click → `/api/content` PATCH (gated bookkeeping) → atomic UPDATE | manual-only |
| — | Twitter/X | **Excluded** until Developer Portal billing is fixed. The route exists but every attempt would 402 from `api.twitter.com`. | `POST /2/tweets` → currently 402 | excluded |

The cron's eligibility filter SHOULD be hard-coded to `platform IN ('facebook', 'instagram')` for the first ~30 days of Phase 14O.1. Adding TikTok requires building the OAuth token-exchange helper (Phase 14K-tt). Adding Twitter requires the Developer Portal fix.

---

## 4. Rollback plan

The default state is **cron OFF**. If Phase 14O.1 enables cron and any of the following occurs, follow the rollback path immediately:

### Rollback triggers
- Platform API returns non-2xx
- `posted_at` did not increment after a platform success response
- `status='posted'` count diverges from `posted_at IS NOT NULL` count beyond the known WARN row
- Audit Check 9 regresses (a row appears with `status='posted' AND posted_at IS NULL`)
- More than 1 row is in the eligible queue when the cron fires (operator may have Mark-Ready'd extras; the cron's `--limit=1` cap protects against this, but it's still a smell)
- Any platform API call lands in the audit script's source self-scan
- Any unexpected social platform side-effect reported by the operator

### Rollback steps
1. **Disable the cron immediately.** Either flip `site_settings.autoposter_cron_enabled = false` (if the auto-disable flag is wired) OR manually remove the cron from `vercel.json` and redeploy.
2. **Run the audit:** `node scripts/audit-pre-autoposter-readiness.js`. Confirm Check 9 still PASS or flag the new anomaly.
3. **Inspect the affected row directly** via Supabase query — capture `status`, `posted_at`, `posting_status`, `posting_gate_approved`, `queued_for_posting_at`, `posting_block_reason`.
4. **Manually unqueue any stuck row** in the dashboard: Reset to draft OR click `Remove from Queue` if the row hasn't been mutated to `status='posted'` yet.
5. **If a row landed `status='posted'` but no platform post was actually made**, manually Reset that row to draft and clear `posted_at` via a one-shot operator-authorized UPDATE.
6. **Document the failure in `PHASE_14O_AUTOPOSTER_PILOT_PLAN.md`** under a new "Failure log" section.
7. **Phase 14O.1 stays disabled** until the root cause is identified, fixed, and re-verified through the dry-run path described in §5.

---

## 5. Success criteria to graduate to Phase 14O.1

Phase 14O.1 (live cron, 1 row/day, FB-only first) may be enabled only when ALL of the following are true on a given run:

1. The Phase 14O dry-run endpoint (`/api/cron/autoposter-dry-run`) returns:
   - HTTP 200
   - `dry_run: true`
   - `live_posting_blocked: true`
   - `eligible_count: 1` (exactly one — never 0, never >1)
   - The selected row id matches the operator's known Mark Ready click
   - The selected platform is Facebook (Phase 14O.1 starts FB-only)
2. The pre-flight audit (`audit-pre-autoposter-readiness.js`) reports **9/9 PASS** with the row added to the queue:
   - Check 5 reports `eligible: 1, by platform: facebook=1`
   - Check 8 reports `0 disagreements`
   - Check 9 still PASS (no new orphans)
3. `posted_at` count is **unchanged** during the dry-run call (delta = 0).
4. **Zero platform API calls** during the dry-run (verified by audit script's self-scan + by the absence of any platform-side activity).
5. The dry-run completes in under 5 seconds.

Only after these conditions are met for the same row across two separate dry-run invocations (catches transient drift) should Phase 14O.1 ship.

---

## 6. Failure conditions (any one is a stop-ship)

The dry-run, the audit, and (eventually) the live cron must NEVER produce any of these:

1. **Eligible queue > 1.** The cron's eligibility filter must always cap at 1; if the dry-run returns >1, the cap is broken or the operator queued multiple rows accidentally.
2. **Validator disagreement.** `validateAutoposterCandidate` and `validateManualPostingGate` MUST agree on every approved row. Any disagreement is a bug.
3. **Media readiness failure.** Selected row fails `validateMediaReadiness` on the cron-target platform.
4. **Missing tracking URL where required.** Selected row has `campaign_asset_id` set but `tracking_url` is null OR doesn't start with `https://www.vortextrips.com/t/`.
5. **Any platform call during the dry-run.** The dry-run endpoint must remain pure-logic. Self-scan + `live_posting_blocked: true` are the contract.
6. **`posted_at` mutation during the dry-run.** Read-only invariant.
7. **Audit Check 9 regression.** New rows with `status='posted' AND posted_at IS NULL`.
8. **Cron firing outside the registered schedule** (covered by Vercel platform; if observed, rollback immediately).

---

## 7. What this phase does and does NOT do

| Action | Status |
|---|---|
| Create plan doc (this file) | ✅ done |
| Run baseline audit | ✅ done — 9/9 PASS, `posted_at` = 30 |
| Document Mark Ready operator step | ✅ done — see §8 |
| Document curl + verification commands | ✅ done — see §8 |
| **Mark Ready a row** | ⏳ operator action; not done in this phase |
| **Run the dry-run endpoint live** | ⏳ awaits operator Mark Ready click |
| **Enable cron** | ❌ NOT done. Phase 14O.1 territory. |
| **Make any platform API call** | ❌ NOT done. |
| **Mutate any row** | ❌ NOT done (operator's Mark Ready click only). |
| **Modify `vercel.json`** | ❌ NOT done. |

---

## 8. Operator instructions for Phase 14O dry-run

Once the operator decides to run the dry-run proof, follow this sequence exactly. **Cron stays off the entire time.**

### Step 1 — Mark Ready exactly one Facebook row

Open `/dashboard/content` while signed in as admin. Find an approved + unposted **Facebook** row with permanent media (image_url present). Click **Mark Ready** on that one row only.

> Why FB? Phase 14O.1 starts FB-only; using a FB row in the dry-run aligns the simulation with the planned cron's first-class platform.

### Step 2 — Tell Claude `"ready - Facebook"`

Claude will run:

```bash
node scripts/audit-pre-autoposter-readiness.js
node scripts/diagnose-autoposter-dry-run.js
```

Expected:
- Audit: 9/9 PASS, `eligible queue: 1, by platform: facebook=1`, `posted_at: 30` (unchanged), Check 9 PASS
- Dry-run diagnostic: 1 eligible row, the same id, `live_posting_blocked: true`

### Step 3 — Curl the live `/api/cron/autoposter-dry-run` endpoint with `CRON_SECRET`

PowerShell-compatible:

```powershell
$CRON_SECRET = (Select-String -Path .env.local -Pattern '^CRON_SECRET=' | Select-Object -First 1).Line -replace '^CRON_SECRET=', ''
curl.exe -sS -w "`n---HTTP %{http_code}---`n" -H "Authorization: Bearer $CRON_SECRET" "https://www.vortextrips.com/api/cron/autoposter-dry-run"
```

Expected response:
- HTTP 200
- JSON body containing:
  - `success: true`
  - `dry_run: true`
  - `live_posting_blocked: true`
  - `eligible_count: 1`
  - The selected row's id matches the row Mark-Ready'd in Step 1
  - `by_platform: { facebook: 1 }` (or similar)
- `posted_at` unchanged at 30 (cross-check via audit immediately after)

### Step 4 — Re-run the audit to prove no mutation

```bash
node scripts/audit-pre-autoposter-readiness.js
```

Expected:
- 9/9 PASS
- `posted_at: 30` (delta 0)
- Eligible queue still 1 (or 0 if operator unqueued; either is acceptable as long as no row was mutated to `status='posted'`)

### Step 5 — Decide

If all of §5's success criteria are met, Phase 14O is closed and Phase 14O.1 (live cron, FB-only, 1 row/day) becomes the next decision point.

If any of §6's failure conditions occurs, follow §4's rollback path.

### Step 6 — Cleanup

Restore the proof file from earlier audit runs OR delete the freshly-written one if it's untracked:

```powershell
git restore PHASE_14M_PRE_AUTOPOSTER_AUDIT_2026-05-06.md
git status
```

If the audit's date suffix doesn't exist as a tracked file, use:

```powershell
Remove-Item PHASE_14M_PRE_AUTOPOSTER_AUDIT_2026-05-06.md
git status
```

Working tree should be clean.

---

## 9. Open items entering Phase 14O

- **Twitter/X paused** — fixing requires Developer Portal billing upgrade. Out of scope for Phase 14O.
- **Legacy IG row `a0bd9d16…`** — WARN only; untouched. Decision deferred (clear via `--repair-legacy-id` OR preserve as historical).
- **TikTok OAuth token exchange** — Phase 14K-tt territory. The callback route is live but the helper isn't built. TikTok stays manual until then.
- **Local `RESEND_API_KEY=""`** — `vercel env pull --environment=production` strips secrets to empty strings; production unaffected. Operator can manually restore if local builds need it.

---

## 10. Approval gate before Phase 14O.1 (now superseded — see §11)

Phase 14O.1 (live cron) ships only after:
1. ✅ Plan doc reviewed by operator
2. ✅ Phase 14O dry-run (§8 steps 1–4) returned the expected results — `eligible_count: 1`, `live_posting_blocked: true`, `posted_at` unchanged at 30 (later 29 after legacy IG WARN cleanup), HTTP 200, all 6 success criteria met. Captured 2026-05-06.
3. ⏳ Operator explicitly authorizes `vercel.json` cron registration
4. ⏳ A staging window is chosen for the first cron firing — operator on standby for immediate rollback

Until all four are checked, cron stays OFF.

---

## 11. Path D adopted: manual autoposter runner before any cron

**Decision (2026-05-06):** Skip the immediate Phase 14O.1 (live cron) step. Adopt **Path D** from the four-paths analysis: a manual runner script that exercises the autoposter pipeline once per operator click, with the same gate/atomic-update guarantees the deployed cron route would enforce. Run for ~30 successful manual cycles before considering live cron registration.

### Why Path D before cron

- Real-world cadence learning. We don't yet know whether the right rhythm is one-row-per-day, one-per-business-day, sub-daily, or weekend-included. Path D lets the operator choose each day until a pattern emerges.
- No `vercel.json` change. Hobby plan's 4-cron limit isn't touched. No upgrade, no slot reshuffle.
- Same code surface as the future cron. The runner mirrors `getAutoposterEligibleRows` + `validateAutoposterCandidate` + `validateMediaReadiness` + the platform-poster route logic. When Phase 14O.2 promotes the runner to a cron, the eligibility logic is already proven.
- Operator-in-the-loop. Every post is a deliberate click. Rolling back is instant (just don't run the script). No "did the cron fire? did it land? do I need to look at logs?" anxiety.
- Catches edge cases at human speed. If the gate's input shape changes (e.g., a future migration adds a new column), the runner's first failure surfaces it the next morning instead of overnight when nobody's watching.

### Runner script

`scripts/run-autoposter-once.js` — committed in this phase.

### Operator daily routine

```bash
# 1. Audit (sanity baseline)
node scripts/audit-pre-autoposter-readiness.js
# Expect: 9/9 PASS, posted_at = current count, queue size matches Mark Ready clicks

# 2. Mark Ready exactly one Facebook or Instagram row in /dashboard/content
#    (browser action; runner refuses if queue size != 1)

# 3. DRY-RUN the autoposter — confirms selection, prints plan, no platform call
node scripts/run-autoposter-once.js
# Expect: selected row id, platform, caption preview, "DRY-RUN" footer

# 4. Authorize the live post
node scripts/run-autoposter-once.js --apply
# Expect: platform call lands, atomic UPDATE writes status='posted' + posted_at
#         post-flight invariants printed

# 5. Re-audit to lock in the proof
node scripts/audit-pre-autoposter-readiness.js
# Expect: 9/9 PASS, posted_at: +1, eligible queue: 0, Check 9: PASS
```

### Refusal contract (encoded in the runner)

The runner refuses (exits non-zero) on any of:
- Eligible queue size != 1
- Selected row's platform is `twitter`, `x`, or `tiktok`
- Selected row's platform is not in `{facebook, instagram}` (defense in depth)
- `validateAutoposterCandidate` returns a non-null reason
- `validateMediaReadiness` returns blocked
- Platform credentials missing (no FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN for FB; no INSTAGRAM_BUSINESS_ACCOUNT_ID / INSTAGRAM_ACCESS_TOKEN for IG)
- Platform API call fails — DB unchanged, exits with error code 3
- Atomic UPDATE affects 0 or >1 rows (defensive `.eq('status','approved').is('posted_at',null)` guards inline)
- Post-flight `posted_at` delta != +1
- Post-flight `status='posted'` delta != +1
- Post-flight Check 9 anomaly (a) > 0 (a row landed `status='posted'` without `posted_at`)
- Post-flight eligible queue != 0

### Promotion criteria to Phase 14O.2 (live cron)

After ~30 consecutive clean `--apply` runs, the operator may promote to a live cron with confidence that:
- All gate transitions land correctly
- The atomic UPDATE never produces orphans
- Platform-side reliability is acceptable (FB + IG return 2xx consistently)
- No drift between manual + autoposter validators
- The script's refusal contract has been exercised (try queue size 0, queue size 2, twitter rows, tiktok rows — confirm refusals fire as expected)

If any of those holds break during the 30 runs, fix the root cause before continuing the count. Reset the counter to 0 after any incident.

### Phase 14O.2 (cron promotion) preview

When the time comes, Phase 14O.2 will:
1. Choose between Path A (free, drop `check-heygen-jobs` slot) or Path C (Vercel Pro upgrade)
2. Add a single `vercel.json` cron entry pointing at a route that wraps `scripts/run-autoposter-once.js --apply`'s logic
3. Keep the runner script as the manual fallback / debug tool
4. Add a `site_settings.autoposter_cron_enabled` flag (default `false`) the cron route checks before posting — operator-controlled kill switch
5. Add an auto-disable trigger: after any non-2xx platform response, set the flag to `false` and skip subsequent runs until manually re-enabled

Phase 14O.2 is gated on the 30-run criteria above.
