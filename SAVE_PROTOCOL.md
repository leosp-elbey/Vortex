# Save Protocol — VortexTrips

**Created:** 2026-04-28
**Rule status:** MANDATORY after every phase or meaningful change.

---

## The rule

**No phase is complete until all four of these are done:**

1. `PROJECT_STATE_CURRENT.md` is updated
2. `BUILD_PROGRESS.md` is updated
3. The work is committed
4. `git push origin main` confirms `Everything up-to-date`

If you skip any step, treat the phase as **incomplete** and do not move on.

---

## Why this exists

- The previous Claude chat froze before saving, and we lost track of what was actually shipped vs. planned. Two source-of-truth files (`PROJECT_STATE_CURRENT.md` for narrative state, `BUILD_PROGRESS.md` for the checklist) plus a remote git push give us three independent recovery points.
- Memory and conversation context are not durable. Files in the repo + commits on GitHub are.

---

## Workflow — run after every phase

### 1. Update `PROJECT_STATE_CURRENT.md`

Edit it to reflect:
- Current completed phase
- Last known good commit hash (will fill in after commit; placeholder OK)
- Files created/edited in this phase
- What is working
- What is still pending
- Known issues
- Exact next step

### 2. Update `BUILD_PROGRESS.md`

Flip the phase checkbox to `[x]`. Add any sub-tasks you knocked out. Move "Current focus" to the next phase.

### 3. Save status

```bash
git status
```

You should see only the files you intended to change. If anything unexpected appears, investigate before continuing.

### 4. Stage everything

```bash
git add .
```

(Or stage specific files by name if you want to be surgical — preferred when secrets or large binaries might be in the working tree.)

### 5. Commit with a clear message

```bash
git commit -m "Phase N: short description of what shipped"
```

Commit-message conventions:
- Start with the phase number (e.g. `Phase 6:`, `Phase 10.5:`)
- Then a short imperative summary
- Body (optional) lists files touched and why

### 6. Push to GitHub

```bash
git push origin main
```

### 7. Confirm

Run again:

```bash
git push origin main
```

You **must** see `Everything up-to-date` before considering the phase saved. If it pushes anything new, your previous push didn't finalize — figure out why before moving on.

### 8. (Optional) Update the commit hash in `PROJECT_STATE_CURRENT.md`

Now that the commit exists, edit `PROJECT_STATE_CURRENT.md`'s "Last known good commit" line to the real hash, then commit + push that one-line change. This is a small follow-up and is OK as its own commit.

---

## Cheat-sheet

```bash
# After updating PROJECT_STATE_CURRENT.md and BUILD_PROGRESS.md:
git status
git add .
git commit -m "Phase N: <what shipped>"
git push origin main
git push origin main   # confirm "Everything up-to-date"
```

---

## What NOT to do

- Do not skip the MD updates "to save time" — that's exactly how the last session was lost.
- Do not amend or force-push to `main`. New work = new commits.
- Do not commit `.env`, `.env.local`, screenshots >2000px, or any oversized binaries. See `IMAGE_UPLOAD_RULES.md`.
- Do not begin the next phase until step 7 confirms `Everything up-to-date`.
