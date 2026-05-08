// Phase 14AB — Shared `bounded()` helper for hang-resistant awaits.
//
// Originally written in Phase 14Y for `src/app/t/[slug]/route.ts` to fix a
// production hang when Supabase was 522'd. The bug there generalizes:
// ANY route that awaits an external service (Supabase, Resend, Bland, etc.)
// without bounding the await time can eat Vercel's 10s function-execution
// budget when the upstream is slow / unavailable.
//
// Phase 14AB extracted the helper into this shared module so the same
// hang-resistance can be applied uniformly across the codebase. The first
// adopters beyond /t/[slug] are the webhook receiving routes
// (/api/webhooks/lead-created, /api/webhooks/bland), where external
// providers (GoHighLevel, Bland.ai) expect fast 200/500 responses and
// will retry / blacklist a slow endpoint.
//
// Design contract:
//   - `bounded(work, ms, label, logPrefix?)` races a thenable against a
//     fixed timeout.
//   - Returns the resolved value of `work` if it completes within `ms`.
//   - Returns `null` on timeout.
//   - Returns `null` on rejection (caught + logged via `console.error`).
//   - **Never throws** to the caller. Callers can rely on a `T | null`
//     contract and decide what to do on null (return early, fall through,
//     log warning, etc.).
//   - Cleans up the timer in `finally` so we don't leak a setTimeout
//     handle when work resolves first.
//
// Why this isn't `Promise.race(work, timeout)` directly:
//   - Plain Promise.race would propagate `work`'s rejection to the caller.
//     We catch it here so callers don't need their own try/catch around
//     every bounded() call.
//   - Plain setTimeout won't be cancelled when work resolves first; over
//     a long-running route this could leak handles.
//
// Logging:
//   - Timeouts log via `console.warn` so they show up in Vercel logs but
//     don't get treated as errors (timeouts are expected operational state
//     during upstream outages).
//   - Rejections log via `console.error` (genuine errors).
//   - Every log carries the caller-supplied `label` for grep-ability.
//   - `logPrefix` defaults to `[bounded-wait]`; callers like /t/[slug] pass
//     `[branded-redirect]` to keep their existing log format.

/**
 * Race any thenable against a fixed timeout. Returns the resolved value or
 * `null` on timeout/rejection. Never throws.
 *
 * @param work A Promise or thenable (Supabase query builders qualify).
 * @param ms Hard ceiling on how long to wait, in milliseconds.
 * @param label Short human-readable description (e.g. "campaign lookup")
 *              that flows into log messages for grep-ability.
 * @param logPrefix Bracketed tag prepended to every log line. Defaults to
 *              `[bounded-wait]`. Pass `[branded-redirect]`, `[lead-created]`,
 *              etc. to keep route-specific log streams clean.
 */
export async function bounded<T>(
  work: PromiseLike<T>,
  ms: number,
  label: string,
  logPrefix = '[bounded-wait]',
): Promise<T | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    const timeoutPromise = new Promise<null>(resolve => {
      timeoutHandle = setTimeout(() => {
        console.warn(`${logPrefix} ${label} timed out after ${ms}ms — falling through`)
        resolve(null)
      }, ms)
    })
    // Wrap the thenable so a rejection becomes a `null` result rather than
    // a Promise.race rejection. Lets callers degrade gracefully on ANY
    // upstream failure mode (timeout, 5xx, malformed response, etc.).
    const safeWork = Promise.resolve(work).catch(err => {
      console.error(`${logPrefix} ${label} threw:`, err)
      return null as T | null
    })
    return await Promise.race([safeWork, timeoutPromise])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

/**
 * Convenience constant for routes that handle external webhooks. Both
 * `/api/webhooks/lead-created` and `/api/webhooks/bland` use this budget
 * per the Phase 14AB operator directive: "Set the bounds to 2500 ms for
 * these routes." Webhook senders (GoHighLevel, Bland.ai) typically retry
 * or blacklist endpoints that exceed 5-10 seconds; 2.5s per Supabase call
 * keeps even a multi-call route well within that window for any single
 * call's worst case.
 */
export const WEBHOOK_BOUND_MS = 2500
