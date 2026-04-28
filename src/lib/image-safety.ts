/**
 * Image safety guard. Enforces the 2000px / 5 MB / allowed-MIME rule
 * documented in IMAGE_UPLOAD_RULES.md. Call validateImage() on any
 * upload route before persisting or forwarding the file.
 *
 * Runs in browser AND server contexts (uses Web APIs only).
 */

export const IMAGE_SAFETY = {
  MAX_DIMENSION_PX: 2000,
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
} as const

export type AllowedMimeType = (typeof IMAGE_SAFETY.ALLOWED_MIME_TYPES)[number]

export type ImageValidationResult =
  | { ok: true; width: number; height: number; sizeBytes: number; mime: AllowedMimeType }
  | { ok: false; reason: string }

/**
 * Validate an uploaded image File / Blob against the safety limits.
 * Returns { ok: true, ...info } on success, { ok: false, reason } on failure.
 */
export async function validateImage(file: File | Blob): Promise<ImageValidationResult> {
  const mime = (file as File).type || ''

  if (!IMAGE_SAFETY.ALLOWED_MIME_TYPES.includes(mime as AllowedMimeType)) {
    return {
      ok: false,
      reason: `Unsupported image type "${mime || 'unknown'}". Allowed: ${IMAGE_SAFETY.ALLOWED_MIME_TYPES.join(', ')}.`,
    }
  }

  if (file.size > IMAGE_SAFETY.MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return {
      ok: false,
      reason: `Image is ${mb} MB; maximum allowed is ${IMAGE_SAFETY.MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`,
    }
  }

  const dims = await readImageDimensions(file)
  if (!dims) {
    return { ok: false, reason: 'Could not read image dimensions. File may be corrupt.' }
  }

  if (dims.width > IMAGE_SAFETY.MAX_DIMENSION_PX || dims.height > IMAGE_SAFETY.MAX_DIMENSION_PX) {
    return {
      ok: false,
      reason: `Image is ${dims.width}×${dims.height}px; maximum is ${IMAGE_SAFETY.MAX_DIMENSION_PX}px on the longest side. Resize before uploading.`,
    }
  }

  return {
    ok: true,
    width: dims.width,
    height: dims.height,
    sizeBytes: file.size,
    mime: mime as AllowedMimeType,
  }
}

/**
 * Read width/height from a JPEG/PNG/WebP without third-party deps.
 * Parses the file headers directly so it works on Node 20+ (Next route
 * handlers) and modern browsers without needing `sharp` or `<img>`.
 */
async function readImageDimensions(
  file: File | Blob
): Promise<{ width: number; height: number } | null> {
  const buf = new Uint8Array(await file.arrayBuffer())

  if (isPng(buf)) return readPngDimensions(buf)
  if (isJpeg(buf)) return readJpegDimensions(buf)
  if (isWebp(buf)) return readWebpDimensions(buf)
  return null
}

function isPng(b: Uint8Array): boolean {
  return (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
}

function isJpeg(b: Uint8Array): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
}

function isWebp(b: Uint8Array): boolean {
  return (
    b.length >= 12 &&
    b[0] === 0x52 && // R
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x46 && // F
    b[8] === 0x57 && // W
    b[9] === 0x45 && // E
    b[10] === 0x42 && // B
    b[11] === 0x50 // P
  )
}

function readPngDimensions(b: Uint8Array): { width: number; height: number } | null {
  // PNG: width = bytes 16..19, height = bytes 20..23 (big-endian)
  if (b.length < 24) return null
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return { width: dv.getUint32(16), height: dv.getUint32(20) }
}

function readJpegDimensions(b: Uint8Array): { width: number; height: number } | null {
  // Walk JPEG segments looking for SOF0..SOF15 (excluding 0xC4, 0xC8, 0xCC).
  let i = 2
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  while (i < b.length) {
    if (b[i] !== 0xff) return null
    let marker = b[i + 1]
    while (marker === 0xff && i + 1 < b.length) {
      i++
      marker = b[i + 1]
    }
    i += 2
    const isSOF =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    if (isSOF) {
      if (i + 7 > b.length) return null
      const height = dv.getUint16(i + 3)
      const width = dv.getUint16(i + 5)
      return { width, height }
    }
    if (i + 2 > b.length) return null
    const segLen = dv.getUint16(i)
    if (segLen < 2) return null
    i += segLen
  }
  return null
}

function readWebpDimensions(b: Uint8Array): { width: number; height: number } | null {
  // VP8X (extended), VP8L (lossless), VP8 (lossy) — handle the three common forms.
  if (b.length < 30) return null
  const fourCC = String.fromCharCode(b[12], b[13], b[14], b[15])
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)

  if (fourCC === 'VP8X') {
    const w = 1 + (dv.getUint8(24) | (dv.getUint8(25) << 8) | (dv.getUint8(26) << 16))
    const h = 1 + (dv.getUint8(27) | (dv.getUint8(28) << 8) | (dv.getUint8(29) << 16))
    return { width: w, height: h }
  }
  if (fourCC === 'VP8L') {
    const b0 = dv.getUint8(21)
    const b1 = dv.getUint8(22)
    const b2 = dv.getUint8(23)
    const b3 = dv.getUint8(24)
    const w = 1 + (((b1 & 0x3f) << 8) | b0)
    const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    return { width: w, height: h }
  }
  if (fourCC === 'VP8 ') {
    if (b.length < 30) return null
    const w = dv.getUint16(26, true) & 0x3fff
    const h = dv.getUint16(28, true) & 0x3fff
    return { width: w, height: h }
  }
  return null
}
