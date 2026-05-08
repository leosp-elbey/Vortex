// Phase 14U — System Status & Kill Switch UI card.
//
// Reads + toggles the autoposter cron kill switch via the admin API at
// /api/admin/system/autoposter-cron. Lets the operator enable/disable daily
// posting without touching Supabase SQL. Surfaces the last-change timestamp
// and reason so the operator can tell at a glance whether the cron is off
// because they disabled it OR because the cron auto-disabled itself after
// a failure (Phase 14S kill-switch tripwire).

'use client'

import { useCallback, useEffect, useState } from 'react'

interface SystemStatusCardProps {
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void
}

interface CronStatus {
  enabled: boolean
  last_change: string | null
  last_reason: string | null
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'never'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function SystemStatusCard({ notify }: SystemStatusCardProps) {
  const [status, setStatus] = useState<CronStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/system/autoposter-cron', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load cron status')
      setStatus({
        enabled: !!json.enabled,
        last_change: json.last_change ?? null,
        last_reason: json.last_reason ?? null,
      })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load cron status', 'error')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount; loadStatus writes setState internally
    loadStatus()
  }, [loadStatus])

  const handleToggle = async () => {
    if (!status || submitting) return
    const newEnabled = !status.enabled
    const verb = newEnabled ? 'enable' : 'disable'

    if (!newEnabled) {
      const ok = window.confirm(
        'Disable the autoposter cron?\n\nThe daily 14:00 UTC tick will be skipped until you re-enable. Mark Ready rows will sit in queue until the cron resumes.',
      )
      if (!ok) return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/system/autoposter-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Failed to ${verb} cron`)
      setStatus({
        enabled: !!json.enabled,
        last_change: json.last_change ?? null,
        last_reason: json.last_reason ?? null,
      })
      notify(newEnabled ? 'Autoposter cron ENABLED' : 'Autoposter cron DISABLED')
    } catch (err) {
      notify(err instanceof Error ? err.message : `Failed to ${verb} cron`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const enabled = status?.enabled === true

  // Color tokens — green family when enabled, rose when disabled, slate while loading.
  const borderColor = loading
    ? 'border-gray-200'
    : enabled
      ? 'border-emerald-300'
      : 'border-rose-300'
  const badgeColor = loading
    ? 'bg-gray-100 text-gray-600'
    : enabled
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-rose-100 text-rose-800'
  const buttonColor = enabled
    ? 'bg-rose-600 hover:bg-rose-700'
    : 'bg-emerald-600 hover:bg-emerald-700'

  return (
    <section className={`bg-white rounded-2xl shadow-sm p-6 border-2 ${borderColor}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h2 className="text-xl font-black text-[#1A1A2E]">System Status &amp; Kill Switch</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wide ${badgeColor}`}>
              {loading ? 'Loading…' : enabled ? '🟢 Enabled' : '🔴 Disabled'}
            </span>
          </div>

          <p className="text-sm text-gray-600 mb-3">
            Autoposter cron at <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/api/cron/autoposter-once</code>.
            Runs daily at 14:00 UTC when enabled. Auto-disables on platform failure or post-flight invariant slip.
          </p>

          {!loading && status && (
            <div className="text-xs text-gray-500 space-y-0.5">
              <div>
                <span className="font-semibold text-gray-700">Last change:</span> {formatTimestamp(status.last_change)}
              </div>
              {status.last_reason && (
                <div className="break-words">
                  <span className="font-semibold text-gray-700">Reason:</span> {status.last_reason}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 items-end">
          <button
            onClick={handleToggle}
            disabled={loading || submitting || !status}
            className={`text-sm font-bold text-white px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonColor}`}
          >
            {submitting ? 'Saving…' : enabled ? 'Disable Cron' : 'Enable Cron'}
          </button>
          <button
            onClick={loadStatus}
            disabled={loading || submitting}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            title="Refresh status"
          >
            ↻ Refresh
          </button>
        </div>
      </div>
    </section>
  )
}
