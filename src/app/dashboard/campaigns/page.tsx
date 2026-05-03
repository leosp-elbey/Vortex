'use client'

// Phase 14E — Dashboard Campaign Planner.
// Lists event_campaigns rows, lets an admin filter and drill in, generate the
// asset bundle for a campaign, and approve/reject individual campaign_assets
// drafts. Strictly a human-approval surface — does not push to content_calendar.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDate, formatDateTime, getStatusColor } from '@/lib/utils'
import { useToast, Toaster } from '@/components/ui/toast'
import { buildPlatformGuidanceLine, getSocialSpec } from '@/lib/social-specs'

const STATUS_OPTIONS = ['', 'idea', 'draft', 'approved', 'scheduled', 'active', 'archived'] as const

const ASSET_TYPE_LABELS: Record<string, string> = {
  social_post: 'Social Posts',
  short_form_script: 'Short-Form Video Scripts',
  email_subject: 'Email Subjects',
  email_body: 'Email Bodies',
  dm_reply: 'DM Replies',
  hashtag_set: 'Hashtag Sets',
  image_prompt: 'Image Prompts',
  video_prompt: 'Video Prompts',
  landing_headline: 'Landing Headlines',
  lead_magnet: 'Lead Magnets',
}

// Helper text shown under media-related asset groups so operators understand the
// asset is a *prompt*, not a finished image/video. Actual media is produced in a
// later phase when assets are pushed to the content calendar (Pexels / OpenAI image
// gen / HeyGen). Leaving this null/undefined means no helper text for that group.
const ASSET_TYPE_HELPER_TEXT: Record<string, string | undefined> = {
  image_prompt:
    'These are image generation/fetch instructions. Actual images are created later when assets are pushed to the content calendar.',
  video_prompt:
    'These are video generation instructions. Actual videos are created later through the video workflow.',
}

const ASSET_TYPE_ORDER = [
  'social_post',
  'short_form_script',
  'email_subject',
  'email_body',
  'dm_reply',
  'hashtag_set',
  'image_prompt',
  'video_prompt',
  'landing_headline',
  'lead_magnet',
]

// Phase 14E timeout patch — Vercel Hobby caps function execution at 10s, and a single
// monolithic LLM call for the full ~33-asset bundle (Sonnet 4.6 + Claude verifier) blows
// past that. The dashboard splits generation into 4 sequential batches against the cheap
// model with the verifier skipped. Each call carries asset_types so the API only generates
// — and only dedup-blocks — the requested slice. See SYSTEM_AUDIT_PHASE_14_STATUS.md.
const GENERATION_BATCHES: Array<{ label: string; types: string[] }> = [
  { label: 'Social posts', types: ['social_post'] },
  { label: 'Scripts & emails', types: ['short_form_script', 'email_subject', 'email_body'] },
  { label: 'DMs & hashtags', types: ['dm_reply', 'hashtag_set'] },
  { label: 'Prompts, headline & lead magnet', types: ['image_prompt', 'video_prompt', 'landing_headline', 'lead_magnet'] },
]
const BATCH_MODEL_OVERRIDE = 'meta-llama/llama-3.3-70b-instruct'

// Phase 14F — Push to Calendar.
// Today the existing content_calendar.platform CHECK only accepts the four social
// platforms below, so only `social_post` assets carrying one of them can land on the
// calendar. Email / DM / headline / lead-magnet / hashtag-set / image-prompt /
// video-prompt assets are explicitly out of scope until a future phase reshapes
// content_calendar (or introduces a separate planning table). The route enforces this
// server-side; the dashboard mirrors the rule so the operator only sees the Push button
// where it will actually work.
const CALENDAR_PUSHABLE_ASSET_TYPES = new Set(['social_post'])
const CALENDAR_PLATFORMS = new Set(['instagram', 'facebook', 'tiktok', 'twitter'])

interface CampaignListRow {
  id: string
  campaign_name: string
  event_name: string
  event_year: number
  destination_city: string
  destination_country: string | null
  destination_region: string | null
  categories: string[] | null
  score: number | null
  score_updated_at: string | null
  status: string
  is_cruise: boolean | null
  event_start_date: string | null
  event_end_date: string | null
  created_at: string
  updated_at: string
  asset_counts: Record<string, number>
}

interface CampaignDetail {
  id: string
  campaign_name: string
  event_name: string
  event_year: number
  destination_city: string
  destination_country: string | null
  destination_region: string | null
  categories: string[] | null
  audience: string[] | null
  score: number | null
  score_updated_at: string | null
  status: string
  is_cruise: boolean | null
  departure_city: string | null
  cruise_line: string | null
  event_start_date: string | null
  event_end_date: string | null
  travel_window_start: string | null
  travel_window_end: string | null
  hotel_angle: string | null
  cruise_angle: string | null
  flight_angle: string | null
  group_travel_angle: string | null
  lead_magnet_idea: string | null
  landing_page_headline: string | null
  cta_text: string | null
  cta_url: string | null
  tracking_url_template: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface AssetRow {
  id: string
  campaign_id: string
  asset_type: string
  wave: string | null
  platform: string | null
  body: string | null
  image_url?: string | null
  video_url?: string | null
  content_calendar_id?: string | null
  tracking_url?: string | null
  hashtags: string[] | null
  status: string
  scheduled_for: string | null
  posted_at: string | null
  post_url: string | null
  requires_human_approval: boolean
  approved_at: string | null
  approved_by: string | null
  generation_metadata: Record<string, unknown> | null
  verification_metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface ScoreRow {
  id: string
  scored_at: string
  week_of: string | null
  score: number
  breakdown: Record<string, number> | null
  generated_by: string
  model_used: string | null
  notes: string | null
}

interface DetailResponse {
  ok: boolean
  campaign: CampaignDetail
  assets: AssetRow[]
  asset_counts: Record<string, number>
  latest_score: ScoreRow | null
}

// Phase 14H — performance / attribution panel.
interface BreakdownEntry { asset_count: number; approved_count: number; posted_count: number }
interface AttributionRollup {
  campaign_id: string
  asset_count: number
  approved_asset_count: number
  calendar_row_count: number
  posted_count: number
  latest_posted_at: string | null
  lead_count: number
  member_count: number
  click_count: number
  click_to_lead_rate: number | null
  lead_to_conversion_rate: number | null
  latest_activity_at: string | null
  first_lead_at: string | null
  performance_score: number
  by_platform: Record<string, BreakdownEntry>
  by_wave: Record<string, BreakdownEntry>
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', category: '', minScore: '', q: '' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number; label: string } | null>(null)
  const [actionInFlight, setActionInFlight] = useState<string | null>(null)
  // Local-only set of asset IDs that have been pushed to content_calendar this session.
  // The campaign-detail API does not return campaign_assets.content_calendar_id today, so
  // this client-side set is what powers the "Added to Calendar" badge between page loads.
  // After a successful push we add the id; the same badge will also render whenever the
  // API starts returning content_calendar_id without further dashboard changes.
  const [pushedAssetIds, setPushedAssetIds] = useState<Set<string>>(new Set())
  // Phase 14H.1 — session-local map of assetId → resolved tracking URL captured
  // from the push-to-calendar response. The campaign-detail API does not yet
  // return campaign_assets.tracking_url, so this is what powers the "Tracking
  // URL ready" affordance between page loads. Same forward-compat pattern as
  // pushedAssetIds: when the API later returns tracking_url, the AssetCard
  // already reads asset.tracking_url too and the badge appears organically.
  const [pushedAssetTrackingUrls, setPushedAssetTrackingUrls] = useState<Map<string, string>>(new Map())
  // Phase 14H — attribution rollup for the currently-selected campaign. Loaded
  // lazily via /api/admin/campaigns/attribution?campaign_id=… when a campaign is
  // selected. Errors degrade silently (panel shows empty state).
  const [attribution, setAttribution] = useState<AttributionRollup | null>(null)
  const [attributionLoading, setAttributionLoading] = useState(false)
  const { toasts, show } = useToast()

  const loadList = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.category.trim()) params.set('category', filters.category.trim())
    if (filters.minScore.trim()) params.set('min_score', filters.minScore.trim())
    if (filters.q.trim()) params.set('q', filters.q.trim())
    const qs = params.toString()
    try {
      const res = await fetch(`/api/admin/campaigns${qs ? '?' + qs : ''}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to load campaigns')
      }
      setCampaigns(json.campaigns ?? [])
    } catch (err) {
      show(err instanceof Error ? err.message : 'Failed to load campaigns', 'error')
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [filters, show])

  useEffect(() => {
    loadList()
  }, [loadList])

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true)
      try {
        const res = await fetch(`/api/admin/campaigns/${id}`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load campaign')
        setDetail(json as DetailResponse)
      } catch (err) {
        show(err instanceof Error ? err.message : 'Failed to load campaign', 'error')
        setDetail(null)
      } finally {
        setDetailLoading(false)
      }
    },
    [show],
  )

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId)
    } else {
      setDetail(null)
    }
  }, [selectedId, loadDetail])

  const loadAttribution = useCallback(async (id: string) => {
    setAttributionLoading(true)
    try {
      const res = await fetch(`/api/admin/campaigns/attribution?campaign_id=${id}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setAttribution(null)
        return
      }
      const ranked = (json.ranked ?? []) as AttributionRollup[]
      setAttribution(ranked.find(r => r.campaign_id === id) ?? null)
    } catch {
      setAttribution(null)
    } finally {
      setAttributionLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) {
      loadAttribution(selectedId)
    } else {
      setAttribution(null)
    }
  }, [selectedId, loadAttribution])

  const handleGenerate = async (campaignId: string, force: boolean) => {
    if (force) {
      const ok = window.confirm(
        'Force regenerate?\n\nThis archives existing draft assets only. Posted, approved, scheduled, and rejected assets are not overwritten.',
      )
      if (!ok) return
    }
    setGenerating(true)
    setGenerationProgress({ current: 0, total: GENERATION_BATCHES.length, label: '' })

    let totalAssets = 0
    let totalArchived = 0
    let skippedBatches = 0

    try {
      for (let i = 0; i < GENERATION_BATCHES.length; i++) {
        const batch = GENERATION_BATCHES[i]
        setGenerationProgress({ current: i + 1, total: GENERATION_BATCHES.length, label: batch.label })

        const res = await fetch('/api/admin/campaigns/generate-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_campaign_id: campaignId,
            asset_types: batch.types,
            model_override: BATCH_MODEL_OVERRIDE,
            force_regenerate: force,
            skip_verifier: true,
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          throw new Error(`Batch ${i + 1}/${GENERATION_BATCHES.length} (${batch.label}): ${json.error || json.message || 'failed'}`)
        }
        if (json.already_exists) {
          skippedBatches++
        } else if (!json.ok) {
          throw new Error(`Batch ${i + 1}/${GENERATION_BATCHES.length} (${batch.label}): ${json.message || 'generation failed'}`)
        } else {
          totalAssets += json.asset_count ?? 0
          totalArchived += json.archived_count ?? 0
        }
      }

      const arch = totalArchived > 0 ? ` (archived ${totalArchived} drafts)` : ''
      const skipped = skippedBatches > 0 ? `, ${skippedBatches} batch${skippedBatches === 1 ? '' : 'es'} skipped (already exist)` : ''
      if (totalAssets === 0 && skippedBatches > 0) {
        show(`All requested asset types already exist for this campaign — use Force Regenerate to replace drafts`, 'info')
      } else {
        show(`Generated ${totalAssets} assets across ${GENERATION_BATCHES.length} batches${arch}${skipped}`)
      }
      await loadDetail(campaignId)
      await loadList()
    } catch (err) {
      show(err instanceof Error ? err.message : 'Generation failed', 'error')
    } finally {
      setGenerating(false)
      setGenerationProgress(null)
    }
  }

  const handleApprove = async (assetId: string) => {
    setActionInFlight(assetId)
    try {
      const res = await fetch(`/api/admin/campaigns/assets/${assetId}/approve`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Approve failed')
      show('Asset approved')
      if (selectedId) await loadDetail(selectedId)
    } catch (err) {
      show(err instanceof Error ? err.message : 'Approve failed', 'error')
    } finally {
      setActionInFlight(null)
    }
  }

  const handlePushToCalendar = async (assetId: string) => {
    setActionInFlight(assetId)
    try {
      const res = await fetch(`/api/admin/campaigns/assets/${assetId}/push-to-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Push to calendar failed')
      }
      setPushedAssetIds(prev => {
        const next = new Set(prev)
        next.add(assetId)
        return next
      })
      // Capture tracking URL when the route returned one (Phase 14H.1). Surfaced
      // on every response shape — new push, already_pushed, partial-link path.
      if (typeof json.tracking_url === 'string' && json.tracking_url) {
        setPushedAssetTrackingUrls(prev => {
          const next = new Map(prev)
          next.set(assetId, json.tracking_url as string)
          return next
        })
      }
      if (json.already_pushed) {
        show('Already on the content calendar', 'info')
      } else if (json.partial) {
        show(json.warning || 'Calendar row created; click again to repair the link', 'info')
      } else {
        show('Pushed to content calendar as draft')
      }
      if (selectedId) {
        await loadDetail(selectedId)
        await loadAttribution(selectedId)
      }
    } catch (err) {
      show(err instanceof Error ? err.message : 'Push to calendar failed', 'error')
    } finally {
      setActionInFlight(null)
    }
  }

  const handleReject = async (assetId: string) => {
    const reason = window.prompt('Reason for rejection (optional)') ?? ''
    setActionInFlight(assetId)
    try {
      const res = await fetch(`/api/admin/campaigns/assets/${assetId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Reject failed')
      show('Asset rejected')
      if (selectedId) await loadDetail(selectedId)
    } catch (err) {
      show(err instanceof Error ? err.message : 'Reject failed', 'error')
    } finally {
      setActionInFlight(null)
    }
  }

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {}
    for (const c of campaigns) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
    return { total: campaigns.length, byStatus }
  }, [campaigns])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-[#1A1A2E]">🌍 Event Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review event campaigns, generate asset bundles, and approve drafts before they go to the content calendar.
          </p>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span>{stats.total} loaded</span>
            {Object.entries(stats.byStatus).map(([s, n]) => (
              <span key={s} className="capitalize">
                {s}: {n}
              </span>
            ))}
          </div>
        </div>
      </header>

      <Filters filters={filters} onChange={setFilters} onApply={loadList} loading={loading} />

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 xl:col-span-4">
          <CampaignList
            campaigns={campaigns}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <div className="lg:col-span-7 xl:col-span-8">
          <CampaignDetailPanel
            detail={detail}
            loading={detailLoading}
            generating={generating}
            generationProgress={generationProgress}
            actionInFlight={actionInFlight}
            pushedAssetIds={pushedAssetIds}
            pushedAssetTrackingUrls={pushedAssetTrackingUrls}
            attribution={attribution}
            attributionLoading={attributionLoading}
            onGenerate={handleGenerate}
            onApprove={handleApprove}
            onReject={handleReject}
            onPushToCalendar={handlePushToCalendar}
          />
        </div>
      </div>

      <Toaster toasts={toasts} />
    </div>
  )
}

function Filters({
  filters,
  onChange,
  onApply,
  loading,
}: {
  filters: { status: string; category: string; minScore: string; q: string }
  onChange: (next: { status: string; category: string; minScore: string; q: string }) => void
  onApply: () => void
  loading: boolean
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 grid md:grid-cols-5 gap-3">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
        <select
          value={filters.status}
          onChange={e => onChange({ ...filters, status: e.target.value })}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>
              {s === '' ? 'Any' : s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
        <input
          value={filters.category}
          onChange={e => onChange({ ...filters, category: e.target.value })}
          placeholder="e.g. Carnival"
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Min score</label>
        <input
          type="number"
          min={1}
          max={100}
          value={filters.minScore}
          onChange={e => onChange({ ...filters, minScore: e.target.value })}
          placeholder="60"
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2"
        />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-semibold text-gray-500 mb-1">Search event / destination</label>
        <input
          value={filters.q}
          onChange={e => onChange({ ...filters, q: e.target.value })}
          onKeyDown={e => {
            if (e.key === 'Enter') onApply()
          }}
          placeholder="Trinidad, Carnival, Miami…"
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2"
        />
      </div>
      <div className="md:col-span-5 flex justify-end">
        <button
          onClick={onApply}
          disabled={loading}
          className="bg-[#1A1A2E] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#2a2a4a] disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Apply filters'}
        </button>
      </div>
    </div>
  )
}

function CampaignList({
  campaigns,
  loading,
  selectedId,
  onSelect,
}: {
  campaigns: CampaignListRow[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (loading) {
    return <div className="bg-white rounded-xl shadow-sm p-6 text-center text-sm text-gray-400">Loading campaigns…</div>
  }
  if (!campaigns.length) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 text-center text-sm text-gray-400">
        No campaigns match these filters.
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
      {campaigns.map(c => {
        const active = c.id === selectedId
        const wave = inferUrgencyWave(c.event_start_date)
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left bg-white rounded-xl shadow-sm p-4 border transition ${
              active ? 'border-[#FF6B35]' : 'border-transparent hover:border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="font-semibold text-sm text-[#1A1A2E] truncate">{c.campaign_name}</div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStatusColor(c.status)}`}>
                {c.status}
              </span>
            </div>
            <div className="text-xs text-gray-500 truncate">
              {c.event_name} · {c.destination_city}
              {c.destination_country ? `, ${c.destination_country}` : ''}
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
              <span>{c.event_start_date ? formatDate(c.event_start_date) : 'Date TBD'}</span>
              <span className="flex items-center gap-2">
                {wave && (
                  <span className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 font-medium">{wave}</span>
                )}
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                  Score {c.score ?? '—'}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                  {c.asset_counts.total ?? 0} assets
                </span>
              </span>
            </div>
            {c.categories && c.categories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {c.categories.slice(0, 4).map(cat => (
                  <span key={cat} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    {cat}
                  </span>
                ))}
                {c.categories.length > 4 && (
                  <span className="text-[10px] text-gray-400">+{c.categories.length - 4}</span>
                )}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function CampaignDetailPanel({
  detail,
  loading,
  generating,
  generationProgress,
  actionInFlight,
  pushedAssetIds,
  pushedAssetTrackingUrls,
  attribution,
  attributionLoading,
  onGenerate,
  onApprove,
  onReject,
  onPushToCalendar,
}: {
  detail: DetailResponse | null
  loading: boolean
  generating: boolean
  generationProgress: { current: number; total: number; label: string } | null
  actionInFlight: string | null
  pushedAssetIds: Set<string>
  pushedAssetTrackingUrls: Map<string, string>
  attribution: AttributionRollup | null
  attributionLoading: boolean
  onGenerate: (id: string, force: boolean) => void
  onApprove: (assetId: string) => void
  onReject: (assetId: string) => void
  onPushToCalendar: (assetId: string) => void
}) {
  if (loading) {
    return <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-gray-400">Loading campaign…</div>
  }
  if (!detail) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-gray-400">
        Select a campaign on the left to see its details, scoring breakdown, and asset bundle.
      </div>
    )
  }

  const c = detail.campaign
  const liveAssets = detail.asset_counts.total ?? 0
  const hasDrafts = (detail.asset_counts.draft ?? 0) > 0
  const showForceButton = liveAssets > 0
  const grouped = groupAssetsByType(detail.assets)

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-black text-[#1A1A2E]">{c.campaign_name}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {c.event_name} · {c.destination_city}
              {c.destination_country ? `, ${c.destination_country}` : ''}
              {c.destination_region ? ` (${c.destination_region})` : ''}
            </p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(c.status)}`}>
                {c.status}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                Score {c.score ?? '—'}
              </span>
              {c.is_cruise && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-cyan-100 text-cyan-700">
                  🚢 Cruise
                </span>
              )}
              {(c.categories ?? []).slice(0, 6).map(cat => (
                <span key={cat} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                  {cat}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <button
              onClick={() => onGenerate(c.id, false)}
              disabled={generating}
              className="bg-[#FF6B35] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#e55a25] disabled:opacity-60"
            >
              {generating
                ? generationProgress
                  ? `Generating batch ${generationProgress.current} of ${generationProgress.total}${generationProgress.label ? ` — ${generationProgress.label}` : ''}…`
                  : 'Generating…'
                : '✨ Generate Asset Bundle'}
            </button>
            {showForceButton && (
              <button
                onClick={() => onGenerate(c.id, true)}
                disabled={generating || !hasDrafts}
                title={
                  hasDrafts
                    ? 'Archive existing draft assets only and re-generate'
                    : 'No drafts to archive'
                }
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:opacity-50"
              >
                ↻ Force Regenerate
              </button>
            )}
            <p className="text-[11px] text-gray-400 max-w-xs text-right">
              Force regenerate archives draft assets only. Posted, approved, scheduled, and rejected assets are not
              overwritten.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <Field label="Event date" value={`${formatMaybeDate(c.event_start_date)}${c.event_end_date && c.event_end_date !== c.event_start_date ? ' → ' + formatMaybeDate(c.event_end_date) : ''}`} />
          <Field label="Travel window" value={`${formatMaybeDate(c.travel_window_start)}${c.travel_window_end ? ' → ' + formatMaybeDate(c.travel_window_end) : ''}`} />
          <Field label="Audience" value={(c.audience ?? []).join(', ') || '—'} />
          <Field label="Created" value={formatDate(c.created_at)} />
          {c.is_cruise && (
            <>
              <Field label="Departure city" value={c.departure_city || '—'} />
              <Field label="Cruise line" value={c.cruise_line || '—'} />
            </>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <LongField label="Hotel angle" value={c.hotel_angle} />
          <LongField label="Cruise angle" value={c.cruise_angle} />
          <LongField label="Flight angle" value={c.flight_angle} />
          <LongField label="Group travel angle" value={c.group_travel_angle} />
          <LongField label="Lead magnet" value={c.lead_magnet_idea} />
          <LongField label="Landing headline" value={c.landing_page_headline} />
          <LongField label="CTA text" value={c.cta_text} />
          <LongField label="CTA URL" value={c.cta_url} />
        </div>

        {c.tracking_url_template && (
          <div className="text-xs text-gray-500 break-words">
            <span className="font-semibold text-gray-600">Tracking URL:</span>{' '}
            <code className="bg-gray-50 px-1.5 py-0.5 rounded">{c.tracking_url_template}</code>
          </div>
        )}
      </section>

      {detail.latest_score && (
        <ScorePanel score={detail.latest_score} />
      )}

      <PerformancePanel attribution={attribution} loading={attributionLoading} />

      <section className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-bold text-[#1A1A2E] mb-3">Asset bundle</h3>
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 font-medium">
            Total: {detail.asset_counts.total ?? 0}
          </span>
          {Object.entries(detail.asset_counts)
            .filter(([k]) => k !== 'total')
            .map(([status, count]) => (
              <span key={status} className={`px-2 py-1 rounded font-medium ${getStatusColor(status)}`}>
                {status}: {count}
              </span>
            ))}
        </div>

        {detail.assets.length === 0 ? (
          <p className="text-sm text-gray-400">
            No assets yet. Click <strong>Generate Asset Bundle</strong> above to create drafts.
          </p>
        ) : (
          <div className="space-y-6">
            {ASSET_TYPE_ORDER.filter(t => grouped[t]?.length).map(type => (
              <AssetGroup
                key={type}
                assetType={type}
                title={ASSET_TYPE_LABELS[type] ?? type}
                helperText={ASSET_TYPE_HELPER_TEXT[type]}
                assets={grouped[type]}
                actionInFlight={actionInFlight}
                pushedAssetIds={pushedAssetIds}
                pushedAssetTrackingUrls={pushedAssetTrackingUrls}
                onApprove={onApprove}
                onReject={onReject}
                onPushToCalendar={onPushToCalendar}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PerformancePanel({
  attribution,
  loading,
}: {
  attribution: AttributionRollup | null
  loading: boolean
}) {
  if (loading) {
    return (
      <section className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-bold text-[#1A1A2E] mb-3">Performance</h3>
        <p className="text-xs text-gray-400">Loading attribution…</p>
      </section>
    )
  }

  // No rollup at all — campaign has no rows in the view (rare; means the
  // attribution view query failed silently OR the view hasn't been created yet).
  if (!attribution) {
    return (
      <section className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-bold text-[#1A1A2E] mb-3">Performance</h3>
        <p className="text-sm text-gray-400">
          No conversion data yet. Campaign assets are now trackable once links receive traffic.
        </p>
      </section>
    )
  }

  const hasAnySignal =
    attribution.lead_count > 0 ||
    attribution.member_count > 0 ||
    attribution.posted_count > 0 ||
    attribution.click_count > 0

  const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 1000) / 10}%`)

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-[#1A1A2E]">
          Performance: <span className="text-[#FF6B35]">{attribution.performance_score}/100</span>
        </h3>
        {attribution.latest_activity_at && (
          <p className="text-xs text-gray-400">
            Latest activity: {formatDateTime(attribution.latest_activity_at)}
          </p>
        )}
      </div>

      {!hasAnySignal && (
        <p className="text-sm text-gray-400 mb-4">
          No conversion data yet. Campaign assets are now trackable once links receive traffic.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Metric label="Clicks" value={attribution.click_count} subtext="deferred" />
        <Metric label="Leads" value={attribution.lead_count} />
        <Metric label="Conversions" value={attribution.member_count} />
        <Metric label="Posted" value={attribution.posted_count} />
        <Metric label="Click → Lead" value={pct(attribution.click_to_lead_rate)} />
        <Metric label="Lead → Member" value={pct(attribution.lead_to_conversion_rate)} />
        <Metric label="Approved assets" value={attribution.approved_asset_count} />
        <Metric label="Calendar rows" value={attribution.calendar_row_count} />
      </div>

      {Object.keys(attribution.by_platform).length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 mb-1">By platform</p>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {Object.entries(attribution.by_platform).map(([p, e]) => (
              <span key={p} className="px-2 py-1 rounded bg-gray-50 text-gray-700">
                {p}: {e.posted_count}/{e.approved_count} posted
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-400">
        Click attribution is deferred until track-event captures UTM. Lead/member counts use UTM substring match
        on contacts (best-effort) and will start counting once campaign tracking URLs are materialized in posts.
      </p>
    </section>
  )
}

function Metric({ label, value, subtext }: { label: string; value: number | string; subtext?: string }) {
  return (
    <div className="bg-gray-50 rounded p-2">
      <div className="font-semibold text-gray-600 truncate">{label}</div>
      <div className="text-[#1A1A2E] font-mono text-base">{value}</div>
      {subtext && <div className="text-[10px] text-gray-400">{subtext}</div>}
    </div>
  )
}

function ScorePanel({ score }: { score: ScoreRow }) {
  const breakdown = score.breakdown ?? {}
  const entries = Object.entries(breakdown)
  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-bold text-[#1A1A2E]">
          Latest score: <span className="text-[#FF6B35]">{score.score}/100</span>
        </h3>
        <p className="text-xs text-gray-400">
          Scored {formatDateTime(score.scored_at)}
          {score.week_of ? ` · week of ${formatDate(score.week_of)}` : ''}
        </p>
      </div>
      {entries.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          {entries.map(([dim, v]) => (
            <div key={dim} className="bg-gray-50 rounded p-2">
              <div className="font-semibold text-gray-600 capitalize truncate">{dim.replace(/_/g, ' ')}</div>
              <div className="text-[#1A1A2E] font-mono">{v}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No breakdown recorded.</p>
      )}
    </section>
  )
}

function AssetGroup({
  assetType,
  title,
  helperText,
  assets,
  actionInFlight,
  pushedAssetIds,
  pushedAssetTrackingUrls,
  onApprove,
  onReject,
  onPushToCalendar,
}: {
  assetType: string
  title: string
  helperText?: string
  assets: AssetRow[]
  actionInFlight: string | null
  pushedAssetIds: Set<string>
  pushedAssetTrackingUrls: Map<string, string>
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onPushToCalendar: (id: string) => void
}) {
  return (
    <div>
      <h4 className="text-sm font-bold text-gray-700 mb-1">
        {title} <span className="text-xs text-gray-400 font-normal">({assets.length})</span>
      </h4>
      {helperText && (
        <p className="text-xs text-gray-500 italic mb-2 max-w-prose">
          {helperText}
        </p>
      )}
      <div className="space-y-2">
        {assets.map(a => (
          <AssetCard
            key={a.id}
            asset={a}
            assetType={assetType}
            disabled={actionInFlight === a.id}
            pushedToCalendar={pushedAssetIds.has(a.id) || !!a.content_calendar_id}
            trackingUrl={pushedAssetTrackingUrls.get(a.id) ?? a.tracking_url ?? null}
            onApprove={onApprove}
            onReject={onReject}
            onPushToCalendar={onPushToCalendar}
          />
        ))}
      </div>
    </div>
  )
}

function AssetCard({
  asset,
  assetType,
  disabled,
  pushedToCalendar,
  trackingUrl,
  onApprove,
  onReject,
  onPushToCalendar,
}: {
  asset: AssetRow
  assetType: string
  disabled: boolean
  pushedToCalendar: boolean
  trackingUrl: string | null
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onPushToCalendar: (id: string) => void
}) {
  const meta = (asset.verification_metadata ?? {}) as Record<string, unknown>
  const complianceFlag = typeof meta.compliance_flag === 'string' ? (meta.compliance_flag as string) : null
  const flaggedTerms = Array.isArray(meta.terms) ? (meta.terms as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const rejectionReason = typeof meta.rejection_reason === 'string' ? (meta.rejection_reason as string) : null

  const canApprove = asset.status === 'draft' || asset.status === 'idea'
  const canReject = asset.status === 'draft' || asset.status === 'idea' || asset.status === 'approved'
  const isPosted = asset.status === 'posted'

  // Phase 14F: Push-to-Calendar gating. Only shown for 'approved' assets whose
  // type is in the calendar-pushable allowlist (today: social_post only). Hidden
  // when the asset has already been pushed (badge shown instead) and never shown
  // for rejected/draft/posted/etc.
  const isCalendarPushable = CALENDAR_PUSHABLE_ASSET_TYPES.has(assetType)
  const canPushToCalendar = asset.status === 'approved' && isCalendarPushable && !pushedToCalendar

  // Phase 14G: per-platform creative-format hint. Shown only on social_post rows
  // where the platform resolves to one of the canonical platform IDs in social-specs.ts.
  // Both helpers return null on unknown platforms so the line silently disappears
  // instead of rendering a malformed string.
  const platformSpec = assetType === 'social_post' ? getSocialSpec(asset.platform) : null
  const platformGuidance = assetType === 'social_post' ? buildPlatformGuidanceLine(asset.platform) : null

  // Media display: image_url and video_url are nullable on the schema. Today
  // image_prompt / video_prompt rows ship without a populated URL because the
  // generator only writes the prompt text — Pexels/OpenAI/HeyGen run in a later
  // phase. Show a small preview when a URL is set; show a clear "not generated
  // yet" placeholder for image_prompt/video_prompt rows so the operator
  // understands the asset is a brief, not a finished file.
  const imageUrl = typeof asset.image_url === 'string' && asset.image_url ? asset.image_url : null
  const videoUrl = typeof asset.video_url === 'string' && asset.video_url ? asset.video_url : null
  const isImagePromptRow = assetType === 'image_prompt'
  const isVideoPromptRow = assetType === 'video_prompt'

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/40">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {asset.platform && (
            <span className="px-1.5 py-0.5 rounded bg-white border border-gray-200 capitalize text-gray-700">
              {asset.platform}
            </span>
          )}
          {asset.wave && (
            <span className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-100 font-medium">
              {asset.wave}
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded font-medium ${getStatusColor(asset.status)}`}>{asset.status}</span>
          {complianceFlag && (
            <span
              className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium"
              title={flaggedTerms.length ? `Banned: ${flaggedTerms.join(', ')}` : undefined}
            >
              ⚠ {complianceFlag}
            </span>
          )}
          {asset.scheduled_for && (
            <span className="text-[11px] text-gray-500">📅 {formatDateTime(asset.scheduled_for)}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canApprove && (
            <button
              onClick={() => onApprove(asset.id)}
              disabled={disabled}
              className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 disabled:opacity-50 font-medium"
            >
              ✓ Approve
            </button>
          )}
          {canReject && (
            <button
              onClick={() => onReject(asset.id)}
              disabled={disabled}
              className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 disabled:opacity-50 font-medium"
            >
              ✕ Reject
            </button>
          )}
          {canPushToCalendar && (
            <button
              onClick={() => onPushToCalendar(asset.id)}
              disabled={disabled}
              title="Push this approved asset into the content calendar as a draft (does not auto-post)"
              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 disabled:opacity-50 font-medium"
            >
              📅 Push to Calendar
            </button>
          )}
          {pushedToCalendar && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
              ✓ Added to Calendar
            </span>
          )}
          {trackingUrl && (
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(trackingUrl).catch(() => {})
                }
              }}
              title={trackingUrl}
              className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100"
            >
              🔗 Tracking URL ready · copy
            </button>
          )}
          {asset.status === 'approved' && !isCalendarPushable && (
            <span
              className="text-[11px] text-gray-400"
              title="Calendar push is only available for social_post assets in this phase. Email / DM / headline / lead-magnet / hashtag-set / image-prompt / video-prompt assets are out of scope until a future content_calendar phase."
            >
              Calendar push not yet supported for {assetType.replace(/_/g, ' ')}
            </span>
          )}
          {isPosted && <span className="text-[11px] text-gray-400">Posted — read only</span>}
        </div>
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
        {previewBody(asset.body)}
      </p>
      {platformGuidance && (
        <p
          className="mt-2 text-[11px] text-gray-500"
          title={platformSpec?.notes.join('\n') ?? undefined}
        >
          📐 {platformSpec?.displayName ?? 'Platform'}: {platformGuidance}
        </p>
      )}
      {imageUrl && (
        <div className="mt-2">
          {/* Use plain <img> so existing Supabase Storage / Pexels URLs render without
              configuring next/image remote patterns for new hosts. Capped at h-32 so
              the preview stays compact in the asset list. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Asset preview"
            className="max-h-32 rounded border border-gray-200 object-cover"
          />
        </div>
      )}
      {!imageUrl && isImagePromptRow && (
        <p className="mt-2 text-xs text-gray-500 italic">
          🖼️ No image generated yet. This row holds the prompt; the actual image will be created during the content-calendar push.
        </p>
      )}
      {videoUrl && (
        <p className="mt-2 text-xs">
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FF6B35] underline hover:no-underline"
          >
            ▶ View generated video
          </a>
        </p>
      )}
      {!videoUrl && isVideoPromptRow && (
        <p className="mt-2 text-xs text-gray-500 italic">
          🎬 No video generated yet. This row holds the prompt; the actual video will be created during the video workflow.
        </p>
      )}
      {asset.hashtags && asset.hashtags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {asset.hashtags.map(tag => (
            <span key={tag} className="text-[#FF6B35] text-xs">
              #{tag}
            </span>
          ))}
        </div>
      )}
      {rejectionReason && (
        <p className="mt-2 text-xs text-red-600">
          <span className="font-semibold">Rejection reason:</span> {rejectionReason}
        </p>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-gray-800">{value || '—'}</div>
    </div>
  )
}

function LongField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{value}</div>
    </div>
  )
}

function previewBody(body: string | null): string {
  if (!body) return '(empty body)'
  const limit = 600
  return body.length > limit ? body.slice(0, limit) + '…' : body
}

function groupAssetsByType(assets: AssetRow[]): Record<string, AssetRow[]> {
  const out: Record<string, AssetRow[]> = {}
  for (const a of assets) {
    out[a.asset_type] = out[a.asset_type] ?? []
    out[a.asset_type].push(a)
  }
  return out
}

function formatMaybeDate(d: string | null): string {
  return d ? formatDate(d) : '—'
}

function inferUrgencyWave(eventStart: string | null): string | null {
  if (!eventStart) return null
  const start = new Date(eventStart + 'T00:00:00Z')
  if (Number.isNaN(start.getTime())) return null
  const diffDays = Math.round((start.getTime() - Date.now()) / 86_400_000)
  if (diffDays > 180) return null
  if (diffDays > 120) return 'W1'
  if (diffDays > 90) return 'W2'
  if (diffDays > 60) return 'W3'
  if (diffDays > 30) return 'W4'
  if (diffDays > 14) return 'W5'
  if (diffDays > 7) return 'W6'
  if (diffDays >= 0) return 'W7'
  return 'W8'
}
