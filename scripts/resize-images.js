#!/usr/bin/env node
/**
 * Local utility — resize any image in a folder that exceeds 2000px
 * on the longest side. Originals are preserved; the resized copy is
 * written next to the original with a `.resized.jpg` suffix.
 *
 * Usage:
 *   npm install --no-save sharp
 *   node scripts/resize-images.js ./path/to/folder
 *
 * Why this exists: see IMAGE_UPLOAD_RULES.md. The previous Claude
 * session froze on oversized screenshots; this script preps a batch
 * before pasting.
 */

const path = require('path')
const fs = require('fs')

const MAX_DIMENSION_PX = 2000
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])

async function main() {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: node scripts/resize-images.js <folder>')
    process.exit(1)
  }

  const absTarget = path.resolve(target)
  if (!fs.existsSync(absTarget) || !fs.statSync(absTarget).isDirectory()) {
    console.error(`Not a directory: ${absTarget}`)
    process.exit(1)
  }

  let sharp
  try {
    sharp = require('sharp')
  } catch {
    console.error('Missing dependency `sharp`. Install it with:')
    console.error('  npm install --no-save sharp')
    process.exit(1)
  }

  const files = fs
    .readdirSync(absTarget)
    .filter((f) => ALLOWED_EXT.has(path.extname(f).toLowerCase()))
    .filter((f) => !f.includes('.resized.'))

  if (files.length === 0) {
    console.log(`No images found in ${absTarget}`)
    return
  }

  console.log(`Scanning ${files.length} image(s) in ${absTarget}`)
  let resized = 0
  let skipped = 0

  for (const f of files) {
    const src = path.join(absTarget, f)
    const meta = await sharp(src).metadata()
    const longest = Math.max(meta.width || 0, meta.height || 0)

    if (longest <= MAX_DIMENSION_PX) {
      skipped++
      continue
    }

    const base = path.basename(f, path.extname(f))
    const out = path.join(absTarget, `${base}.resized.jpg`)
    await sharp(src)
      .resize({
        width: MAX_DIMENSION_PX,
        height: MAX_DIMENSION_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toFile(out)
    console.log(`  resized: ${f} (${meta.width}x${meta.height}) -> ${path.basename(out)}`)
    resized++
  }

  console.log(`Done. Resized: ${resized}, skipped (already small enough): ${skipped}`)
  console.log('Originals were not deleted. Review the .resized.jpg files, then remove originals manually if desired.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
