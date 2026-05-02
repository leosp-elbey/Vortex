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
