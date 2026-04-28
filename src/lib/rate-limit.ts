// Simple in-memory rate limiter, keyed by IP (or any string).
// Note: state resets when a Vercel function instance cold-starts. This deters volume
// attacks against a warm function but does NOT enforce a global per-IP cap across
// all instances. For stronger guarantees use Upstash KV or a Supabase-backed counter.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const MAX_BUCKETS = 10_000
function maybeEvict() {
  if (buckets.size <= MAX_BUCKETS) return
  const now = Date.now()
  for (const [k, v] of buckets) {
    if (v.resetAt < now) buckets.delete(k)
  }
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    maybeEvict()
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt }
  }

  existing.count += 1
  return { ok: true, remaining: limit - existing.count, resetAt: existing.resetAt }
}

export function clientIpFrom(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}
