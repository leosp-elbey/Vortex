# Claude Session Skill — VortexTrips

**Created:** 2026-05-01
**Status:** ACTIVE — load this on every Claude session for VortexTrips.

---

## Purpose

Reusable skill layer that prevents Claude from drifting, rebuilding, or losing context between sessions. Anchors every interaction to the markdown source of truth.

## When Claude must use it

- At the start of every new VortexTrips session.
- After any reported session reset, image-size error, or context loss.
- Before beginning a new phase.
- Before making changes that span more than two files.

## Required startup file reads (in this exact order)

1. `PROJECT_STATE_CURRENT.md` — current locked-in state and rules.
2. `BUILD_PROGRESS.md` — phase checklist and pending items.
3. `SAVE_PROTOCOL.md` — completion rules and session hardening rules.
4. `CHAT_CONTINUATION_*.md` — most recent continuation file (the highest-dated one).

If any of these files is missing, **stop and report**. Do not proceed.

## Session limit prevention rules

- Never process the entire repository unless explicitly requested.
- Use targeted file reads via `Read` with offset/limit; do not pull thousand-line files in full.
- Use `Grep` and `Glob` for discovery, not full-tree reads.
- Default to short text replies; offload long output into `.md` files.
- Do not paste large code blocks into chat — write them to disk.
- Cap any single tool invocation to focused scope.

## Image handling rules

- Image uploads must be under 1920px on the longest side.
- Do not paste oversized images into chat under any circumstance.
- Use `src/lib/image-safety.ts` to validate any user-uploaded image at runtime.
- Use `scripts/resize-images.js` to batch-prepare local images before sharing.

## Git save workflow

After every meaningful change, run:

```bash
git status
git add <specific files>
git commit -m "Phase N: <short summary>"
git push origin main
git push origin main   # second push must show "Everything up-to-date"
```

Do not skip hooks. Do not amend or force-push to `main`. New work = new commits.

## Phase handoff rules

- One phase per session. Do not start a new phase mid-session.
- A phase is **not complete** until:
  - `PROJECT_STATE_CURRENT.md` is updated
  - `BUILD_PROGRESS.md` is updated
  - Changes are committed
  - Changes are pushed to `origin/main`
  - `git status` shows clean
- Before ending any session, write a `CHAT_CONTINUATION_<DATE>.md` file summarizing what was done and the exact next prompt to use.
- The next session must read that continuation file before starting work.

---

## Mandatory End-of-Phase Save Protocol

This protocol is **mandatory** at the end of every completed phase, patch, smoke test, audit, migration, or deployment. It overrides any default behavior that would skip docs or commits.

### Rule 1 — Always update both tracking files

At the close of every phase / patch / smoke test / audit / migration / deployment, Claude must update:

- `PROJECT_STATE_CURRENT.md`
- `BUILD_PROGRESS.md`

No exceptions. The work is not done if either file is stale.

### Rule 2 — Phase-specific docs go on the save list too

If the work created a new phase report, roadmap, audit, or skill file (e.g. `SYSTEM_AUDIT_PHASE_14_STATUS.md`, `EVENT_CAMPAIGN_ROADMAP.md`, a `CHAT_CONTINUATION_*.md`, etc.), Claude must include it in the staged files list. New files are easy to miss; explicitly enumerate them.

### Rule 3 — Phase-completion checklist (all must be true)

Claude must never call a phase complete unless all of the following are true and explicitly stated in the final report:

- [x] Tracking files updated (Rule 1)
- [x] Tests run, OR explicitly deferred with a reason (e.g. "lint not run — Phase 13 ESLint v8/v9 mismatch")
- [x] Migration status documented if a migration was created or required
- [x] Deploy status documented (deployed / pending / not required)
- [x] Smoke-test status documented (passed / pending / not required)
- [x] Exact git commands provided (named files, exact commit message, two push commands)

If any item is missing or unverified, the phase is **incomplete**. Say so plainly.

### Rule 4 — End-of-phase report shape

Every end-of-phase report must enumerate, in order:

1. **Files created**
2. **Files updated**
3. **Tests run** (with results: ✅ PASS / ❌ FAIL / not run + reason)
4. **Migration required?** (yes / no — if yes, name and apply order)
5. **Deployment required?** (yes / no)
6. **Smoke test required?** (yes / no — if yes, the checklist)
7. **Exact `git add` command** with file names (no `.` and no globs)
8. **Exact commit message**
9. **Exact push commands** (two `git push origin main` lines, the second to verify)
10. **`tsconfig.tsbuildinfo` note** — explicitly state it is excluded; mention it only if a special case requires committing it

This shape is mandatory even when the phase is small.

### Rule 5 — Always exclude cache / build / secret files unless explicitly required

The following must be **excluded** from staging by default. Never add them with `git add` unless the user explicitly authorizes it for a specific reason:

- `tsconfig.tsbuildinfo`
- `.next/`
- `node_modules/`
- `.env.local`
- `.claude/settings.local.json`
- Any file matching `*.log`, `.DS_Store`, or platform-specific temp paths

If one of these shows up in `git status`, leave it alone. Do not "tidy up" by committing it.

### Rule 6 — Named-file staging only

Claude must always stage files by name:

```bash
git add path/to/file1 path/to/file2 ...
```

Never use `git add .`, `git add -A`, or `git add -u` unless the user explicitly authorizes it for a specific commit. Named-file staging is the only safe default — it prevents accidentally committing secrets, large binaries, or cache files.

### Rule 7 — Two-push verification

After every commit, Claude must always recommend (and run, when authorized):

```bash
git push origin main
git push origin main   # second push must return "Everything up-to-date"
```

The second push is non-negotiable. Without it, there is no proof the first push reached the remote. If the second push reports new objects pushed, the first push did not finalize — investigate the cause before continuing.

### Rule 8 — Final state must be clean

After the save sequence, Claude must run `git status` and confirm:

```
nothing to commit, working tree clean
```

Caveat: `tsconfig.tsbuildinfo` may legitimately remain modified after a `tsc --noEmit` or `next build`. That single file alone in `git status` is acceptable; everything else is not. If anything else is dirty, the phase is **incomplete** until resolved.

### Rule 9 — Migration ordering must be stated

When a phase creates a new migration, Claude must state explicitly which order to apply it:

- **Apply migration before deploy** (default; safest — code referencing the new schema gets a real schema to read)
- **Deploy before migration** (only when explicitly safer — e.g. when the new code gracefully degrades against an old schema)

In addition, Claude must provide a Supabase SQL verification query the operator can paste into the SQL Editor to confirm the migration landed. Examples:

```sql
-- Verify a new column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = '<table>' AND column_name = '<column>';

-- Verify a new view exists
SELECT viewname FROM pg_views WHERE viewname = '<view_name>';

-- Verify a new index exists
SELECT indexname FROM pg_indexes WHERE indexname = '<index_name>';
```

Without the verification query, the migration is "applied on a hope" — not acceptable.

### Rule 10 — Production-behavior changes require a smoke-test checklist

If a phase changes any production behavior (a new route, an existing route's response shape, a UI surface, a redirect, a webhook auth path, etc.), Claude must include a **smoke-test checklist** in the final report. The next phase cannot be considered safe to start until that checklist has been completed against prod (or until the user explicitly authorizes proceeding without it).

Smoke-test checklist format:

```
- [ ] Open <URL> while signed in as admin
- [ ] Confirm <observable behavior>
- [ ] Verify <DB row appeared / response shape / UI element>
- [ ] Verify no errors in browser console / Vercel logs
```

If the phase is purely additive (a new lib module with no UI) and has no production-observable impact, state explicitly: "No smoke test required — this phase has no production-observable surface."

---

## A. Startup Prompt

```
You are continuing work on the VortexTrips AI Command Center.

Before you do anything else, read these files in order:
1. PROJECT_STATE_CURRENT.md
2. BUILD_PROGRESS.md
3. SAVE_PROTOCOL.md
4. The most recent CHAT_CONTINUATION_*.md

Apply the rules in CLAUDE_SESSION_SKILL.md for this entire session.

After reading, summarize in three lines:
- The last completed phase
- The current blocker (if any)
- The exact next action

Do not start any new phase or modify code until I confirm.
```

## B. Shutdown Prompt

```
We are ending this session.

Before you stop:
1. Confirm all work this session is committed.
2. Run git status and verify it is clean.
3. Run git push origin main twice — the second push must show "Everything up-to-date".
4. Update PROJECT_STATE_CURRENT.md with the new last-known-good commit hash.
5. Update BUILD_PROGRESS.md to reflect any phase changes.
6. Write a new CHAT_CONTINUATION_<today's date>.md summarizing:
   - What was done this session
   - What is committed and pushed
   - What remains
   - The exact prompt to use to start the next session

Then output only:
- Files updated this session
- Final commit hash on origin/main
- The exact next-session startup prompt

Do not output anything else.
```

## C. Recovery Prompt (if session crashes)

```
The previous Claude session crashed or was reset.

Do not assume any prior context. Treat chat history as untrusted.

1. Read CLAUDE_SESSION_SKILL.md fully and obey it.
2. Read PROJECT_STATE_CURRENT.md, BUILD_PROGRESS.md, SAVE_PROTOCOL.md, and the most recent CHAT_CONTINUATION_*.md.
3. Run git status to inspect the working tree.
4. Run git log -10 to inspect the last ten commits.

Then output a recovery report:
- Last commit hash on origin/main
- Last completed phase per the markdown files
- Whether the working tree is clean or has uncommitted changes
- Files changed since the last commit (if any)
- The exact next action recommended by the markdown files

Do not modify any files until I confirm the recovery report and authorize the next step.
```
