# Image Upload Rules — VortexTrips

**Created:** 2026-04-28
**Reason:** Previous Claude chat froze because images larger than 2000px on the long edge were pasted/dragged into the chat. Oversized images also bloat the app's storage, slow page loads, and can crash mobile browsers.

---

## The rule

**Maximum dimension: 2000px on the longest side.**
**Maximum file size: 5 MB.**
**Allowed types: JPEG, PNG, WebP.**

This applies to:
- Screenshots pasted into Claude chats
- Images uploaded through the dashboard (avatars, content calendar attachments, etc.)
- Anything dragged into the project repo

---

## Why 2000px?

- Claude Code's tooling and the Anthropic API choke on images that exceed roughly that envelope when combined with a long conversation. The previous session crashed with no way to recover.
- 2000px is more than enough resolution for product/marketing screenshots — most modern displays render at ≤2560px wide and downscale.
- A 2000×1125 PNG is typically <1.5 MB. A 4000×2250 PNG can hit 8 MB+.

---

## How to enforce — three layers

### Layer 1: Before you paste into Claude

If you're about to drop a screenshot, check:
- macOS: open in Preview → Tools → Adjust Size → cap at 2000px
- Windows: open in Photos → Resize → Custom dimensions → cap at 2000px
- Or run the helper script: `node scripts/resize-images.js <folder>` (see below)

### Layer 2: Runtime guard inside the app

`src/lib/image-safety.ts` exports `validateImage()` which checks:
- File size ≤ 5 MB
- Dimensions ≤ 2000 × 2000
- MIME type in the allowed list

Call it on any upload route before persisting to Supabase Storage or sending to a downstream service.

```ts
import { validateImage } from '@/lib/image-safety'

const result = await validateImage(file)
if (!result.ok) {
  return NextResponse.json({ error: result.reason }, { status: 400 })
}
```

### Layer 3: Local batch resize

`scripts/resize-images.js` walks a folder and resizes anything over the cap in place (writes a `.resized.jpg` next to the original). Useful for prepping a batch of screenshots before pasting.

```bash
# one-time setup
npm install --no-save sharp

# resize everything in ./screenshots
node scripts/resize-images.js ./screenshots
```

The script never deletes originals. Review the resized output, then delete the originals manually if you want to.

---

## Hard nos

- Do not commit images >2000px to the repo.
- Do not bypass `validateImage()` in upload routes.
- Do not paste 4K screenshots into Claude. If a previous session froze, it was almost certainly this.
