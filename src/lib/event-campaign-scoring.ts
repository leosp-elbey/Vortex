// Event campaign scoring — Phase 14C.
// Implements the 10-dimension rubric defined in VORTEX_EVENT_CAMPAIGN_SKILL.md §9.
//
// Each dimension is scored against its max weight and summed for a 1-100 total.
// The function is deterministic and pure — given the same inputs it always returns
// the same score. It does not call any external APIs, hit the database, or read
// process.env. The Phase 14C generator passes a ScoringInputs object derived from
// event-seeds.json plus a `daysUntilEvent` it computes for the upcoming occurrence.
//
// Dimension weights (sum = 100):
//   1. travel_demand           15
//   2. hotel_pressure          12
//   3. group_travel            10
//   4. buying_intent           12
//   5. social_potential        10
//   6. commission_potential    12
//   7. urgency                  8
//   8. competition_level        6  (inverse — higher competition lowers score)
//   9. addon_opportunity        8
//  10. repeatability            7
// -------------------------------------
//                            = 100

export type Tri = 'low' | 'medium' | 'high'
export type GroupSize = 'solo' | 'couple' | 'family' | 'group'
export type AddonOpportunity = 'none' | 'hotel' | 'cruise' | 'flight' | 'multi'

export interface ScoringInputs {
  /** Estimated event attendance (0 if not an attendance event, e.g. evergreen wedding/reunion). */
  estimated_attendance: number
  /** How tight the hotel market gets around the event window. */
  hotel_inventory_pressure: Tri
  /** Typical traveling unit. */
  typical_group_size: GroupSize
  /** How likely the audience converts to actual paid travel. */
  buying_intent: Tri
  /** How visually shareable the event is on social. */
  visual_appeal: Tri
  /** Approximate full-trip value per traveler in USD (used for commission proxy). */
  average_trip_value_usd: number
  /** Days from booking to travel that the average buyer waits — smaller = more urgent. */
  urgency_baseline_days: number
  /** How crowded the affiliate / influencer market already is around this event. */
  competition_level: Tri
  /** What kind of multi-product upsell is realistic. */
  addon_opportunity: AddonOpportunity
  /** Will the event recur next year so we can harvest the audience again? */
  annual_recurrence: boolean
}

export interface ScoringContext {
  /** Days from "now" to the next occurrence of the event. Used by the urgency dimension. */
  daysUntilEvent: number
}

export interface ScoringBreakdown {
  travel_demand: number
  hotel_pressure: number
  group_travel: number
  buying_intent: number
  social_potential: number
  commission_potential: number
  urgency: number
  competition_level: number
  addon_opportunity: number
  repeatability: number
}

export interface ScoringResult {
  score: number
  breakdown: ScoringBreakdown
}

const MAX = {
  travel_demand: 15,
  hotel_pressure: 12,
  group_travel: 10,
  buying_intent: 12,
  social_potential: 10,
  commission_potential: 12,
  urgency: 8,
  competition_level: 6,
  addon_opportunity: 8,
  repeatability: 7,
} as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function triFraction(level: Tri): number {
  if (level === 'high') return 1
  if (level === 'medium') return 0.66
  return 0.33
}

function scoreTravelDemand(attendance: number): number {
  // Evergreen events (reunions, weddings) carry attendance=0 — give them a steady mid-band
  // (8/15) since the audience exists year-round even without a single peak.
  if (attendance <= 0) return Math.round(MAX.travel_demand * 0.55)
  // Log-scale: 1k → ~6, 10k → ~9, 100k → ~12, 1M+ → 15.
  const score = Math.log10(attendance + 1) * 2.5
  return Math.round(clamp(score, 0, MAX.travel_demand))
}

function scoreHotelPressure(level: Tri): number {
  return Math.round(MAX.hotel_pressure * triFraction(level))
}

function scoreGroupTravel(size: GroupSize): number {
  if (size === 'group') return MAX.group_travel
  if (size === 'family') return Math.round(MAX.group_travel * 0.85)
  if (size === 'couple') return Math.round(MAX.group_travel * 0.5)
  return Math.round(MAX.group_travel * 0.3)
}

function scoreBuyingIntent(level: Tri): number {
  return Math.round(MAX.buying_intent * triFraction(level))
}

function scoreSocialPotential(level: Tri): number {
  return Math.round(MAX.social_potential * triFraction(level))
}

function scoreCommissionPotential(tripValueUsd: number): number {
  // Anchor: $1k trip → 5/12, $2.5k → ~9, $5k+ → 12.
  if (tripValueUsd <= 0) return Math.round(MAX.commission_potential * 0.5)
  const score = (tripValueUsd / 5000) * MAX.commission_potential
  return Math.round(clamp(score, 0, MAX.commission_potential))
}

/**
 * Urgency score blends two signals:
 *   - The event's own urgency baseline (shorter booking windows = more urgent overall)
 *   - How close the next occurrence actually is right now
 * Both contribute additively, so a long-booking event becomes urgent only as the date approaches.
 */
function scoreUrgency(baselineDays: number, daysUntilEvent: number): number {
  // Baseline: 14 days → ~4/8 (always somewhat urgent), 180 days → ~1/8.
  const baselineComponent = clamp(MAX.urgency * 0.5 * (1 - baselineDays / 240), 0, MAX.urgency * 0.5)
  // Live proximity: ≤30 days → 4/8 (max), 90 days → ~2.7, 180+ → ~1.
  const proximityComponent = clamp(MAX.urgency * 0.5 * (1 - daysUntilEvent / 240), 0, MAX.urgency * 0.5)
  return Math.round(baselineComponent + proximityComponent)
}

function scoreCompetition(level: Tri): number {
  // Inverse weighting: low competition = full points, high competition = small points.
  if (level === 'low') return MAX.competition_level
  if (level === 'medium') return Math.round(MAX.competition_level * 0.6)
  return Math.round(MAX.competition_level * 0.25)
}

function scoreAddon(opportunity: AddonOpportunity): number {
  if (opportunity === 'multi') return MAX.addon_opportunity
  if (opportunity === 'cruise') return Math.round(MAX.addon_opportunity * 0.85)
  if (opportunity === 'flight') return Math.round(MAX.addon_opportunity * 0.7)
  if (opportunity === 'hotel') return Math.round(MAX.addon_opportunity * 0.55)
  return 0
}

function scoreRepeatability(annual: boolean): number {
  return annual ? MAX.repeatability : Math.round(MAX.repeatability * 0.4)
}

/**
 * Score an event candidate against the 10-dimension rubric.
 * Always returns a clamped 1-100 total plus the per-dimension breakdown.
 */
export function scoreEventCampaign(inputs: ScoringInputs, context: ScoringContext): ScoringResult {
  const breakdown: ScoringBreakdown = {
    travel_demand: scoreTravelDemand(inputs.estimated_attendance),
    hotel_pressure: scoreHotelPressure(inputs.hotel_inventory_pressure),
    group_travel: scoreGroupTravel(inputs.typical_group_size),
    buying_intent: scoreBuyingIntent(inputs.buying_intent),
    social_potential: scoreSocialPotential(inputs.visual_appeal),
    commission_potential: scoreCommissionPotential(inputs.average_trip_value_usd),
    urgency: scoreUrgency(inputs.urgency_baseline_days, context.daysUntilEvent),
    competition_level: scoreCompetition(inputs.competition_level),
    addon_opportunity: scoreAddon(inputs.addon_opportunity),
    repeatability: scoreRepeatability(inputs.annual_recurrence),
  }

  const total =
    breakdown.travel_demand +
    breakdown.hotel_pressure +
    breakdown.group_travel +
    breakdown.buying_intent +
    breakdown.social_potential +
    breakdown.commission_potential +
    breakdown.urgency +
    breakdown.competition_level +
    breakdown.addon_opportunity +
    breakdown.repeatability

  return { score: clamp(Math.round(total), 1, 100), breakdown }
}

export const SCORING_DIMENSION_MAX = MAX
