// Phase 19.1C — deterministic caption post-processor.
//
// THE KEYSTONE of the Phase 19.1 caption overhaul. Every caption generator
// (the weekly cron on a cheap model, the dashboard route on gpt-4o, and the
// social-pack path) is instructed by SOCIAL_SYSTEM to include the
// vortextrips.com/free link and to keep hashtags to at most 2 — but model
// compliance is never guaranteed, especially on the cheap cron model. This
// module enforces both rules deterministically at generation time, so every
// row written to content_calendar is correct regardless of what the model
// actually returned.
//
// Pure functions: no I/O, no side effects, no mutation of the inputs. Run
// enforceCaptionRules on each post immediately before it is inserted into
// content_calendar.

/** CTA line appended when a caption carries no vortextrips.com reference. */
const APPENDED_LINK = '\n\n👉 vortextrips.com/free'

export interface EnforcedCaption {
  caption: string
  hashtags: string[]
}

/**
 * Enforce the two non-negotiable caption rules:
 *
 *  a. LINK — every caption must reference vortextrips.com. If the caption
 *     contains no 'vortextrips.com' substring at all (case-insensitive), a
 *     CTA line pointing at vortextrips.com/free is appended. If it already
 *     contains any 'vortextrips.com' reference — with a path, without one,
 *     or with a different path — the caption is left untouched: we never
 *     rewrite an existing valid link.
 *
 *  b. HASHTAGS — hard-cap to the first 2 elements and strip any leading
 *     '#' so storage stays consistent with the content_calendar schema
 *     (hashtags are stored WITHOUT the '#' prefix; the autoposter prepends
 *     it at publish time). Empty entries are dropped so no stray '#' lands
 *     in the published post.
 *
 * Pure function: returns a new pair, never mutates the arguments.
 */
export function enforceCaptionRules(
  caption: string,
  hashtags: string[],
): EnforcedCaption {
  const safeCaption = typeof caption === 'string' ? caption : ''
  const hasLink = safeCaption.toLowerCase().includes('vortextrips.com')
  const enforcedCaption = hasLink
    ? safeCaption
    : `${safeCaption.trimEnd()}${APPENDED_LINK}`

  const safeHashtags = Array.isArray(hashtags) ? hashtags : []
  const enforcedHashtags = safeHashtags
    .slice(0, 2)
    .map(h => (typeof h === 'string' ? h.trim().replace(/^#+/, '').trim() : ''))
    .filter(h => h.length > 0)

  return { caption: enforcedCaption, hashtags: enforcedHashtags }
}
